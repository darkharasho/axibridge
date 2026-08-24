import { describe, expect, it } from 'vitest';
import { gunzipSync, gzipSync } from 'node:zlib';

import {
    REPLAY_SIDECAR_FILENAME,
    parseMaybeGzippedJson,
    prepareReplaySidecar,
    replayObjectKeys
} from '../replaySidecar';

describe('prepareReplaySidecar', () => {
    it('gzips the replay fights into a payload the viewer can inflate', () => {
        const fights = [{ id: 1, positions: [1, 2, 3] }];
        const { buffer } = prepareReplaySidecar(fights);

        expect(buffer.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
        expect(JSON.parse(gunzipSync(buffer).toString('utf8'))).toEqual({ replayFights: fights });
    });

    it('reports the uncompressed size alongside the compressed bytes', () => {
        // Repetitive replay payloads are the whole reason to compress: the size
        // gate and the log line should both be able to show the saving.
        const fights = Array.from({ length: 200 }, (_, i) => ({ id: i, positions: [0, 0, 0, 0] }));
        const { buffer, rawBytes } = prepareReplaySidecar(fights);

        expect(rawBytes).toBe(Buffer.byteLength(JSON.stringify({ replayFights: fights }), 'utf8'));
        expect(buffer.length).toBeLessThan(rawBytes);
    });
});

describe('replayObjectKeys', () => {
    it('names both the gzipped object and the legacy plain one', () => {
        // Reports published before compression landed still have replay.json in
        // the bucket; a delete that only knows the new key leaks storage forever.
        expect(replayObjectKeys('abc123')).toEqual([
            'reports/abc123/replay.json.gz',
            'reports/abc123/replay.json'
        ]);
    });

    it('uses the same filename the publish path uploads', () => {
        expect(replayObjectKeys('abc123')[0]).toBe(`reports/abc123/${REPLAY_SIDECAR_FILENAME}`);
    });
});

describe('parseMaybeGzippedJson', () => {
    it('inflates a gzipped body', () => {
        const body = gzipSync(Buffer.from(JSON.stringify({ replayFights: [] }), 'utf8'));
        expect(parseMaybeGzippedJson(body)).toEqual({ replayFights: [] });
    });

    it('reads a plain JSON body, so reports published before compression still load', () => {
        const body = Buffer.from(JSON.stringify({ replayFights: [{ id: 7 }] }), 'utf8');
        expect(parseMaybeGzippedJson(body)).toEqual({ replayFights: [{ id: 7 }] });
    });

    it('throws on a body that is neither', () => {
        expect(() => parseMaybeGzippedJson(Buffer.from('not json at all', 'utf8'))).toThrow();
    });
});
