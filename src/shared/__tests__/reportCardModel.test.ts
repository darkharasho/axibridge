import { describe, expect, it } from 'vitest';
import { buildReportCardModel, formatCardValue, REPORT_CARD_BOARDS } from '../reportCardModel';

const lb = (...vals: Array<[string, string, number]>) =>
    vals.map(([account, profession, value], i) => ({ rank: i + 1, account, profession, value }));

const meta = {
    dateLabel: 'Saturday, September 7, 2026',
    guild: { id: 'G1', name: 'Axius Imperium', tag: 'AXI' },
};

const stats = {
    total: 12, wins: 8, losses: 4,
    avgSquadSize: 41.4, avgEnemies: 36.6,
    squadKDR: '2.31', enemyKDR: '0.43',
    totalSquadKills: 184, totalSquadDeaths: 79, totalSquadDowns: 231,
    totalEnemyKills: 79, totalEnemyDeaths: 184, totalEnemyDowns: 96,
    mapData: [
        { name: 'Eternal Battlegrounds', value: 5, color: '#ffffff' },
        { name: 'Red Desert Borderlands', value: 4, color: '#ef4444' },
    ],
    fightBreakdown: [
        { shortLabel: 'F1', isWin: true },
        { shortLabel: 'F2', isWin: false },
    ],
    leaderboards: {
        damage: lb(['Harasho.1234', 'Firebrand', 4_210_000], ['Nova.5678', 'Scourge', 3_880_000]),
        healing: lb(['Grove.1111', 'Druid', 2_020_000]),
        barrier: lb(['Dusk.2222', 'Scourge', 988_400]),
        cleanses: lb(['Rho.3333', 'Tempest', 1204]),
        strips: lb(['Void.4444', 'Spellbreaker', 612]),
        stability: lb(['Dusk.2222', 'Firebrand', 38_400]),
        ccAndInterrupts: lb(['Iron.5555', 'Herald', 418]),
        downContrib: lb(['Nova.5678', 'Scourge', 1_940_000]),
        closestToTag: lb(['Dusk.2222', 'Firebrand', 312.7]),
    },
};

describe('formatCardValue', () => {
    it('compacts large numbers', () => {
        expect(formatCardValue(4_210_000, 'compact')).toBe('4.21M');
        expect(formatCardValue(988_400, 'compact')).toBe('988k');
        expect(formatCardValue(612, 'compact')).toBe('612');
    });

    it('formats integers with separators', () => {
        expect(formatCardValue(1204, 'int')).toBe('1,204');
    });

    it('rounds distances', () => {
        expect(formatCardValue(312.7, 'dist')).toBe('313');
    });

    it('never emits NaN or Infinity', () => {
        expect(formatCardValue(Number.NaN, 'int')).toBe('—');
        expect(formatCardValue(Number.POSITIVE_INFINITY, 'dist')).toBe('—');
    });
});

describe('buildReportCardModel', () => {
    it('maps the session header', () => {
        const m = buildReportCardModel(meta, stats);
        expect(m.fightCount).toBe(12);
        expect(m.recordLabel).toBe('8W – 4L');
        expect(m.guildTag).toBe('AXI');
        expect(m.guildName).toBe('Axius Imperium');
        expect(m.dateLabel).toBe('Saturday, September 7, 2026');
    });

    it('maps both sides and rounds squad sizes', () => {
        const m = buildReportCardModel(meta, stats);
        expect(m.squad).toEqual({ kills: 184, downs: 231, deaths: 79, kdr: '2.31' });
        expect(m.enemy).toEqual({ kills: 79, downs: 96, deaths: 184, kdr: '0.43' });
        expect(m.size).toEqual({ squad: 41, enemy: 37 });
    });

    it('passes maps and fights through', () => {
        const m = buildReportCardModel(meta, stats);
        expect(m.maps).toHaveLength(2);
        expect(m.maps[0]).toEqual({ name: 'Eternal Battlegrounds', value: 5, color: '#ffffff' });
        expect(m.fights).toEqual([{ label: 'F1', isWin: true }, { label: 'F2', isWin: false }]);
    });

    it('emits all nine boards in order with formatted values', () => {
        const m = buildReportCardModel(meta, stats);
        expect(m.boards.map((b) => b.key)).toEqual(REPORT_CARD_BOARDS.map((b) => b.key));
        const damage = m.boards.find((b) => b.key === 'damage')!;
        expect(damage.leaders[0]).toEqual({ rank: 1, account: 'Harasho.1234', profession: 'Firebrand', value: '4.21M' });
        expect(m.boards.find((b) => b.key === 'stability')!.leaders[0].value).toBe('38.4k');
        expect(m.boards.find((b) => b.key === 'closestToTag')!.leaders[0].value).toBe('313');
    });

    it('honors topN', () => {
        const m = buildReportCardModel(meta, stats, { topN: 1 });
        expect(m.boards.find((b) => b.key === 'damage')!.leaders).toHaveLength(1);
    });

    it('survives a single-fight session', () => {
        const m = buildReportCardModel(meta, { ...stats, total: 1, wins: 1, losses: 0 });
        expect(m.fightCount).toBe(1);
        expect(m.recordLabel).toBe('1W – 0L');
    });

    it('survives empty and missing leaderboards', () => {
        const m = buildReportCardModel(meta, { ...stats, leaderboards: { damage: [] } });
        expect(m.boards).toHaveLength(9);
        expect(m.boards.every((b) => Array.isArray(b.leaders))).toBe(true);
        expect(m.boards.find((b) => b.key === 'healing')!.leaders).toEqual([]);
    });

    it('survives missing guild, maps, and fights', () => {
        const m = buildReportCardModel({}, { total: 3, wins: 2, losses: 1 });
        expect(m.guildTag).toBe('');
        expect(m.guildName).toBe('');
        expect(m.dateLabel).toBe('');
        expect(m.maps).toEqual([]);
        expect(m.fights).toEqual([]);
        expect(m.squad.kdr).toBe('—');
    });

    it('survives a null guild name and tag', () => {
        const m = buildReportCardModel({ guild: { id: 'G1', name: null, tag: null } }, stats);
        expect(m.guildTag).toBe('');
        expect(m.guildName).toBe('');
    });

    it('never throws on a completely empty stats object', () => {
        expect(() => buildReportCardModel({}, {})).not.toThrow();
        const m = buildReportCardModel({}, {});
        expect(m.fightCount).toBe(0);
        expect(m.boards).toHaveLength(9);
    });
});
