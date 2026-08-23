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
import { buildFrameLabelSeed, resolveFrameFightLabels } from '../frameLabels';

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
        mergeCommanderStatsInto(target, source, resolveFrameFightLabels(buildFrameLabelSeed(log), i));
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

/**
 * Fix round 1: the native fixtures only ever produce zero (or equal-across-frames)
 * values for several CommanderEntry fields, so a sum bug that degrades to
 * first-wins or last-wins would pass silently. Every field below uses two
 * distinct, positive, per-frame values so that sum(a,b), a, and b are all
 * pairwise distinct -- a wrong merge rule cannot coincidentally match the
 * expected sum.
 */
const makeFightRow = (overrides: Partial<CommanderEntry['fightRows'][number]> = {}): CommanderEntry['fightRows'][number] => ({
    id: 'fight-x',
    shortLabel: 'F1',
    fullLabel: 'Fight X',
    timestamp: 0,
    mapName: 'EBG',
    durationMs: 1000,
    duration: '0:01',
    isWin: true,
    squadCount: 10,
    enemyCount: 10,
    kills: 1,
    downs: 1,
    commanderDowns: 0,
    commanderDeaths: 0,
    alliesDown: 0,
    alliesDead: 0,
    damageTaken: 0,
    damageTakenPerMinute: 0,
    incomingBarrierAbsorbed: 0,
    incomingBarrierAbsorbedPerMinute: 0,
    incomingStrips: 0,
    incomingStripsPerMinute: 0,
    incomingCC: 0,
    incomingCCPerMinute: 0,
    timeToFirstEnemyDownMs: null,
    timeToFirstEnemyDeathMs: null,
    downToKillConversionMs: null,
    hadEarlyDown: null,
    wasStalledPush: null,
    downToKillConversionPct: null,
    failedDownEstimate: 0,
    distanceTraveled: null,
    movementPerMinute: null,
    stationaryPct: null,
    movementBurstCount: null,
    commanderDiedAtMs: null,
    squadDeathsAfterTagDeath: null,
    enemyKillsAfterTagDeath: null,
    collapsedAfterTagDeath: null,
    recoveredAfterTagDeath: null,
    boonUptimePct: 0,
    boonEntries: 0,
    incomingDamageBySkill: [],
    incomingBoonUptimes: [],
    incomingDamageBuckets5s: [],
    incomingBoonBuckets5s: [],
    ...overrides,
});

const makeCommander = (overrides: Partial<CommanderEntry> = {}): CommanderEntry => ({
    key: 'Commander.1234',
    account: 'Commander.1234',
    characterNames: new Set(['AltOne']),
    primaryProfession: 'Guardian',
    professionTimeMs: { Guardian: 1000 },
    fights: 1,
    wins: 1,
    losses: 1,
    totalDurationMs: 1000,
    totalSquadCount: 10,
    totalEnemyCount: 12,
    totalKills: 14,
    totalDowns: 16,
    totalCommanderDowns: 3,
    totalCommanderDeaths: 2,
    totalAlliesDown: 18,
    totalAlliesDead: 4,
    totalDamageTaken: 1000,
    totalIncomingBarrierAbsorbed: 100,
    totalIncomingStrips: 20,
    totalIncomingCC: 22,
    boonWeightedPctMs: 50000,
    boonDurationMs: 1000,
    boonEntriesSeen: 24,
    incomingSkillMap: new Map([
        ['1', { id: '1', name: 'Skill 1', icon: undefined, damage: 100, hits: 2 }],
    ]),
    incomingBoonMap: new Map([
        ['b1', { id: 'b1', name: 'Might', icon: undefined, uptimePctWeightedMs: 50, durationMs: 1000, stacking: false }],
    ]),
    fightRows: [makeFightRow({ id: 'fight-1', shortLabel: 'F1' })],
    ...overrides,
});

// Frame B's values are all distinct from frame A's (see makeCommander above)
// and both are positive, so sum(A, B) != A and sum(A, B) != B for every field
// below -- a first-wins or last-wins bug cannot pass these assertions.
const makeSecondCommander = (overrides: Partial<CommanderEntry> = {}): CommanderEntry => makeCommander({
    characterNames: new Set(['AltTwo']),
    primaryProfession: 'Firebrand',
    professionTimeMs: { Guardian: 500, Firebrand: 200 },
    fights: 2,
    wins: 3,
    losses: 4,
    totalDurationMs: 2000,
    totalSquadCount: 30,
    totalEnemyCount: 32,
    totalKills: 34,
    totalDowns: 36,
    totalCommanderDowns: 5,
    totalCommanderDeaths: 7,
    totalAlliesDown: 38,
    totalAlliesDead: 6,
    totalDamageTaken: 3000,
    totalIncomingBarrierAbsorbed: 200,
    totalIncomingStrips: 40,
    totalIncomingCC: 42,
    boonWeightedPctMs: 30000,
    boonDurationMs: 500,
    boonEntriesSeen: 44,
    incomingSkillMap: new Map([
        // Same skill id: real name should win over the generic "Skill N" placeholder,
        // and damage/hits should sum rather than overwrite.
        ['1', { id: '1', name: 'Real Skill Name', icon: 'icon.png', damage: 50, hits: 1 }],
    ]),
    incomingBoonMap: new Map([
        // Same boon id, stacking DIFFERS from frame A (false) so first-wins is
        // distinguishable from "always take incoming's stacking" (true).
        ['b1', { id: 'b1', name: 'Might', icon: 'might.png', uptimePctWeightedMs: 30, durationMs: 500, stacking: true }],
    ]),
    fightRows: [makeFightRow({ id: 'fight-2', shortLabel: 'F2', timestamp: 1 })],
    ...overrides,
});

