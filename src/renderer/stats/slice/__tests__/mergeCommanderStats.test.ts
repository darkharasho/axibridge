import { describe, it, expect } from 'vitest';
import {
    ingestLogCommanderStats,
    finalizeCommanderStats,
    mergeCommanderStatsInto,
    type CommanderEntry,
} from '../../computeCommanderStats';
import { encodeState, decodeState } from '../stateCodec';
import fixture1 from '../../../../../test-fixtures/native/20260117-175120.json';
import fixture2 from '../../../../../test-fixtures/native/20260117-180135.json';
import fixture3 from '../../../../../test-fixtures/native/20260117-180259.json';

const LOGS = [fixture1, fixture2, fixture3].map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

const direct = (logs: any[]) => {
    const acc = new Map<string, CommanderEntry>();
    logs.forEach((log, i) => ingestLogCommanderStats(log, i, acc));
    return finalizeCommanderStats(acc);
};

const framed = (logs: any[], viaJson = false) => {
    const target = new Map<string, CommanderEntry>();
    logs.forEach((log, i) => {
        const solo = new Map<string, CommanderEntry>();
        ingestLogCommanderStats(log, i, solo);
        const source = viaJson ? decodeState(JSON.parse(JSON.stringify(encodeState(solo)))) : solo;
        mergeCommanderStatsInto(target, source);
    });
    return finalizeCommanderStats(target);
};

describe('commander stats merge equivalence', () => {
    it('reproduces the all-fights result from per-fight maps', () => {
        expect(framed(LOGS)).toEqual(direct(LOGS));
    });

    it('reproduces a two-fight subset', () => {
        const subset = [LOGS[0], LOGS[2]];
        expect(framed(subset)).toEqual(direct(subset));
    });

    it('reproduces a single-fight slice', () => {
        expect(framed([LOGS[1]])).toEqual(direct([LOGS[1]]));
    });

    it('survives a JSON round trip through the state codec', () => {
        expect(framed(LOGS, true)).toEqual(direct(LOGS));
    });
});

describe('commander stats merge synthetic pins', () => {
    it('unions characterNames, sums per-profession time, and folds incoming skill/boon maps entry-by-entry when the same commander account appears across fights (fixture-uncovered rule surface)', () => {
        const makeCommander = (overrides: Partial<CommanderEntry> = {}): CommanderEntry => ({
            key: 'Commander.1234',
            account: 'Commander.1234',
            characterNames: new Set(['AltOne']),
            primaryProfession: 'Guardian',
            professionTimeMs: { Guardian: 1000 },
            fights: 1,
            wins: 1,
            losses: 0,
            totalDurationMs: 1000,
            totalSquadCount: 10,
            totalEnemyCount: 10,
            totalKills: 5,
            totalDowns: 5,
            totalCommanderDowns: 0,
            totalCommanderDeaths: 0,
            totalAlliesDown: 1,
            totalAlliesDead: 0,
            totalDamageTaken: 1000,
            totalIncomingBarrierAbsorbed: 100,
            totalIncomingStrips: 2,
            totalIncomingCC: 3,
            boonWeightedPctMs: 50000,
            boonDurationMs: 1000,
            boonEntriesSeen: 4,
            incomingSkillMap: new Map([
                ['1', { id: '1', name: 'Skill 1', icon: undefined, damage: 100, hits: 2 }],
            ]),
            incomingBoonMap: new Map([
                ['b1', { id: 'b1', name: 'Might', icon: undefined, uptimePctWeightedMs: 50, durationMs: 1000, stacking: true }],
            ]),
            fightRows: [],
            ...overrides,
        });

        const target = new Map<string, CommanderEntry>();
        const first = makeCommander();
        mergeCommanderStatsInto(target, new Map([['Commander.1234', first]]));

        const second = makeCommander({
            characterNames: new Set(['AltTwo']),
            professionTimeMs: { Guardian: 500, Firebrand: 200 },
            fights: 1,
            wins: 0,
            losses: 1,
            incomingSkillMap: new Map([
                // Same skill id: real name should win over the generic "Skill N" placeholder,
                // and damage/hits should sum rather than overwrite.
                ['1', { id: '1', name: 'Real Skill Name', icon: 'icon.png', damage: 50, hits: 1 }],
            ]),
            incomingBoonMap: new Map([
                ['b1', { id: 'b1', name: 'Might', icon: 'might.png', uptimePctWeightedMs: 30, durationMs: 500, stacking: true }],
            ]),
        });
        mergeCommanderStatsInto(target, new Map([['Commander.1234', second]]));

        const merged = target.get('Commander.1234')!;
        expect(Array.from(merged.characterNames.values()).sort()).toEqual(['AltOne', 'AltTwo']);
        expect(merged.professionTimeMs).toEqual({ Guardian: 1500, Firebrand: 200 });

        const skill = merged.incomingSkillMap.get('1')!;
        expect(skill.damage).toBe(150);
        expect(skill.hits).toBe(3);
        expect(skill.name).toBe('Real Skill Name');
        expect(skill.icon).toBe('icon.png');

        const boon = merged.incomingBoonMap.get('b1')!;
        expect(boon.uptimePctWeightedMs).toBe(80);
        expect(boon.durationMs).toBe(1500);
        expect(boon.icon).toBe('might.png');

        expect(merged.fights).toBe(2);
        expect(merged.wins).toBe(1);
        expect(merged.losses).toBe(1);
    });
});
