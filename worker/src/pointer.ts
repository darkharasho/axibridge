/**
 * The pointer record is the only thing we host per share link (~300 B in KV).
 * Everything else — the report bytes — lives in the user's own storage, so this
 * record is what lets a link survive the user relocating them.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const CODE_LENGTH = 8;

export type Stage = 'full' | 'demoted' | 'tombstone';

const STAGES: readonly Stage[] = ['full', 'demoted', 'tombstone'];

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

export interface PointerRecord {
    v: 1;
    /** Absolute URL of the gzip-compressed native report (Tier 1). */
    loc: string;
    /** Absolute URL of the raw .zevtc (Tier 2), when the user opted in. */
    raw?: string;
    stage: Stage;
    sum: ShareSummary;
    created: number;
    /** Last resolve, epoch ms. Drives least-recently-used retention. */
    seen: number;
    /** GitHub login that created the pointer. */
    owner: string;
}

export const generateCode = (bytes?: Uint8Array): string => {
    const source = bytes ?? crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += ALPHABET[(source[i] ?? 0) % ALPHABET.length];
    }
    return code;
};

export const isValidCode = (code: string): boolean =>
    typeof code === 'string' && new RegExp(`^[0-9A-Za-z]{${CODE_LENGTH}}$`).test(code);

export const isSummary = (value: any): value is ShareSummary =>
    !!value
    && typeof value.f === 'string'
    && typeof value.m === 'string'
    && typeof value.d === 'number'
    && typeof value.t === 'number'
    && typeof value.sq === 'number'
    && typeof value.en === 'number';

export const parsePointer = (json: string | null): PointerRecord | null => {
    if (!json) return null;
    let parsed: any;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (!parsed || parsed.v !== 1) return null;
    if (typeof parsed.loc !== 'string' || !parsed.loc) return null;
    if (!STAGES.includes(parsed.stage)) return null;
    if (!isSummary(parsed.sum)) return null;
    if (typeof parsed.created !== 'number' || typeof parsed.seen !== 'number') return null;
    if (typeof parsed.owner !== 'string') return null;
    return parsed as PointerRecord;
};
