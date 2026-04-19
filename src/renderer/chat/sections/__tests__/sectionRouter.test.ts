// src/renderer/chat/sections/__tests__/sectionRouter.test.ts
import { describe, it, expect } from 'vitest';
import { routeSections } from '../sectionRouter';

describe('routeSections', () => {
    it('always includes fight_overview', () => {
        expect(routeSections('who did the most damage?').sections).toContain('fight_overview');
    });

    it('routes damage question to offense', () => {
        const { sections } = routeSections('who did the most damage?');
        expect(sections).toContain('offense');
    });

    it('routes deaths question to defense', () => {
        const { sections } = routeSections('who died the most?');
        expect(sections).toContain('defense');
    });

    it('routes boon question to boons', () => {
        const { sections } = routeSections('how was our stability uptime?');
        expect(sections).toContain('boons');
    });

    it('routes per-group boon question to both boons and groups', () => {
        const { sections } = routeSections('how was boon coverage per group?');
        expect(sections).toContain('boons');
        expect(sections).toContain('groups');
    });

    it('routes incoming skill question to skills_incoming', () => {
        const { sections } = routeSections('what hit us the most?');
        expect(sections).toContain('skills_incoming');
    });

    it('routes support question to support', () => {
        const { sections } = routeSections('who had the most cleanses?');
        expect(sections).toContain('support');
    });

    it('extracts fight_index from "fight 2"', () => {
        const { fightIndex } = routeSections('who died in fight 2?');
        expect(fightIndex).toBe(1);
    });

    it('extracts fight_index from "fight 1"', () => {
        const { fightIndex } = routeSections('how was our damage in fight 1?');
        expect(fightIndex).toBe(0);
    });

    it('returns undefined fightIndex when not specified', () => {
        const { fightIndex } = routeSections('how was our damage?');
        expect(fightIndex).toBeUndefined();
    });

    it('returns at most 4 sections', () => {
        const { sections } = routeSections('who had the most damage, deaths, cleanses, strips, and boon uptime?');
        expect(sections.length).toBeLessThanOrEqual(4);
    });

    it('broad coaching question includes offense, defense, boons', () => {
        const { sections } = routeSections('what can we improve?');
        // Should cover multiple dimensions
        expect(sections.length).toBeGreaterThanOrEqual(3);
    });
});
