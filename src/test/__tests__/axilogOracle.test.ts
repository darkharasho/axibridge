import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted } from '../axilogOracle';

describe('axilog oracle harness', () => {
    it('parses the fixture both ways at the same version', () => {
        const { ei, native } = oracleFixture();
        expect(native.axilog.schema).toBe('1.0');
        expect(native.axilog.version).toBe('0.3.4');
        expect(Array.isArray(ei.players)).toBe(true);
        expect(Array.isArray(native.entities)).toBe(true);
    });

    it('memoizes — the second call returns the identical objects', () => {
        const a = oracleFixture();
        const b = oracleFixture();
        expect(a.ei).toBe(b.ei);
        expect(a.native).toBe(b.native);
    });

    it('exposes the six native top-level keys', () => {
        const { native } = oracleFixture();
        for (const key of ['axilog', 'encounter', 'entities', 'catalogs', 'blocks', 'coverage']) {
            expect(native, `missing native key ${key}`).toHaveProperty(key);
        }
    });

    it('passes when the two sides agree', () => {
        expect(() => expectEqualOrAllowlisted('n', 1, 1, {})).not.toThrow();
    });

    it('fails when they disagree and there is no allowlist entry', () => {
        expect(() => expectEqualOrAllowlisted('n', 1, 2, {})).toThrow();
    });

    it('passes a disagreement that carries an allowlist entry', () => {
        expect(() =>
            expectEqualOrAllowlisted('n', 1, 2, { n: { reason: 'native is right because ...' } }),
        ).not.toThrow();
    });
});
