import { describe, it, expect, vi } from 'vitest';
import { QUICK_SETTINGS, type QuickSettingsContext } from '../quickSettings';
import { DEFAULT_STATS_VIEW_SETTINGS } from '../../global.d';
import type { IParserSettings } from '../../global.d';

const PARSER_SETTINGS: IParserSettings = {
    computeDamageModifiers: true,
    parseCombatReplay: true,
    rawTimelineArrays: false,
};

const makeContext = (overrides?: Partial<QuickSettingsContext>): QuickSettingsContext => ({
    parserSettings: { ...PARSER_SETTINGS },
    setParserSetting: vi.fn(),
    statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS },
    setStatsViewSettings: vi.fn(),
    r2Hosting: null,
    setR2ReplayEnabled: vi.fn(),
    setR2SliceEnabled: vi.fn(),
    ...overrides,
});

describe('QUICK_SETTINGS registry', () => {
    it('exposes the five dashboard toggles with stable ids', () => {
        expect(QUICK_SETTINGS.map((s) => s.id)).toEqual([
            'parseCombatReplay',
            'noEgoMode',
            'splitPlayersByClass',
            'r2HostingEnabled',
            'r2SliceEnabled',
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
            parserSettings: { ...PARSER_SETTINGS, parseCombatReplay: false },
            statsViewSettings: { ...DEFAULT_STATS_VIEW_SETTINGS, noEgoMode: true, splitPlayersByClass: false },
            r2Hosting: { credentialsPresent: true, replayEnabled: false, sliceEnabled: true },
        });
        const read = Object.fromEntries(QUICK_SETTINGS.map((s) => [s.id, s.read(ctx)]));
        expect(read).toEqual({
            parseCombatReplay: false,
            noEgoMode: true,
            splitPlayersByClass: false,
            r2HostingEnabled: false,
            r2SliceEnabled: true,
        });
    });

    it('routes parser-backed writes to setParserSetting only', () => {
        const ctx = makeContext();
        const combatReplay = QUICK_SETTINGS.find((s) => s.id === 'parseCombatReplay')!;
        combatReplay.write(ctx, false);
        expect(ctx.setParserSetting).toHaveBeenCalledWith('parseCombatReplay', false);
        expect(ctx.setStatsViewSettings).not.toHaveBeenCalled();
    });

    it('routes stats-view writes to setStatsViewSettings only, preserving sibling keys', () => {
        const ctx = makeContext();
        const noEgo = QUICK_SETTINGS.find((s) => s.id === 'noEgoMode')!;
        noEgo.write(ctx, true);
        expect(ctx.setParserSetting).not.toHaveBeenCalled();
        expect(ctx.setStatsViewSettings).toHaveBeenCalledWith({
            ...DEFAULT_STATS_VIEW_SETTINGS,
            noEgoMode: true,
        });
    });

    it('round-trips read-after-write for every entry', () => {
        for (const setting of QUICK_SETTINGS) {
            const r2Hosting = { credentialsPresent: true, replayEnabled: false, sliceEnabled: false };
            let ctx = makeContext({ r2Hosting });
            const next = !setting.read(ctx);
            ctx = makeContext({
                r2Hosting,
                setParserSetting: vi.fn((key, value) => {
                    ctx = { ...ctx, parserSettings: { ...ctx.parserSettings!, [key]: value } };
                }),
                setStatsViewSettings: vi.fn((value) => {
                    ctx = { ...ctx, statsViewSettings: value };
                }),
                setR2ReplayEnabled: vi.fn((value) => {
                    ctx = { ...ctx, r2Hosting: { ...ctx.r2Hosting!, replayEnabled: value } };
                }),
                setR2SliceEnabled: vi.fn((value) => {
                    ctx = { ...ctx, r2Hosting: { ...ctx.r2Hosting!, sliceEnabled: value } };
                }),
            });
            setting.write(ctx, next);
            expect(setting.read(ctx)).toBe(next);
        }
    });

    it('reads false when EI settings have not loaded yet', () => {
        const ctx = makeContext({ parserSettings: null });
        const combatReplay = QUICK_SETTINGS.find((s) => s.id === 'parseCombatReplay')!;
        expect(combatReplay.read(ctx)).toBe(false);
        expect(combatReplay.isReady(ctx)).toBe(false);
    });

    it('reports stats-view entries as ready even before EI settings load', () => {
        const ctx = makeContext({ parserSettings: null });
        const noEgo = QUICK_SETTINGS.find((s) => s.id === 'noEgoMode')!;
        expect(noEgo.isReady(ctx)).toBe(true);
    });
});

