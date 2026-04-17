import { describe, it, expect } from 'vitest';
import {
    resolveMapFromZone,
    normalizeMapNameShort,
    formatDuration,
    computeFightAvgPosition,
    buildFightLabelV2,
} from '../mapUtils';
import { WvwMap } from '../wvwLandmarks';

describe('resolveMapFromZone', () => {
    it('resolves EBG variants', () => {
        expect(resolveMapFromZone('Eternal Battlegrounds')).toBe(WvwMap.EternalBattlegrounds);
        expect(resolveMapFromZone('WvW - Eternal Battlegrounds')).toBe(WvwMap.EternalBattlegrounds);
        expect(resolveMapFromZone('EBG')).toBe(WvwMap.EternalBattlegrounds);
    });

    it('resolves borderland variants', () => {
        expect(resolveMapFromZone('Green Alpine Borderlands')).toBe(WvwMap.GreenBorderlands);
        expect(resolveMapFromZone('Blue Borderlands')).toBe(WvwMap.BlueBorderlands);
        expect(resolveMapFromZone('Red Desert Borderlands')).toBe(WvwMap.RedBorderlands);
    });

    it('returns null for unknown zones', () => {
        expect(resolveMapFromZone('Raids Wing 7')).toBeNull();
        expect(resolveMapFromZone('')).toBeNull();
    });
});

describe('normalizeMapNameShort', () => {
    it('returns short codes for known WvW maps', () => {
        expect(normalizeMapNameShort('Eternal Battlegrounds')).toBe('EBG');
        expect(normalizeMapNameShort('Green Alpine Borderlands')).toBe('Green BL');
        expect(normalizeMapNameShort('Blue Borderlands')).toBe('Blue BL');
        expect(normalizeMapNameShort('Red Desert Borderlands')).toBe('Red BL');
    });

    it('strips WvW prefixes before short-coding', () => {
        expect(normalizeMapNameShort('WvW - Eternal Battlegrounds')).toBe('EBG');
        expect(normalizeMapNameShort('Detailed WvW - Green Borderlands')).toBe('Green BL');
    });

    it('returns the sanitized zone for unknown zones', () => {
        expect(normalizeMapNameShort('Raids Wing 7')).toBe('Raids Wing 7');
    });

    it('returns empty string for empty input', () => {
        expect(normalizeMapNameShort('')).toBe('');
    });
});

describe('formatDuration', () => {
    it('formats minutes:seconds with zero-padding', () => {
        expect(formatDuration(0)).toBe('0:00');
        expect(formatDuration(1_000)).toBe('0:01');
        expect(formatDuration(59_000)).toBe('0:59');
        expect(formatDuration(60_000)).toBe('1:00');
        expect(formatDuration(150_000)).toBe('2:30');
        expect(formatDuration(3_600_000)).toBe('60:00');
    });
});

describe('computeFightAvgPosition', () => {
    it('returns null when details has no players', () => {
        expect(computeFightAvgPosition({})).toBeNull();
        expect(computeFightAvgPosition({ players: [] })).toBeNull();
        expect(computeFightAvgPosition(null)).toBeNull();
    });

    it('uses the commander when present', () => {
        const details = {
            players: [
                { hasCommanderTag: false, combatReplayData: { positions: [[100, 100], [200, 200]] } },
                { hasCommanderTag: true, combatReplayData: { positions: [[50, 60], [70, 80], [90, 100]] } },
            ],
        };
        // median of xs=[50,70,90] is 70; median of ys=[60,80,100] is 80.
        expect(computeFightAvgPosition(details)).toEqual([70, 80]);
    });

    it('falls back to first player with positions when no commander', () => {
        const details = {
            players: [
                { hasCommanderTag: false, combatReplayData: { positions: [] } },
                { hasCommanderTag: false, combatReplayData: { positions: [[10, 10], [30, 30], [50, 50]] } },
            ],
        };
        expect(computeFightAvgPosition(details)).toEqual([30, 30]);
    });

    it('returns null when no player has positions', () => {
        const details = {
            players: [
                { hasCommanderTag: true, combatReplayData: { positions: [] } },
                { hasCommanderTag: false, combatReplayData: { positions: [] } },
            ],
        };
        expect(computeFightAvgPosition(details)).toBeNull();
    });
});

describe('buildFightLabelV2', () => {
    it('formats as "Short: Landmark (m:ss)" when all parts resolve', () => {
        // Stonemist Castle sits at (370, 435) on EBG.
        const label = buildFightLabelV2({
            zone: 'Eternal Battlegrounds',
            durationMs: 150_000,
            avgPosition: [370, 435],
        });
        expect(label).toBe('EBG: Stonemist Castle (2:30)');
    });

    it('uses short map code when landmark is unavailable', () => {
        expect(buildFightLabelV2({
            zone: 'Green Borderlands',
            durationMs: 150_000,
            avgPosition: null,
        })).toBe('Green BL (2:30)');
    });

    it('uses sanitized zone when map is unknown', () => {
        expect(buildFightLabelV2({
            zone: 'WvW - Guild Hall Duel',
            durationMs: 90_000,
            avgPosition: null,
        })).toBe('Guild Hall Duel (1:30)');
    });

    it('omits duration when missing or zero', () => {
        expect(buildFightLabelV2({
            zone: 'Green Borderlands',
            avgPosition: null,
        })).toBe('Green BL');
        expect(buildFightLabelV2({
            zone: 'Green Borderlands',
            durationMs: 0,
            avgPosition: null,
        })).toBe('Green BL');
    });

    it('returns "Unknown" when zone is empty and map cannot resolve', () => {
        expect(buildFightLabelV2({ zone: '', durationMs: 60_000 })).toBe('Unknown (1:00)');
    });

    it('strips WvW prefixes from the sanitized fallback', () => {
        expect(buildFightLabelV2({
            zone: 'Detailed WvW - Custom Arena',
            durationMs: 60_000,
        })).toBe('Custom Arena (1:00)');
    });
});
