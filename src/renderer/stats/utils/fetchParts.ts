import {
    assertSupportedManifest,
    joinParts,
    readPartsManifest,
    resolvePartUrl,
    type PartsManifest
} from '../../../shared/chunkedGzip';

/**
 * Inflate gzipped bytes in the browser. GitHub Pages and R2 serve these files
 * with no Content-Encoding, so the browser hands over the compressed bytes.
 */
export const inflateGzipToText = async (bytes: ArrayBuffer | Uint8Array): Promise<string> => {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
};

let warnedNoSubtle = false;

/**
 * `crypto.subtle` is only exposed in secure contexts (https, or localhost).
 * A report site on a plain-http custom domain, or `dev:web` reached over a
 * LAN IP, is an insecure context, so subtle is undefined there. In that case
 * skip hash verification rather than throwing on every load — the manifest's
 * per-part and total length checks in `joinParts`, plus gzip's own CRC32
 * trailer (validated by `DecompressionStream`), still guard against
 * truncated or corrupt parts.
 */
export const sha256Hex = async (bytes: Uint8Array): Promise<string | null> => {
    if (!globalThis.crypto?.subtle) {
        if (!warnedNoSubtle) {
            warnedNoSubtle = true;
            console.warn('[fetchParts] crypto.subtle unavailable (insecure context); skipping report part hash verification.');
        }
        return null;
    }
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

const fetchBytes = async (url: string): Promise<Uint8Array> => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
};

export const fetchPartsJson = async (manifestUrl: string, manifest: PartsManifest): Promise<any> => {
    assertSupportedManifest(manifest);
    // Scoped so the per-part chunk array can be garbage-collected once `gzip`
    // is assembled, instead of staying reachable (alongside the joined
    // buffer, the inflated Blob, and the decoded text) for the rest of the
    // function.
    const gzip = await (async () => {
        const chunks = await Promise.all(manifest.parts.map((part) => fetchBytes(resolvePartUrl(manifestUrl, part.path))));
        return joinParts(chunks, manifest);
    })();
    const hash = await sha256Hex(gzip);
    if (hash !== null && hash !== manifest.sha256) {
        throw new Error('Report parts corrupt: sha256 mismatch');
    }
    const text = await inflateGzipToText(gzip);
    return JSON.parse(text);
};

/**
 * Load a published report.json. Reports published by AxiBridge 3.10+ are a
 * stub whose `axibridgeParts` manifest points at gzipped parts; older reports
 * are the plain payload and are returned unchanged.
 */
export const fetchReportPayload = async (url: string): Promise<any> => {
    const json = JSON.parse(new TextDecoder().decode(await fetchBytes(url)));
    const manifest = readPartsManifest(json);
    return manifest ? fetchPartsJson(url, manifest) : json;
};
