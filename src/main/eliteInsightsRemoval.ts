/**
 * One-time cleanup for the removal of the Elite Insights backend.
 *
 * This supersedes the earlier `parserBackendMigration`, which moved users off
 * Elite Insights but deliberately gave up its one chance so that anyone who
 * re-picked Elite Insights afterwards kept it. That restraint made sense while
 * the engine still existed. It does not now: there is no second engine to keep,
 * so this runs unconditionally and the `parserBackend` key goes with it.
 *
 * It also deletes the install itself. A user who never opened Settings is
 * holding ~90 MB of Elite Insights CLI plus a private .NET runtime that nothing
 * will ever call again, and no UI left to remove it with — so leaving it would
 * mean orphaning the files permanently rather than respecting a choice.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Set once the cleanup has run. */
export const ELITE_INSIGHTS_REMOVAL_KEY = 'eliteInsightsRemoved';

/**
 * Set only when the cleanup actually changed something the user could notice.
 * Cleared by the renderer once it has said so; it survives a restart on purpose,
 * so a silent engine change cannot slip past someone who was not watching.
 */
export const ELITE_INSIGHTS_REMOVAL_NOTICE_KEY = 'eliteInsightsRemovalNotice';

/** Store keys the removed backend owned, deleted together with it. */
const RETIRED_STORE_KEYS = [
    'parserBackend',
    'parserBackendMigratedToAxilog',
    'parserBackendMigrationNotice',
    'eiAutoManage',
] as const;

export interface EliteInsightsRemovalNotice {
    /** The user had explicitly selected Elite Insights as their engine. */
    wasSelected: boolean;
    /** Bytes freed by deleting the install directory. */
    reclaimedBytes: number;
}

interface RemovalStore {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
}

const directorySize = (dir: string): number => {
    let total = 0;
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return 0;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        try {
            if (entry.isDirectory()) total += directorySize(full);
            else total += fs.statSync(full).size;
        } catch {
            // A file that vanished or is unreadable contributes nothing; the
            // number is for a "reclaimed N MB" line, not an audit.
        }
    }
    return total;
};

/**
 * Run the cleanup once. Returns the notice to show the user, or `null` when
 * there was nothing to tell them (a fresh install, or a repeat launch).
 *
 * Never throws: a failure to delete leaves the files on disk, which is a
 * cosmetic loss, whereas a throw here would happen before the window exists.
 */
export function removeEliteInsights(
    store: RemovalStore,
    userDataPath: string,
): EliteInsightsRemovalNotice | null {
    if (store.get(ELITE_INSIGHTS_REMOVAL_KEY)) return null;

    const wasSelected = store.get('parserBackend') === 'elite-insights';

    for (const key of RETIRED_STORE_KEYS) {
        try {
            store.delete(key);
        } catch {
            /* a key that will not delete is inert either way */
        }
    }

    const installDir = path.join(userDataPath, 'elite-insights');
    let reclaimedBytes = 0;
    try {
        if (fs.existsSync(installDir)) {
            reclaimedBytes = directorySize(installDir);
            fs.rmSync(installDir, { recursive: true, force: true });
        }
    } catch {
        reclaimedBytes = 0;
    }

    store.set(ELITE_INSIGHTS_REMOVAL_KEY, true);

    if (!wasSelected && reclaimedBytes === 0) return null;

    const notice: EliteInsightsRemovalNotice = { wasSelected, reclaimedBytes };
    store.set(ELITE_INSIGHTS_REMOVAL_NOTICE_KEY, notice);
    return notice;
}
