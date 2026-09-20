/**
 * Budget-driven retention for share reports.
 *
 * GitHub Pages is a ~1 GiB ceiling, not a monthly bill, so age-based expiry is
 * the wrong instrument: it evicts too early for a casual player and far too late
 * for a raid commander. We evict against a budget instead.
 *
 * Nothing is ever deleted. A report is demoted (replay stripped, ~66% of its
 * bytes) and only then tombstoned down to the KV summary card, which we store
 * anyway for Discord previews. That is why a share link never 404s.
 *
 * ┌─ NOT YET IMPLEMENTED ──────────────────────────────────────────────────┐
 * │ THE BYTE-STRIPPING STEP DOES NOT EXIST. Nothing anywhere rewrites or   │
 * │ re-uploads a Tier 1 object with `combatReplay` removed —              │
 * │ `shareService.compressReport` gzips the whole `details` block, replay  │
 * │ included. Today `stage: 'demoted'` changes exactly two things: the OG  │
 * │ description string, and a banner in the viewer.                       │
 * │                                                                        │
 * │ So every `reclaimed` value this module emits is a PROJECTION, derived  │
 * │ from REPLAY_SHARE_OF_REPORT — it is NOT measured, and no bytes are     │
 * │ actually freed by acting on this plan. Whoever wires this up must      │
 * │ implement `stripReplay(details)` + re-`putObject` BEFORE issuing the   │
 * │ PATCH, and should re-derive `reclaimed` from the real post-strip size, │
 * │ before trusting any of these numbers.                                 │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * The Worker's PATCH /r/:code is monotonic (full=0, demoted=1, tombstone=2) and
 * rejects a move to a lower rank, because promoting a tombstone back to `full`
 * would resurrect a record whose bytes the user already deleted. Every action
 * this module emits must therefore move strictly down the ladder.
 */

export const PAGES_BUDGET_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_HIGH_WATER_PCT = 0.8;

/** Replay data is ~66% of a published report; demoting reclaims that much. */
export const REPLAY_SHARE_OF_REPORT = 0.66;

export type RetentionStage = 'full' | 'demoted' | 'tombstone';

export interface RetentionEntry {
    id: string;
    bytes: number;
    stage: RetentionStage;
    /** Last resolve from the Worker, epoch ms. `null` means never opened. */
    seen: number | null;
    pinned: boolean;
}

export interface RetentionAction {
    id: string;
    from: RetentionStage;
    to: RetentionStage;
    /**
     * Bytes this single step is PROJECTED to free — see the "not yet
     * implemented" note in the module header. Always > 0: a step that frees
     * nothing is not emitted at all.
     */
    reclaimed: number;
}

/** `seen: null` (never opened) ranks below every real timestamp, however small. */
const seenRank = (entry: RetentionEntry): number => (entry.seen === null ? -Infinity : entry.seen);

/**
 * Never-opened reports are the most evictable, so they sort first.
 *
 * `-Infinity - -Infinity` is `NaN`, which would make this comparator incoherent
 * for two never-opened entries, so equal ranks are compared-equal before
 * subtracting.
 */
const byLeastRecentlySeen = (a: RetentionEntry, b: RetentionEntry): number => {
    const ra = seenRank(a);
    const rb = seenRank(b);
    if (ra === rb) return 0;
    return ra - rb;
};

export const planRetention = (
    entries: RetentionEntry[],
    opts: { budgetBytes?: number; highWaterPct?: number } = {}
): RetentionAction[] => {
    const budget = opts.budgetBytes ?? PAGES_BUDGET_BYTES;
    const highWater = budget * (opts.highWaterPct ?? DEFAULT_HIGH_WATER_PCT);

    const live = new Map(entries.map((e) => [e.id, { ...e }]));
    // `total` deliberately counts PINNED entries too: they occupy the same
    // budget even though they are never candidates. A repo that is over budget
    // purely because of pinned reports therefore yields an empty plan while
    // still being over budget — correct (there is nothing we are allowed to
    // evict), and the caller is responsible for surfacing that to the user.
    let total = entries.reduce((sum, e) => sum + e.bytes, 0);
    if (total <= highWater) return [];

    const actions: RetentionAction[] = [];
    const evictable = entries
        .filter((e) => !e.pinned)
        .slice()
        .sort(byLeastRecentlySeen);

    // Pass 1: strip replays. Reclaims two-thirds of each report while keeping
    // every stat table, so prefer doing it everywhere before losing a report.
    for (const candidate of evictable) {
        if (total <= highWater) break;
        const current = live.get(candidate.id)!;
        if (current.stage !== 'full') continue;
        const reclaimed = Math.max(0, Math.round(current.bytes * REPLAY_SHARE_OF_REPORT));
        // A step that frees nothing (an empty or malformed-negative entry) is
        // not a plan step — emitting it would have the caller issue a PATCH,
        // and pay a Worker round-trip, for no reclaimed bytes at all. Skipping
        // it is also stage-safe: leaving the entry at `full` keeps pass 2's
        // `stage !== 'demoted'` guard from touching it, so nothing moves.
        if (reclaimed <= 0) continue;
        actions.push({ id: current.id, from: 'full', to: 'demoted', reclaimed });
        current.stage = 'demoted';
        current.bytes -= reclaimed;
        total -= reclaimed;
    }

    // Pass 2: only now give up stat tables.
    for (const candidate of evictable) {
        if (total <= highWater) break;
        const current = live.get(candidate.id)!;
        if (current.stage !== 'demoted') continue;
        const previousBytes = current.bytes;
        const reclaimed = Math.max(0, previousBytes);
        if (reclaimed <= 0) {
            // Frees nothing, so no action — but the clamp still has to be paid
            // for in the running total. Setting a NEGATIVE `bytes` to 0 raises
            // the real occupancy by |bytes|, and the old code subtracted only
            // the clamped `0`, so `total` drifted below the truth and the loop
            // could stop early. Subtracting `previousBytes` (negative, so this
            // adds) keeps the accounting and the clamp in agreement.
            total -= previousBytes;
            current.bytes = 0;
            continue;
        }
        actions.push({ id: current.id, from: 'demoted', to: 'tombstone', reclaimed });
        current.stage = 'tombstone';
        current.bytes = 0;
        total -= reclaimed;
    }

    return actions;
};
