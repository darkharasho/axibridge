import { describe, it, expect, vi } from 'vitest';
import { QUICK_SETTINGS, type QuickSettingsContext } from '../quickSettings';
import { DEFAULT_STATS_VIEW_SETTINGS } from '../../global.d';
import type { IEiParserSettings } from '../../global.d';

const EI_SETTINGS: IEiParserSettings = {
    detailledWvW: true,
    computeDamageModifiers: true,
    parsePhases: true,
    skipFailedTries: false,
    anonymous: false,
    customTooShort: 2200,
    saveOutHTML: false,
    parseCombatReplay: true,
    lightTheme: false,
    rawTimelineArrays: false,
    singleThreaded: false,
    memoryLimit: 0,
};

const makeContext = (overrides?: Partial<QuickSettingsContext>): QuickSettingsContext => ({
    eiSettings: { ...EI_SETTINGS },
    setEiSetting: vi.fn(),
    statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS },
    setStatsViewSettings: vi.fn(),
    ...overrides,
});

describe('QUICK_SETTINGS registry', () => {
    it('exposes the four dashboard toggles with stable ids', () => {
        expect(QUICK_SETTINGS.map((s) => s.id)).toEqual([
            'parseCombatReplay',
            'anonymous',
            'noEgoMode',
            'splitPlayersByClass',
        ]);
    });

    it('declares every entry as a boolean toggle', () => {
        for (const setting of QUICK_SETTINGS) {
            expect(setting.kind).toBe('boolean');
            expect(setting.label.length).toBeGreaterThan(0);
        }
    });

    it('reads current values out of the backing stores', () => {
        const ctx = makeContext({
            eiSettings: { ...EI_SETTINGS, parseCombatReplay: false, anonymous: true },
            statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, noEgoMode: true, splitPlayersByClass: false },
        });
        const read = Object.fromEntries(QUICK_SETTINGS.map((s) => [s.id, s.read(ctx)]));
        expect(read).toEqual({
            parseCombatReplay: false,
            anonymous: true,
            noEgoMode: true,
            splitPlayersByClass: false,
        });
    });

    it('routes EI-backed writes to setEiSetting only', () => {
        const ctx = makeContext();
        const combatReplay = QUICK_SETTINGS.find((s) => s.id === 'parseCombatReplay')!;
        combatReplay.write(ctx, false);
        expect(ctx.setEiSetting).toHaveBeenCalledWith('parseCombatReplay', false);
        expect(ctx.setStatsViewSettings).not.toHaveBeenCalled();
    });

    it('routes stats-view writes to setStatsViewSettings only, preserving sibling keys', () => {
        const ctx = makeContext();
        const noEgo = QUICK_SETTINGS.find((s) => s.id === 'noEgoMode')!;
        noEgo.write(ctx, true);
        expect(ctx.setEiSetting).not.toHaveBeenCalled();
        expect(ctx.setStatsViewSettings).toHaveBeenCalledWith({
            ...DEFAULT_STATS_VIEW_SETTINGS,
            noEgoMode: true,
        });
    });

    it('round-trips read-after-write for every entry', () => {
        for (const setting of QUICK_SETTINGS) {
            let ctx = makeContext();
            const next = !setting.read(ctx);
            ctx = makeContext({
                setEiSetting: vi.fn((key, value) => {
                    ctx = { ...ctx, eiSettings: { ...ctx.eiSettings!, [key]: value } };
                }),
                setStatsViewSettings: vi.fn((value) => {
                    ctx = { ...ctx, statsViewSettings: value };
                }),
            });
            setting.write(ctx, next);
            expect(setting.read(ctx)).toBe(next);
        }
    });

    it('reads false when EI settings have not loaded yet', () => {
        const ctx = makeContext({ eiSettings: null });
        const combatReplay = QUICK_SETTINGS.find((s) => s.id === 'parseCombatReplay')!;
        expect(combatReplay.read(ctx)).toBe(false);
        expect(combatReplay.isReady(ctx)).toBe(false);
    });

    it('reports stats-view entries as ready even before EI settings load', () => {
        const ctx = makeContext({ eiSettings: null });
        const noEgo = QUICK_SETTINGS.find((s) => s.id === 'noEgoMode')!;
        expect(noEgo.isReady(ctx)).toBe(true);
    });
});