describe('the R2 hosting toggles', () => {
    const r2 = QUICK_SETTINGS.find((s) => s.id === 'r2HostingEnabled')!;
    const slice = QUICK_SETTINGS.find((s) => s.id === 'r2SliceEnabled')!;

    it('keeps both rows off the card until the user has connected R2', () => {
        for (const setting of [r2, slice]) {
            expect(setting.isRelevant?.(makeContext())).toBe(false);
            expect(setting.isRelevant?.(makeContext({
                r2Hosting: { credentialsPresent: false, replayEnabled: true, sliceEnabled: true },
            }))).toBe(false);
        }
    });

    it('stays relevant while switched off, so it can be switched back on', () => {
        const ctx = makeContext({ r2Hosting: { credentialsPresent: true, replayEnabled: false, sliceEnabled: false } });
        for (const setting of [r2, slice]) {
            expect(setting.isRelevant?.(ctx)).toBe(true);
            expect(setting.read(ctx)).toBe(false);
        }
    });

    it('writes each artifact through its own setter, never the other one', () => {
        const ctx = makeContext({ r2Hosting: { credentialsPresent: true, replayEnabled: true, sliceEnabled: true } });
        r2.write(ctx, false);
        expect(ctx.setR2ReplayEnabled).toHaveBeenCalledWith(false);
        expect(ctx.setR2SliceEnabled).not.toHaveBeenCalled();

        const ctx2 = makeContext({ r2Hosting: { credentialsPresent: true, replayEnabled: true, sliceEnabled: true } });
        slice.write(ctx2, false);
        expect(ctx2.setR2SliceEnabled).toHaveBeenCalledWith(false);
        expect(ctx2.setR2ReplayEnabled).not.toHaveBeenCalled();
    });

    it('reads each artifact independently, so one off does not read as both off', () => {
        const ctx = makeContext({ r2Hosting: { credentialsPresent: true, replayEnabled: false, sliceEnabled: true } });
        expect(r2.read(ctx)).toBe(false);
        expect(slice.read(ctx)).toBe(true);
    });

    it('says what it hosts, so neither row reads as the other artifact', () => {
        // The pre-split single switch was labelled for replay while it silently
        // gated slices too — the confusion this split exists to remove.
        expect(r2.label).toMatch(/replay/i);
        expect(r2.label).not.toMatch(/slice/i);
        expect(slice.label).toMatch(/slice/i);
        expect(slice.label).not.toMatch(/replay/i);
    });

    it('is not ready before the main process has answered', () => {
        expect(r2.isReady(makeContext())).toBe(false);
        expect(slice.isReady(makeContext())).toBe(false);
        const ready = makeContext({ r2Hosting: { credentialsPresent: true, replayEnabled: true, sliceEnabled: true } });
        expect(r2.isReady(ready)).toBe(true);
        expect(slice.isReady(ready)).toBe(true);
    });

    it('routes writes to the R2 setters alone', () => {
        for (const setting of [r2, slice]) {
            const ctx = makeContext({ r2Hosting: { credentialsPresent: true, replayEnabled: true, sliceEnabled: true } });
            setting.write(ctx, false);
            expect(ctx.setParserSetting).not.toHaveBeenCalled();
            expect(ctx.setStatsViewSettings).not.toHaveBeenCalled();
        }
    });
});
