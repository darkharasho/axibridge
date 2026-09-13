import { describe, expect, it } from 'vitest';
import {
    PART_BYTES,
    PARTS_FORMAT_VERSION,
    UNSUPPORTED_PARTS_VERSION_MESSAGE,
    assertSupportedManifest,
    joinParts,
    partPath,
    readPartsManifest,
    resolvePartUrl,
    splitIntoParts
} from '../chunkedGzip';

const bytes = (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) out[i] = (i * 31 + 7) & 0xff;
    return out;
};

describe('splitIntoParts / joinParts', () => {
    it.each([0, 1, PART_BYTES - 1, PART_BYTES, PART_BYTES + 1, 3 * PART_BYTES + 17])(
        'round-trips %i bytes',
        (size) => {
            const input = bytes(size);
            const { parts, manifest } = splitIntoParts(input, 'report.json.gz', 'abc');
            expect(manifest.parts.length).toBe(Math.max(1, Math.ceil(size / PART_BYTES)));
            expect(parts.every((p) => p.data.length <= PART_BYTES)).toBe(true);
            expect(manifest.totalBytes).toBe(size);
            expect(manifest.parts.map((p) => p.bytes)).toEqual(parts.map((p) => p.data.length));
            // Buffer.equals, not toEqual on arrays: a 12MB deep compare times out on CI runners.
            const joined = joinParts(parts.map((p) => p.data), manifest);
            expect(Buffer.from(joined).equals(Buffer.from(input))).toBe(true);
        }
    );

    it('names parts with a three-digit suffix and records the manifest header', () => {
        const { manifest } = splitIntoParts(bytes(10), 'report.json.gz', 'deadbeef', 4);
        expect(manifest).toEqual({
            version: PARTS_FORMAT_VERSION,
            encoding: 'gzip',
            totalBytes: 10,
            sha256: 'deadbeef',
            parts: [
                { path: 'report.json.gz.000', bytes: 4 },
                { path: 'report.json.gz.001', bytes: 4 },
                { path: 'report.json.gz.002', bytes: 2 }
            ]
        });
        expect(partPath('replay.json.gz', 12)).toBe('replay.json.gz.012');
    });

    it('rejects a missing part', () => {
        const { parts, manifest } = splitIntoParts(bytes(10), 'r', 'x', 4);
        expect(() => joinParts(parts.slice(0, 2).map((p) => p.data), manifest)).toThrow(/expected 3 parts, got 2/);
    });

    it('rejects a truncated part', () => {
        const { parts, manifest } = splitIntoParts(bytes(10), 'r', 'x', 4);
        const chunks = parts.map((p) => p.data);
        chunks[1] = chunks[1].subarray(0, 3);
        expect(() => joinParts(chunks, manifest)).toThrow(/part r\.001 is 3 bytes, expected 4/);
    });
});

describe('readPartsManifest', () => {
    const manifest = splitIntoParts(bytes(5), 'report.json.gz', 'x').manifest;

    it('reads a manifest out of a stub report', () => {
        expect(readPartsManifest({ meta: {}, stats: {}, axibridgeParts: manifest })).toEqual(manifest);
    });

    it('reads a bare manifest', () => {
        expect(readPartsManifest(manifest)).toEqual(manifest);
    });

    it('returns null for a plain report and for junk', () => {
        expect(readPartsManifest({ meta: { title: 't' }, stats: { total: 1 } })).toBeNull();
        expect(readPartsManifest(null)).toBeNull();
        expect(readPartsManifest({ axibridgeParts: { version: 1, parts: 'nope' } })).toBeNull();
    });

    it('lets an unknown version through the shape check but fails the support check', () => {
        const future = { ...manifest, version: 2 };
        expect(readPartsManifest(future)).toEqual(future);
        expect(() => assertSupportedManifest(future)).toThrow(UNSUPPORTED_PARTS_VERSION_MESSAGE);
        expect(() => assertSupportedManifest(manifest)).not.toThrow();
    });
});

describe('resolvePartUrl', () => {
    it('resolves next to an absolute manifest URL', () => {
        expect(resolvePartUrl('https://u.github.io/r/reports/a/report.json', 'report.json.gz.000'))
            .toBe('https://u.github.io/r/reports/a/report.json.gz.000');
    });
    it('resolves next to a relative manifest URL and drops a query string', () => {
        expect(resolvePartUrl('./reports/a/replay.parts.json?v=2', 'replay.json.gz.001'))
            .toBe('./reports/a/replay.json.gz.001');
    });
});
