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
 * Emits `log-detected` for each arcdps log that appears under the watched
 * folder after `start`.
 *
 * One recursive `fs.watch` on the folder, deliberately not chokidar: chokidar 3
 * opens a native watcher for every existing file under the folder, and on
 * Windows each of those is a synchronous call on the main thread. A folder
 * holding a few thousand logs froze the app as "Not Responding" for up to two
 * minutes after every launch. A recursive watch is a single OS handle however
 * many logs the folder already holds.
 *
 * Only `rename` events start tracking a file: that is what creation and
 * rename-into-place report on every platform, while `change` alone is a write
 * to an existing file — an old log touched by a sync tool or a virus scanner
 * is not a new log.
 */
export class LogWatcher extends EventEmitter {
    private watcher: fs.FSWatcher | null = null;
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
        for (const timer of this.pending.values()) if (timer) clearTimeout(timer);
        this.pending.clear();
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
        if (!this.watcher) {
            this.pending.delete(filePath);
            return;
        }
        this.pending.set(filePath, setTimeout(() => {
            void this.awaitWriteFinish(filePath, stats);
        }, this.stabilityMs));
    }
}
