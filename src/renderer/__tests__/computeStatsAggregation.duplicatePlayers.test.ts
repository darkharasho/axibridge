import { describe, expect, it } from 'vitest';
import { computeStatsSync as computeStatsAggregation } from '../stats/incrementalAggregation';

const squadEntry = (account: string, name: string, profession: string, over: any = {}) => ({
    account, name, profession, notInSquad: false,
    activeTimes: [60000],
    dpsAll: [{ damage: 1000 }],
    defenses: [{ downCount: 0, deadCount: 0, damageTaken: 500, dodgeCount: 0 }],
    statsAll: [{ distToCom: 100, saved: 0 }],
    statsTargets: [[{ downed: 0, killed: 0, damage: 1000, connectedHits: 3 }]],
    support: [{}],
    rotation: [],
    ...over
});

// Mirrors the reported fight (report 20260727-200833-g1o0, Log 21):
// 43 distinct squad accounts across 51 entries, plus 4 pugs.
const buildLog21Roster = () => {
    const players: any[] = [];
    for (let i = 0; i < 40; i++) {
        players.push(squadEntry(`Member.${1000 + i}`, `Squaddie ${i}`, 'Guardian'));
    }
    // Dash.8715: 5 entries (relog + build swaps)
    players.push(squadEntry('Dash.8715', 'Celeana S', 'Thief', { activeTimes: [30000] }));
    for (let i = 0; i < 4; i++) {
        players.push(squadEntry('Dash.8715', 'Celeana S', 'Thief', { activeTimes: [5000 + i] }));
    }
    // Tangella.4031: 3 entries (subgroup move)
    for (let i = 0; i < 3; i++) {
        players.push(squadEntry('Tangella.4031', 'Tanggella', 'Ranger', { activeTimes: [10000 + i] }));
    }
    // Ayumi Anime.1426: 3 entries (build swaps)
    for (let i = 0; i < 3; i++) {
        players.push(squadEntry('Ayumi Anime.1426', 'Bàe Suzy', 'Ranger', { activeTimes: [12000 + i] }));
    }
    for (let i = 0; i < 4; i++) {
        players.push(squadEntry(`Pug.${2000 + i}`, `Pug ${i}`, 'Necromancer', { notInSquad: true }));
    }
    return players;
};

describe('computeStatsAggregation (duplicate player entries)', () => {
    const logs = [{
        status: 'success',
        filePath: 'dup-log-21',
        uploadTime: 1700000000000,
        details: {
            uploadTime: 1700000000000,
            durationMS: 411000,
            success: false,
            players: buildLog21Roster(),
            targets: [{ profession: 'Necromancer', isFake: false }],
            skillMap: {},
            buffMap: {}
        }
    }];

    it('counts 43 (+4) distinct people, matching the real squad', () => {
        const { stats } = computeStatsAggregation({ logs: logs as any[] });
        expect(stats.timelineData).toHaveLength(1);
        expect(stats.timelineData[0].squadCount).toBe(43);
        expect(stats.timelineData[0].friendlyCount).toBe(47);
        expect(stats.avgSquadSize).toBe(43);
        expect(stats.fightBreakdown[0].squadCount).toBe(43);
        expect(stats.fightBreakdown[0].allyCount).toBe(4);
    });

    it('counts each person once in per-fight class counts, by primary build', () => {
        const { stats } = computeStatsAggregation({ logs: logs as any[] });
        const squadClasses = stats.fightBreakdown[0].squadClassCountsFight;
        expect(squadClasses.Guardian).toBe(40);
        expect(squadClasses.Thief).toBe(1);
        expect(squadClasses.Ranger).toBe(2);
        const allyClasses = stats.fightBreakdown[0].allyClassCountsFight;
        expect(allyClasses.Necromancer).toBe(4);
    });

    it('credits participation once per person per log', () => {
        const { stats } = computeStatsAggregation({ logs: logs as any[] });
        const participation = stats.leaderboards?.participation || [];
        const dupRow = participation.find((row: any) => row.account === 'Dash.8715');
        expect(dupRow?.value).toBe(1);
    });
});
