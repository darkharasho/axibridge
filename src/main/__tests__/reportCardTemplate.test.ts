import { describe, expect, it } from 'vitest';
import { buildReportCardModel } from '../../shared/reportCardModel';
import { renderReportCardHtml, REPORT_CARD_SIZES, resolveReportCardAssets } from '../reportCardTemplate';

const model = buildReportCardModel(
    { dateLabel: 'Saturday, September 7, 2026', guild: { id: 'G', name: 'Axius Imperium', tag: 'AXI' } },
    {
        total: 12, wins: 8, losses: 4,
        avgSquadSize: 41, avgEnemies: 37,
        squadKDR: '2.31', enemyKDR: '0.43',
        totalSquadKills: 184, totalSquadDeaths: 79, totalSquadDowns: 231,
        totalEnemyKills: 79, totalEnemyDeaths: 184, totalEnemyDowns: 96,
        mapData: [
            { name: 'Eternal Battlegrounds', value: 5, color: '#ffffff' },
            { name: 'Red Desert Borderlands', value: 4, color: '#ef4444' },
        ],
        fightBreakdown: [{ shortLabel: 'F1', isWin: true }, { shortLabel: 'F2', isWin: false }],
        leaderboards: {
            damage: [{ rank: 1, account: 'Harasho.1234', profession: 'Firebrand', value: 4_210_000 }],
            healing: [{ rank: 1, account: 'Grove.1111', profession: 'Druid', value: 2_020_000 }],
        },
    }
);

const assets = resolveReportCardAssets('/app/public');

describe('resolveReportCardAssets', () => {
    it('derives font, icon, and glyph paths from the public dir', () => {
        expect(assets.fontDir).toContain('fonts');
        expect(assets.iconDir).toContain('class-icons');
        expect(assets.glyphPath).toContain('AxiBridge-glyph.png');
    });
});

describe('renderReportCardHtml', () => {
    it('embeds the session numbers', () => {
        const html = renderReportCardHtml(model, 'hybrid', assets);
        expect(html).toContain('12');
        expect(html).toContain('8W – 4L');
        expect(html).toContain('2.31');
        expect(html).toContain('AXI');
    });

    it('declares local @font-face rules and no remote font fetch', () => {
        const html = renderReportCardHtml(model, 'hybrid', assets);
        expect(html).toContain('@font-face');
        expect(html).toContain('InterVariable.woff2');
        expect(html).not.toContain('fonts.googleapis.com');
        expect(html).not.toContain('http://');
    });

    it('draws one map segment per map with its color', () => {
        const html = renderReportCardHtml(model, 'hybrid', assets);
        expect(html).toContain('#ffffff');
        expect(html).toContain('#ef4444');
    });

    it('includes the fight sparkline and leaders only in the graphic variant', () => {
        const hybrid = renderReportCardHtml(model, 'hybrid', assets);
        const graphic = renderReportCardHtml(model, 'graphic', assets);
        expect(graphic).toContain('data-fight="F1"');
        expect(graphic).toContain('Harasho.1234');
        expect(hybrid).not.toContain('data-fight="F1"');
        expect(hybrid).not.toContain('Harasho.1234');
    });

    it('references class icons with object-fit contain', () => {
        const html = renderReportCardHtml(model, 'graphic', assets);
        expect(html).toContain('Firebrand.png');
        expect(html).toContain('object-fit: contain');
    });

    it('escapes account names so a crafted name cannot inject markup', () => {
        const evil = buildReportCardModel({}, {
            total: 1, wins: 1, losses: 0,
            leaderboards: { damage: [{ rank: 1, account: '<img src=x onerror=alert(1)>', profession: 'Firebrand', value: 1 }] },
        });
        const html = renderReportCardHtml(evil, 'graphic', assets);
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x');
    });

    it('renders with empty maps, fights, and boards without throwing', () => {
        const empty = buildReportCardModel({}, {});
        expect(() => renderReportCardHtml(empty, 'graphic', assets)).not.toThrow();
        expect(() => renderReportCardHtml(empty, 'hybrid', assets)).not.toThrow();
    });

    it('exposes 2x sizes for both variants', () => {
        expect(REPORT_CARD_SIZES.hybrid.width).toBe(1200);
        expect(REPORT_CARD_SIZES.graphic.width).toBe(1200);
        expect(REPORT_CARD_SIZES.graphic.height).toBeGreaterThan(REPORT_CARD_SIZES.hybrid.height);
    });

    it('renders no remote font fetch and no google fonts reference even for graphic variant', () => {
        const html = renderReportCardHtml(model, 'graphic', assets);
        expect(html).not.toContain('fonts.googleapis.com');
        expect(html).not.toContain('https://fonts.gstatic.com');
    });

    it('does not resolve a path-traversal profession into a file:// src outside iconDir', () => {
        const evil = buildReportCardModel({}, {
            leaderboards: {
                damage: [{ rank: 1, account: 'A.1234', profession: '../../../../etc/passwd', value: 1 }],
            },
        });
        const html = renderReportCardHtml(evil, 'graphic', assets);
        expect(html).not.toContain('etc/passwd');
        expect(html).not.toContain('..%2F');
        expect(html).toContain('chipabbrev');
    });

    it('degrades an unknown profession to a text abbreviation with no icon element', () => {
        const unknown = buildReportCardModel({}, {
            leaderboards: {
                damage: [{ rank: 1, account: 'A.1234', profession: 'TotallyUnknownClass', value: 1 }],
            },
        });
        const html = renderReportCardHtml(unknown, 'graphic', assets);
        expect(html).not.toContain('TotallyUnknownClass.png');
        expect(html).toContain('chipabbrev');
    });

    it('never interpolates untrusted leader data into inline onerror JavaScript', () => {
        // Firebrand is a known profession, so this exercises the icon-with-fallback
        // path (not the "no icon at all" unknown-profession path), and the onerror
        // handler must still be a fixed script with no leader-derived substitution.
        const html = renderReportCardHtml(model, 'graphic', assets);
        expect(html).toContain(
            `onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"`
        );
    });

    it('falls back to the default map colour when a slice colour is not a strict hex value', () => {
        const hostile = buildReportCardModel({}, {
            mapData: [{ name: 'Eternal Battlegrounds', value: 1, color: 'red;background-image:url(evil)' }],
        });
        const html = renderReportCardHtml(hostile, 'hybrid', assets);
        expect(html).not.toContain('background-image:url(evil)');
        expect(html).toContain('#64748b');
    });
});
