import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { loadShareReportJson, ShareLoadError } from '../loadShareReport';

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe('loadShareReportJson', () => {
    it('parses a successful plain-JSON response into the decoded object', async () => {
        const payload = { meta: { title: 'Demo' }, stats: { ok: true } };
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            arrayBuffer: async () => bytesOf(JSON.stringify(payload)).buffer
        })) as any;
        const result = await loadShareReportJson('https://example.com/shares/demo.json', fetchImpl);
        // A naive impl that forgot to JSON.parse the decoded text (returning
        // the raw string instead) would give back a string, not an object —
        // `result.meta` would be `undefined` instead of `{ title: 'Demo' }`.
        expect(result).toEqual(payload);
    });

    it('parses a gzip-compressed response transparently', async () => {
        const payload = { meta: { title: 'Gz' }, stats: { players: 5 } };
        const gzipped = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            arrayBuffer: async () => new Uint8Array(gzipped).buffer
        })) as any;
        const result = await loadShareReportJson('https://example.com/shares/demo.json', fetchImpl);
        expect(result).toEqual(payload);
    });

    it('wraps a rejected fetch (network/CORS failure) in ShareLoadError', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new TypeError('Failed to fetch');
        });
        // A naive impl that does not catch the rejection lets the raw
        // `TypeError: Failed to fetch` escape uncaught, with no mention of
        // CORS/network — the wrong (unhelpful, uncatchable-by-type) error a
        // user-facing error card would have to display verbatim instead of
        // a clear explanation.
        await expect(loadShareReportJson('https://example.com/shares/demo.json', fetchImpl as any)).rejects.toThrow(
            ShareLoadError
        );
    });

    it('turns a non-OK HTTP status into a ShareLoadError naming the status code', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: false,
            status: 404,
            arrayBuffer: async () => bytesOf('Not Found').buffer
        })) as any;
        // A naive impl that skips the `response.ok` check and just reads the
        // body would try to JSON.parse the storage host's "Not Found" error
        // page text, producing a confusing "Unexpected token N in JSON"
        // message with no mention of "404" anywhere — instead of a message
        // that actually says what happened.
        await expect(loadShareReportJson('https://example.com/shares/demo.json', fetchImpl)).rejects.toThrow(/404/);
    });
});
