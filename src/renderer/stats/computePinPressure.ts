import type { EnemyAttentionContribution, EnemyAttentionIngest } from './computeEnemyAttention';

/**
 * Pin pressure — did the enemy's casts converge on the tag before it went down?
 *
 * Built on the same `blocks.focus` census as `computeEnemyAttention`, but asks
 * a per-fight question rather than a session-wide one, and answers it with
 * evidence rather than with a prediction.
 *
 * ## Why this is a ratio against the squad's own downs
 *
 * The obvious design — grade a fight by the commander's absolute focus index
 * and label the high band "pin sniped" — was measured against 1,774 real WvW
 * fights and does not work. Bucketing fights by the tag's focus index gives a
 * tag-down rate of 44.5% / 55.7% / 49.4% / 37.3% across normal→extreme: the
 * MOST focused band is the SAFEST. A focus index is a share, so in a short,
 * low-volume skirmish the tag's share inflates precisely because there was
 * little else for the enemy to spend casts on (extreme-band median: 282 casts
 * over 71s at a 0.15 squad death rate, against 519 over 97.5s at 0.43 for the
 * normal band). An absolute band would have shouted loudest on the quietest
 * fights.
 *
 * Two other candidates died in the same pass and are recorded here so they are
 * not rebuilt: cast CONCENTRATION (the top enemy's share of casts aimed at the
 * tag) discriminates tag downs at AUC 0.41 train / 0.39 holdout — inverted, so
 * "a coordinated snipe reads narrow" is refuted, not merely unsupported; and
 * the tag's focus divided by the squad's maximum beat plain focus marginally
 * (0.654 vs 0.579) while losing to it inside every squad-lethality stratum,
 * which is the signature of a confound rather than a signal.
 *
 * What survived is {@link PinPressureFight.ratio}: the aimed casts the tag
 * drew in the seconds before ITS downs, over the same figure for the rest of
 * the squad before THEIRS, inside the same fight. Because both halves come
 * from one log, fight length, squad size, cast volume and how lethal the fight
 * was all divide out — the artifact that sank the absolute bands cannot occur.
 * Pooled over the corpus the tag draws 1.41x (first chronological half) and
 * 1.63x (second half) what a squad member draws before their own down, and the
 * per-fight spread is wide enough to grade: p50 1.14x, p75 2.30x, p90 4.04x.
 *
 * ## What it is not
 *
 * It is not a probability, and the UI must not call it one. The census records
 * casts that named the tag, never the intent behind them; a commander who
 * overextends draws the same rows as one who is being hunted. It also is not a
 * claim about who the enemy focused overall — across the corpus the tag is the
 * single most-focused squad member in only 15.3% of fights.
 */

/**
 * Other-squad downs a fight needs before its ratio is reported.
 *
 * The denominator is a per-down average over the rest of the squad, so a fight
 * where two people went down sets it from two samples and swings wildly. At
 * five the comparison is stable enough to show; below it the honest output is
 * "no comparison", never a low ratio — see {@link PinPressureFight.comparable}.
 */
export const MIN_OTHER_DOWNS = 5;

/** Ratio at or above which a fight is called out as focused. Corpus p69. */
export const FOCUSED_RATIO = 2;
/** Ratio at or above which the convergence is called out as strong. Corpus p90. */
export const CONVERGED_RATIO = 4;

export type PinPressureBand = 'converged' | 'focused' | 'normal';

export type PinPressureFight = {
    fightId: string;
    /** `"Eternal: Bay (2:31)"`, or the fight id when the log named no zone. */
    label: string;
    tagAccount: string;
    tagProfession: string;
    tagProfessionList: string[];
    tagDowns: number;
    tagPreDownCasts: number;
    /** Downs across every squad member except the tag. */
    otherDowns: number;
    otherPreDownCasts: number;
    /** Aimed casts before a down, per down, for the tag. `0` when never downed. */
    tagPerDown: number;
    /** The same figure for the rest of the squad — this fight's own baseline. */
    otherPerDown: number;
    /**
     * `tagPerDown / otherPerDown`. `1` means the enemy converged on the tag no
     * harder than on anyone else who fell. `0` when {@link comparable} is false,
     * where it carries no meaning and must not be rendered as a number.
     */
    ratio: number;
    band: PinPressureBand;
    /**
     * Whether this fight can answer the question at all: the tag went down, and
     * enough of the squad went down to set a baseline. False is "not measurable
     * here", never "the tag was safe".
     */
    comparable: boolean;
};

