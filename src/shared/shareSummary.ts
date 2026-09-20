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
 * Truncate a string to fit within a byte limit while respecting UTF-8 boundaries
 * and surrogate pair safety. Iterates by code point (via for...of) to ensure
 * surrogate pairs are never split.
 */
export const truncateToBytes = (str: string, maxBytes: number): string => {
    const encoder = new TextEncoder();
    if (encoder.encode(str).length <= maxBytes) return str;

    let out = '';
    let used = 0;
    // for...of iterates by code point, so a surrogate pair is never split.
    for (const ch of str) {
        const size = encoder.encode(ch).length;
        if (used + size > maxBytes) break;
        out += ch;
        used += size;
    }
    return out;
};

const text = (value: unknown, fallback: string): string => {
    const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
    // Truncate to character limit using code points (Array.from splits by code point)
    const chars = Array.from(raw);
    const charTruncated = chars.length > MAX_TEXT ? chars.slice(0, MAX_TEXT).join('') : raw;
    // Then respect the 128-byte field cap, never breaking UTF-8 or surrogate pairs
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
