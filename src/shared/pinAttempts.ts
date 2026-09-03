/**
 * Pin attempts — bursts of crowd control aimed at the commander, and whether
 * the tag survived them.
 *
 * This is the half of "pin sniping" that the enemy cast census cannot see. The
 * census (`blocks.focus`) reports only whole-fight aggregates and the casts in
 * a window before a down, so it can say the enemy converged on a tag that FELL
 * and can say nothing at all about a tag that was jumped and lived. Attributed
 * incoming CC (`blocks.cc.taken_events`) is timestamped and carries the
 * applying enemy's id, so a burst can be located in time, sized, and then
 * checked against what happened next.
 *
 * ## What was measured
 *
 * 4,117 real WvW logs, split chronologically into a tuning half and a holdout
 * half that nothing was tuned on.
 *
 * The null is the load-bearing part. Comparing bursts against randomly placed
 * windows is too weak, because CC and downs BOTH cluster inside the enemy's
 * bomb — any window near the bomb catches downs, and the resulting lift mostly
 * measures that violence is bursty. The null used instead holds the fight's
 * timeline fixed and swaps the victim: a burst detected on player A is scored
 * against every OTHER squad member's downs in the same fight. Against that,
 * bursts on the tag precede the tag's own down 5.6x more often than they
 * precede a squad-mate's. The effect is player-specific, not a bomb clock.
 *
 * Severity is the count of DISTINCT enemies in the burst, which is the only
 * feature that held up out of sample, and it replicates closely across the
 * split — see {@link PIN_ATTEMPT_LANDED_RATE}. Burst size and total control
 * duration carry the same signal more weakly (holdout AUC 0.598 and 0.593
 * against 0.605), and adding them buys 0.008 AUC, which is not worth a
 * compound score a reader cannot reason about.
 *
 * ## The cast census is deliberately NOT an input
 *
 * Folding enemy casts into this score was tested and rejected. Fight-level
 * focus index separates a landed burst from a survived one at holdout AUC
 * 0.491 / 0.488 / 0.515 across three parameter settings — chance — and adding
 * it to the severity score degrades holdout AUC monotonically as its weight
 * rises (0.613 → 0.597 → 0.582). Enemy casts belong beside this measurement as
 * context, never inside it. This is the fourth candidate in this family to die
 * on a holdout; see `computePinPressure.ts` for the other three.
 *
 * ## Not era-gated
 *
 * Unlike the cast census, attributed CC exists in every arcdps build in the
 * corpus — all 4,117 logs carried it, including the pre-2026-05 ones where
 * `blocks.focus` is absent entirely. Pin attempts are therefore measurable on
 * fights where Pin Pressure must report "not measurable".
 */

/**
 * arcdps control kinds counted as a pin attempt.
 *
 * Every one of these interrupts or displaces, which is what a burst has to do
 * to convert. `control_kind` is resolved from the skill catalog rather than by
 * hardcoding ids, because arcdps substitutes its own generic control ids for
 * the skill that was actually cast — the id names the EFFECT and the cause is
 * lost. `knockback_or_pull` is one kind rather than two for the same reason:
 * both share a single arcdps id and genuinely cannot be told apart from a log.
 *
 * Immobilise is absent and cannot be added here: it is a condition, not a
 * control event, and axilog's condition block carries enemy-facing targets
 * only, so enemy→squad immobilise never reaches the app.
 */
export const PIN_ATTEMPT_CONTROL_KINDS: ReadonlySet<string> = new Set([
    'stun_or_daze', 'knockback_or_pull', 'fear', 'knockdown', 'stagger', 'launch', 'float',
]);

/** Window a burst's applications must fall inside, in ms. */
export const PIN_ATTEMPT_WINDOW_MS = 2000;
/** Control applications a burst needs. */
export const PIN_ATTEMPT_MIN_APPLICATIONS = 2;
/**
 * Distinct enemies a burst needs.
 *
 * Two is the floor rather than one because one enemy chain-CCing the tag is a
 * duel; the thing worth naming is several enemies arriving together.
 */
export const PIN_ATTEMPT_MIN_SOURCES = 2;
/**
 * How long after a burst a down still counts as that burst landing, in ms.
 *
 * Control has to be followed by damage to convert, so the down trails the
 * control rather than coinciding with it.
 */
export const PIN_ATTEMPT_LANDED_MS = 2000;

