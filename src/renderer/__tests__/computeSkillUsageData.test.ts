import { describe, it, expect } from 'vitest';
import { computeSkillUsageData } from '../stats/computeSkillUsageData';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeLog = (overrides: Record<string, any> = {}) => ({
    id: 'log-1',
    filePath: '/logs/log-1.zevtc',
    uploadTime: 1700000000,
    details: {
        fightName: 'Test Fight',
        durationMS: 60000,
        skillMap: {
            s1001: { name: 'Sword Strike', icon: 'https://example.com/sword.png' },
            s1002: { name: 'Fireball' },
        },
        players: [
            {
                account: 'Alice.1234',
                name: 'Alice',
                profession: 'Guardian',
                notInSquad: false,
                activeTimes: [30000],
                rotation: [
                    { id: 1001, skills: [{ time: 100 }, { time: 200 }] },
                    { id: 1002, skills: [{ time: 300 }] },
                ],
            },
            {
                account: 'Bob.5678',
                name: 'Bob',
                profession: 'Warrior',
                notInSquad: false,
                activeTimes: [45000],
                rotation: [
                    { id: 1001, skills: [{ time: 100 }] },
                ],
            },
        ],
        ...overrides,
    },
});

// ─── Basic structure ───────────────────────────────────────────────────────────

describe('computeSkillUsageData — basic structure', () => {
    it('returns empty results for empty validLogs', () => {
        const result = computeSkillUsageData([]);
        expect(result.logRecords).toHaveLength(0);
        expect(result.players).toHaveLength(0);
        expect(result.skillOptions).toHaveLength(0);
        expect(result.resUtilitySkills).toEqual([]);
    });

    it('produces one logRecord per input log', () => {
        const result = computeSkillUsageData([makeLog()]);
        expect(result.logRecords).toHaveLength(1);
    });

    it('produces multiple logRecords for multiple logs', () => {
        const log2 = { ...makeLog(), id: 'log-2', filePath: '/logs/log-2.zevtc' };
        const result = computeSkillUsageData([makeLog(), log2]);
        expect(result.logRecords).toHaveLength(2);
    });
});

// ─── skillOptions ──────────────────────────────────────────────────────────────

describe('skillOptions', () => {
    it('aggregates skill totals across all players and logs', () => {
        const result = computeSkillUsageData([makeLog()]);
        const sword = result.skillOptions.find((s) => s.id === 's1001');
        const fire = result.skillOptions.find((s) => s.id === 's1002');
        // Alice used Sword Strike 2x, Bob 1x → total 3
        expect(sword?.total).toBe(3);
        // Alice used Fireball 1x
        expect(fire?.total).toBe(1);
    });

    it('sorts skillOptions by total descending', () => {
        const result = computeSkillUsageData([makeLog()]);
        const totals = result.skillOptions.map((s) => s.total);
        expect(totals).toEqual([...totals].sort((a, b) => b - a));
    });

    it('resolves skill name from skillMap', () => {
        const result = computeSkillUsageData([makeLog()]);
        const sword = result.skillOptions.find((s) => s.id === 's1001');
        expect(sword?.name).toBe('Sword Strike');
    });

    it('falls back to "Skill <id>" when skill is not in skillMap', () => {
        const log = makeLog({ skillMap: {} }); // empty skill map
        const result = computeSkillUsageData([log]);
        const skill = result.skillOptions.find((s) => s.id === 's1001');
        expect(skill?.name).toBe('Skill 1001');
    });

    it('includes icon from skillMap when present', () => {
        const result = computeSkillUsageData([makeLog()]);
        const sword = result.skillOptions.find((s) => s.id === 's1001');
        expect(sword?.icon).toBe('https://example.com/sword.png');
    });

    it('icon is undefined when not in skillMap', () => {
        const result = computeSkillUsageData([makeLog()]);
        const fire = result.skillOptions.find((s) => s.id === 's1002');
        expect(fire?.icon).toBeUndefined();
    });

    it('accumulates totals across multiple logs', () => {
        const log2 = { ...makeLog(), id: 'log-2', filePath: '/logs/log-2.zevtc' };
        const result = computeSkillUsageData([makeLog(), log2]);
        const sword = result.skillOptions.find((s) => s.id === 's1001');
        // 3 per log × 2 logs = 6
        expect(sword?.total).toBe(6);
    });
});

// ─── players ──────────────────────────────────────────────────────────────────

describe('players', () => {
    it('creates one player entry per unique account+profession', () => {
        const result = computeSkillUsageData([makeLog()]);
        expect(result.players).toHaveLength(2);
    });

    it('excludes notInSquad players', () => {
        const log = makeLog({
            players: [
                {
                    account: 'Ghost.9999',
                    profession: 'Thief',
                    notInSquad: true,
                    activeTimes: [10000],
                    rotation: [{ id: 1001, skills: [{}] }],
                },
            ],
        });
        const result = computeSkillUsageData([log]);
        expect(result.players).toHaveLength(0);
    });

    it('accumulates skillTotals per player', () => {
        const result = computeSkillUsageData([makeLog()]);
        const alice = result.players.find((p) => p.account === 'Alice.1234');
        expect(alice?.skillTotals['s1001']).toBe(2);
        expect(alice?.skillTotals['s1002']).toBe(1);
    });

    it('accumulates log count across multiple logs', () => {
        const log2 = { ...makeLog(), id: 'log-2', filePath: '/logs/log-2.zevtc' };
        const result = computeSkillUsageData([makeLog(), log2]);
        const alice = result.players.find((p) => p.account === 'Alice.1234');
        expect(alice?.logs).toBe(2);
    });

    it('accumulates totalActiveSeconds across multiple logs', () => {
        const log2 = { ...makeLog(), id: 'log-2', filePath: '/logs/log-2.zevtc' };
        const result = computeSkillUsageData([makeLog(), log2]);
        const alice = result.players.find((p) => p.account === 'Alice.1234');
        // activeTimes[0] = 30000ms = 30s per log, 2 logs → 60s
        expect(alice?.totalActiveSeconds).toBeCloseTo(60);
    });

    it('deduplicates players across logs (same account + profession = same entry)', () => {
        const log2 = { ...makeLog(), id: 'log-2', filePath: '/logs/log-2.zevtc' };
        const result = computeSkillUsageData([makeLog(), log2]);
        // 2 unique players (Alice + Bob), not 4
        expect(result.players).toHaveLength(2);
    });

    it('uses account as displayName', () => {
        const result = computeSkillUsageData([makeLog()]);
        const alice = result.players.find((p) => p.account === 'Alice.1234');
        expect(alice?.displayName).toBe('Alice.1234');
    });
});

