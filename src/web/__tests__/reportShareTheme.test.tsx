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
    document.documentElement.removeAttribute('data-axi-accent');
    document.documentElement.removeAttribute('data-axi-theme');
    vi.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('no network in tests'));
});

describe('share-link theming', () => {
    // Axi is the only language now, so there is nothing to force on. A share link
    // still ignores the publisher's accent in favour of the map's, but it follows
    // the publisher's glass choice like every other report.
    it('applies the axi language through the document element', () => {
        renderShare({ colorPalette: 'crimson-red' });
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe('crimson-red');
        expect(document.documentElement.hasAttribute('data-axi-theme')).toBe(false);
        expect(document.body.classList.contains('axi-design')).toBe(false);
        expect(document.body.classList.contains('glass-surfaces')).toBe(false);
    });

    // Review Focus 5.
    it('renders a report published with glass in glass', () => {
        renderShare({ colorPalette: 'teal-ocean', glass: true });
        expect(document.documentElement.getAttribute('data-axi-theme')).toBe('glass');
    });

    it('honours the pre-collapse glassSurfaces spelling', () => {
        renderShare({ colorPalette: 'teal-ocean', glassSurfaces: true });
        expect(document.documentElement.getAttribute('data-axi-theme')).toBe('glass');
    });

    it('accents a borderlands report with that borderlands colour', () => {
        renderShare({ mapData: [{ name: 'Green Borderlands', value: 6, color: '#22c55e' }] });
        expect(document.body.style.getPropertyValue('--brand-primary')).toBe('#22c55e');
        expect(document.body.style.getPropertyValue('--accent-border')).toBe('rgba(34, 197, 94, 0.35)');
    });

    // Review Focus 3: --brand-primary now DERIVES from --axi-accent, so setting it
    // alone leaves every upstream component and every axi remap on the palette
    // accent and the map colour never arrives.
    it('drives the design language from the map accent too', () => {
        renderShare({ mapData: [{ name: 'Red Borderlands', value: 4, color: '#ef4444' }] });
        expect(document.body.style.getPropertyValue('--axi-accent')).toBe('#ef4444');
    });

    it('accents Eternal Battlegrounds, Obsidian Sanctum and Edge of the Mists white', () => {
        for (const name of ['Eternal Battlegrounds', 'Obsidian Sanctum', 'Edge of the Mists']) {
            document.body.removeAttribute('style');
            renderShare({ mapData: [{ name, value: 3, color: '#ffffff' }] });
            expect(document.body.style.getPropertyValue('--axi-accent')).toBe('#ffffff');
        }
    });

    it('overrides the palette the report was published with', () => {
        renderShare({
            colorPalette: 'crimson-red',
            mapData: [{ name: 'Blue Borderlands', value: 2, color: '#3b82f6' }],
        });
        expect(document.body.style.getPropertyValue('--axi-accent')).toBe('#3b82f6');
    });

    it('leaves the accent to the palette when the report has no map data', () => {
        renderShare({ colorPalette: 'crimson-red' });
        expect(document.body.style.getPropertyValue('--axi-accent')).toBe('');
        expect(document.documentElement.getAttribute('data-axi-accent')).toBe('crimson-red');
    });
});
