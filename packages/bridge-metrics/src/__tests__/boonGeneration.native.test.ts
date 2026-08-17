/**
 * Pins the ingest swap in buildBoonTables. The numbers must not move: EI's
 * generation values and native's generation percentages were measured equal
 * (within EI's own 3-decimal rounding) on 153/153 non-zero squad/category
 * pairs for one intensity boon (Might, b740) and one duration boon
 * (Protection, b717) -- see the "pins native generation against the EI
 * generation" case below for the exact comparison and tolerance. This file
 * also asserts the table set and the row values against the real fixture
 * parsed both ways.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile, parseFileEi } from '@axiapps/axilog';
import { buildBoonTables, getEntityBoonGenerationMs, getPlayerBoonGenerationMs } from '../boonGeneration';
import { squadEntities } from '../nativeRoster';

const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');

describe('buildBoonTables over native', () => {
    const native: any = parseFile(FIXTURE, { everything: true } as any);
    const ei: any = parseFileEi(FIXTURE, { everything: true } as any);
    const details = { ...ei, native } as any;

    it('builds the same twelve boon tables as the EI path', () => {
        const { boonTables } = buildBoonTables([{ details }]);
        expect(boonTables.map((t) => t.id).sort()).toEqual([
            'b1122', 'b1187', 'b26980', 'b30328', 'b717', 'b718',
            'b719', 'b725', 'b726', 'b740', 'b743', 'b873',
        ]);
        // Conditions must not leak in now that `kind` is a real filter.
        expect(boonTables.some((t) => t.name === 'Bleeding')).toBe(false);
    });

    it('marks intensity boons as stacking', () => {
        const { boonTables } = buildBoonTables([{ details }]);
        expect(boonTables.find((t) => t.id === 'b740')?.stacking).toBe(true);
        expect(boonTables.find((t) => t.id === 'b717')?.stacking).toBe(false);
    });

    it('gives a row to every squad member who actually generated Might, each with a real active time', () => {
        const { boonTables } = buildBoonTables([{ details }]);
        const squad = native.entities.filter((e: any) => e.role === 'squad');
        const might = boonTables.find((t) => t.id === 'b740');

        // Measured from wvw-small.anon.zevtc: 5 of 38 squad members generate
        // zero Might in every category (self/group/squad), identically in
        // native and EI, so buildBoonTables' pre-existing
        // `if (!generationMs && !wastedMs) return;` guard correctly omits
        // them from the table. 33 is the faithfully-reproduced count, not a
        // hardcoded expectation of full squad coverage.
        const expectedAccounts = new Set(
            squadEntities(native)
                .filter((entity) => {
                    const gen = getEntityBoonGenerationMs(details, entity.id, 'selfBuffs', 740, 1000, 5, squad.length);
                    const genGroup = getEntityBoonGenerationMs(details, entity.id, 'groupBuffs', 740, 1000, 5, squad.length);
                    const genSquad = getEntityBoonGenerationMs(details, entity.id, 'squadBuffs', 740, 1000, 5, squad.length);
                    return (
                        gen.generationMs > 0 || gen.wastedMs > 0 ||
                        genGroup.generationMs > 0 || genGroup.wastedMs > 0 ||
                        genSquad.generationMs > 0 || genSquad.wastedMs > 0
                    );
                })
                .map((entity) => entity.account || entity.character || 'Unknown'),
        );

        expect(new Set(might!.rows.map((row) => row.account))).toEqual(expectedAccounts);
        expect(might!.rows.length).toBeGreaterThanOrEqual(33);
        for (const row of might!.rows) {
            expect(row.activeTimeMs).toBeGreaterThan(0);
            expect(row.squadSupported).toBe(squad.length);
        }
    });

    it('reads generation from native without any EI buff payload', () => {
        const { boonTables } = buildBoonTables([{ details }]);
        const stripped = {
            details: {
                ...details,
                players: ei.players.map((p: any) => ({
                    ...p, selfBuffs: undefined, groupBuffs: undefined,
                    squadBuffs: undefined, buffUptimes: undefined, activeTimes: undefined,
                })),
                buffMap: undefined,
            },
        };
        expect(buildBoonTables([stripped]).boonTables).toEqual(boonTables);
    });

    it('pins native generation against the EI generation the pre-migration code read', () => {
        // GENERATION_FIELD/WASTED_FIELD map category -> native field name.
        // Nothing else in this file exercises those maps against a value
        // that didn't come from getEntityBoonGenerationMs itself, so a
        // transposed category (e.g. self <-> group) or a generation/wasted
        // swap would pass every other test here while silently changing
        // every number users see. This test reads EI's own generation
        // arrays via getPlayerBoonGenerationMs -- the exact reader the
        // pre-migration ingest used per player (see git history at
        // 234579ce) -- and compares it to the native reader, pair by pair.
        //
        // Tolerance: EI truncates its `generation`/`wasted` fields to 3
        // decimal places (verified directly against the fixture: EI reports
        // 4.298 self-Might generation where native's raw self_pct is
        // 4.297595617327787 -- a real, expected precision difference, not a
        // bug). computeGenerationMs (shared, untouched by this task)
        // multiplies that value by durationMs and by a per-category
        // recipient count, so a half-ULP (0.0005) rounding gap at the
        // percentage/stack level is amplified by the same count. The
        // tolerance below models exactly that amplification, so it stays
        // tight enough that a transposed category (self's ~4.3 vs squad's
        // ~0.03, i.e. two orders of magnitude apart here) or a
        // generation/wasted swap still fails by a wide margin.
        const durationMs = Number(native?.encounter?.duration_ms ?? ei.durationMS ?? 0);
        const squad = squadEntities(native);
        const squadCount = squad.length;

        const groupCounts = new Map<number, number>();
        squad.forEach((entity) => {
            const group = entity.subgroup ?? 0;
            groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
        });

        const eiPlayersByAccount = new Map<string, any>();
        (ei.players || []).forEach((p: any) => {
            if (p.notInSquad) return;
            const account = p.account || p.name || p.character_name || 'Unknown';
            eiPlayersByAccount.set(account, p);
        });

        const buffMap = ei.buffMap || {};
        const categories: Array<'selfBuffs' | 'groupBuffs' | 'squadBuffs'> = ['selfBuffs', 'groupBuffs', 'squadBuffs'];
        const CATEGORY_RECIPIENT_COUNT: Record<'selfBuffs' | 'groupBuffs' | 'squadBuffs', (groupCount: number, squadCt: number) => number> = {
            selfBuffs: () => 1,
            groupBuffs: (groupCount) => Math.max(groupCount - 1, 0),
            squadBuffs: (_groupCount, squadCt) => Math.max(squadCt - 1, 0),
        };
        // b740 = Might (intensity/stacking), b717 = Protection (duration).
        // Covering one of each means a stacking-mode regression fails too.
        const boonIds = [740, 717];

        let compared = 0;
        for (const entity of squad) {
            const account = entity.account || entity.character || 'Unknown';
            const eiPlayer = eiPlayersByAccount.get(account);
            if (!eiPlayer) continue;
            const group = entity.subgroup ?? 0;
            const groupCount = groupCounts.get(group) || 1;

            for (const category of categories) {
                for (const boonId of boonIds) {
                    const eiResult = getPlayerBoonGenerationMs(
                        eiPlayer, category, boonId, durationMs, groupCount, squadCount, buffMap,
                    );
                    const nativeResult = getEntityBoonGenerationMs(
                        details, entity.id, category, boonId, durationMs, groupCount, squadCount,
                    );
                    if (!eiResult.generationMs && !eiResult.wastedMs && !nativeResult.generationMs && !nativeResult.wastedMs) {
                        continue;
                    }
                    compared += 1;
                    const count = CATEGORY_RECIPIENT_COUNT[category](groupCount, squadCount);
                    const toleranceMs = 0.0006 * durationMs * count + 1;
                    expect(Math.abs(nativeResult.generationMs - eiResult.generationMs)).toBeLessThanOrEqual(toleranceMs);
                    expect(Math.abs(nativeResult.wastedMs - eiResult.wastedMs)).toBeLessThanOrEqual(toleranceMs);
                }
            }
        }

        // Measured on wvw-small.anon.zevtc for boons 740 and 717: 153 of the
        // 38 squad x 3 category x 2 boon combinations have non-zero
        // generation or wasted on at least one side. A regression that
        // zeroes out real data changes this count; a transposed category
        // mapping or a generation/wasted swap fails the tolerance checks
        // above instead (both sides would still be non-zero, just mismatched
        // by far more than rounding).
        expect(compared).toBe(153);
    });

    it('returns zero generation for a boon the entity never generated', () => {
        const squadId = native.entities.find((e: any) => e.role === 'squad').id;
        expect(getEntityBoonGenerationMs(details, squadId, 'selfBuffs', 999999, 50000, 5, 38))
            .toEqual({ generationMs: 0, wastedMs: 0 });
    });
});
