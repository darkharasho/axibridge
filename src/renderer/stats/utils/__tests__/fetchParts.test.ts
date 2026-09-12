// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { splitIntoParts, UNSUPPORTED_PARTS_VERSION_MESSAGE } from '../../../../shared/chunkedGzip';
import { fetchPartsJson, fetchReportPayload } from '../fetchParts';

const REPORT = { meta: { title: 'Real title' }, stats: { total: 42, list: Array.from({ length: 500 }, (_, i) => i) } };
const BASE = 'https://u.github.io/r/reports/a/';

const makeParts = (payload: unknown, partBytes = 64) => {
    const gz = new Uint8Array(gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }));
    const sha = createHash('sha256').update(gz).digest('hex');
    return splitIntoParts(gz, 'report.json.gz', sha, partBytes);
};

const toArrayBuffer = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);

const serveFiles = (files: Record<string, Uint8Array | null>) => {
    const fetchMock = vi.fn(async (url: string) => {
        const body = files[url];
        if (!body) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
        return { ok: true, status: 200, arrayBuffer: async () => toArrayBuffer(body) };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchReportPayload', () => {
    it('returns a plain report as-is', async () => {
        serveFiles({ [`${BASE}report.json`]: json(REPORT) });
        await expect(fetchReportPayload(`${BASE}report.json`)).resolves.toEqual(REPORT);
    });

    it('reassembles a stub + parts report', async () => {
        const { parts, manifest } = makeParts(REPORT);
        expect(parts.length).toBeGreaterThan(1);
        const files: Record<string, Uint8Array> = {
            [`${BASE}report.json`]: json({ meta: { title: 'stub' }, stats: {}, axibridgeParts: manifest })
        };
        parts.forEach((p) => { files[`${BASE}${p.path}`] = p.data; });
        serveFiles(files);
        await expect(fetchReportPayload(`${BASE}report.json`)).resolves.toEqual(REPORT);
    });

    it('fails when a part is missing (Pages still deploying)', async () => {
        const { parts, manifest } = makeParts(REPORT);
        const files: Record<string, Uint8Array | null> = {
            [`${BASE}report.json`]: json({ meta: {}, stats: {}, axibridgeParts: manifest })
        };
        parts.forEach((p, i) => { files[`${BASE}${p.path}`] = i === 1 ? null : p.data; });
        serveFiles(files);
        await expect(fetchReportPayload(`${BASE}report.json`)).rejects.toThrow('HTTP 404');
    });

    it('fails on a hash mismatch', async () => {
        const { parts, manifest } = makeParts(REPORT);
        const files: Record<string, Uint8Array> = {
            [`${BASE}report.json`]: json({ meta: {}, stats: {}, axibridgeParts: { ...manifest, sha256: '00' } })
        };
        parts.forEach((p) => { files[`${BASE}${p.path}`] = p.data; });
        serveFiles(files);
        await expect(fetchReportPayload(`${BASE}report.json`)).rejects.toThrow('sha256 mismatch');
    });

    it('fails with the reload message on an unknown manifest version', async () => {
        const { manifest } = makeParts(REPORT);
        serveFiles({ [`${BASE}report.json`]: json({ meta: {}, stats: {}, axibridgeParts: { ...manifest, version: 2 } }) });
        await expect(fetchReportPayload(`${BASE}report.json`)).rejects.toThrow(UNSUPPORTED_PARTS_VERSION_MESSAGE);
    });

    it('throws the status when report.json itself is missing', async () => {
        serveFiles({});
        await expect(fetchReportPayload(`${BASE}report.json`)).rejects.toThrow('HTTP 404');
    });
});

describe('fetchPartsJson', () => {
    it('fetches all parts relative to the manifest URL', async () => {
        const { parts, manifest } = makeParts({ replayFights: [1, 2, 3] }, 8);
        const files: Record<string, Uint8Array> = {};
        parts.forEach((p) => { files[`${BASE}${p.path}`] = p.data; });
        const fetchMock = serveFiles(files);
        await expect(fetchPartsJson(`${BASE}replay.parts.json`, manifest)).resolves.toEqual({ replayFights: [1, 2, 3] });
        expect(fetchMock).toHaveBeenCalledTimes(parts.length);
    });
});
