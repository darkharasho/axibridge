import { describe, it, expect } from 'vitest';
import {
    resolveMapAccentFromName,
    resolveMapAccentFromStats,
    MAP_ACCENT_CSS_VARS,
} from '../mapAccent';

const RED = '#ef4444';
const GREEN = '#22c55e';
const BLUE = '#3b82f6';
const WHITE = '#ffffff';

describe('resolveMapAccentFromName', () => {
    it('gives each borderlands its own colour', () => {
        expect(resolveMapAccentFromName('Red Borderlands').primary).toBe(RED);
        expect(resolveMapAccentFromName('Green Borderlands').primary).toBe(GREEN);
        expect(resolveMapAccentFromName('Blue Borderlands').primary).toBe(BLUE);
    });

    it('accepts the short labels the stats pipeline also produces', () => {
        expect(resolveMapAccentFromName('Red BL').primary).toBe(RED);
        expect(resolveMapAccentFromName('EBG').primary).toBe(WHITE);
        expect(resolveMapAccentFromName('OS').primary).toBe(WHITE);
    });

    it('is white for the three neutral maps', () => {
        expect(resolveMapAccentFromName('Eternal Battlegrounds').primary).toBe(WHITE);
        expect(resolveMapAccentFromName('Obsidian Sanctum').primary).toBe(WHITE);
        // Edge of the Mists has no `WvwMap` member and no map-id entry, so it
        // arrives unrecognized and lands on white by the same rule.
        expect(resolveMapAccentFromName('Edge of the Mists').primary).toBe(WHITE);
    });

    it('is white for unknown and non-WvW zones', () => {
        expect(resolveMapAccentFromName('World vs World').primary).toBe(WHITE);
        expect(resolveMapAccentFromName('Unknown').primary).toBe(WHITE);
        expect(resolveMapAccentFromName('').primary).toBe(WHITE);
    });

    it('does not read a colour word out of a PvE encounter name', () => {
        // "Conjured Amalgamate" contains "red"; a substring test once called it Red BL.
        expect(resolveMapAccentFromName('Conjured Amalgamate').primary).toBe(WHITE);
    });

    it('derives the whole variable set from the one hex', () => {
        const accent = resolveMapAccentFromName('Red Borderlands');
        expect(accent).toEqual({
            primary: RED,
            secondary: 'rgba(239, 68, 68, 0.85)',
            gradient: 'linear-gradient(135deg, #ef4444, rgba(239, 68, 68, 0.7))',
            accentBg: 'rgba(239, 68, 68, 0.1)',
            accentBgStrong: 'rgba(239, 68, 68, 0.18)',
            accentBorder: 'rgba(239, 68, 68, 0.35)',
            glowPrimary: 'rgba(239, 68, 68, 0.35)',
            glowSecondary: 'rgba(239, 68, 68, 0.25)',
        });
    });
});

describe('resolveMapAccentFromStats', () => {
    it('takes the colour of a single-map report', () => {
        const stats = { mapData: [{ name: 'Green Borderlands', value: 4, color: GREEN }] };
        expect(resolveMapAccentFromStats(stats)?.primary).toBe(GREEN);
    });

    it('takes the colour of the map with the most fights', () => {
        const stats = {
            mapData: [
                { name: 'Blue Borderlands', value: 9, color: BLUE },
                { name: 'Red Borderlands', value: 2, color: RED },
            ],
        };
        expect(resolveMapAccentFromStats(stats)?.primary).toBe(BLUE);
    });

    it('finds the dominant map even if mapData arrives unsorted', () => {
        const stats = {
            mapData: [
                { name: 'Red Borderlands', value: 1, color: RED },
                { name: 'Eternal Battlegrounds', value: 12, color: WHITE },
            ],
        };
        expect(resolveMapAccentFromStats(stats)?.primary).toBe(WHITE);
    });

    it('returns null when there is no map data, leaving the palette alone', () => {
        expect(resolveMapAccentFromStats({ mapData: [] })).toBeNull();
        expect(resolveMapAccentFromStats({})).toBeNull();
        expect(resolveMapAccentFromStats(null)).toBeNull();
        expect(resolveMapAccentFromStats({ mapData: [{ value: 3 }] })).toBeNull();
    });
});

describe('MAP_ACCENT_CSS_VARS', () => {
    it('covers every field of the accent', () => {
        // --axi-accent duplicates the `primary` key deliberately (see the export's
        // doc comment), so this compares the unique key set rather than the raw list.
        const accent = resolveMapAccentFromName('EBG');
        expect(new Set(MAP_ACCENT_CSS_VARS.map(([, key]) => key)))
            .toEqual(new Set(Object.keys(accent)));
    });

    it('leads with --axi-accent so the map colour reaches the design language', () => {
        expect(MAP_ACCENT_CSS_VARS[0]).toEqual(['--axi-accent', 'primary']);
    });

    it('still carries every brand and glow variable a component may read directly', () => {
        expect(MAP_ACCENT_CSS_VARS.map(([cssVar]) => cssVar)).toEqual([
            '--axi-accent',
            '--brand-primary',
            '--brand-secondary',
            '--brand-gradient',
            '--accent-bg',
            '--accent-bg-strong',
            '--accent-border',
            '--glow-primary',
            '--glow-secondary',
        ]);
    });
});
