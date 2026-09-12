// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { splitIntoParts } from '../../shared/chunkedGzip';
import { resolvePartsJson } from '../partsReader';

const REPORT = { meta: { title: 'Real' }, stats: { n: Array.from({ length: 300 }, (_, i) => i) } };

const build = () => {
    const gz = gzipSync(Buffer.from(JSON.stringify(REPORT)));
    const sha = createHash('sha256').update(gz).digest('hex');
    return splitIntoParts(new Uint8Array(gz), 'report.json.gz', sha, 50);
};

describe('resolvePartsJson', () => {
    it('passes a plain report through without fetching', async () => {
        const fetchPart = vi.fn();
        await expect(resolvePartsJson(REPORT, fetchPart)).resolves.toBe(REPORT);
        expect(fetchPart).not.toHaveBeenCalled();
    });

    it('reassembles a stub report', async () => {
        const { parts, manifest } = build();
        const byPath = new Map(parts.map((p) => [p.path, Buffer.from(p.data)]));
        const fetchPart = vi.fn(async (p: string) => byPath.get(p)!);
        await expect(resolvePartsJson({ meta: {}, stats: {}, axibridgeParts: manifest }, fetchPart)).resolves.toEqual(REPORT);
        expect(fetchPart.mock.calls.map((c) => c[0])).toEqual(manifest.parts.map((p) => p.path));
    });

    it('rejects a corrupted part', async () => {
        const { parts, manifest } = build();
        const byPath = new Map(parts.map((p) => [p.path, Buffer.from(p.data)]));
        const first = byPath.get(parts[0].path)!;
        first[first.length - 1] ^= 0xff;
        await expect(resolvePartsJson(manifest, async (p) => byPath.get(p)!)).rejects.toThrow('sha256 mismatch');
    });
});
