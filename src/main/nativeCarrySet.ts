/**
 * The slice of axilog's native report that rides along with the EI details
 * for the duration of the migration.
 *
 * It is a WHITELIST, and it grows one migration unit at a time. Keeping it
 * narrow is the whole reason the carry-the-native-report seam is affordable:
 * measured on `wvw-small.anon.zevtc`, the unit 1+2 carry-set is 22 KB against
 * a 2.38 MB full native report, because `blocks` — and inside it
 * `replay.tracks`, the payload that dominates `report.json` — never enters it.
 *
 * When a unit migrates, widen CARRIED_KEYS and re-measure. Never carry
 * `blocks` wholesale; carry the specific block that unit reads.
 */
export const CARRIED_KEYS = ['axilog', 'encounter', 'entities', 'coverage'] as const;

export type CarriedKey = (typeof CARRIED_KEYS)[number];

export type NativeCarrySet = Partial<Record<CarriedKey, unknown>>;

export const buildNativeCarrySet = (report: unknown): NativeCarrySet | null => {
    if (!report || typeof report !== 'object') return null;
    const src = report as Record<string, unknown>;
    // A real native report always carries `axilog`. Its absence means we were
    // handed something else, and attaching a half-built carry-set would make
    // readers believe native data is present.
    if (!src.axilog || typeof src.axilog !== 'object') return null;
    const out: NativeCarrySet = {};
    for (const key of CARRIED_KEYS) {
        if (src[key] !== undefined) out[key] = src[key];
    }
    return out;
};
