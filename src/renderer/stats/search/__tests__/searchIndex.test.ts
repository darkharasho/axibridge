import { describe, it, expect } from 'vitest';
import { buildSearchIndex, matchSearchIndex } from '../searchIndex';

const PLAYERS = [
    { account: 'Ravi.1234', displayName: 'Ravi', profession: 'Firebrand' },
    { account: 'Bulwark.5678', displayName: 'Bulwark', profession: 'Spellbreaker' },
];

describe('buildSearchIndex', () => {
    it('indexes every taxonomy section except data-map', () => {
        const index = buildSearchIndex();
        const sections = index.filter((e) => e.type === 'section');
        expect(sections.some((e) => e.sectionId === 'on-tag-review')).toBe(true);
        expect(sections.some((e) => e.sectionId === 'data-map')).toBe(false);
    });

    it('indexes metrics with their home section', () => {
        const index = buildSearchIndex();
        const cleanses = index.find((e) => e.type === 'metric' && e.metricId === 'condiCleanse');
        expect(cleanses).toMatchObject({ sectionId: 'support-detailed', categoryId: 'support-healing' });
        const mitigation = index.find((e) => e.type === 'metric' && e.metricId === 'totalMitigation');
        expect(mitigation).toMatchObject({ sectionId: 'defense-mitigation', categoryId: 'defense' });
    });

    it('indexes players pointing at player-breakdown', () => {
        const index = buildSearchIndex({ players: PLAYERS });
        const ravi = index.find((e) => e.type === 'player' && e.account === 'Ravi.1234');
        expect(ravi).toMatchObject({ sectionId: 'player-breakdown', categoryId: 'players', label: 'Ravi' });
        expect(ravi!.sublabel).toContain('Firebrand');
    });

    it('filters everything by isSectionAllowed', () => {
        const index = buildSearchIndex({
            players: PLAYERS,
            isSectionAllowed: (id) => id !== 'support-detailed' && id !== 'player-breakdown',
        });
        expect(index.some((e) => e.sectionId === 'support-detailed')).toBe(false);
        expect(index.some((e) => e.type === 'player')).toBe(false);
    });

    it('omits players when none are provided', () => {
        expect(buildSearchIndex().some((e) => e.type === 'player')).toBe(false);
    });
});

describe('matchSearchIndex', () => {
    const index = buildSearchIndex({ players: PLAYERS });

    it('finds sections by keyword', () => {
        const results = matchSearchIndex(index, 'stab');
        expect(results[0]).toMatchObject({ type: 'section', sectionId: 'stab-performance' });
    });

    it('finds metrics by label', () => {
        const results = matchSearchIndex(index, 'cleanse');
        expect(results.some((e) => e.type === 'metric' && e.metricId === 'condiCleanse')).toBe(true);
    });

    it('finds players by account and display name, case-insensitive', () => {
        expect(matchSearchIndex(index, 'ravi')[0]).toMatchObject({ type: 'player', account: 'Ravi.1234' });
        expect(matchSearchIndex(index, 'bulwark.5')[0]).toMatchObject({ type: 'player', account: 'Bulwark.5678' });
    });

    it('ranks label prefix matches above substring matches', () => {
        const results = matchSearchIndex(index, 'boon');
        const first = results[0];
        expect(first.label.toLowerCase().startsWith('boon')).toBe(true);
    });

    it('returns [] for empty or whitespace queries and respects the limit', () => {
        expect(matchSearchIndex(index, '   ')).toEqual([]);
        expect(matchSearchIndex(index, 'a', 5).length).toBeLessThanOrEqual(5);
    });
});
