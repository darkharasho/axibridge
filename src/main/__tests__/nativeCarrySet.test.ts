import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { DEFAULT_PARSER_SETTINGS } from '../parserSettings';
import { buildNativeCarrySet, CARRIED_PATHS } from '../nativeCarrySet';
import { listConditionApplications, getEntityConditionDamageTakenRows } from '@axiapps/bridge-metrics/nativeConditions';
import { computeOutgoingConditions } from '@axiapps/bridge-metrics/conditionsMetrics';
import { AxilogManager } from '../axilogParser';
import {
    getEntitySkillRows,
    getEntityDamageTotal,
    getEntityDamageSeries,
    getEntityDamageTakenSeries,
    getEntityDownContribution,
} from '@axiapps/bridge-metrics/nativeDamage';
import { listBoonIds, getBuffMeta, getEntityBuffUptime } from '@axiapps/bridge-metrics/nativeBoons';
import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';
import { hasCcTakenEvents, readCcTakenEvents } from '@axiapps/bridge-metrics/nativeSeries';

const report = () => ({
    axilog: { schema: '1.0', version: '0.3.5' },
    encounter: { map: 'Green Alpine Borderlands', duration_ms: 49285 },
    entities: [{ id: 0, role: 'squad' }],
    coverage: { damage: 'present' },
    catalogs: { skills: { 1: 'x' }, buffs: { 2: 'y' }, minions: { 3: 'z' } },
    blocks: { replay: { tracks: [1, 2, 3] }, damage: { big: true } },
});

describe('buildNativeCarrySet', () => {
    it('carries exactly the migrated paths and nothing else', () => {
        const out = buildNativeCarrySet(report())!;
        const topLevel = [...new Set(CARRIED_PATHS.map((p) => p.split('.')[0]))];
        expect(Object.keys(out).sort()).toEqual(topLevel.sort());
    });

    it('never carries a catalog no migrated reader needs', () => {
        // `catalogs.skills` (unit 4) and `catalogs.buffs` (unit 5a) are
        // whitelisted narrowly — `catalogs.minions` has no reader yet and
        // must stay absent even though the fixture report carries it.
        const out = buildNativeCarrySet(report()) as any;
        expect(Object.keys(out.catalogs).sort()).toEqual(['buffs', 'skills']);
        expect(out.catalogs.minions).toBeUndefined();
    });

    it('returns null for a non-report so the seam can attach nothing', () => {
        expect(buildNativeCarrySet(null)).toBeNull();
        expect(buildNativeCarrySet('nope')).toBeNull();
        expect(buildNativeCarrySet({})).toBeNull();
    });

    it('preserves an empty entities array rather than dropping the key', () => {
        // "ran, found nobody" must stay distinguishable from "never parsed".
        const out = buildNativeCarrySet({ ...report(), entities: [] })!;
        expect(out.entities).toEqual([]);
    });
});

describe('carry-set — blocks.cc.taken_events (attributed incoming CC)', () => {
    const ccReport = {
        axilog: { schema: '1.0' },
        blocks: {
            cc: {
                squad: { applied: 12 },
                by_entity: { '7': { applied: 3 } },
                taken_events: { '7': [{ time_ms: 1100, src: 91, skill_id: 23295, duration_ms: 0 }] },
            },
        },
    };

    it('carries the attributed rows the replay draws marks from', () => {
        const out = buildNativeCarrySet(ccReport) as any;
        expect(out.blocks.cc.taken_events['7']).toHaveLength(1);
    });

    it('leaves the rest of blocks.cc behind', () => {
        // `squad`/`by_entity` are already served by `blocks.series`; carrying
        // them would duplicate that data inside every published fight.
        const out = buildNativeCarrySet(ccReport) as any;
        expect(Object.keys(out.blocks.cc)).toEqual(['taken_events']);
    });

    it('omits the container entirely when axilog never ran the pass', () => {
        // Absence is the gate signal the replay reads, so a carry set must not
        // manufacture an empty object and claim the pass ran.
        const out = buildNativeCarrySet({ axilog: { schema: '1.0' }, blocks: { cc: { squad: {} } } }) as any;
        expect(out.blocks?.cc).toBeUndefined();
    });
});