/**
 * The synthetic entries below are not built from a log, so their labels are
 * hand-written. Feed the merge a seed that names a zone and matches each row's
 * id, so restating the labels at the merge ordinal reproduces exactly what the
 * fixtures already say and the pins keep testing the merge rules, not labelling.
 */
const syntheticLabels = (index: number, fightId: string) => resolveFrameFightLabels({
    fightName: 'Synthetic Zone', logFightName: '', encounterName: '',
    filePath: fightId, logId: '', durationMs: 0,
}, index);

describe('commander stats merge synthetic pins', () => {
    it('sums every counter/total field with values that distinguish sum from first-wins and from last-wins', () => {
        const target = new Map<string, CommanderEntry>();
        mergeCommanderStatsInto(target, new Map([['Commander.1234', makeCommander()]]), syntheticLabels(0, 'fight-1'));
        mergeCommanderStatsInto(target, new Map([['Commander.1234', makeSecondCommander()]]), syntheticLabels(1, 'fight-2'));
        const merged = target.get('Commander.1234')!;

        expect(merged.fights).toBe(3);
        expect(merged.wins).toBe(4);
        expect(merged.losses).toBe(5);
        expect(merged.totalDurationMs).toBe(3000);
        expect(merged.totalSquadCount).toBe(40);
        expect(merged.totalEnemyCount).toBe(44);
        expect(merged.totalKills).toBe(48);
        expect(merged.totalDowns).toBe(52);
        expect(merged.totalCommanderDowns).toBe(8);
        expect(merged.totalCommanderDeaths).toBe(9);
        expect(merged.totalAlliesDown).toBe(56);
        expect(merged.totalAlliesDead).toBe(10);
        expect(merged.totalDamageTaken).toBe(4000);
        expect(merged.totalIncomingBarrierAbsorbed).toBe(300);
        expect(merged.totalIncomingStrips).toBe(60);
        expect(merged.totalIncomingCC).toBe(64);
        expect(merged.boonWeightedPctMs).toBe(80000);
        expect(merged.boonDurationMs).toBe(1500);
        expect(merged.boonEntriesSeen).toBe(68);
    });

    it('unions characterNames, sums per-profession time (including a brand-new key), and keeps primaryProfession first-wins', () => {
        const target = new Map<string, CommanderEntry>();
        mergeCommanderStatsInto(target, new Map([['Commander.1234', makeCommander()]]), syntheticLabels(0, 'fight-1'));
        mergeCommanderStatsInto(target, new Map([['Commander.1234', makeSecondCommander()]]), syntheticLabels(1, 'fight-2'));
        const merged = target.get('Commander.1234')!;

        expect(Array.from(merged.characterNames.values()).sort()).toEqual(['AltOne', 'AltTwo']);
        expect(merged.professionTimeMs).toEqual({ Guardian: 1500, Firebrand: 200 });
        // primaryProfession is first-wins-unless-Unknown: frame A's 'Guardian'
        // (not 'Unknown') must survive frame B's 'Firebrand'.
        expect(merged.primaryProfession).toBe('Guardian');
    });

    it('folds incomingSkillMap and incomingBoonMap entry-by-entry, including boon stacking first-wins', () => {
        const target = new Map<string, CommanderEntry>();
        mergeCommanderStatsInto(target, new Map([['Commander.1234', makeCommander()]]), syntheticLabels(0, 'fight-1'));
        mergeCommanderStatsInto(target, new Map([['Commander.1234', makeSecondCommander()]]), syntheticLabels(1, 'fight-2'));
        const merged = target.get('Commander.1234')!;

        const skill = merged.incomingSkillMap.get('1')!;
        expect(skill.damage).toBe(150);
        expect(skill.hits).toBe(3);
        expect(skill.name).toBe('Real Skill Name');
        expect(skill.icon).toBe('icon.png');

        const boon = merged.incomingBoonMap.get('b1')!;
        expect(boon.uptimePctWeightedMs).toBe(80);
        expect(boon.durationMs).toBe(1500);
        expect(boon.icon).toBe('might.png');
        // stacking is set only at creation and never revisited by ingest, so
        // merge must leave frame A's `false` alone even though frame B's
        // same-id entry carries `true`.
        expect(boon.stacking).toBe(false);
    });

    it('concatenates fightRows rather than keeping only one frame\'s rows', () => {
        const target = new Map<string, CommanderEntry>();
        mergeCommanderStatsInto(target, new Map([['Commander.1234', makeCommander()]]), syntheticLabels(0, 'fight-1'));
        mergeCommanderStatsInto(target, new Map([['Commander.1234', makeSecondCommander()]]), syntheticLabels(1, 'fight-2'));
        const merged = target.get('Commander.1234')!;

        expect(merged.fightRows.map((row) => row.id)).toEqual(['fight-1', 'fight-2']);
    });
});