// ─── logRecords ───────────────────────────────────────────────────────────────

describe('logRecords', () => {
    it('uses filePath as record id when present', () => {
        const result = computeSkillUsageData([makeLog()]);
        expect(result.logRecords[0].id).toBe('/logs/log-1.zevtc');
    });

    it('uses log.id as record id when filePath is absent', () => {
        const log = { id: 'my-log', details: { fightName: 'Test', players: [] } };
        const result = computeSkillUsageData([log]);
        expect(result.logRecords[0].id).toBe('my-log');
    });

    it('resolves durationSeconds from durationMS', () => {
        const result = computeSkillUsageData([makeLog()]);
        expect(result.logRecords[0].durationSeconds).toBeCloseTo(60);
    });

    it('records per-player active seconds in playerActiveSeconds map', () => {
        const result = computeSkillUsageData([makeLog()]);
        const record = result.logRecords[0];
        const aliceKey = 'Alice.1234|Guardian';
        expect(record.playerActiveSeconds![aliceKey]).toBeCloseTo(30);
    });

    it('builds skillEntries with per-player counts', () => {
        const result = computeSkillUsageData([makeLog()]);
        const record = result.logRecords[0];
        expect(record.skillEntries['s1001'].players['Alice.1234|Guardian']).toBe(2);
        expect(record.skillEntries['s1001'].players['Bob.5678|Warrior']).toBe(1);
    });

    it('skips rotation entries with no skills', () => {
        const log = makeLog({
            players: [{
                account: 'Alice.1234',
                profession: 'Guardian',
                notInSquad: false,
                activeTimes: [0],
                rotation: [{ id: 9999, skills: [] }],
            }],
        });
        const result = computeSkillUsageData([log]);
        expect(result.skillOptions).toHaveLength(0);
    });

    it('skips rotation entries with no id', () => {
        const log = makeLog({
            players: [{
                account: 'Alice.1234',
                profession: 'Guardian',
                notInSquad: false,
                activeTimes: [0],
                rotation: [{ skills: [{}] }],
            }],
        });
        const result = computeSkillUsageData([log]);
        expect(result.skillOptions).toHaveLength(0);
    });
});

// ─── edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
    it('handles logs with no details gracefully', () => {
        const result = computeSkillUsageData([{ id: 'no-details' }]);
        expect(result.logRecords).toHaveLength(0);
        expect(result.players).toHaveLength(0);
    });

    it('handles players with empty rotation array', () => {
        const log = makeLog({
            players: [{
                account: 'Alice.1234',
                profession: 'Guardian',
                notInSquad: false,
                activeTimes: [10000],
                rotation: [],
            }],
        });
        const result = computeSkillUsageData([log]);
        expect(result.players).toHaveLength(1);
        expect(result.skillOptions).toHaveLength(0);
    });

    it('handles players with undefined rotation', () => {
        const log = makeLog({
            players: [{
                account: 'Alice.1234',
                profession: 'Guardian',
                notInSquad: false,
                activeTimes: [10000],
            }],
        });
        const result = computeSkillUsageData([log]);
        expect(result.players).toHaveLength(1);
    });

    it('always returns resUtilitySkills as empty array', () => {
        const result = computeSkillUsageData([makeLog()]);
        expect(result.resUtilitySkills).toEqual([]);
    });
});

// ─── proc flag passthrough ───────────────────────────────────────────────────

describe('computeSkillUsageData — proc flag passthrough', () => {
    it('passes isTraitProc, isGearProc, and isUnconditionalProc from skillMap to skillOptions', () => {
        const log = makeLog({
            skillMap: {
                s1001: { name: 'Windborne Notes', icon: 'https://example.com/wn.png', autoAttack: false, isTraitProc: true, isGearProc: false, isUnconditionalProc: false },
                s1002: { name: 'Sigil of Fire', icon: 'https://example.com/fire.png', autoAttack: false, isTraitProc: false, isGearProc: true, isUnconditionalProc: false },
            },
        });
        const result = computeSkillUsageData([log]);
        const wnOption = result.skillOptions.find((o) => o.id === 's1001');
        const sigOption = result.skillOptions.find((o) => o.id === 's1002');
        expect(wnOption?.isTraitProc).toBe(true);
        expect(wnOption?.isGearProc).toBe(false);
        expect(sigOption?.isGearProc).toBe(true);
        expect(sigOption?.isTraitProc).toBe(false);
    });

    it('leaves proc flags undefined when skillMap entries lack them', () => {
        const result = computeSkillUsageData([makeLog()]);
        const option = result.skillOptions.find((o) => o.id === 's1001');
        expect(option?.isTraitProc).toBeUndefined();
        expect(option?.isGearProc).toBeUndefined();
        expect(option?.isUnconditionalProc).toBeUndefined();
    });
});
