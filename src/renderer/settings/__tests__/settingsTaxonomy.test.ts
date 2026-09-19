import { describe, expect, it } from 'vitest';
import {
    SETTINGS_CATEGORIES,
    FLATTENED_SECTIONS,
    categoryIdForSection,
    labelForSection,
    stepSectionId
} from '../settingsTaxonomy';

/**
 * Pinned list: every section id SettingsView renders, in the order the
 * flattened taxonomy must produce. Adding a section to SettingsView without
 * filing it under a category fails here rather than silently becoming
 * unreachable from the rail.
 */
const EXPECTED_FLATTENED = [
    'destinations', 'embed-summary', 'embed-top', 'report-links',
    'github-pages', 'r2-storage', 'parser-settings',
    'dashboard-stats', 'mvp-weighting', 'boon-uptime-resolution', 'commander-thresholds',
    'log-directory', 'dps-token',
    'appearance', 'close-behavior', 'export-import', 'help-updates', 'legal'
];

describe('SETTINGS_CATEGORIES', () => {
    it('has the five categories in rail order', () => {
        expect(SETTINGS_CATEGORIES.map((c) => c.id)).toEqual([
            'discord', 'web-report', 'stats', 'logs', 'application'
        ]);
    });

    it('files every section under exactly one category', () => {
        const seen = new Map<string, string>();
        for (const category of SETTINGS_CATEGORIES) {
            for (const section of category.sections) {
                expect(seen.has(section.id)).toBe(false);
                seen.set(section.id, category.id);
            }
        }
        expect(seen.size).toBe(EXPECTED_FLATTENED.length);
    });

    it('flattens in rail order', () => {
        expect(FLATTENED_SECTIONS.map((s) => s.id)).toEqual(EXPECTED_FLATTENED);
    });

    it('never labels a Discord section "embed"', () => {
        const discord = SETTINGS_CATEGORIES.find((c) => c.id === 'discord')!;
        for (const section of discord.sections) {
            expect(section.label.toLowerCase()).not.toContain('embed');
        }
    });
});

describe('categoryIdForSection', () => {
    it('resolves a section to its category', () => {
        expect(categoryIdForSection('parser-settings')).toBe('web-report');
        expect(categoryIdForSection('embed-top')).toBe('discord');
        expect(categoryIdForSection('legal')).toBe('application');
    });

    it('returns null for an unknown id', () => {
        expect(categoryIdForSection('nope')).toBeNull();
    });
});

describe('labelForSection', () => {
    it('returns the renamed label, not the id', () => {
        expect(labelForSection('embed-summary')).toBe('Summary Sections');
        expect(labelForSection('parser-settings')).toBe('Report Data');
        expect(labelForSection('r2-storage')).toBe('Cloudflare R2');
    });
});

describe('stepSectionId', () => {
    it('crosses a category boundary going forward', () => {
        expect(stepSectionId('report-links', 1)).toBe('github-pages');
    });

    it('crosses a category boundary going backward', () => {
        expect(stepSectionId('github-pages', -1)).toBe('report-links');
    });

    it('stops at the first section', () => {
        expect(stepSectionId('destinations', -1)).toBeNull();
    });

    it('stops at the last section', () => {
        expect(stepSectionId('legal', 1)).toBeNull();
    });

    it('returns null from an unknown id', () => {
        expect(stepSectionId('nope', 1)).toBeNull();
    });
});
