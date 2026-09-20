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
 * This module only PLANS. `shareReclaim.reclaimShareSpace` executes the plan —
 * it re-uploads a replay-stripped copy (`shareReplayStrip`), deletes the object
 * at the tombstone rung, and PATCHes the pointer — and `shareHandlers` runs it
 * at publish time, right after each share is recorded in `shareLedger`.
 *
 * The `reclaimed` figure below is still a PROJECTION, derived from
 * `REPLAY_SHARE_OF_REPORT`, because this module cannot know a report's
 * post-strip size without fetching and rewriting it. It is used only to decide
 * how far down the plan to go. The numbers reported to a user come from
 * `ReclaimStepResult.reclaimed`, which is measured: size before minus size
 * after. Do not surface these ones.
 *
 * The Worker's PATCH /r/:code is monotonic (full=0, demoted=1, tombstone=2) and
 * rejects a move to a lower rank, because promoting a tombstone back to `full`
 * would resurrect a record whose bytes the user already deleted. Every action
 * this module emits must therefore move strictly down the ladder.
 */

export const PAGES_BUDGET_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_HIGH_WATER_PCT = 0.8;

/**
 * Fraction of a published report's STORED bytes that demoting reclaims.
 *
 * Measured, not assumed. Running `stripShareReplay` over every fixture in
 * `test-fixtures/native/` and comparing gzip sizes gives, per fight:
 *
 *     3.5 MB raw / 518 KB gz -> 189 KB   63.5%
 *     4.2 MB raw / 606 KB gz -> 469 KB   22.7%
 *     4.1 MB raw / 594 KB gz -> 468 KB   21.3%
 *     5.1 MB raw / 704 KB gz -> 525 KB   25.4%
 *     5.5 MB raw / 837 KB gz -> 533 KB   36.3%
 *     5.7 MB raw / 792 KB gz -> 632 KB   20.3%
 *     5.9 MB raw / 814 KB gz -> 616 KB   24.3%
 *    31.6 MB raw / 4.3 MB gz -> 2.5 MB   41.3%
 *
 * n=8, min 20.3%, median 25.4%, max 63.5%.
 *
 * This was 0.66 until it was measured, on the strength of the profiling note
 * that replay is ~66% of a published report. That figure is real but describes
 * a different thing: the RAW size of a multi-fight session `report.json`. Two
 * corrections apply here. Position tracks are long runs of near-identical
 * numbers, so gzip already removes most of their cost — the same strip that
 * frees 30% of the raw JSON frees only ~10% of it again once compressed, and
 * retention budgets against stored bytes, not raw ones. And a share is one
 * fight, whose non-replay blocks (catalogs, buff maps, skill maps) are a fixed
 * overhead that a session report amortises over many fights.
 *
 * Over-projecting is the harmful direction: the planner stops demoting once the
 * PROJECTED total drops under the high-water mark, so at 0.66 it believed it
 * had freed ~2.6x what it really had and left the user over budget. The spread
 * above (20%-63%) means a single run will still miss in either direction; that
 * residual is what `ReclaimResult.stillOverBudget` reports, and the next
 * publish re-plans against the ledger's now-measured sizes.
 */
export const REPLAY_SHARE_OF_REPORT = 0.25;

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
     * Bytes this single step is PROJECTED to free — see the module header, and
     * prefer `ReclaimStepResult.reclaimed` for anything a user reads. Always
     * > 0: a step that frees nothing is not emitted at all.
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
