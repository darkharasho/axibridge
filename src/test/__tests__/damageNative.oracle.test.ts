/**
 * Damage oracle — EI damage shapes vs native blocks.
 *
 * Unit 4 is close to a like-for-like port: the same quantities, read from a
 * container that states them directly instead of one that had to be guessed
 * at. So most assertions here are equalities, and the interesting ones are
 * the two invariants a hand-built fixture cannot pin:
 *
 *   - the `indirect` join, because `per_target.by_skill` does not carry the
 *     flag and a broken join is silent: condition ticks would simply appear
 *     in the strike tables looking like damage
 *   - the cumulative-series decode, because a mis-decoded RLE run produces
 *     plausible-but-wrong per-second numbers rather than an error
 */
import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted, type DivergenceAllowlist } from '../axilogOracle';
import { computeAllDamageData } from '../../renderer/stats/computeAllDamageData';
import { computeSpikeDamageData } from '../../renderer/stats/computeSpikeDamageData';
import { computeIncomingStrikeDamageData } from '../../renderer/stats/computeIncomingStrikeDamageData';

const CONDITIONS = ['Bleeding', 'Burning', 'Confusion', 'Torment', 'Poison'];

const ALLOWLIST: DivergenceAllowlist = {};

describe('damage oracle — EI shapes vs native blocks', () => {
    const { ei, native } = oracleFixture();
    const details = { ...ei, native } as any;
    const log = { filePath: 'fixture', details };

    const data = computeAllDamageData([log]);
    const squad = native.entities.filter((e: any) => e.role === 'squad');

    it('totals the same squad damage as EI', () => {
        const eiTotal = ei.players
            .filter((p: any) => !p.notInSquad)
            .reduce((s: number, p: any) => s + Number(p?.dpsAll?.[0]?.damage ?? 0), 0);
        expectEqualOrAllowlisted('squadTotalDamage', eiTotal, data.fights[0].totalDamage, ALLOWLIST);
    });

    it('agrees with the native damage block, which is the arbiter', () => {
        // If our per-entity sum disagreed with axilog's own by_entity totals,
        // the roster filter would be wrong, not the arithmetic.
        const nativeTotal = squad.reduce(
            (s: number, e: any) => s + Number(native.blocks.damage.by_entity[String(e.id)]?.total ?? 0), 0,
        );
        expect(data.fights[0].totalDamage).toBe(nativeTotal);
        expect(data.fights[0].totalDamage).toBeGreaterThan(0);
    });

    it('keeps one row per squad member', () => {
        expect(data.fights[0].players).toHaveLength(squad.length);
    });

    it('excludes condition damage from strike skill rows', () => {
        // The join this unit's correctness rests on: per_target.by_skill carries
        // no `indirect`, so a broken join shows up as Bleeding/Burning here.
        const names = data.fights[0].players.flatMap((p) => p.skillRows.map((r) => r.skillName));
        expect(names.length).toBeGreaterThan(0);
        for (const cond of CONDITIONS) expect(names).not.toContain(cond);

        // And the flag is really present on this fixture, so the assertion
        // above is not passing vacuously against an empty by_skill.
        const withOutcomes = Object.values<any>(native.blocks.damage.by_entity)
            .flatMap((e: any) => Object.values<any>(e.by_skill ?? {}))
            .filter((s: any) => s?.outcomes?.indirect === true);
        expect(withOutcomes.length).toBeGreaterThan(0);
    });

    it('decodes each member series to that member reported total', () => {
        // Cumulative RLE: the per-second buckets must sum back to the block
        // total. A short run padded with zeros instead of the last value would
        // pass every shape check and fail exactly here.
        for (const player of data.fights[0].players) {
            const bucketSum = player.buckets5s.reduce((s, v) => s + v, 0);
            if (player.totalDamage === 0) continue;
            expect(bucketSum).toBe(player.totalDamage);
        }
    });

    it('reads no EI damage payload anywhere in the damage path', () => {
        // The only proof nothing fell back: strip EI's damage fields entirely
        // and every number must be unchanged.
        const stripped = {
            ...log,
            details: {
                ...details,
                players: ei.players.map((p: any) => ({
                    ...p,
                    damage1S: undefined,
                    targetDamage1S: undefined,
                    targetPowerDamage1S: undefined,
                    powerDamageTaken1S: undefined,
                    targetDamageDist: undefined,
                    totalDamageDist: undefined,
                    dpsAll: undefined,
                })),
                targets: undefined,
                skillMap: undefined,
                buffMap: undefined,
            },
        };
        expect(computeAllDamageData([stripped])).toEqual(data);
        expect(computeSpikeDamageData([stripped])).toEqual(computeSpikeDamageData([log]));
        expect(computeIncomingStrikeDamageData([stripped]))
            .toEqual(computeIncomingStrikeDamageData([log]));
    });

    it('keeps spike peaks bounded by the damage they came from', () => {
        const spike = computeSpikeDamageData([log]);
        expect(spike.players).toHaveLength(squad.length);
        for (const player of spike.players) {
            // A single hit cannot exceed a 1s window, which cannot exceed 5s.
            expect(player.peakHit).toBeLessThanOrEqual(player.peak1s || player.peakHit);
            expect(player.peak1s).toBeLessThanOrEqual(player.peak5s);
            expect(player.peak5s).toBeLessThanOrEqual(player.peak30s);
        }
        expect(spike.players[0].peakHit).toBeGreaterThan(0);
        expect(spike.players[0].peakSkillName).not.toBe('Unknown Skill');
    });

    it('buckets incoming strike damage by enemy elite spec', () => {
        const incoming = computeIncomingStrikeDamageData([log]);
        // Elite spec where there is one, base profession where there is not:
        // 13 of this fixture's 32 enemies carry an `elite_spec`, and the core
        // ones must land in their own bucket rather than share an empty-string
        // one, which is why this counts resolved labels and not raw specs.
        const enemies = native.entities.filter((e: any) => e.role === 'enemy_player');
        const labels = new Set(enemies.map((e: any) => e.elite_spec || e.profession));
        expect(labels.size).toBe(15);
        expect(incoming.players.length).toBeGreaterThan(0);
        expect(incoming.players.length).toBeLessThanOrEqual(labels.size);
        // Enemies carry no `outcomes` in native, so nothing is filtered from
        // their rows -- but the skill names must still resolve from the catalog.
        const names = incoming.fights[0].values[incoming.players[0].key].skillRows ?? [];
        expect(names.length).toBeGreaterThan(0);
        expect(names.every((r) => !/^Skill \d+$/.test(r.skillName))).toBe(true);
    });
});
