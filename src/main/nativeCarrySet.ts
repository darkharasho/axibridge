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
 * Unit 4 (damage) was migrated in `packages/bridge-metrics/src/nativeDamage.ts`
 * without ever updating this whitelist, so `blocks.damage`/`blocks.series`/
 * `blocks.contribution`/`catalogs.skills` were silently absent in every
 * shipped build — the readers ran on `main` returning zeroed damage totals,
 * empty skill breakdowns, and empty spike/incoming-damage series the whole
 * time. Backfilled here alongside the unit 5a fix below. Measured on
 * `wvw-small.anon.zevtc`: `blocks.damage` is 1113.2 KB (by far the largest
 * single addition this carry-set has taken — nearly 4x `blocks.replay`'s
 * 290.5 KB — because it holds full per-entity, per-target, per-skill hit
 * breakdowns for the whole squad; there is no narrower sub-path that still
 * serves `getEntitySkillRows`/`getEntityDamageTotal`), `blocks.series` is
 * 223.7 KB (comparable to `blocks.replay`), `blocks.contribution` is 9.4 KB,
 * and `catalogs.skills` is 82.1 KB (carried narrowly — `catalogs` wholesale
 * is 103.3 KB and also drags in unrelated catalogs).
 *
 * Unit 5b (conditions) adds `blocks.conditions`, 88.8 KB on the same fixture.
 * It was missed when 5b landed, which made `listConditionApplications` read an
 * absent container and return nothing: outgoing condition applications and
 * uptime were empty in the app while the oracle — which parses the FULL report,
 * not the carry set — passed. Exactly the failure mode this list produced for
 * unit 4.
 *
 * Unit 5a (boons) adds `blocks.boons` and `catalogs.buffs`. Measured on the
 * same fixture: `blocks.boons` is 209.4 KB — this must be carried whole, not
 * narrowed to exclude the nested `per_source` (~90.9 KB of the total),
 * because `getEntityBuffStatesPerSource` backs the live boon-generation- and
 * boon-uptime-over-time timelines. `catalogs.buffs` is 2.0 KB.
 *
 * Attributed incoming CC adds `blocks.cc.taken_events` — the individual rows
 * behind the `cc_taken` series lane, which the replay draws per-member marks
 * from. Carried NARROWLY: `blocks.cc`'s `squad` and `by_entity` halves restate
 * what `blocks.series` already carries, so only the rows are taken. Measured
 * on a 39-player WvW fight: 908 rows, 57.6 KB raw / 5.7 KB gzipped — small
 * against `blocks.replay`, which dominates `report.json`.
 *
 * Enemy attention adds `blocks.focus` — the enemy cast-start census behind the
 * Enemy Attention section. It cannot be measured on `wvw-small.anon.zevtc` like
 * every path above it, because that fixture is arcdps build `20260114` and
 * predates the census entirely (axilog omits the block there). Measured
 * instead across 72 sampled post-rework logs from a real arcdps folder: the
 * LARGEST was 19.6 KB raw / 2.8 KB gzipped, on a 50-player fight with 1,616
 * aimed casts across 227 distinct enemy skills — against a 41.7 MB native
 * report for that same fight. Its `skills[]` ids resolve through
 * `catalogs.skills`, already carried above for unit 4.
 *
 * When a unit migrates, add its path and re-measure.
 */
export const CARRIED_PATHS = [
    'axilog',
    'encounter',
    'entities',
    'coverage',
    'blocks.replay',
    'blocks.damage',
    'blocks.series',
    'blocks.contribution',
    'catalogs.skills',
    'blocks.boons',
    'catalogs.buffs',
    'blocks.conditions',
    'blocks.cc.taken_events',
    'blocks.focus',
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
