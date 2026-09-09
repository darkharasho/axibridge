/**
 * A down interval that ended in a stand-up rather than a death.
 *
 * This is the atomic unit of revive tracking and it is ground truth from the
 * log: it depends on no attribution heuristic. `support[0].resurrects`, by
 * contrast, is a count of hand-resurrect CHANNEL STARTS — attempts, not
 * pickups — which is the defect this module exists to correct.
 */
export interface Recovery {
    playerKey: string;
    playerIndex: number;
    downStart: number;
    standUpAt: number;
}

/**
 * A death is recorded as a `dead` interval starting where the `down` interval
 * ended. Allow a small slop for ordering jitter between the two event streams.
 */
export const DEATH_MATCH_TOLERANCE_MS = 250;

const intervals = (value: unknown): number[][] =>
    Array.isArray(value) ? value.filter((entry) => Array.isArray(entry) && entry.length >= 2) : [];

/**
 * True when this player's data can support revive derivation at all.
 *
 * Requires BOTH replay intervals (for recoveries) and rotation (for
 * attribution). Logs parsed without `replay: true` or `rotation: true`, and
 * logs cached before this feature shipped, have neither — for those, completed
 * revives must be reported as null, never as zero.
 */
export const hasReviveData = (player: any): boolean =>
    Array.isArray(player?.combatReplayData?.down)
    && Array.isArray(player?.combatReplayData?.dead)
    && Array.isArray(player?.rotation);

export const deriveRecoveries = (player: any, playerKey: string, playerIndex: number): Recovery[] => {
    const down = intervals(player?.combatReplayData?.down);
    const dead = intervals(player?.combatReplayData?.dead);
    const recoveries: Recovery[] = [];

    for (const [downStart, downEnd] of down) {
        const diedHere = dead.some(([deadStart]) => Math.abs(deadStart - downEnd) <= DEATH_MATCH_TOLERANCE_MS);
        if (diedHere) continue;
        recoveries.push({ playerKey, playerIndex, downStart, standUpAt: downEnd });
    }

    return recoveries;
};
