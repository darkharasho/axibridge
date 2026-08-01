/**
 * Replay-fight transfer elision for the stats worker.
 *
 * replayFights dominates the worker's finalize payload (~26MB of 38MB at 60
 * logs) but only changes when the ingested log set (or the preciseReplay
 * setting) changes. Settings tweaks, view-switch restarts, and manual flushes
 * re-stream the same logs — for those, the worker omits replayFights from the
 * structured-clone and the main thread reinjects the copy it already holds.
 *
 * Pure functions so both sides of the protocol are unit-testable.
 */

export interface ReplayElisionState {
    lastKey: string;
}

export const createReplayElisionState = (): ReplayElisionState => ({ lastKey: '' });

/**
 * Build the identity key for the current replay payload: the ordered ingested
 * log ids plus the preciseReplay flag (which changes replay payload contents)
 * plus the set of logs carrying a sector-ownership snapshot. Ownership arrives
 * asynchronously after a log was first ingested — without it in the key, the
 * owners-only re-aggregation posts a payload the elision check wrongly treats
 * as identical, and the main thread reinjects the stale pre-owners fights.
 */
export const buildReplayKey = (logIds: string[], preciseReplay: boolean | undefined, ownedLogIds?: string[]): string =>
    `${preciseReplay ? 'precise' : 'coarse'}|${logIds.join(',')}|owned:${(ownedLogIds ?? []).slice().sort().join(',')}`;

/**
 * Worker side: if the replay payload is identical to the last one posted,
 * strip it from the result and set a marker instead. Mutates `result.stats`.
 * Returns true when the payload was elided.
 */
export const elideUnchangedReplayFights = (result: any, replayKey: string, state: ReplayElisionState): boolean => {
    const stats = result?.stats;
    if (!stats || typeof stats !== 'object') return false;
    const fights = stats.replayFights;
    if (!Array.isArray(fights) || fights.length === 0) {
        state.lastKey = '';
        return false;
    }
    if (replayKey && replayKey === state.lastKey) {
        delete stats.replayFights;
        stats.replayFightsElided = true;
        return true;
    }
    state.lastKey = replayKey;
    return false;
};

/**
 * Main-thread side: restore an elided replay payload from the previously
 * received copy, and track the latest full copy for future reinjection.
 * Mutates `result.stats`. Returns the replay array the caller should retain.
 */
export const reinjectElidedReplayFights = (result: any, previousReplayFights: any[] | null): any[] | null => {
    const stats = result?.stats;
    if (!stats || typeof stats !== 'object') return previousReplayFights;
    if (stats.replayFightsElided) {
        if (Array.isArray(previousReplayFights)) {
            // We hold a full copy — restore it and clear the marker.
            delete stats.replayFightsElided;
            stats.replayFights = previousReplayFights;
        }
        // Otherwise keep the marker set: the worker dropped replayFights before we
        // ever received a full copy (e.g. a mid-stream flush), so this result has
        // no replay data *yet*. Leaving the marker lets consumers distinguish
        // "replay not available yet" from "report genuinely has no replay" and
        // avoid publishing a replay-less web report. See isReplayElided().
        return previousReplayFights;
    }
    return Array.isArray(stats.replayFights) ? stats.replayFights : previousReplayFights;
};

/**
 * True when a result still carries an unrestored elision marker — i.e. its
 * replay payload was dropped in transit and never reinjected, so replay data is
 * not yet available. Used to defer the web upload until replay settles.
 */
export const isReplayElided = (stats: any): boolean =>
    Boolean(stats && typeof stats === 'object' && stats.replayFightsElided);
