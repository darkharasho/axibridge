import fs from 'node:fs';
import path from 'node:path';

export interface ScannedLogFile {
    path: string;
    /** Basename, e.g. `20260918-203000.zevtc`. Encounter parsing keys on this. */
    name: string;
    /**
     * Path relative to the scanned root, using forward slashes. Equals `name`
     * for files sitting directly in the root. arcdps buckets logs into
     * per-encounter subfolders, so this is what tells two same-named logs
     * apart in the picker.
     */
    relativePath: string;
    mtimeMs: number;
    size: number;
}

export interface ScanLogFilesOptions {
    allowJson?: boolean;
    /**
     * Levels of subdirectory to descend, matching LogWatcher's chokidar
     * `depth: 5`. A picker that listed logs the watcher would never see — or
     * the reverse — is its own bug.
     */
    maxDepth?: number;
}

export const DEFAULT_LOG_SCAN_DEPTH = 5;

function isLogFile(name: string, allowJson: boolean): boolean {
    const lower = name.toLowerCase();
    if (lower.endsWith('.evtc') || lower.endsWith('.zevtc')) return true;
    return allowJson && lower.endsWith('.json');
}

/**
 * Collect log files from `root` and its subdirectories, newest first.
 *
 * Symlinks are skipped on both counts: `isFile()`/`isDirectory()` are false
 * for them, so a symlinked directory cannot send the walk round a cycle.
 *
 * A subdirectory that cannot be read is skipped rather than failing the whole
 * scan — one unreadable folder should cost you that folder, not every log.
 */
export async function scanLogFiles(
    root: string,
    options: ScanLogFilesOptions = {}
): Promise<ScannedLogFile[]> {
    const allowJson = options.allowJson === true;
    const maxDepth = options.maxDepth ?? DEFAULT_LOG_SCAN_DEPTH;
    const files: ScannedLogFile[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        const subdirectories: string[] = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (depth < maxDepth) subdirectories.push(fullPath);
                continue;
            }
            if (!entry.isFile()) continue;
            if (!isLogFile(entry.name, allowJson)) continue;
            let stat: fs.Stats;
            try {
                stat = await fs.promises.stat(fullPath);
            } catch {
                continue;
            }
            files.push({
                path: fullPath,
                name: entry.name,
                relativePath: path.relative(root, fullPath).split(path.sep).join('/'),
                mtimeMs: stat.mtimeMs,
                size: stat.size
            });
        }

        for (const subdirectory of subdirectories) {
            await walk(subdirectory, depth + 1);
        }
    };

    await walk(root, 0);
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return files;
}
