/**
 * Overall boon uptime for the Boon Uptime table.
 *
 * A player's coverage is divided by their own attendance, never by the
 * session's. The earlier version counted bucket hits over the bucket count of
 * every fight in the report, so missing a fight was indistinguishable from
 * standing in it without the boon -- which reordered the leaderboard, putting
 * regulars above part-timers who held the boon far better.
 */

export interface BoonUptimeAggregateInput {
    /** Rows from `computeBoonUptimeTimeline`, plus any synthetic subgroup rows. */
    players: Array<any>;
    /** Per-fight values, used only for reports published before `weightedMs`. */
    fights: Array<any>;
    /** Intensity boons yield a mean stack count; duration boons a percentage. */
    stacking: boolean;
    intervalMs: number;
}

/**
 * Published reports are static JSON served by whatever web bundle is currently
 * deployed, so a report written before `weightedMs`/`attendedMs` existed can
 * still be opened by this code. Rebuild both from the bucket grid in that case:
 * those buckets were sampled rather than time-weighted, so the coverage is
 * approximate -- but the attendance denominator, which is what actually
 * reordered the table, comes out right.
 */
const legacyCoverage = (key: string, fights: Array<any>, intervalMs: number) => {
    let weightedMs = 0;
    let attendedMs = 0;
    fights.forEach((fight) => {
        const value = fight?.values?.[key];
        if (!value || !Array.isArray(value.buckets)) return;
        attendedMs += Math.max(0, Number(fight?.durationMs || 0));
        weightedMs += value.buckets.reduce(
            (sum: number, bucket: any) => sum + Math.max(0, Number(bucket || 0)),
            0,
        ) * intervalMs;
    });
    return { weightedMs, attendedMs };
};

export const computeBoonUptimePercentByPlayer = (
    { players, fights, stacking, intervalMs }: BoonUptimeAggregateInput,
): Map<string, number> => {
    const map = new Map<string, number>();
    if (!Array.isArray(players) || players.length === 0) return map;
    const scale = stacking ? 1 : 100;

    players.forEach((player: any) => {
        const key = String(player?.key || '');
        if (!key || key === '__all__') return;

        let attendedMs = Math.max(0, Number(player?.attendedMs || 0));
        let weightedMs = Math.max(0, Number(player?.weightedMs || 0));
        // Zero coverage has to trigger the fallback as well as zero
        // attendance. The subgroup rows are synthesized by `StatsView`, not
        // read off the report: their attendance is summed from fight
        // durations and so is always positive, while their coverage is
        // averaged from the member entries in `fight.values` -- absent in any
        // report published before `weightedMs` existed. Gating on attendance
        // alone skipped the fallback for exactly those rows, and every
        // subgroup rendered 0.0 beside correct player rows. A row whose
        // coverage is genuinely zero rebuilds to zero here too, so the wider
        // condition costs a grid walk and changes no honest value.
        if (attendedMs <= 0 || weightedMs <= 0) {
            const legacy = legacyCoverage(key, Array.isArray(fights) ? fights : [], intervalMs);
            attendedMs = legacy.attendedMs;
            weightedMs = legacy.weightedMs;
        }
        if (attendedMs <= 0) return;

        map.set(key, (weightedMs / attendedMs) * scale);
    });
    return map;
};
