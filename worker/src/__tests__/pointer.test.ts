import { describe, expect, it } from 'vitest';
import { generateCode, isValidCode, parsePointer, type PointerRecord } from '../pointer';

const summary = { f: 'Detonator', m: 'Eternal Battlegrounds', d: 182000, t: 1758240000000, sq: 42, en: 51 };

const record: PointerRecord = {
    v: 1,
    loc: 'https://cdn.example.com/a.br',
    stage: 'full',
    sum: summary,
    created: 1758240000000,
    seen: 1758240000000,
    owner: 'darkharasho'
};

describe('generateCode', () => {
    it('produces exactly 8 base62 characters', () => {
        const code = generateCode();
        expect(code).toHaveLength(8);
        expect(code).toMatch(/^[0-9A-Za-z]{8}$/);
    });

    it('is deterministic for given random bytes', () => {
        const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(generateCode(bytes)).toBe(generateCode(bytes));
    });

    it('maps distinct bytes to distinct codes', () => {
        const a = generateCode(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
        const b = generateCode(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0]));
        expect(a).not.toBe(b);
    });
});

describe('isValidCode', () => {
    it.each(['k3Xm9qR2', '00000000', 'zzzzzzzz'])('accepts %s', (code) => {
        expect(isValidCode(code)).toBe(true);
    });

    it.each(['short', 'toolongcode', 'has-dash', '', 'k3Xm9qR!'])('rejects %s', (code) => {
        expect(isValidCode(code)).toBe(false);
    });
});

describe('parsePointer', () => {
    it('round-trips a valid record', () => {
        expect(parsePointer(JSON.stringify(record))).toEqual(record);
    });

    it('returns null for null input', () => {
        expect(parsePointer(null)).toBeNull();
    });

    it('returns null for malformed JSON', () => {
        expect(parsePointer('{not json')).toBeNull();
    });

    it('returns null when the version is unknown', () => {
        expect(parsePointer(JSON.stringify({ ...record, v: 2 }))).toBeNull();
    });

    it('returns null when a required field is missing', () => {
        const { loc, ...withoutLoc } = record;
        expect(parsePointer(JSON.stringify(withoutLoc))).toBeNull();
    });

    it('returns null when the stage is not a known stage', () => {
        expect(parsePointer(JSON.stringify({ ...record, stage: 'archived' }))).toBeNull();
    });
});
