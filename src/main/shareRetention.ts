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
    /** Bytes this single step frees. */
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
        const reclaimed = Math.max(0, current.bytes);
        actions.push({ id: current.id, from: 'demoted', to: 'tombstone', reclaimed });
        current.stage = 'tombstone';
        current.bytes = 0;
        total -= reclaimed;
    }

    return actions;
};
