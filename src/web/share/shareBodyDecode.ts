/**
 * Decodes the bytes fetched from a share pointer's `loc`. `shareService.ts`
 * gzips Tier 1 reports, but the bytes can still arrive in more than one state
 * depending on what the host does with them, so this stays tolerant of each
 * instead of assuming one:
 *
 *  - If the server sent a `Content-Encoding` the browser understood (gzip,
 *    br, zstd), `fetch` already decompressed it — the bytes here are plain
 *    UTF-8 JSON text.
 *  - If the bytes are still gzip-compressed (no Content-Encoding, or a
 *    proxy stripped it), they start with the gzip magic `0x1f 0x8b` and can
 *    be inflated with `DecompressionStream('gzip')`, which every target
 *    browser supports.
 *  - Anything else (notably: still-brotli-compressed bytes — the browser
 *    has no `DecompressionStream('br')`, and adding a brotli-wasm
 *    dependency is explicitly out of scope) is undecodable here and must
 *    fail with a message that names the likely cause instead of silently
 *    returning garbage.
 */

export class ShareBodyDecodeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ShareBodyDecodeError';
    }
}

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

const isGzipMagic = (bytes: Uint8Array): boolean =>
    bytes.length >= 2 && bytes[0] === GZIP_MAGIC_0 && bytes[1] === GZIP_MAGIC_1;

const inflateGzip = async (bytes: Uint8Array): Promise<string> => {
    // Built from a plain `ReadableStream` rather than `new Blob([...]).stream()`:
    // jsdom's `Blob` (used under the vitest jsdom test environment) has no
    // `.stream()` method, and wrapping through `Response(blob).body` was
    // unreliable there too. A hand-built `ReadableStream` works the same way
    // in real browsers and under jsdom/undici.
    const source = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        }
    });
    // The DOM lib typings bundled with this project disagree with
    // `ReadableStream`'s own generic on `DecompressionStream`'s exact
    // `BufferSource` vs `Uint8Array` element type; both are the same bytes
    // at runtime, so this is cast rather than fought.
    const stream = (source as unknown as ReadableStream<BufferSource>).pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
};

/**
 * Returns the decoded UTF-8 JSON *text* (not yet `JSON.parse`d) so callers
 * can distinguish "we couldn't get text out of these bytes at all" from
 * "we got text, but it isn't valid JSON".
 */
export const decodeShareBody = async (bytes: Uint8Array): Promise<string> => {
    if (isGzipMagic(bytes)) {
        try {
            return await inflateGzip(bytes);
        } catch (err) {
            throw new ShareBodyDecodeError(
                `The share data looked gzip-compressed but failed to decompress: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }

    let text: string;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new ShareBodyDecodeError(
            'The share data is not valid UTF-8 and is not gzip-compressed — it is likely still brotli-compressed, which this viewer cannot decode in-browser.'
        );
    }

    return text;
};
