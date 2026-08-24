/**
 * Fetch a published report's replay object.
 *
 * The bytes are gzipped (see `src/main/cloudflare/replaySidecar.ts`) and served
 * with no `Content-Encoding`, so the browser hands them over compressed and
 * this is where they are inflated. Reports published before compression landed
 * serve plain JSON from the same kind of URL, so the format is decided by the
 * gzip magic number rather than by the file extension.
 */

const isGzipped = (bytes: Uint8Array): boolean =>
    bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

const inflate = async (buffer: ArrayBuffer): Promise<string> => {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
};

export async function fetchReplayJson(url: string): Promise<any> {
    // In Electron, proxy through the main process to avoid CORS restrictions.
    const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (electronAPI?.fetchR2Json) {
        const result = await electronAPI.fetchR2Json(url);
        if (!result.success) throw new Error(result.error ?? 'Fetch failed');
        return result.json;
    }

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return JSON.parse(isGzipped(bytes) ? await inflate(buffer) : new TextDecoder().decode(bytes));
}