describe('carry-set — blocks.replay (unit 3)', () => {
    const unit3Report = {
        axilog: { schema: '1.0' },
        encounter: { map_id: 95 },
        entities: [],
        coverage: { replay: 'present' },
        blocks: {
            replay: { by_entity: { 3: { dist_to_com: 0 } }, tracks: { poll_ms: 300 } },
            damage: { by_entity: { 3: { total: 999 } } },
            boons: { by_entity: {} },
        },
    };

    it('carries blocks.replay', () => {
        const set: any = buildNativeCarrySet(unit3Report);
        expect(set.blocks.replay.tracks.poll_ms).toBe(300);
        expect(set.blocks.replay.by_entity['3'].dist_to_com).toBe(0);
    });

    it('carries no unmigrated block', () => {
        // The whole point of the whitelist: `blocks` is 2.4 MB and
        // `replay.tracks` alone is the payload that dominates report.json.
        // A wholesale carry would be a silent 100x regression. `damage` (unit
        // 4) is expected here because `unit3Report` supplies it; `boons`
        // (unit 5a) supplies only `by_entity: {}`, which is `{}` not
        // `undefined`, so it is carried too — `cc`/`conditions`/etc. are not.
        const set: any = buildNativeCarrySet(unit3Report);
        expect(Object.keys(set.blocks).sort()).toEqual(['boons', 'damage', 'replay']);
    });

    it('omits blocks entirely when the report has no carried block', () => {
        const set: any = buildNativeCarrySet({ ...unit3Report, blocks: { cc: {} } });
        expect(set.blocks).toBeUndefined();
    });

    it('still returns null for a non-native object', () => {
        expect(buildNativeCarrySet({ encounter: {} })).toBeNull();
    });

    it('declares blocks.replay in CARRIED_PATHS', () => {
        expect(CARRIED_PATHS).toContain('blocks.replay');
    });
});

// ─── Regression guard: every migrated reader must get non-empty output ───────
//
// Every existing bridge-metrics reader test calls `parseFile(..., {everything:
// true})` directly, bypassing `buildNativeCarrySet` entirely — that is
// structurally blind to the whitelist production actually applies. This block
// drives the REAL `AxilogManager.parseLog` seam (the one `axilogParser.ts`
// uses in production, which builds `details.native` via `buildNativeCarrySet`
// under the hood) against the committed anonymized fixture, then runs the
// real migrated readers against the result. It catches "reader migrated but
// its path never added to CARRIED_PATHS" the way nothing else in the suite
// does — this is what should have caught unit 4 and unit 5a.
//
// What it DOES catch: any migrated reader (nativeDamage, nativeBoons, and
// future native* readers exercised here) silently returning empty/zero
// because its native path was dropped by the whitelist.
// What it does NOT catch: a reader that was migrated but never added to this
// test, or a path that's carried but wrong/stale in a way that still yields
// non-empty (non-zero) output. It is a non-emptiness smoke test, not a
// value-correctness test — value correctness is covered by the
// `parseFile(..., {everything:true})`-based unit tests elsewhere.
const COMMITTED_FIXTURE = path.resolve(__dirname, '../../../test-fixtures/axilog/wvw-small.anon.zevtc');
let binding: any = null;
try {
    binding = require('@axiapps/axilog');
} catch {
    binding = null;
}

