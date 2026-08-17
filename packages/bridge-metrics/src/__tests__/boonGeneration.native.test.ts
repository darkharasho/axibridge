/**
 * Pins the ingest swap in buildBoonTables. The numbers must not move: EI's
 * generation values and native's generation percentages were measured equal
 * on 203/203 squad pairs, so this asserts the table set and the row values
 * against the real fixture parsed both ways.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile, parseFileEi } from '@axiapps/axilog';
import { buildBoonTables, getEntityBoonGenerationMs } from '../boonGeneration';
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

    it('returns zero generation for a boon the entity never generated', () => {
        const squadId = native.entities.find((e: any) => e.role === 'squad').id;
        expect(getEntityBoonGenerationMs(details, squadId, 'selfBuffs', 999999, 50000, 5, 38))
            .toEqual({ generationMs: 0, wastedMs: 0 });
    });
});
