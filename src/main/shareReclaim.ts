import { gunzipSync } from 'zlib';
import { DEFAULT_WORKER_URL, compressReport, type ShareTarget } from './shareService';
import { readLedger, toRetentionEntries, totalBytes, updateShare, type ShareLedgerEntry } from './shareLedger';
import {
    DEFAULT_HIGH_WATER_PCT,
    PAGES_BUDGET_BYTES,
    planRetention,
    type RetentionAction
} from './shareRetention';
import { stripShareReplay } from './shareReplayStrip';

/**
 * Executes budget-driven retention: the step that turns `planRetention`'s plan
 * into bytes that are actually gone.
 *
 * `shareRetention` has been correct and inert since it was written — it decides
 * WHICH reports to evict, but nothing called it and nothing acted on its
 * output, so a user's fights repo grew toward the ~1 GiB Pages ceiling with no
 * brake at all. This module is the brake.
 *
 * Three ordering rules are load-bearing:
 *
 * 1. **PATCH before touching bytes.** The pointer's stage is what the viewer
 *    reads to decide whether to render replay. Stripping first and then failing
 *    to PATCH would leave a pointer claiming `full` over bytes that no longer
 *    have replay in them — a broken report. The reverse failure (stage says
 *    `demoted`, replay still present) costs nothing but the unreclaimed bytes,
 *    and the next run retries it.
 * 2. **Re-derive from the published object, not from local state.** A demote
 *    fetches the report back from its own `loc`, strips, and re-uploads. Using
 *    the in-app parsed details instead would restrict retention to logs still
 *    loaded in this session — precisely the ones an LRU should evict LAST.
 * 3. **Measure, never project.** `planRetention.reclaimed` is a projection from
 *    `REPLAY_SHARE_OF_REPORT`. What this module reports is the difference
 *    between the real byte counts before and after, so the numbers shown to a
 *    user are the ones that actually happened.
 *
 * Every step is idempotent and every failure is per-report: one report that
 * cannot be fetched or re-uploaded is skipped and the run continues, because
 * the alternative — aborting — leaves a user over budget with no recourse.
 */

export interface ReclaimStepResult {
    code: string;
    from: string;
    to: string;
    /** Bytes genuinely freed: size before minus size after. Zero on a skip. */
    reclaimed: number;
    error?: string;
}

export interface ReclaimResult {
    /** Footprint before and after, in bytes, counting each object once. */
    before: number;
    after: number;
    steps: ReclaimStepResult[];
    /**
     * True when the plan ran to completion and the footprint is still over the
     * high-water mark — which happens when the remainder is all pinned, all
     * already tombstoned, or every candidate step failed. The caller is
     * expected to surface this; retention cannot fix it on its own.
     */
    stillOverBudget: boolean;
}

export interface ReclaimDeps {
    store: any;
    target: ShareTarget;
    githubToken: string | null;
    fetchImpl?: typeof fetch;
    workerUrl?: string;
    budgetBytes?: number;
    highWaterPct?: number;
}

const errorMessage = (err: unknown, fallback: string): string =>
    (err instanceof Error && err.message) || fallback;

const metaUrl = (workerUrl: string): string => `${workerUrl.replace(/\/+$/, '')}/meta`;

/**
 * How many codes go in one `POST /r/meta`. Mirrors the Worker's `MAX_META_CODES`
 * — deliberately duplicated rather than imported, because `worker/` is a
 * separate build with no Node types and importing across that boundary is what
 * the worker tsconfig exists to prevent. The Worker rejects an oversized batch
 * with a 400, so a drift here degrades to "no timestamps", not to corruption.
 */
export const META_BATCH_SIZE = 250;

