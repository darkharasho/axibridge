// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

import { fetchReplayJson } from '../fetchReplayJson';
import { splitIntoParts } from '../../../../shared/chunkedGzip';

const PAYLOAD = { replayFights: [{ id: 'fight-1', movementData: { positions: [1, 2] } }] };

/** Serve raw bytes the way R2 does: no Content-Encoding, so no transparent inflate. */
const serve = (body: Uint8Array, ok = true, status = 200) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
        ok,
        status,
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
    })));
};

const gz = (value: unknown) => new Uint8Array(gzipSync(Buffer.from(JSON.stringify(value), 'utf8')));
const plain = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchReplayJson', () => {
    it('inflates a gzipped replay object', async () => {
        serve(gz(PAYLOAD));
        await expect(fetchReplayJson('https://pub-x.r2.dev/reports/a/replay.json.gz')).resolves.toEqual(PAYLOAD);
    });

    it('reads a plain replay object, so reports published before compression still load', async () => {
        serve(plain(PAYLOAD));
        await expect(fetchReplayJson('https://user.github.io/repo/reports/a/replay.json')).resolves.toEqual(PAYLOAD);
    });

    it('rejects with the status code when the object is missing', async () => {
        serve(plain(PAYLOAD), false, 404);
        await expect(fetchReplayJson('https://pub-x.r2.dev/reports/a/replay.json.gz')).rejects.toThrow('HTTP 404');
    });

    it('goes through the main process when running inside Electron, to dodge CORS', async () => {
        const fetchR2Json = vi.fn(async () => ({ success: true, json: PAYLOAD }));
        vi.stubGlobal('window', { electronAPI: { fetchR2Json } });
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('should not touch the network'); }));

        await expect(fetchReplayJson('https://pub-x.r2.dev/reports/a/replay.json.gz')).resolves.toEqual(PAYLOAD);
        expect(fetchR2Json).toHaveBeenCalledWith('https://pub-x.r2.dev/reports/a/replay.json.gz');
    });

    it('surfaces the main-process error message', async () => {
        vi.stubGlobal('window', {
            electronAPI: { fetchR2Json: vi.fn(async () => ({ success: false, error: 'HTTP 403' })) }
        });
        await expect(fetchReplayJson('https://pub-x.r2.dev/reports/a/replay.json.gz')).rejects.toThrow('HTTP 403');
    });

    it('follows a Pages replay parts manifest', async () => {
        const gzBytes = gz(PAYLOAD);
        const sha = createHash('sha256').update(gzBytes).digest('hex');
        const { parts, manifest } = splitIntoParts(gzBytes, 'replay.json.gz', sha, 16);
        const base = 'https://user.github.io/repo/reports/a/';
        const files: Record<string, Uint8Array> = {
            [`${base}replay.parts.json`]: plain(manifest)
        };
        parts.forEach((p) => { files[`${base}${p.path}`] = p.data; });
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            const body = files[url];
            return body
                ? { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) }
                : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
        }));
        await expect(fetchReplayJson(`${base}replay.parts.json`)).resolves.toEqual(PAYLOAD);
    });
});
