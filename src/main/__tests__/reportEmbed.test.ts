import { describe, expect, it } from 'vitest';
import { buildReportEmbed, DISCORD_EMBED_CHAR_LIMIT, DISCORD_EMBED_FIELD_LIMIT, REPORT_CARD_FILENAME } from '../reportEmbed';
import { buildReportCardModel } from '../../shared/reportCardModel';

const lb = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({ rank: i + 1, account: `${prefix}${i}.1234`, profession: 'Firebrand', value: 1000 - i }));

const stats = {
    total: 12, wins: 8, losses: 4,
    avgSquadSize: 41, avgEnemies: 37,
    squadKDR: '2.31', enemyKDR: '0.43',
    totalSquadKills: 184, totalSquadDeaths: 79, totalSquadDowns: 231,
    totalEnemyKills: 79, totalEnemyDeaths: 184, totalEnemyDowns: 96,
    mapData: [{ name: 'Eternal Battlegrounds', value: 5, color: '#ffffff' }],
    fightBreakdown: [{ shortLabel: 'F1', isWin: true }],
    leaderboards: {
        damage: lb(5, 'a'), healing: lb(5, 'b'), barrier: lb(5, 'c'),
        cleanses: lb(5, 'd'), strips: lb(5, 'e'), stability: lb(5, 'f'),
        ccAndInterrupts: lb(5, 'g'), downContrib: lb(5, 'h'), closestToTag: lb(5, 'i'),
    },
};

const meta = { dateLabel: 'Saturday, September 7, 2026', guild: { id: 'G', name: 'Axius', tag: 'AXI' } };
const model = buildReportCardModel(meta, stats);

const charCount = (embed: any) =>
    String(embed.title ?? '').length +
    String(embed.description ?? '').length +
    String(embed.footer?.text ?? '').length +
    (embed.fields ?? []).reduce((sum: number, f: any) => sum + f.name.length + f.value.length, 0);

describe('buildReportEmbed', () => {
    it('builds a rich text embed with KPI and board fields', () => {
        const embed = buildReportEmbed({ model, style: 'text', title: 'T', url: 'https://r/1', hasImage: false });
        expect(embed.title).toBe('T');
        expect(embed.url).toBe('https://r/1');
        expect(embed.description).toContain('12 fights');
        expect(embed.description).toContain('8W – 4L');
        expect(embed.footer?.text).toBe('Saturday, September 7, 2026');
        const names = embed.fields!.map((f) => f.name);
        expect(names.some((n) => n.includes('Squad'))).toBe(true);
        expect(names.some((n) => n.includes('Enemy'))).toBe(true);
        expect(names.some((n) => n.includes('Damage'))).toBe(true);
        expect(embed.image).toBeUndefined();
    });

    it('omits boards with no entries instead of emitting empty fields', () => {
        const sparse = buildReportCardModel(meta, { ...stats, leaderboards: { damage: lb(2, 'a') } });
        const embed = buildReportEmbed({ model: sparse, style: 'text', title: 'T', url: 'u', hasImage: false });
        const names = embed.fields!.map((f) => f.name);
        expect(names.some((n) => n.includes('Damage'))).toBe(true);
        expect(names.some((n) => n.includes('Healing'))).toBe(false);
        expect(embed.fields!.every((f) => f.value.trim().length > 0)).toBe(true);
    });

    it('attaches the image and keeps fields for hybrid', () => {
        const embed = buildReportEmbed({ model, style: 'hybrid', title: 'T', url: 'u', hasImage: true });
        expect(embed.image).toEqual({ url: `attachment://${REPORT_CARD_FILENAME}` });
        expect(embed.fields!.length).toBeGreaterThan(0);
    });

    it('drops fields entirely for graphic', () => {
        const embed = buildReportEmbed({ model, style: 'graphic', title: 'T', url: 'u', hasImage: true });
        expect(embed.image).toEqual({ url: `attachment://${REPORT_CARD_FILENAME}` });
        expect(embed.fields ?? []).toHaveLength(0);
    });

    it('falls back to the text layout when a graphic style has no image', () => {
        const embed = buildReportEmbed({ model, style: 'graphic', title: 'T', url: 'u', hasImage: false });
        expect(embed.image).toBeUndefined();
        expect(embed.fields!.length).toBeGreaterThan(0);
    });

    it('stays inside Discord limits on a hostile model', () => {
        const huge = {
            ...stats,
            leaderboards: Object.fromEntries(
                Object.keys(stats.leaderboards).map((k) => [k, lb(50, 'X'.repeat(28))])
            ),
        };
        const hostile = buildReportCardModel(meta, huge, { topN: 10 });
        const embed = buildReportEmbed({ model: hostile, style: 'text', title: 'X'.repeat(200), url: 'u', hasImage: false });
        expect(embed.fields!.length).toBeLessThanOrEqual(DISCORD_EMBED_FIELD_LIMIT);
        expect(charCount(embed)).toBeLessThanOrEqual(DISCORD_EMBED_CHAR_LIMIT);
        expect(embed.fields!.length).toBeGreaterThan(0);
    });

    it('never emits a field longer than 1024 characters', () => {
        const wide = buildReportCardModel(meta, {
            ...stats,
            leaderboards: { damage: lb(40, 'Y'.repeat(30)) },
        }, { topN: 40 });
        const embed = buildReportEmbed({ model: wide, style: 'text', title: 'T', url: 'u', hasImage: false });
        expect(embed.fields!.every((f) => f.value.length <= 1024)).toBe(true);
    });
});