const chunk = <T,>(items: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

/**
 * Ask the Worker for each pointer's live last-seen timestamp.
 *
 * Returns whatever it managed to collect. A failed lookup yields no entry for
 * that code, which `toRetentionEntries` maps to `seen: null` — ranked most
 * evictable. That is deliberately the safe direction: under demote-never-delete
 * the worst case of an over-eager demote is a report that loses its replay and
 * can be re-shared, whereas treating an unknown timestamp as "recently seen"
 * would let a full repo never reclaim anything.
 */
export const fetchSeen = async (
    codes: string[],
    deps: { githubToken: string | null; fetchImpl?: typeof fetch; workerUrl?: string }
): Promise<Record<string, number | null>> => {
    const seen: Record<string, number | null> = {};
    if (!deps.githubToken || codes.length === 0) return seen;

    const fetchImpl = deps.fetchImpl ?? fetch;
    const url = metaUrl(deps.workerUrl ?? DEFAULT_WORKER_URL);

    for (const batch of chunk(codes, META_BATCH_SIZE)) {
        try {
            const response = await fetchImpl(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${deps.githubToken}`,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ codes: batch })
            });
            if (response.status !== 200) continue;
            const payload = await response.json() as { meta?: Record<string, { seen?: number | null }> };
            for (const [code, entry] of Object.entries(payload?.meta ?? {})) {
                seen[code] = typeof entry?.seen === 'number' ? entry.seen : null;
            }
        } catch {
            // A retention hint, never load-bearing for correctness.
        }
    }
    return seen;
};

/** Move a pointer down the stage ladder. The Worker rejects any move upward. */
const patchStage = async (
    code: string,
    stage: string,
    deps: { githubToken: string | null; fetchImpl?: typeof fetch; workerUrl?: string }
): Promise<{ success: boolean; error?: string }> => {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const base = (deps.workerUrl ?? DEFAULT_WORKER_URL).replace(/\/+$/, '');
    try {
        const response = await fetchImpl(`${base}/${code}`, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${deps.githubToken}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ stage })
        });
        if (response.status === 200) return { success: true };
        const payload = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: payload.error || `Share service returned ${response.status}.` };
    } catch (err) {
        return { success: false, error: errorMessage(err, 'Failed to reach the share service.') };
    }
};

/**
 * Fetch a published report back, strip its replay, and re-upload it in place.
 *
 * Returns the new size so the caller can report a MEASURED reclaim. The fetch
 * is the step most likely to fail (the object may already be gone, or Pages may
 * still be building), and a failure here is reported rather than thrown so the
 * run continues with the next report.
 */
const demoteBytes = async (
    entry: ShareLedgerEntry,
    deps: ReclaimDeps
): Promise<{ success: boolean; bytes?: number; error?: string }> => {
    const fetchImpl = deps.fetchImpl ?? fetch;

    let compressed: Buffer;
    try {
        const response = await fetchImpl(entry.loc);
        if (!response.ok) return { success: false, error: `Could not fetch the report (${response.status}).` };
        compressed = Buffer.from(await response.arrayBuffer());
    } catch (err) {
        return { success: false, error: errorMessage(err, 'Could not fetch the report.') };
    }

    let next: Buffer;
    try {
        const details = JSON.parse(gunzipSync(compressed).toString('utf8'));
        next = compressReport(stripShareReplay(details));
    } catch (err) {
        return { success: false, error: errorMessage(err, 'Could not rewrite the report.') };
    }

    // A rewrite that grew the object is not a reclaim. It means the report had
    // no replay to drop (already demoted out-of-band, or parsed with replay
    // off), and re-uploading would spend a commit to make things worse.
    if (next.length >= compressed.length) {
        return { success: true, bytes: compressed.length };
    }

    const put = await deps.target.putObject(entry.key, next, 'application/gzip');
    if (!put.success) return { success: false, error: put.error || 'Could not re-upload the report.' };
    return { success: true, bytes: next.length };
};

const applyAction = async (
    action: RetentionAction,
    entry: ShareLedgerEntry,
    deps: ReclaimDeps
): Promise<ReclaimStepResult> => {
    const step: ReclaimStepResult = { code: action.id, from: action.from, to: action.to, reclaimed: 0 };

    // Rule 1: the stage moves first. See the module header.
    const patched = await patchStage(action.id, action.to, deps);
    if (!patched.success) return { ...step, error: patched.error };

    if (action.to === 'tombstone') {
        if (!deps.target.deleteObject) {
            // The pointer is already tombstoned, so the link now renders its
            // summary card and no longer fetches `loc`. The bytes linger, which
            // is why this is reported as a zero-byte step rather than a success.
            updateShare(deps.store, action.id, { stage: 'tombstone' });
            return { ...step, error: 'This storage target cannot remove objects.' };
        }
        const removed = await deps.target.deleteObject(entry.key);
        updateShare(deps.store, action.id, { stage: 'tombstone', ...(removed.success ? { bytes: 0 } : {}) });
        if (!removed.success) return { ...step, error: removed.error };
        return { ...step, reclaimed: entry.bytes };
    }

    const demoted = await demoteBytes(entry, deps);
    if (!demoted.success) {
        updateShare(deps.store, action.id, { stage: 'demoted' });
        return { ...step, error: demoted.error };
    }
    updateShare(deps.store, action.id, { stage: 'demoted', bytes: demoted.bytes });
    // Rule 3: measured, not projected.
    return { ...step, reclaimed: Math.max(0, entry.bytes - (demoted.bytes ?? entry.bytes)) };
};

export const reclaimShareSpace = async (deps: ReclaimDeps): Promise<ReclaimResult> => {
    const ledger = readLedger(deps.store);
    const before = totalBytes(ledger);

    if (!deps.githubToken || ledger.length === 0) {
        return { before, after: before, steps: [], stillOverBudget: false };
    }

    const seen = await fetchSeen(ledger.map((e) => e.code), deps);
    const actions = planRetention(toRetentionEntries(ledger, seen), {
        budgetBytes: deps.budgetBytes,
        highWaterPct: deps.highWaterPct
    });

    const steps: ReclaimStepResult[] = [];
    for (const action of actions) {
        // Re-read per action: each `applyAction` writes the ledger, and a later
        // action in the same plan may target a report an earlier one resized.
        const entry = readLedger(deps.store).find((e) => e.code === action.id);
        if (!entry) continue;
        steps.push(await applyAction(action, entry, deps));
    }

    const after = totalBytes(readLedger(deps.store));
    // Measured against the real post-run footprint rather than inferred from
    // whether the plan was empty: a plan that ran but whose every step failed
    // leaves the user just as over budget as one that was never made.
    const budget = deps.budgetBytes ?? PAGES_BUDGET_BYTES;
    const highWater = budget * (deps.highWaterPct ?? DEFAULT_HIGH_WATER_PCT);

    return { before, after, steps, stillOverBudget: after > highWater };
};
