import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';
import { DEFAULT_LOG_SCAN_DEPTH } from './logFileScan';

/** How long a new log's size and mtime must hold still before it is handed on. */
export const LOG_WRITE_STABILITY_MS = 2000;

export interface LogWatcherOptions {
    stabilityMs?: number;
    /** Levels of subdirectory to descend; matches the log picker's scan. */
    maxDepth?: number;
}

const isLogFile = (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.evtc' || ext === '.zevtc';
};

/**
 * Whether `fs.watch({ recursive: true })` is a single native OS watch here.
 * Elsewhere (Linux) Node emulates it in JavaScript, and the emulation is the
 * freeze this module exists to avoid — see {@link LogWatcher}.
 */
const hasNativeRecursiveWatch = (platform: NodeJS.Platform = process.platform) =>
    platform === 'win32' || platform === 'darwin';

/**
 * Emits `log-detected` for each arcdps log that appears under the watched
 * folder after `start`.
 *
 * Deliberately not chokidar: chokidar 3 opens a native watcher for every
 * existing file under the folder, and on Windows each of those is a
 * synchronous call on the main thread. A folder holding a few thousand logs
 * froze the app as "Not Responding" for up to two minutes after every launch.
 *
 * On Windows and macOS this is one recursive `fs.watch`, a single OS handle
 * however many logs the folder holds. On Linux it is one plain `fs.watch` per
 * folder instead, because Node's recursive watch there is a JavaScript
 * emulation with the same per-file shape chokidar had, and worse: it watches
 * every file *and* its folder, and on each write to any file it re-reads the
 * whole folder with `readdirSync`. arcdps writing one new log into a folder of
 * ~4700 fires thousands of those back to back, which blocked the main thread
 * for ~35s after every fight.
 *
 * Only `rename` events start tracking a file: that is what creation and
 * rename-into-place report on every platform, while `change` alone is a write
 * to an existing file — an old log touched by a sync tool or a virus scanner
 * is not a new log.
 */
export class LogWatcher extends EventEmitter {
    private watcher: fs.FSWatcher | null = null;
    /** Linux only: one watcher per folder, keyed by its path. */
    private readonly folderWatchers = new Map<string, fs.FSWatcher>();
    private root = '';
    private readonly stabilityMs: number;
    private readonly maxDepth: number;
    // A path is pending from its first event until it settles or vanishes;
    // the value is null while a stat is in flight.
    private readonly pending = new Map<string, NodeJS.Timeout | null>();
    private readonly emitted = new Set<string>();

    constructor({ stabilityMs = LOG_WRITE_STABILITY_MS, maxDepth = DEFAULT_LOG_SCAN_DEPTH }: LogWatcherOptions = {}) {
        super();
        this.stabilityMs = stabilityMs;
        this.maxDepth = maxDepth;
    }

    public start(logDirectory: string): void {
        this.stop();

        console.log(`Starting watcher on: ${logDirectory}`);

        if (!fs.existsSync(logDirectory)) {
            console.error(`Directory does not exist: ${logDirectory}`);
            return;
        }

        this.root = logDirectory;
        if (!hasNativeRecursiveWatch()) {
            this.watchFolderTree(logDirectory, false);
            return;
        }
        try {
            this.watcher = fs.watch(logDirectory, { recursive: true, persistent: true }, (eventType, filename) => {
                if (eventType !== 'rename' || !filename) return;
                this.onCandidate(path.join(logDirectory, filename.toString()));
            });
        } catch (error) {
            console.error(`Watcher error: ${error}`);
            return;
        }
        this.watcher.on('error', (error) => {
            console.error(`Watcher error: ${error}`);
        });
    }

    public stop(): void {
        this.watcher?.close();
        this.watcher = null;
        for (const folderWatcher of this.folderWatchers.values()) folderWatcher.close();
        this.folderWatchers.clear();
        for (const timer of this.pending.values()) if (timer) clearTimeout(timer);
        this.pending.clear();
    }

    private get isWatching(): boolean {
        return this.watcher !== null || this.folderWatchers.size > 0;
    }

    /**
     * Watch `folder` and every subfolder within `maxDepth`. Only folders are
     * watched, never files, so the cost is the folder count, not the log count.
     *
     * `isNew` is set for a folder that appeared after `start`: arcdps can create
     * a folder and write a log into it before this watch exists, so any log
     * already inside is reported rather than missed.
     */
    private watchFolderTree(folder: string, isNew: boolean): void {
        if (this.folderWatchers.has(folder)) return;
        const depth = folder === this.root ? 0 : path.relative(this.root, folder).split(path.sep).length;
        if (depth > this.maxDepth) return;

        let folderWatcher: fs.FSWatcher;
        try {
            folderWatcher = fs.watch(folder, { persistent: true }, (eventType, filename) => {
                if (eventType !== 'rename' || !filename) return;
                this.onFolderEntry(path.join(folder, filename.toString()));
            });
        } catch (error) {
            console.error(`Watcher error: ${error}`);
            return;
        }
        folderWatcher.on('error', (error) => {
            // A watched folder that is deleted errors here; stop tracking it.
            console.error(`Watcher error: ${error}`);
            this.unwatchFolder(folder);
        });
        this.folderWatchers.set(folder, folderWatcher);

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(folder, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const entryPath = path.join(folder, entry.name);
            if (entry.isDirectory()) this.watchFolderTree(entryPath, isNew);
            else if (isNew) this.onCandidate(entryPath);
        }
    }

    private unwatchFolder(folder: string): void {
        for (const [watched, folderWatcher] of this.folderWatchers) {
            if (watched === folder || watched.startsWith(folder + path.sep)) {
                folderWatcher.close();
                this.folderWatchers.delete(watched);
            }
        }
    }

    /** Linux: something was created, renamed or removed inside a watched folder. */
    private onFolderEntry(entryPath: string): void {
        if (isLogFile(entryPath)) {
            this.onCandidate(entryPath);
            return;
        }
        fs.promises.stat(entryPath).then(
            (stats) => {
                if (stats.isDirectory() && this.isWatching) this.watchFolderTree(entryPath, true);
            },
            () => this.unwatchFolder(entryPath),
        );
    }

    private onCandidate(filePath: string): void {
        if (!isLogFile(filePath) || this.emitted.has(filePath) || this.pending.has(filePath)) return;
        const subdirectories = path.relative(this.root, filePath).split(path.sep).length - 1;
        if (subdirectories > this.maxDepth) return;
        this.pending.set(filePath, null);
        void this.awaitWriteFinish(filePath, null);
    }

    /**
     * Wait until the file's size and mtime are unchanged across one stability
     * window, so a log arcdps is still writing is not parsed half-finished.
     */
    private async awaitWriteFinish(filePath: string, previous: fs.Stats | null): Promise<void> {
        let stats: fs.Stats;
        try {
            stats = await fs.promises.stat(filePath);
        } catch {
            // Deleted or renamed away before it settled.
            this.pending.delete(filePath);
            return;
        }
        if (!stats.isFile()) {
            this.pending.delete(filePath);
            return;
        }
        if (previous && previous.size === stats.size && previous.mtimeMs === stats.mtimeMs) {
            this.pending.delete(filePath);
            this.emitted.add(filePath);
            console.log(`New log detected: ${filePath}`);
            this.emit('log-detected', filePath);
            return;
        }
        if (!this.isWatching) {
            this.pending.delete(filePath);
            return;
        }
        this.pending.set(filePath, setTimeout(() => {
            void this.awaitWriteFinish(filePath, stats);
        }, this.stabilityMs));
    }
}
