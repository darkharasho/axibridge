import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReportApp } from '../reportApp';

const buildReport = (stats: Record<string, unknown>) => ({
    meta: {
        id: '20260926-120000-abcd',
        title: 'Commander',
        commanders: ['Commander'],
        dateStart: '2026-09-26T12:00:00.000Z',
        dateEnd: '2026-09-26T13:00:00.000Z',
        dateLabel: 'today',
        generatedAt: '2026-09-26T13:00:00.000Z',
    },
    stats: { statsViewSettings: {}, ...stats },
});

const renderShare = (stats: Record<string, unknown>) => render(
    <ReportApp injectedSource={{ report: buildReport(stats) as any }} assetBase="https://bridge.axi.link/view/" />
);

beforeEach(() => {
    document.body.className = '';
    document.body.removeAttribute('style');
    vi.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('no network in tests'));
});

describe('share-link theming', () => {
    // The publisher's own toggles are deliberately ignored on /r/<code>: a share
    // link always looks like axi, whatever app published it.
    it('forces the axi language on even when the report was published without it', () => {
        renderShare({ colorPalette: 'crimson-red', axiDesign: false, glassSurfaces: true });
        expect(document.body.classList.contains('axi-design')).toBe(true);
        expect(document.body.classList.contains('glass-surfaces')).toBe(false);
        expect(document.body.classList.contains('glassmorphic')).toBe(false);
    });

    it('accents a borderlands report with that borderlands colour', () => {
        renderShare({ mapData: [{ name: 'Green Borderlands', value: 6, color: '#22c55e' }] });
        expect(document.body.style.getPropertyValue('--brand-primary')).toBe('#22c55e');
        expect(document.body.style.getPropertyValue('--accent-border')).toBe('rgba(34, 197, 94, 0.35)');
    });

    it('accents Eternal Battlegrounds, Obsidian Sanctum and Edge of the Mists white', () => {
        for (const name of ['Eternal Battlegrounds', 'Obsidian Sanctum', 'Edge of the Mists']) {
            document.body.removeAttribute('style');
            renderShare({ mapData: [{ name, value: 3, color: '#ffffff' }] });
            expect(document.body.style.getPropertyValue('--brand-primary')).toBe('#ffffff');
        }
    });

    it('overrides the palette the report was published with', () => {
        renderShare({
            colorPalette: 'crimson-red',
            mapData: [{ name: 'Blue Borderlands', value: 2, color: '#3b82f6' }],
        });
        expect(document.body.style.getPropertyValue('--brand-primary')).toBe('#3b82f6');
    });

    it('leaves the accent to the palette when the report has no map data', () => {
        renderShare({ colorPalette: 'crimson-red' });
        expect(document.body.style.getPropertyValue('--brand-primary')).toBe('');
        expect(document.body.classList.contains('palette-crimson-red')).toBe(true);
    });
});
