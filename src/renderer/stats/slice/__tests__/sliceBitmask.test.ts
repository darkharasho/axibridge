import { describe, it, expect } from 'vitest';
import { encodeSliceMask, decodeSliceMask } from '../sliceBitmask';

describe('sliceBitmask', () => {
    it('round-trips a subset', () => {
        const token = encodeSliceMask([0, 2, 5], 7);
        expect(decodeSliceMask(token, 7)).toEqual([0, 2, 5]);
    });

    it('round-trips every fight included', () => {
        const token = encodeSliceMask([0, 1, 2, 3, 4, 5, 6], 7);
        expect(decodeSliceMask(token, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('round-trips no fights included', () => {
        expect(decodeSliceMask(encodeSliceMask([], 7), 7)).toEqual([]);
    });

    it('keeps fourteen fights inside three characters', () => {
        expect(encodeSliceMask([0, 3, 13], 14).length).toBeLessThanOrEqual(3);
    });

    it('keeps sixty fights inside eleven characters', () => {
        const all = Array.from({ length: 60 }, (_, i) => i);
        expect(encodeSliceMask(all, 60).length).toBeLessThanOrEqual(11);
    });

    it('emits URL-safe characters only', () => {
        const all = Array.from({ length: 60 }, (_, i) => i);
        expect(encodeSliceMask(all, 60)).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('rejects a token whose width disagrees with the roster', () => {
        // A stale link must degrade to the truth, not to silently-wrong numbers.
        const token = encodeSliceMask([0, 2], 7);
        expect(decodeSliceMask(token, 9)).toBeNull();
    });

    it('rejects malformed input', () => {
        expect(decodeSliceMask('!!!!', 7)).toBeNull();
        expect(decodeSliceMask('', 7)).toBeNull();
    });

    it('ignores ordinals outside the width when encoding', () => {
        expect(decodeSliceMask(encodeSliceMask([0, 99, -1], 3), 3)).toEqual([0]);
    });

    it('rejects a token encoded at width 7 when decoded at width 8 (same-byte-bucket)', () => {
        const token = encodeSliceMask([0, 2, 5], 7);
        expect(decodeSliceMask(token, 8)).toBeNull();
    });

    it('rejects a token encoded at width 8 when decoded at width 7 (same-byte-bucket)', () => {
        const token = encodeSliceMask([0, 2, 5], 8);
        expect(decodeSliceMask(token, 7)).toBeNull();
    });

    it('empty slice rejects at neighboring width', () => {
        const token7 = encodeSliceMask([], 7);
        expect(decodeSliceMask(token7, 8)).toBeNull();
        const token8 = encodeSliceMask([], 8);
        expect(decodeSliceMask(token8, 7)).toBeNull();
    });
});
