import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { buildNativeCarrySet, CARRIED_PATHS } from '../nativeCarrySet';
import { AxilogManager } from '../axilogParser';
import { DEFAULT_EI_SETTINGS } from '../eiParser';
import { getEntitySkillRows, getEntityDamageTotal } from '@axiapps/bridge-metrics/nativeDamage';
import { listBoonIds, getBuffMeta, getEntityBuffUptime } from '@axiapps/bridge-metrics/nativeBoons';
import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';

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
            mgr.setSettings(DEFAULT_EI_SETTINGS);
            const details: any = await mgr.parseLog(COMMITTED_FIXTURE, 'carry-set-guard');
            expect(details.native).toBeTruthy();

            const squadId = squadEntities(details.native)[0]?.id;
            expect(squadId).toBeDefined();

            // Unit 4 (damage) — blocks.damage / blocks.series / catalogs.skills.
            const skillRows = getEntitySkillRows(details, squadId, { perTarget: true });
            expect(skillRows.length).toBeGreaterThan(0);
            expect(getEntityDamageTotal(details, squadId)).toBeGreaterThan(0);

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
        }, 120_000);
    },
);
