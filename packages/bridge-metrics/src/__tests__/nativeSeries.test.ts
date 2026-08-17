import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { parseFile } from '@axiapps/axilog';
import { decodeSeries } from '../nativeSeries';

describe('decodeSeries', () => {
    it('expands rle pairs into one value per interval', () => {
        // [value, runLength] pairs; len is the authoritative output length.
        expect(decodeSeries({ data: [[0, 3], [5, 2]], enc: 'rle', interval_ms: 1000, len: 5 }))
            .toEqual([0, 0, 0, 5, 5]);
    });

    it('returns raw data unchanged', () => {
        expect(decodeSeries({ data: [1, 2, 3], enc: 'raw', interval_ms: 1000, len: 3 }))
            .toEqual([1, 2, 3]);
    });

    it('pads a short run to len by repeating the last value', () => {
        // A cumulative damage series that stops changing must stay flat, not drop
        // to zero, or every downstream toPerSecond() delta invents a negative.
        expect(decodeSeries({ data: [[7, 2]], enc: 'rle', interval_ms: 1000, len: 4 }))
            .toEqual([7, 7, 7, 7]);
    });

    it('truncates a long run to len', () => {
        expect(decodeSeries({ data: [[1, 99]], enc: 'rle', interval_ms: 1000, len: 3 }))
            .toEqual([1, 1, 1]);
    });

    it('returns an empty array for absent or unknown-encoding series', () => {
        expect(decodeSeries(null)).toEqual([]);
        expect(decodeSeries(undefined)).toEqual([]);
        expect(decodeSeries({ data: [1], enc: 'lz4', interval_ms: 1000, len: 1 })).toEqual([]);
    });

    it('decodes the fixture cumulative damage series to the reported total', () => {
        // Pinned against the real container because a hand-built object cannot
        // catch an axilog encoding change -- which would otherwise surface as
        // every damage number being quietly wrong rather than as a failure.
        const fixture = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');
        const r: any = parseFile(fixture, { everything: true } as any);
        const id = Object.keys(r.blocks.damage.by_entity)[0];
        const decoded = decodeSeries(r.blocks.series.by_entity[id].damage);

        expect(decoded).toHaveLength(r.blocks.series.by_entity[id].damage.len);
        // Cumulative: monotonic, and the last sample IS the entity total.
        for (let i = 1; i < decoded.length; i++) expect(decoded[i]).toBeGreaterThanOrEqual(decoded[i - 1]);
        expect(decoded[decoded.length - 1]).toBe(r.blocks.damage.by_entity[id].total);
    });
});