/**
 * Share of bursts that downed the tag, by distinct-enemy count, measured on
 * the holdout half of the corpus.
 *
 * These are corpus FREQUENCIES, not a prediction about any one burst, and no
 * surface may render them as this attempt's chance of landing. Train-half
 * figures for the same buckets were 19% / 25% / 36% / 50% — the ladder
 * replicates, which is why it is safe to show at all.
 */
export const PIN_ATTEMPT_LANDED_RATE: ReadonlyArray<{ sources: number; rate: number }> = [
    { sources: 2, rate: 0.20 },
    { sources: 3, rate: 0.28 },
    { sources: 4, rate: 0.36 },
    { sources: 5, rate: 0.47 },
];

export const pinAttemptLandedRate = (sources: number): number => {
    let rate = PIN_ATTEMPT_LANDED_RATE[0].rate;
    for (const step of PIN_ATTEMPT_LANDED_RATE) if (sources >= step.sources) rate = step.rate;
    return rate;
};

/** One incoming control application, as `nativeSeries.readCcTakenEvents` returns it. */
export interface PinAttemptInput {
    timeMs: number;
    /** Applying enemy, or `null` when the source is not in the roster. */
    sourceId: number | null;
    controlKind: string | null;
    durationMs: number;
}

export interface PinAttempt {
    /** Fight-relative ms of the first control application in the burst. */
    startMs: number;
    /** Fight-relative ms of the last. */
    endMs: number;
    applications: number;
    /** Distinct enemies — the severity axis. Sources outside the roster are not counted. */
    sources: number;
    /** Summed control duration applied, in ms. */
    controlMs: number;
    /** Whether the tag went down during the burst or within {@link PIN_ATTEMPT_LANDED_MS} of it. */
    landed: boolean;
}

export interface PinAttemptSummary {
    attempts: PinAttempt[];
    landedCount: number;
    /**
     * Bursts the tag walked out of. The number this whole module exists to
     * produce: a snipe that fails leaves no trace in any down-conditioned
     * metric, so without this it reads as a fight where nothing happened.
     */
    survivedCount: number;
    /** The most attackers that converged in any one burst. `0` when there were none. */
    peakSources: number;
    /**
     * Whether attributed CC was recorded at all. `false` is "not measured",
     * NEVER "no attempts" — axilog omits the container when the pass did not
     * run, and an empty container means it ran and found nothing.
     */
    measured: boolean;
}

export const EMPTY_PIN_ATTEMPTS: PinAttemptSummary = {
    attempts: [], landedCount: 0, survivedCount: 0, peakSources: 0, measured: false,
};

/**
 * Find the bursts on one player and score each against their own downs.
 *
 * Bursts are taken greedily and never overlap: a single sustained chain of
 * control is one attempt, not one attempt per application. Without that a
 * long lockdown would inflate the count in proportion to how long it lasted.
 */
export const findPinAttempts = (
    events: readonly PinAttemptInput[],
    downStartsMs: readonly number[],
    measured: boolean,
): PinAttemptSummary => {
    if (!measured) return EMPTY_PIN_ATTEMPTS;

    const control = events
        .filter(e => e.controlKind != null && PIN_ATTEMPT_CONTROL_KINDS.has(e.controlKind))
        .slice()
        .sort((a, b) => a.timeMs - b.timeMs);

    const attempts: PinAttempt[] = [];
    let i = 0;
    while (i < control.length) {
        const startMs = control[i].timeMs;
        let j = i;
        while (j < control.length && control[j].timeMs <= startMs + PIN_ATTEMPT_WINDOW_MS) j += 1;
        const burst = control.slice(i, j);
        const sources = new Set(burst.map(e => e.sourceId).filter((s): s is number => s != null));

        if (burst.length >= PIN_ATTEMPT_MIN_APPLICATIONS && sources.size >= PIN_ATTEMPT_MIN_SOURCES) {
            const endMs = burst[burst.length - 1].timeMs;
            attempts.push({
                startMs,
                endMs,
                applications: burst.length,
                sources: sources.size,
                controlMs: burst.reduce((s, e) => s + e.durationMs, 0),
                landed: downStartsMs.some(d => d >= startMs && d <= endMs + PIN_ATTEMPT_LANDED_MS),
            });
            i = j;
        } else {
            i += 1;
        }
    }

    const landedCount = attempts.reduce((n, a) => n + (a.landed ? 1 : 0), 0);
    return {
        attempts,
        landedCount,
        survivedCount: attempts.length - landedCount,
        peakSources: attempts.reduce((m, a) => Math.max(m, a.sources), 0),
        measured: true,
    };
};