describe.runIf(binding && fs.existsSync(COMMITTED_FIXTURE))(
    'carry-set regression guard — real readers through the real production seam',
    () => {
        it('produces non-empty damage and boon output through AxilogManager.parseLog', async () => {
            const mgr = new AxilogManager();
            mgr.setSettings(DEFAULT_PARSER_SETTINGS);
            const details: any = await mgr.parseLog(COMMITTED_FIXTURE, 'carry-set-guard');
            expect(details.native).toBeTruthy();

            const squadId = squadEntities(details.native)[0]?.id;
            expect(squadId).toBeDefined();

            // Unit 4 (damage) — blocks.damage / blocks.series / catalogs.skills.
            const skillRows = getEntitySkillRows(details, squadId, { perTarget: true });
            expect(skillRows.length).toBeGreaterThan(0);
            expect(getEntityDamageTotal(details, squadId)).toBeGreaterThan(0);
            // `catalogs.skills` — the shape-mirror test only proves the row
            // count survives; without the catalog `resolveSkillMeta` falls
            // back to the placeholder `Skill ${id}` name, which would still
            // satisfy a bare non-empty-string check. Require at least one
            // row with a real, catalog-resolved name.
            expect(skillRows.some((row) => row.skillName.length > 0 && !/^Skill \d+$/.test(row.skillName))).toBe(
                true,
            );

            // `blocks.series` — no reader above touches it; drive the series
            // readers directly across the squad so dropping the path fails.
            const squad = squadEntities(details.native);
            const anyDamageSeries = squad.some((e: any) => getEntityDamageSeries(details, e.id).some((v) => v > 0));
            expect(anyDamageSeries).toBe(true);
            const anyDamageTakenSeries = squad.some((e: any) =>
                getEntityDamageTakenSeries(details, e.id).some((v) => v > 0));
            expect(anyDamageTakenSeries).toBe(true);

            // `blocks.contribution` — down contribution is sparse per entity,
            // so scan the squad rather than assuming `squadId` has any.
            const anyDownContribution = squad.some((e: any) => getEntityDownContribution(details, e.id) > 0);
            expect(anyDownContribution).toBe(true);

            // Unit 5a (boons) — blocks.boons / catalogs.buffs.
            const boonIds = listBoonIds(details);
            expect(boonIds.length).toBeGreaterThan(0);
            const meta = getBuffMeta(details, boonIds[0]);
            expect(meta).not.toBeNull();
            // At least one squad member must show non-zero uptime/stacks for
            // at least one boon, or `blocks.boons` is present but empty.
            const anyUptime = squadEntities(details.native).some((e: any) =>
                boonIds.some((id) => getEntityBuffUptime(details, e.id, id) > 0));
            expect(anyUptime).toBe(true);

            // Unit 5b (conditions) — blocks.conditions. This path was NOT in
            // CARRIED_PATHS when 5b landed, so outgoing condition applications
            // and uptime were empty in the app while 5b's oracle passed: the
            // oracle parses the FULL report, which the carry set is a subset
            // of. That is the exact gap this guard exists to close.
            expect(listConditionApplications(details).length).toBeGreaterThan(0);
            const conditionResult = computeOutgoingConditions({ details });
            expect(Object.keys(conditionResult.summary).length).toBeGreaterThan(0);
            expect(conditionResult.meta.buffStateSourcesSeen).toBeGreaterThan(0);

            // Unit 5c (incoming conditions) — blocks.damage's by_skill_taken.
            // Carried already, but no reader above touches that sub-object, so
            // narrowing `blocks.damage` later would go unnoticed without this.
            const anyIncoming = squad.some((e: any) =>
                getEntityConditionDamageTakenRows(details, e.id).length > 0);
            expect(anyIncoming).toBe(true);

            // Icons — `catalogs.skills[].icon` and `catalogs.buffs[].icon`
            // back the replay squad panel. Both were EMPTY through
            // `details.skillMap`/`buffMap`, which is what sent them here.
            const skillCatalog: any = (details.native as any)?.catalogs?.skills ?? {};
            expect(Object.values(skillCatalog).some((v: any) => v?.icon)).toBe(true);
            const buffCatalog: any = (details.native as any)?.catalogs?.buffs ?? {};
            expect(Object.values(buffCatalog).some((v: any) => v?.icon)).toBe(true);

            // Attributed incoming CC — blocks.cc.taken_events. Gated on the
            // `timeseries` option alone, so on a real parse it must be here,
            // and every row must classify through catalogs.skills: the
            // control kind is the whole point, and the ids arcdps emits are
            // generic effect ids that only the catalog can name.
            expect(hasCcTakenEvents(details.native)).toBe(true);
            const ccRows = squad.flatMap((e: any) => readCcTakenEvents(details.native, String(e.id)));
            expect(ccRows.length).toBeGreaterThan(0);
            expect(ccRows.every((r: any) => r.controlKind)).toBe(true);
        }, 120_000);
    },
);
