import { describe, expect, it } from 'vitest';
import { buildReportCardModel } from '../../shared/reportCardModel';
import {
    collectCardProfessions,
    renderReportCardHtml,
    REPORT_CARD_SIZES,
    type ReportCardAssets,
} from '../reportCardTemplate';

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

// The template is pure: it only ever sees pre-encoded `data:` URIs. Reading the
// real files is `reportCardAssets`' job and is covered in its own suite.
const FONT_URI = 'data:font/woff2;base64,d09GMgABAAAA';
const PNG_URI = (seed: string) => `data:image/png;base64,${Buffer.from(seed).toString('base64')}`;

const assets: ReportCardAssets = {
    fontDataUri: FONT_URI,
    iconDataUris: { Firebrand: PNG_URI('firebrand'), Druid: PNG_URI('druid') },
    glyphDataUri: PNG_URI('glyph'),
};
const emptyAssets: ReportCardAssets = { fontDataUri: null, iconDataUris: {}, glyphDataUri: null };

describe('collectCardProfessions', () => {
    it('lists the allow-listed professions the graphic card will draw', () => {
        expect(collectCardProfessions(model, 'graphic').sort()).toEqual(['Druid', 'Firebrand']);
    });

    it('asks for nothing on the hybrid card, which draws no chips', () => {
        expect(collectCardProfessions(model, 'hybrid')).toEqual([]);
    });

    it('never emits a profession outside the allow-list', () => {
        const evil = buildReportCardModel({}, {
            leaderboards: {
                damage: [{ rank: 1, account: 'A.1234', profession: '../../../../etc/passwd', value: 1 }],
            },
        });
        expect(collectCardProfessions(evil, 'graphic')).toEqual([]);
    });
});

describe('renderReportCardHtml', () => {
    it('embeds the session numbers', () => {
        const html = renderReportCardHtml(model, 'hybrid', assets);
        expect(html).toContain('12');
        // The record is split so the win and loss halves can be coloured.
        expect(html).toContain('<span class="w">8W</span>');
        expect(html).toContain('<span class="l">4L</span>');
        expect(html).toContain('2.31');
        expect(html).toContain('AXI');
    });

    it('renders an unrecognised record label whole rather than as broken markup', () => {
        const html = renderReportCardHtml({ ...model, recordLabel: 'no fights logged' }, 'hybrid', assets);
        expect(html).toContain('no fights logged');
        expect(html).not.toContain('class="w"');
    });

    it('tints each leader chip with its profession colour', () => {
        const html = renderReportCardHtml(model, 'graphic', assets);
        // Guardian's entry in PROFESSION_COLORS. An unknown profession must
        // fall back to the neutral grey instead of reaching CSS unchecked.
        expect(html).toMatch(/<div class="chip" style="--pc: #[0-9a-fA-F]{6}"/);
    });

    it('inlines the font as a data: URI rather than referencing it', () => {
        const html = renderReportCardHtml(model, 'hybrid', assets);
        expect(html).toContain('@font-face');
        expect(html).toContain(`url('${FONT_URI}')`);
        expect(html).not.toContain('fonts.googleapis.com');
        expect(html).not.toContain('http://');
    });

    // The card document is loaded from a `data:` URL, whose opaque origin makes
    // Chromium refuse every `file://` subresource. A single `file://` here means
    // a missing font or a missing icon on every render, on every platform — and
    // the capture still succeeds, so nothing else catches it.
    it.each(['hybrid', 'graphic'] as const)('emits no file:// subresource at all (%s)', (variant) => {
        const html = renderReportCardHtml(model, variant, assets);
        expect(html).not.toContain('file://');
        for (const match of html.matchAll(/(?:src="|url\(')([^"')]+)/g)) {
            expect(match[1]).toMatch(/^data:(?:image\/png|font\/woff2);base64,/);
        }
    });

    it('drops the @font-face entirely when the woff2 could not be read', () => {
        const html = renderReportCardHtml(model, 'hybrid', emptyAssets);
        expect(html).not.toContain('@font-face');
        expect(html).toContain('sans-serif');
    });

    it('rejects an asset URI that is not a base64 image/font data URI', () => {
        const hostile: ReportCardAssets = {
            fontDataUri: 'https://evil.example/x.woff2',
            iconDataUris: { Firebrand: 'javascript:alert(1)' },
            glyphDataUri: 'file:///etc/passwd',
        };
        const html = renderReportCardHtml(model, 'graphic', hostile);
        expect(html).not.toContain('evil.example');
        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('/etc/passwd');
        expect(html).toContain('chipabbrev');
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

    it('inlines class icons as data: PNGs with object-fit contain', () => {
        const html = renderReportCardHtml(model, 'graphic', assets);
        expect(html).toContain(`<img src="${PNG_URI('firebrand')}"`);
        expect(html).toContain('data:image/png;base64,');
        expect(html).toContain('object-fit: contain');
    });

    it('inlines the footer glyph, and omits it when unreadable', () => {
        expect(renderReportCardHtml(model, 'hybrid', assets)).toContain(`<img src="${PNG_URI('glyph')}"`);
        const bare = renderReportCardHtml(model, 'hybrid', emptyAssets);
        expect(bare).toContain('class="foot"');
        expect(bare).not.toContain('<img');
    });

    it('degrades a known profession with an unreadable icon to the text abbreviation', () => {
        const html = renderReportCardHtml(model, 'graphic', { ...assets, iconDataUris: {} });
        expect(html).toContain('chipabbrev');
        expect(html).not.toContain('data:image/png;base64,' + Buffer.from('firebrand').toString('base64'));
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
        expect(() => renderReportCardHtml(empty, 'graphic', emptyAssets)).not.toThrow();
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

    it('does not resolve a path-traversal profession into an icon src', () => {
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
