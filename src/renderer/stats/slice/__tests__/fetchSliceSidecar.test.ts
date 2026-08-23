// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { fetchSliceSidecar } from '../fetchSliceSidecar';
import { SLICE_SIDECAR_VERSION } from '../sliceTypes';

const SIDECAR = {
    version: SLICE_SIDECAR_VERSION,
    settingsHash: 'abc123',
    fights: [{ id: 'a', label: 'EBG: Klovan', timestamp: 1, duration: '1:00' }],
    frames: [{}],
};

/** Serve gzipped bytes the way R2 does: compressed body, no Content-Encoding. */
const serve = (body: Uint8Array, ok = true) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
        ok,
        status: ok ? 200 : 404,
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    })));
};

const gz = (value: unknown) => new Uint8Array(gzipSync(Buffer.from(JSON.stringify(value), 'utf8')));

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchSliceSidecar', () => {
    it('inflates and returns a valid sidecar', async () => {
        serve(gz(SIDECAR));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'abc123');
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.sidecar.fights).toHaveLength(1);
    });

    it('accepts a sidecar when the report has no settings hash to compare against', async () => {
        serve(gz(SIDECAR));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', null);
        expect(result.ok).toBe(true);
    });

    it('rejects a settings hash mismatch rather than rendering wrong numbers', async () => {
        serve(gz(SIDECAR));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'different');
        expect(result).toMatchObject({ ok: false, reason: 'settings' });
    });

    it('rejects an unknown sidecar version', async () => {
        serve(gz({ ...SIDECAR, version: 99 }));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'abc123');
        expect(result).toMatchObject({ ok: false, reason: 'version' });
    });

    it('reports a network failure', async () => {
        serve(gz(SIDECAR), false);
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'abc123');
        expect(result).toMatchObject({ ok: false, reason: 'network' });
    });

    it('reports malformed bytes rather than throwing', async () => {
        serve(new Uint8Array([1, 2, 3, 4]));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'abc123');
        expect(result).toMatchObject({ ok: false, reason: 'malformed' });
    });

    it('reports a sidecar whose frames do not line up with its fights', async () => {
        serve(gz({ ...SIDECAR, frames: [] }));
        const result = await fetchSliceSidecar('https://pub-x.r2.dev/slice.json.gz', 'abc123');
        expect(result).toMatchObject({ ok: false, reason: 'malformed' });
    });
});
