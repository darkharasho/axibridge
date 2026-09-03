/**
 * Pin pressure — the one grading rule, shared by the two surfaces that use it.
 *
 * Both the session-wide Pin Pressure section (`renderer/stats`) and the
 * single-fight Commander tab (`renderer/commander`) grade a fight the same
 * way, so the rule lives here rather than in either of them. The thresholds
 * below are corpus percentiles, not preferences — they are deliberately NOT in
 * `commanderThresholds.ts`, because a user who tunes them is tuning away the
 * calibration rather than expressing a playstyle.
 *
 * ## The rule
 *
 * The tag's aimed enemy casts in the window before ITS downs, per down, over
 * the same figure for the rest of the squad before THEIRS — measured inside a
 * single fight. Because both halves come from one log, fight length, squad
 * size, cast volume and how lethal the fight was all divide out.
 *
 * That within-fight normalisation is the whole reason the rule works. Grading
 * a fight by the tag's ABSOLUTE focus index was measured across 1,774 real WvW
 * fights and is inverted at the top: tag-down rate runs 44.5% / 55.7% / 49.4%
 * / 37.3% across normal→extreme focus, so the most-focused band is the safest.
 * A focus index is a share, and a short low-volume skirmish inflates the tag's
 * share precisely because there is little else to spend casts on. See
 * `renderer/stats/computePinPressure.ts` for the other candidates that died in
 * the same pass, recorded so they are not rebuilt.
 *
 * ## What it is not
 *
 * Not a probability, and no surface may call it one. The census records casts
 * that named the tag, never the intent behind them: a commander who
 * overextends draws the same rows as one who is being hunted.
 */

/**
 * Other-squad downs a fight needs before its ratio means anything.
 *
 * The denominator is a per-down average over the rest of the squad, so a fight
 * where two people went down sets it from two samples and swings wildly. At
 * five the comparison is stable enough to show; below it the honest output is
 * "no comparison", never a low ratio — see {@link PinPressure.comparable}.
 */
export const MIN_OTHER_DOWNS = 5;

/** Ratio at or above which a fight is called out as focused. Corpus p75. */
export const FOCUSED_RATIO = 2;
/** Ratio at or above which the convergence is called out as strong. Corpus p90. */
export const CONVERGED_RATIO = 4;

export type PinPressureBand = 'converged' | 'focused' | 'normal';

export const bandOf = (ratio: number): PinPressureBand =>
    ratio >= CONVERGED_RATIO ? 'converged' : ratio >= FOCUSED_RATIO ? 'focused' : 'normal';

/** Raw counts one fight's grade is computed from — the tag against everyone else. */
export interface PinPressureCounts {
    tagDowns: number;
    tagPreDownCasts: number;
    /** Downs across every squad member except the tag. */
    otherDowns: number;
    otherPreDownCasts: number;
}

export interface PinPressure {
    /** Aimed casts before a down, per down, for the tag. `0` when never downed. */
    tagPerDown: number;
    /** The same figure for the rest of the squad — this fight's own baseline. */
    otherPerDown: number;
    /**
     * `tagPerDown / otherPerDown`. `1` means the enemy converged on the tag no
     * harder than on anyone else who fell. `0` when {@link comparable} is
     * false, where it carries no meaning and must not be rendered as a number.
     */
    ratio: number;
    band: PinPressureBand;
    /**
     * Whether this fight can answer the question at all: the tag went down,
     * enough of the squad went down to set a baseline, and that baseline is
     * non-zero. False is "not measurable here", NEVER "the tag was safe".
     */
    comparable: boolean;
}

/**
 * Grade one fight from its counts.
 *
 * Every guard here fails toward `comparable: false` with a zeroed ratio rather
 * than toward a small or infinite number, because a caller that renders a
 * ratio it should not have is stating something about the fight that the data
 * did not say.
 */
export const gradePinPressure = (counts: PinPressureCounts): PinPressure => {
    const { tagDowns, tagPreDownCasts, otherDowns, otherPreDownCasts } = counts;
    const sampled = tagDowns > 0 && otherDowns >= MIN_OTHER_DOWNS;
    const tagPerDown = tagDowns > 0 ? tagPreDownCasts / tagDowns : 0;
    const otherPerDown = otherDowns > 0 ? otherPreDownCasts / otherDowns : 0;
    // A squad that took downs while drawing no aimed casts leaves the baseline
    // at zero, and a ratio over it would be an infinity dressed as a finding.
    const comparable = sampled && otherPerDown > 0;
    const ratio = comparable ? tagPerDown / otherPerDown : 0;
    return { tagPerDown, otherPerDown, ratio, band: comparable ? bandOf(ratio) : 'normal', comparable };
};