export type PinPressureResult = {
    /** Comparable fights first, hardest convergence first. */
    fights: PinPressureFight[];
    /** Fights carrying a usable ratio. */
    comparableFightCount: number;
    /**
     * Measurable fights that could not be compared — the tag never went down,
     * or fewer than {@link MIN_OTHER_DOWNS} of the squad did.
     */
    noComparisonFightCount: number;
    /** Fights too old to carry the cast census at all. */
    unmeasuredFightCount: number;
    /**
     * Pooled lift across the comparable fights: `(Σ tag casts / Σ tag downs)`
     * over `(Σ other casts / Σ other downs)`.
     *
     * Pooled, never averaged — a per-fight ratio built from one tag down is as
     * loud as one built from six, and a mean of ratios would weight them alike.
     * `0` when nothing was comparable.
     */
    pooledRatio: number;
    pooledTagPerDown: number;
    pooledOtherPerDown: number;
    /** Comparable fights at or above {@link FOCUSED_RATIO}. */
    focusedFightCount: number;
    /**
     * axilog's pre-down window in ms, read off the document so the label cannot
     * drift from the measurement. `0` when nothing was measured.
     */
    preDownWindowMs: number;
};

export const EMPTY_PIN_PRESSURE: PinPressureResult = {
    fights: [], comparableFightCount: 0, noComparisonFightCount: 0,
    unmeasuredFightCount: 0, pooledRatio: 0, pooledTagPerDown: 0,
    pooledOtherPerDown: 0, focusedFightCount: 0, preDownWindowMs: 0,
};

const bandOf = (ratio: number): PinPressureBand =>
    ratio >= CONVERGED_RATIO ? 'converged' : ratio >= FOCUSED_RATIO ? 'focused' : 'normal';

const buildFight = (ingest: EnemyAttentionIngest): PinPressureFight | null => {
    const contributions: EnemyAttentionContribution[] = ingest.contributions || [];
    const tag = contributions.find(c => c.isCommander);
    // No tag in this fight is not a pin-pressure answer of any kind, so the
    // fight is dropped rather than counted as an uncomparable one.
    if (!tag) return null;

    let otherDowns = 0;
    let otherPreDownCasts = 0;
    for (const c of contributions) {
        if (c === tag) continue;
        otherDowns += c.downs;
        otherPreDownCasts += c.preDownCasts;
    }

    const comparable = tag.downs > 0 && otherDowns >= MIN_OTHER_DOWNS;
    const tagPerDown = tag.downs > 0 ? tag.preDownCasts / tag.downs : 0;
    const otherPerDown = otherDowns > 0 ? otherPreDownCasts / otherDowns : 0;
    // A squad that took downs while drawing no aimed casts leaves the baseline
    // at zero, and a ratio over it would be an infinity dressed as a finding.
    const ratio = comparable && otherPerDown > 0 ? tagPerDown / otherPerDown : 0;

    return {
        fightId: tag.fightId,
        label: ingest.label || tag.fightId,
        tagAccount: tag.account,
        tagProfession: tag.profession,
        tagProfessionList: [tag.profession],
        tagDowns: tag.downs,
        tagPreDownCasts: tag.preDownCasts,
        otherDowns,
        otherPreDownCasts,
        tagPerDown,
        otherPerDown,
        ratio,
        band: comparable ? bandOf(ratio) : 'normal',
        comparable: comparable && otherPerDown > 0,
    };
};

export const finalizePinPressure = (ingests: EnemyAttentionIngest[]): PinPressureResult => {
    const fights: PinPressureFight[] = [];
    let unmeasuredFightCount = 0;
    let preDownWindowMs = 0;

    for (const ingest of ingests) {
        if (!ingest?.measurable) { unmeasuredFightCount += 1; continue; }
        if (ingest.preDownWindowMs > 0) preDownWindowMs = ingest.preDownWindowMs;
        const fight = buildFight(ingest);
        if (fight) fights.push(fight);
    }

    let tagCasts = 0, tagDowns = 0, otherCasts = 0, otherDowns = 0;
    let comparableFightCount = 0, focusedFightCount = 0;
    for (const f of fights) {
        if (!f.comparable) continue;
        comparableFightCount += 1;
        if (f.ratio >= FOCUSED_RATIO) focusedFightCount += 1;
        tagCasts += f.tagPreDownCasts;
        tagDowns += f.tagDowns;
        otherCasts += f.otherPreDownCasts;
        otherDowns += f.otherDowns;
    }
    const pooledTagPerDown = tagDowns > 0 ? tagCasts / tagDowns : 0;
    const pooledOtherPerDown = otherDowns > 0 ? otherCasts / otherDowns : 0;

    fights.sort((a, b) => {
        if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
        return b.ratio - a.ratio || a.label.localeCompare(b.label);
    });

    return {
        fights,
        comparableFightCount,
        noComparisonFightCount: fights.length - comparableFightCount,
        unmeasuredFightCount,
        pooledRatio: pooledOtherPerDown > 0 ? pooledTagPerDown / pooledOtherPerDown : 0,
        pooledTagPerDown,
        pooledOtherPerDown,
        focusedFightCount,
        preDownWindowMs,
    };
};
