import { describe, it, expect } from 'vitest';
import { expandIconIndex, normalizeReportPayload } from '../reportNormalization';

const makePayload = (stats: any): any => ({ meta: {}, stats });

describe('expandIconIndex', () => {
    it('replaces numeric icon references with their URL strings throughout the stats tree', () => {
        const payload = makePayload({
            iconIndex: ['https://render.guildwars2.com/a.png', 'https://i.imgur.com/b.png'],
            boons: [{ name: 'Might', icon: 0 }],
            conditions: { rows: [{ name: 'Bleeding', icon: 1 }] },
            skills: [{ name: 'Skill', icon: 0, nested: { name: 'Sub', icon: 1 } }],
        });

        const result = expandIconIndex(payload);

        expect(result.stats.boons[0].icon).toBe('https://render.guildwars2.com/a.png');
        expect(result.stats.conditions.rows[0].icon).toBe('https://i.imgur.com/b.png');
        expect(result.stats.skills[0].icon).toBe('https://render.guildwars2.com/a.png');
        expect(result.stats.skills[0].nested.icon).toBe('https://i.imgur.com/b.png');
    });

    it('removes the iconIndex array after expansion', () => {
        const payload = makePayload({
            iconIndex: ['https://example.com/x.png'],
            rows: [{ icon: 0 }],
        });
        const result = expandIconIndex(payload);
        expect(result.stats.iconIndex).toBeUndefined();
    });

    it('leaves already-expanded (string) icons untouched and is a no-op without an iconIndex', () => {
        const payload = makePayload({
            rows: [{ icon: 'https://example.com/already.png' }],
        });
        const result = expandIconIndex(payload);
        expect(result.stats.rows[0].icon).toBe('https://example.com/already.png');
    });

    it('is applied as part of normalizeReportPayload', () => {
        const payload = makePayload({
            iconIndex: ['https://example.com/icon.png'],
            rows: [{ icon: 0 }],
        });
        const result = normalizeReportPayload(payload);
        expect(result.stats.rows[0].icon).toBe('https://example.com/icon.png');
        expect(result.stats.iconIndex).toBeUndefined();
    });
});
