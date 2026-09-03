import type { ReplayTickRate } from './replayTypes';

/**
 * Server tick rate, read for display.
 *
 * arcdps emits `CBTS_TICK` and axilog buckets it into one sample per second.
 * Nominal is 25 Hz. Three properties of that series drive everything here,
 * all measured across real WvW logs rather than assumed:
 *
 * 1. `avg` is useless as a headline. Six sampled fights averaged 25.035,
 *    25.010, 25.026, 25.025, 25.006 and 25.000 — a spread of 0.035 across
 *    fights whose worst seconds ranged from 23.2 down to 16.5. The mean is
 *    dominated by the healthy majority of seconds. The dips are the signal.
 *
 * 2. A `0` in `per_second` means that second produced no `CBTS_TICK` events,
 *    NOT that the server ran at 0 Hz. Index 0 is always 0 (a partial opening
 *    bucket), the final bucket often is, and interior zeros are scattered
 *    through laggy fights — one 101-second fight had nine of them. axilog's
 *    own `min` agrees: on every log measured it equals the minimum of the
 *    NON-zero samples, so the parser already treats zero as "unsampled".
 *    Rendering it raw would flash a red 0.0 nine times on a fight whose real
 *    floor was 19.5.
 *
 * 3. The block is absent entirely on logs with fewer than two `CBTS_TICK`
 *    events, so every reader has to handle null.
 */

/** Below this, the server was measurably behind. Nominal is 25. */
export const TICK_WARN = 23.5;
/** Below this, it was bad enough to make the fight hard to compare to another. */
export const TICK_BAD = 20;

export type TickTone = 'normal' | 'warn' | 'bad';

export const tickTone = (value: number): TickTone =>
    value < TICK_BAD ? 'bad' : value < TICK_WARN ? 'warn' : 'normal';

/**
 * The tick rate to show for a moment, or null if nothing has been sampled yet.
 *
 * Walks backwards past unsampled (`0`) buckets to the last real measurement
 * rather than reporting a gap as a stall — see note 2 above. A fight whose
 * first sampled second is index 1 therefore reads null only at index 0.
 */
export function tickRateAt(tick: ReplayTickRate | null, timeMs: number): number | null {
    if (!tick || tick.perSecond.length === 0) return null;
    const start = Math.min(tick.perSecond.length - 1, Math.max(0, Math.floor(timeMs / 1000)));
    for (let i = start; i >= 0; i--) {
        const value = tick.perSecond[i];
        if (value > 0) return value;
    }
    return null;
}

/**
 * The last `count` sampled seconds ending at `timeMs`, for a sparkline.
 *
 * Unsampled buckets are carried forward from the previous real sample for the
 * same reason `tickRateAt` walks back: a gap should read as "no news", not as
 * a plunge to zero. Leading buckets with nothing before them are dropped.
 */
export function tickWindow(tick: ReplayTickRate | null, timeMs: number, count: number): number[] {
    if (!tick || tick.perSecond.length === 0 || count <= 0) return [];
    const end = Math.min(tick.perSecond.length - 1, Math.max(0, Math.floor(timeMs / 1000)));
    const start = Math.max(0, end - count + 1);
    const out: number[] = [];
    let carried: number | null = tickRateAt(tick, start * 1000);
    for (let i = start; i <= end; i++) {
        const value = tick.perSecond[i];
        if (value > 0) carried = value;
        if (carried !== null) out.push(carried);
    }
    return out;
}
