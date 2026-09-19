/**
 * The ~200-byte card stored alongside every share pointer.
 *
 * It does double duty: it is what Discord's crawler renders as a link preview,
 * and it is the floor retention demotes to. Because a tombstone keeps only this,
 * a share link never 404s — so the budget below is load-bearing for the whole
 * cost model, not a nicety.
 *
 * This shape is duplicated in `worker/src/pointer.ts` on purpose: the Worker is a
 * separate deploy target with its own tsconfig and must not import from `src/`.
 */

export const SUMMARY_BUDGET_BYTES = 400;

const MAX_TEXT = 80;
const MAX_FIELD_BYTES = 128;

export interface ShareSummary {
    /** Fight name. */
    f: string;
    /** Map / zone name. */
    m: string;
    /** Duration in ms. */
    d: number;
    /** Fight start, epoch ms. */
    t: number;
    /** Squad size. */
    sq: number;
    /** Enemy count. */
    en: number;
}

/**
 * Truncate a string to fit within a byte limit while respecting UTF-8 boundaries.
 * Never emits a broken surrogate pair or partial UTF-8 sequence.
 */
const truncateToBytes = (str: string, maxBytes: number): string => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);

    if (bytes.length <= maxBytes) {
        return str;
    }

    // Binary search for the longest valid truncation point
    let low = 0;
    let high = str.length;

    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const truncated = str.slice(0, mid);
        const encoded = encoder.encode(truncated);

        if (encoded.length <= maxBytes) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }

    return str.slice(0, low);
};

const text = (value: unknown, fallback: string): string => {
    const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    // First truncate to character limit for practical sizing
    const charTruncated = raw.length > MAX_TEXT ? raw.slice(0, MAX_TEXT) : raw;
    // Then respect the 128-byte field cap, never breaking UTF-8
    return truncateToBytes(charTruncated, MAX_FIELD_BYTES);
};

const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export const buildShareSummary = (details: any): ShareSummary => ({
    f: text(details?.fightName, 'Unknown fight'),
    m: text(details?.zone, 'Unknown'),
    d: num(details?.durationMS),
    t: num(details?.timeStart),
    sq: count(details?.players),
    en: count(details?.targets)
});
