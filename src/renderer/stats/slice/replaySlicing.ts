/**
 * Whether the combat replay on screen would show fights the active slice
 * excludes.
 *
 * The replay payload is either carried inline on the aggregation
 * (`stats.replayFights`) or fetched once from the report's `replayDataUrl` and
 * cached whole. The cached copy always holds EVERY fight in the session and is
 * keyed on its own fight identities, not the sidecar's roster ordinals, so it
 * cannot be narrowed after the fact.
 *
 * Sliced stats never carry `replayFights`: slice frames deliberately exclude
 * replay payloads (they are the bulk of report.json and no merge maths needs
 * them). So with a slice active and no inline replay, the viewer would play the
 * whole night while every other section showed the selected subset — silently.
 * That is the case this returns true for, and the caller replaces the replay
 * with an explicit note.
 *
 * Deliberately narrow: when `replayFights` IS populated the replay came from
 * the same, already-sliced aggregation as everything else. That is the desktop
 * path, where Phase A slices the logs before aggregation, and it must keep
 * working under a slice.
 */
export const isReplayUnsliceable = ({ replayFights, excludedFightCount }: {
    replayFights: unknown;
    excludedFightCount: number;
}): boolean => {
    if (excludedFightCount <= 0) return false;
    return !(Array.isArray(replayFights) && replayFights.length > 0);
};
