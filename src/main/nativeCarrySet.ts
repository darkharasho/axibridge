/**
 * The slice of axilog's native report that rides along with the EI details
 * for the duration of the migration.
 *
 * It is a WHITELIST, and it grows one migration unit at a time. Entries are
 * dotted PATHS, not top-level keys, because `blocks` must never be carried
 * wholesale: it is 2.4 MB against a 22.8 KB unit-1+2 carry-set, and
 * `replay.tracks` inside it is the payload that dominates `report.json`.
 *
 * Unit 3 adds `blocks.replay`. Measured on `wvw-small.anon.zevtc`: the
 * interval half (`by_entity`) plus `arena`/`poll_ms` is 6.3 KB; the 284 KB of
 * `tracks.by_entity` replaces EI's `combatReplayData.positions`, which the
 * details object already carries and which `pruneDetailsForStats` already
 * governs via the user's `parseCombatReplay` setting — so the net is roughly
 * flat, not +290 KB.
 *
 * When a unit migrates, add its path and re-measure.
 */
export const CARRIED_PATHS = [
    'axilog',
    'encounter',
    'entities',
    'coverage',
    'blocks.replay',
] as const;

export type CarriedPath = (typeof CARRIED_PATHS)[number];

export type NativeCarrySet = Record<string, unknown>;

export const buildNativeCarrySet = (report: unknown): NativeCarrySet | null => {
    if (!report || typeof report !== 'object') return null;
    const src = report as Record<string, any>;
    // A real native report always carries `axilog`. Its absence means we were
    // handed something else, and attaching a half-built carry-set would make
    // readers believe native data is present.
    if (!src.axilog || typeof src.axilog !== 'object') return null;

    const out: NativeCarrySet = {};
    for (const path of CARRIED_PATHS) {
        const parts = path.split('.');
        let from: any = src;
        for (const part of parts) {
            if (from === undefined || from === null) break;
            from = from[part];
        }
        if (from === undefined) continue;

        // Materialise only the containers this path actually needs, so a
        // carried `blocks` holds `replay` and nothing else.
        let to: any = out;
        for (let i = 0; i < parts.length - 1; i++) {
            if (typeof to[parts[i]] !== 'object' || to[parts[i]] === null) to[parts[i]] = {};
            to = to[parts[i]];
        }
        to[parts[parts.length - 1]] = from;
    }
    return out;
};
