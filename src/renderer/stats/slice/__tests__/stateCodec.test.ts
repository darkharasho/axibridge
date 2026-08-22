import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '../stateCodec';

const roundTrip = (value: unknown) => decodeState(JSON.parse(JSON.stringify(encodeState(value))));

describe('stateCodec', () => {
    it('round-trips a Map through JSON', () => {
        const value = new Map<string, number>([['a', 1], ['b', 2]]);
        const out = roundTrip(value);
        expect(out).toBeInstanceOf(Map);
        expect([...out.entries()]).toEqual([['a', 1], ['b', 2]]);
    });

    it('round-trips a Set through JSON', () => {
        const out = roundTrip(new Set(['d1', 'd2']));
        expect(out).toBeInstanceOf(Set);
        expect([...out]).toEqual(['d1', 'd2']);
    });

    it('round-trips Maps nested inside Maps, arrays and plain objects', () => {
        const value = {
            buckets: new Map([['b1', { players: new Map([['acct', { n: 3 }]]), fights: [1, 2] }]]),
            rows: [new Map([['k', 'v']])],
        };
        const out = roundTrip(value);
        expect(out.buckets.get('b1').players.get('acct')).toEqual({ n: 3 });
        expect(out.buckets.get('b1').fights).toEqual([1, 2]);
        expect(out.rows[0].get('k')).toBe('v');
    });

    it('preserves numeric Map keys, which JSON object keys would stringify', () => {
        const out = roundTrip(new Map<number, string>([[42, 'x']]));
        expect(out.get(42)).toBe('x');
        expect(out.get('42')).toBeUndefined();
    });

    it('leaves plain values untouched', () => {
        expect(roundTrip({ a: 1, b: 'two', c: null, d: [1, 2], e: true })).toEqual({
            a: 1, b: 'two', c: null, d: [1, 2], e: true,
        });
    });

    it('does not mistake a plain object that happens to have a __map key for an encoded Map', () => {
        // Guards a real collision: skill maps are keyed by arbitrary strings.
        const out = roundTrip({ __map: 'not an array' });
        expect(out).toEqual({ __map: 'not an array' });
    });
});
