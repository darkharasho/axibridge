import { describe, it, expect } from 'vitest';
import {
    STATS_CATEGORIES,
    ALL_SECTION_IDS,
    SECTION_TO_CATEGORY,
    resolveSectionTarget,
} from '../statsTaxonomy';

// Every section id in the taxonomy. All ids except 'data-map' and 'top-skills-incoming'
// are rendered by StatsView today and are immutable deep-link anchors. 'data-map' is
// new (Task 4 creates it); 'top-skills-incoming' currently renders as the second column
// inside TopSkillsSection without its own anchor — Task 5 gives it an anchored render entry.
const EXPECTED_SECTION_IDS = [
    // overview
    'data-map', 'overview', 'fight-breakdown', 'fight-diff-mode', 'timeline',
    'map-distribution', 'top-players', 'top-skills-outgoing', 'top-skills-incoming',
    // offense
    'offense-detailed', 'cc-timeline', 'damage-breakdown', 'all-damage', 'spike-damage',
    'damage-modifiers', 'conditions-outgoing',
    // defense
    'defense-detailed', 'incoming-strike-damage', 'incoming-damage-modifiers',
    'defense-mitigation',
    // boons-strips
    'boon-output', 'boon-uptime', 'all-boons', 'boon-timeline', 'stab-performance',
    'boon-strip-comparison', 'strip-spikes', 'strip-timeline',
    // support-healing
    'support-detailed', 'healing-stats', 'healing-breakdown', 'heal-effectiveness',
    // squad-cohesion
    'on-tag-review', 'squad-distance-to-tag', 'squad-distance-to-tag-visual',
    'squad-tag-distance-deaths', 'squad-kill-pressure', 'squad-damage-comparison',
    // commander
    'commander-stats', 'commander-push-timing', 'commander-target-conversion',
    'commander-tag-movement', 'commander-tag-death-response',
    // players
    'player-breakdown', 'player-comparison', 'apm-stats', 'skill-usage',
    'sigil-relic-uptime', 'special-buffs',
    // roster
    'attendance-ledger', 'squad-composition', 'squad-comp-fight', 'fight-comp',
    // replay
    'replay',
];

describe('statsTaxonomy', () => {
    it('has 11 categories with the Data Map first', () => {
        expect(STATS_CATEGORIES.map((c) => c.id)).toEqual([
            'data-map', 'overview', 'offense', 'defense', 'boons-strips', 'support-healing',
            'squad-cohesion', 'commander', 'players', 'roster', 'replay',
        ]);
    });

    it('contains every expected section exactly once', () => {
        expect([...ALL_SECTION_IDS].sort()).toEqual([...EXPECTED_SECTION_IDS].sort());
        expect(new Set(ALL_SECTION_IDS).size).toBe(ALL_SECTION_IDS.length);
    });

    it('maps every section to exactly one category', () => {
        for (const id of EXPECTED_SECTION_IDS) {
            const categoryId = SECTION_TO_CATEGORY.get(id);
            expect(categoryId, `section ${id} has no category`).toBeTruthy();
            const category = STATS_CATEGORIES.find((c) => c.id === categoryId)!;
            expect(category.sections.some((s) => s.id === id)).toBe(true);
        }
    });

    it('has a non-empty label, description, and icon for every category and section', () => {
        for (const c of STATS_CATEGORIES) {
            expect(c.label.length).toBeGreaterThan(0);
            expect(c.description.length).toBeGreaterThan(0);
            expect(c.icon).toBeTruthy();
            for (const s of c.sections) {
                expect(s.label.length, `label for ${s.id}`).toBeGreaterThan(0);
                expect(s.description.length, `description for ${s.id}`).toBeGreaterThan(0);
                expect(s.icon, `icon for ${s.id}`).toBeTruthy();
            }
        }
    });

    it('resolves every section id to its category', () => {
        for (const id of EXPECTED_SECTION_IDS) {
            expect(resolveSectionTarget(id)).toEqual({
                categoryId: SECTION_TO_CATEGORY.get(id),
                sectionId: id,
            });
        }
    });

    it('resolves legacy aliases', () => {
        expect(resolveSectionTarget('kdr')).toEqual({ categoryId: 'overview', sectionId: 'overview' });
        expect(resolveSectionTarget('report-top')).toEqual({ categoryId: 'overview', sectionId: 'overview' });
        // old group anchors from the pre-redesign TOC
        expect(resolveSectionTarget('commanders')).toEqual({ categoryId: 'commander', sectionId: 'commander-stats' });
        expect(resolveSectionTarget('squad-stats')).toEqual({ categoryId: 'squad-cohesion', sectionId: 'squad-damage-comparison' });
        expect(resolveSectionTarget('other')).toEqual({ categoryId: 'overview', sectionId: 'fight-diff-mode' });
        expect(resolveSectionTarget('map')).toEqual({ categoryId: 'replay', sectionId: 'replay' });
    });

    it('resolves category ids to their first real section', () => {
        expect(resolveSectionTarget('offense')).toEqual({ categoryId: 'offense', sectionId: 'offense-detailed' });
        expect(resolveSectionTarget('boons-strips')).toEqual({ categoryId: 'boons-strips', sectionId: 'boon-output' });
    });

    it('normalizes hash prefix, case, and URI encoding', () => {
        expect(resolveSectionTarget('#On-Tag-Review')).toEqual({ categoryId: 'squad-cohesion', sectionId: 'on-tag-review' });
        expect(resolveSectionTarget(encodeURIComponent('boon-uptime'))).toEqual({ categoryId: 'boons-strips', sectionId: 'boon-uptime' });
    });

    it('returns null for unknown anchors', () => {
        expect(resolveSectionTarget('does-not-exist')).toBeNull();
        expect(resolveSectionTarget('')).toBeNull();
    });

    it('registers cc-timeline under offense', () => {
        const offense = STATS_CATEGORIES.find(c => c.id === 'offense');
        expect(offense?.sections.map(s => s.id)).toContain('cc-timeline');
    });

    it('registers strip-timeline under boons-strips', () => {
        const boonsStrips = STATS_CATEGORIES.find(c => c.id === 'boons-strips');
        expect(boonsStrips?.sections.map(s => s.id)).toContain('strip-timeline');
    });
});
