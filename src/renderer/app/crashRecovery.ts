/**
 * Keeping the session log list alive across a renderer crash.
 *
 * Why this exists: the log list is session state (`useState<ILogData[]>([])`)
 * and logs are deliberately not persisted — `src/main/index.ts` deletes any
 * stored `logs` key on boot to keep startup fast, and the `save-logs`/`get-logs`
 * handlers were removed outright. That is a product decision and this module
 * does not reverse it: nothing here touches disk, so a normal quit still starts
 * the next session empty.
 *
 * What it does fix: a renderer OOM is not a quit. Main reloads the window on
 * `render-process-gone`, the reloaded renderer starts from `[]`, and nothing
 * tells the user why — so the list appears to clear itself mid-session. That is
 * the bug reported from WvW nights, twice in one evening for one user. Main
 * keeps the latest snapshot in memory (it survives precisely because it is a
 * *different* process from the one that died) and hands it back once, to the
 * renderer that replaces the dead one.
 *
 * The snapshot must be slim. `details` alone runs to tens of megabytes of live
 * V8 objects per log and is the reason the renderer ran out of heap in the first
 * place; snapshotting it would both re-pin the graph and push the payload
 * through a structured clone on every change. Details do not need carrying
 * anyway: `DetailsCache` writes them through to IndexedDB, so they outlive the
 * crash already and re-hydrate on demand.
 */

/**
 * Fields excluded from a snapshot because they are large, re-derivable, or both.
 *
 * `details` re-hydrates from IndexedDB via `DetailsCache`. `replayDataUrl` is a
 * data URL that can reach megabytes. `sectorOwners` and `squadGuilds` are
 * patched in from details once it is back.
 */
export const CRASH_SNAPSHOT_HEAVY_FIELDS = [
    'details',
    'replayDataUrl',
    'sectorOwners',
    'squadGuilds',
] as const;

export type SlimLogRecord = Omit<ILogData, (typeof CRASH_SNAPSHOT_HEAVY_FIELDS)[number]>;

/**
 * Detail statuses that assert this renderer holds the graph in memory.
 *
 * After a crash that is false by construction, so a restored log carrying one
 * would leave hydration convinced it had nothing to do and the log rendering
 * permanently empty in every migrated stats view.
 */
type LogDetailsStatus = ILogData['detailsStatus'];

const IN_MEMORY_DETAIL_STATUSES: ReadonlySet<LogDetailsStatus> = new Set<LogDetailsStatus>([
    'loaded',
    'available',
    'loading',
]);

/**
 * Project the log list down to what is worth carrying across a crash.
 *
 * Every field is copied by value. Copying a heavy field by reference is what
 * would make this counterproductive: the snapshot lives in main and would keep
 * the whole details graph reachable.
 */
export const toCrashSnapshot = (logs: readonly ILogData[]): SlimLogRecord[] =>
    logs.map((log) => {
        const slim = { ...log } as Record<string, unknown>;
        for (const field of CRASH_SNAPSHOT_HEAVY_FIELDS) delete slim[field];
        return slim as SlimLogRecord;
    });

/**
 * Rebuild a renderable log list from a snapshot handed back by main.
 *
 * Defensive about shape: the snapshot crossed an IPC boundary and was written by
 * a process that has since died mid-operation, so a half-written entry is
 * possible. A malformed row is dropped rather than rendered, because a log row
 * without an id or path cannot be opened, re-parsed or re-uploaded — showing it
 * would only look like corruption.
 */
export const restoreFromCrashSnapshot = (snapshot: readonly unknown[] | null | undefined): ILogData[] => {
    if (!Array.isArray(snapshot)) return [];
    return snapshot.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const record = entry as Partial<ILogData>;
        if (typeof record.id !== 'string' || typeof record.filePath !== 'string') return [];
        const detailsStatus: LogDetailsStatus = IN_MEMORY_DETAIL_STATUSES.has(record.detailsStatus as LogDetailsStatus)
            ? 'idle'
            : (record.detailsStatus ?? 'idle');
        return [{ ...record, detailsStatus } as ILogData];
    });
};
