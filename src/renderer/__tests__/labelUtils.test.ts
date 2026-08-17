import { describe, it, expect } from 'vitest';
import { sanitizeWvwLabel, normalizeMapLabel, tokenizeLabel, resolveMapName } from '../stats/utils/labelUtils';

// ─── sanitizeWvwLabel ─────────────────────────────────────────────────────────

describe('sanitizeWvwLabel', () => {
    it('strips "Detailed WvW - " prefix (case-insensitive)', () => {
        expect(sanitizeWvwLabel('Detailed WvW - Eternal Battlegrounds')).toBe('Eternal Battlegrounds');
        expect(sanitizeWvwLabel('detailed wvw - Eternal Battlegrounds')).toBe('Eternal Battlegrounds');
    });

    it('strips "World vs World - " prefix', () => {
        expect(sanitizeWvwLabel('World vs World - Red Borderlands')).toBe('Red Borderlands');
    });

    it('strips "WvW - " prefix', () => {
        expect(sanitizeWvwLabel('WvW - Alpine Borderlands')).toBe('Alpine Borderlands');
    });

    it('returns the original string when no prefix matches', () => {
        expect(sanitizeWvwLabel('Eternal Battlegrounds')).toBe('Eternal Battlegrounds');
    });

    it('trims surrounding whitespace', () => {
        expect(sanitizeWvwLabel('  Eternal Battlegrounds  ')).toBe('Eternal Battlegrounds');
    });

    it('returns empty string for empty input', () => {
        expect(sanitizeWvwLabel('')).toBe('');
    });

    it('handles null / undefined / non-string inputs gracefully', () => {
        expect(sanitizeWvwLabel(null)).toBe('');
        expect(sanitizeWvwLabel(undefined)).toBe('');
        expect(sanitizeWvwLabel(42)).toBe('42');
    });

    it('only strips the first matching prefix', () => {
        // Prefix appears once at the start only
        expect(sanitizeWvwLabel('WvW - WvW - Fight')).toBe('WvW - Fight');
    });
});

// ─── normalizeMapLabel ────────────────────────────────────────────────────────

describe('normalizeMapLabel', () => {
    it('returns "Unknown" for falsy input', () => {
        expect(normalizeMapLabel(null)).toBe('Unknown');
        expect(normalizeMapLabel(undefined)).toBe('Unknown');
        expect(normalizeMapLabel('')).toBe('Unknown');
    });

    it('strips WvW prefixes', () => {
        expect(normalizeMapLabel('WvW - Eternal Battlegrounds')).toBe('Eternal Battlegrounds');
    });

    it('normalizes "Red Alpine Borderlands" → "Red Borderlands"', () => {
        expect(normalizeMapLabel('Red Alpine Borderlands')).toBe('Red Borderlands');
    });

    it('normalizes "Blue Desert Borderlands" → "Blue Borderlands"', () => {
        expect(normalizeMapLabel('Blue Desert Borderlands')).toBe('Blue Borderlands');
    });

    it('normalizes "Green Borderlands" (no qualifier) → "Green Borderlands"', () => {
        expect(normalizeMapLabel('Green Borderlands')).toBe('Green Borderlands');
    });

    it('preserves "Eternal Battlegrounds" unchanged', () => {
        expect(normalizeMapLabel('Eternal Battlegrounds')).toBe('Eternal Battlegrounds');
    });

    it('strips prefix before applying borderlands normalization', () => {
        expect(normalizeMapLabel('WvW - Red Alpine Borderlands')).toBe('Red Borderlands');
    });

    it('returns "Unknown" for whitespace-only strings after cleaning', () => {
        // A string that strips to nothing should still return Unknown
        expect(normalizeMapLabel('WvW -   ')).toBe('Unknown');
    });
});

// ─── tokenizeLabel ────────────────────────────────────────────────────────────

describe('tokenizeLabel', () => {
    it('lowercases and splits on non-alphanumeric chars', () => {
        expect(tokenizeLabel('Eternal Battlegrounds')).toEqual(['eternal', 'battleground']);
    });

    it('strips WvW prefixes before tokenizing', () => {
        const tokens = tokenizeLabel('WvW - Eternal Battlegrounds');
        expect(tokens).not.toContain('wvw');
        expect(tokens).toContain('eternal');
    });

    it('removes plurals from tokens longer than 3 chars', () => {
        // "battlegrounds" → "battleground" (>3 chars, ends in s)
        expect(tokenizeLabel('Battlegrounds')).toContain('battleground');
    });

    it('preserves short tokens ending in s', () => {
        // "vs" is only 2 chars — stays as-is
        const tokens = tokenizeLabel('World vs World');
        expect(tokens).toContain('vs');
    });

    it('filters out empty tokens', () => {
        const tokens = tokenizeLabel('  --  ');
        expect(tokens).toHaveLength(0);
    });
});

// ─── resolveMapName ───────────────────────────────────────────────────────────

describe('resolveMapName', () => {
    it('uses details.zone first', () => {
        expect(resolveMapName({ zone: 'Eternal Battlegrounds' }, {})).toBe('Eternal Battlegrounds');
    });

    it('falls back through details fields in order', () => {
        expect(resolveMapName({ mapName: 'Red Borderlands' }, {})).toBe('Red Borderlands');
        expect(resolveMapName({ map: 'Blue Borderlands' }, {})).toBe('Blue Borderlands');
        expect(resolveMapName({ location: 'Green Borderlands' }, {})).toBe('Green Borderlands');
        expect(resolveMapName({ fightName: 'Skirmish' }, {})).toBe('Skirmish');
    });

    it('falls back to log.fightName', () => {
        expect(resolveMapName({}, { fightName: 'Skirmish' })).toBe('Skirmish');
    });

    it('falls back to log.encounterName', () => {
        expect(resolveMapName({}, { encounterName: 'Fight' })).toBe('Fight');
    });

    it('returns "Unknown" when all fields are absent', () => {
        expect(resolveMapName({}, {})).toBe('Unknown');
        expect(resolveMapName(null, null)).toBe('Unknown');
    });

    it('applies normalizeMapLabel (strips WvW prefix, normalizes borderlands)', () => {
        expect(resolveMapName({ zone: 'WvW - Red Alpine Borderlands' }, {})).toBe('Red Borderlands');
    });
});

describe('resolveMapName with a native encounter', () => {
    it('prefers the native map name over the fightName-derived zone', () => {
        const details = {
            fightName: 'Detailed WvW - Eternal Battlegrounds',
            native: { axilog: { schema: '1.0' }, encounter: { map: 'Green Alpine Borderlands' } },
        };
        expect(resolveMapName(details, {})).toBe('Green Borderlands');
    });

    it('keeps the existing fallback chain when native is absent', () => {
        expect(resolveMapName({ fightName: 'Detailed WvW - Eternal Battlegrounds' }, {}))
            .toBe('Eternal Battlegrounds');
    });

    it('ignores an empty native map rather than returning Unknown', () => {
        const details = {
            fightName: 'Detailed WvW - Eternal Battlegrounds',
            native: { axilog: { schema: '1.0' }, encounter: { map: '   ' } },
        };
        expect(resolveMapName(details, {})).toBe('Eternal Battlegrounds');
    });
});
