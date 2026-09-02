/**
 * `blocks.focus` readers — how much of the enemy's attention each squad
 * player drew.
 *
 * The block is measurable because arcdps's enemy-event filter is DST-driven
 * for cast-start rows: an enemy cast-start survives into the log exactly when
 * its target is squad-side. The surviving rows are therefore a *census* of
 * enemy activity aimed at the squad rather than a sample of it.
 *
 * ## The era gate is the load-bearing part
 *
 * That census only exists in the post-2026-05 arcdps encoding. Measured over
 * 4,143 real WvW logs, the 2,334 pre-rework ones carry ZERO enemy cast rows —
 * while carrying 7.34M enemy→squad strike rows in the same files, so the
 * enemies are plainly present and swinging. A pre-rework log cannot answer
 * "who was being focused" at all, and rendering a zeroed table for one would
 * state the opposite of the truth on 56% of a real log folder.
 *
 * {@link isFocusMeasurable} is therefore checked FIRST at every call site, and
 * it reads `encounter.build` rather than trusting `coverage.focus` alone:
 * axilog only started reporting `unsupported` for this in 1.12.0, and on
 * 1.11.0 the same log reports `empty` with a full zeroed roster. Reading the
 * build makes the app correct on both.
 */

export interface NativeFocusRow {
    /** Enemy cast-starts that named this player as their target. */
    castsDrawn: number;
    /**
     * Enemy cast-starts aimed at this player's pets, clones, phantasms,
     * spirit weapons, turrets or gyros. A SEPARATE axis: axilog measured that
     * folding these into the index weakens its commander separation on every
     * holdout slice, so they are reported beside it, never summed into it.
     *
     * Always 0 on axilog < 1.12.0, which discarded these rows.
     */
    castsDrawnMinions: number;
    /** This player's downs — the denominator for {@link preDownCasts}. */
    downs: number;
    /** Aimed casts inside the pre-down window before each of this player's downs. */
    preDownCasts: number;
}

export interface NativeFocusLog {
    /** Aimed casts at any squad member in this log — the share denominator. */
    totalCasts: number;
    /** Squad players in the fair-share denominator. */
    squadSize: number;
    /** The window `preDownCasts` is counted in. Read from the document, never hardcoded. */
    preDownWindowMs: number;
    rows: Map<number, NativeFocusRow>;
}

const nativeOf = (details: any): any => details?.native ?? null;
const focusOf = (details: any): any => nativeOf(details)?.blocks?.focus ?? null;

const num = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * The arcdps build from which enemy cast-start rows exist as their own
 * statechange. Matches axilog's own `is_post_buff_rework` threshold; builds
 * are fixed-width zero-padded `YYYYMMDD`, so a string compare is a date
 * compare. A malformed build is treated as pre-rework — the same conservative
 * direction axilog takes, and the one that under-claims rather than over-claims.
 */
const CAST_CENSUS_BUILD = '20260501';

export const isPostCastCensusBuild = (build: unknown): boolean =>
    typeof build === 'string' && /^\d{8}$/.test(build) && build >= CAST_CENSUS_BUILD;

/**
 * Whether this log's era can answer the focus question at all.
 *
 * `false` means "not measurable here", NEVER "nobody was targeted" — the two
 * render completely differently and confusing them is the whole reason this
 * function exists.
 */
export const isFocusMeasurable = (details: any): boolean =>
    isPostCastCensusBuild(nativeOf(details)?.encounter?.build);

/**
 * The log's focus block, or `null` when the log cannot carry one.
 *
 * Returns `null` — not an empty block — for a pre-rework log even when axilog
 * 1.11.0 emitted a zeroed one, so a caller cannot accidentally average real
 * zeros into a pooled total.
 */
export const getFocusLog = (details: any): NativeFocusLog | null => {
    if (!isFocusMeasurable(details)) return null;
    const block = focusOf(details);
    if (!block || typeof block !== 'object') return null;
    const byEntity = block.by_entity;
    if (!byEntity || typeof byEntity !== 'object') return null;

    const rows = new Map<number, NativeFocusRow>();
    for (const [key, value] of Object.entries(byEntity as Record<string, any>)) {
        const id = Number(key);
        if (!Number.isFinite(id)) continue;
        rows.set(id, {
            castsDrawn: num(value?.casts_drawn),
            castsDrawnMinions: num(value?.casts_drawn_minions),
            downs: num(value?.downs),
            preDownCasts: num(value?.pre_down_casts),
        });
    }
    return {
        totalCasts: num(block.total_casts),
        squadSize: num(block.squad_size),
        preDownWindowMs: num(block.pre_down_window_ms),
        rows,
    };
};

/**
 * A log's fair share of aimed casts — what ONE evenly-targeted squad member
 * would have drawn.
 *
 * This is the pooling unit. A focus index cannot be averaged across logs (each
 * log has its own squad size and its own cast volume), but `castsDrawn` and
 * this denominator both SUM, so a session-wide index is
 * `Σ castsDrawn / Σ fairShare` over the logs the player actually played.
 */
export const focusFairShare = (log: NativeFocusLog): number =>
    log.squadSize > 0 ? log.totalCasts / log.squadSize : 0;
