import { brotliCompressSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodeShareBody, ShareBodyDecodeError } from '../shareBodyDecode';

describe('decodeShareBody', () => {
    it('returns plain JSON text unchanged (the already-decoded / Content-Encoding case)', async () => {
        const json = JSON.stringify({ meta: { title: 'Demo' }, stats: {} });
        const bytes = new TextEncoder().encode(json);
        // A naive impl that unconditionally pipes every response through
        // DecompressionStream('gzip') (skipping the magic-byte check) would
        // throw here instead of returning the JSON text, because these
        // bytes are not a valid gzip stream.
        await expect(decodeShareBody(bytes)).resolves.toBe(json);
    });

    it('inflates a real gzip stream built with zlib.gzipSync', async () => {
        const json = JSON.stringify({ meta: { title: 'Gzipped Demo' }, stats: { players: [1, 2, 3] } });
        const gzipped = new Uint8Array(gzipSync(Buffer.from(json, 'utf8')));
        // A naive impl that skips gzip detection and just runs
        // `new TextDecoder().decode(bytes)` on the raw compressed bytes
        // would return mojibake/binary garbage (and fail a fatal UTF-8
        // decode, or produce text that does not `JSON.parse`) instead of
        // the original JSON string.
        await expect(decodeShareBody(gzipped)).resolves.toBe(json);
    });

    it('rejects with a specific error for undecodable (real brotli) bytes', async () => {
        const json = JSON.stringify({ meta: { title: 'Brotli Demo' }, stats: {} });
        const brotli = new Uint8Array(brotliCompressSync(Buffer.from(json, 'utf8')));
        // This is real brotli output — it doesn't start with the gzip magic
        // 0x1f 0x8b, and its bytes are not valid UTF-8 text. A naive impl
        // that always attempts a plain `TextDecoder().decode()` without
        // `fatal: true` would silently return a mangled
        // (replacement-character-laden) string instead of throwing — which
        // would then either crash `JSON.parse` deep in an unrelated caller
        // with a confusing "Unexpected token" error, or, worse, happen to
        // parse into garbage that gets rendered as if it were a real report.
        await expect(decodeShareBody(brotli)).rejects.toThrow(ShareBodyDecodeError);
    });
});
