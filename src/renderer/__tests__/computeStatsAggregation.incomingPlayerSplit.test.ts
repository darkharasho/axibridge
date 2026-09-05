import { describe, expect, it } from 'vitest';
import { computeStatsSync as computeStatsAggregation } from '../stats/incrementalAggregation';
import { DEFAULT_ENABLED_TOP_STATS } from '../stats/topStatsCatalog';

const settings = {
    showTopStats: true,
    showMvp: false,
    roundCountStats: false,
    splitPlayersByClass: false,
    topStatsMode: 'total' as const,
    topSkillDamageSource: 'target' as const,
    topSkillsMetric: 'damage' as const,
    minParticipationPercent: 0,
    boonBucketIntervalMs: 5000,
    stackingBoonBucketIntervalMs: 5000,
    interruptMode: 'ccOnly' as const,
    mvpBoonMetric: 'uptime' as const,
    noEgoMode: false,
    enabledTopStats: DEFAULT_ENABLED_TOP_STATS,
};

/** One squad member who took damage from `rows`, and nothing else of interest. */
function makeLog(rows: any[]) {
    return {
        status: 'success',
        filePath: 'log-1',
        details: {
            durationMS: 60_000,
            players: [{
                account: 'taker.1',
                name: 'Taker',
                profession: 'Guardian',
                notInSquad: false,
                activeTimes: [60_000],
                dpsAll: [{ damage: 0 }],
                statsAll: [{}],
                support: [{}],
                statsTargets: [[{ killed: 0, downed: 0 }]],
                defenses: [{ downCount: 0, deadCount: 0, damageTaken: 0 }],
                totalDamageTaken: [rows],
            }],
            targets: [],
            skillMap: Object.fromEntries(rows.map((r: any) => [`s${r.id}`, { name: `Skill-${r.id}`, icon: `${r.id}.png` }])),
            buffMap: {},
        },
    };
}

const run = (rows: any[]) =>
    computeStatsAggregation({ logs: [makeLog(rows)] as any[], statsViewSettings: settings }).stats.topIncomingSkills as any[];

describe('topIncomingSkills — player-sourced split', () => {
    it('carries the split through to the rendered rows', () => {
        const rows = run([
            { id: 700, totalDamage: 1000, hits: 4, playerTotal: 250 },
            { id: 701, totalDamage: 500, hits: 2, playerTotal: 500 },
        ]);
        const byId = Object.fromEntries(rows.map((r) => [r.name, r]));
        expect(byId['Skill-700'].damage).toBe(1000);
        expect(byId['Skill-700'].playerDamage).toBe(250);
        expect(byId['Skill-700'].splitDamage).toBe(1000);
    });

    it('defaults to the total-damage ordering', () => {
        // The split must not disturb the view that existed before it.
        const rows = run([
            { id: 700, totalDamage: 1000, hits: 4, playerTotal: 10 },
            { id: 701, totalDamage: 500, hits: 2, playerTotal: 500 },
        ]);
        expect(rows.map((r) => r.name).slice(0, 2)).toEqual(['Skill-700', 'Skill-701']);
    });

    it('retains skills that only rank inside the top 25 by player damage', () => {
        // 26 siege-ish skills outrank the player skill on TOTAL damage, so a
        // plain top-25-by-damage slice would drop it -- and the player view
        // would then be missing its own number one. The union keeps it.
        const siege = Array.from({ length: 26 }, (_, i) => ({
            id: 1000 + i, totalDamage: 10_000 - i, hits: 1, playerTotal: 0,
        }));
        const playerSkill = { id: 700, totalDamage: 900, hits: 1, playerTotal: 900 };
        const rows = run([...siege, playerSkill]);

        const kept = rows.find((r) => r.name === 'Skill-700');
        expect(kept, 'the top player-sourced skill must survive the slice').toBeTruthy();
        expect(kept.playerDamage).toBe(900);
        // It ranks last on total damage -- which is exactly why the
        // damage-only slice would have lost it.
        expect(rows[rows.length - 1].name).toBe('Skill-700');
        // Ranked by player damage it is first, and nothing else scores at all.
        const byPlayer = [...rows].sort((a, b) => (b.playerDamage || 0) - (a.playerDamage || 0));
        expect(byPlayer[0].name).toBe('Skill-700');
        expect(byPlayer[1].playerDamage).toBe(0);
    });

    it('marks coverage as partial when any contributing log predates the field', () => {
        const rows = run([{ id: 700, totalDamage: 900, hits: 3 }]);
        expect(rows[0].damage).toBe(900);
        // splitDamage < damage is the signal the view uses to hide the toggle
        // rather than report a player total it cannot actually vouch for.
        expect(rows[0].splitDamage).toBe(0);
        expect(rows[0].splitDamage).toBeLessThan(rows[0].damage);
    });
});
