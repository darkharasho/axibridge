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

export const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
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
    const chunks = await Promise.all(manifest.parts.map((part) => fetchBytes(resolvePartUrl(manifestUrl, part.path))));
    const gzip = joinParts(chunks, manifest);
    if ((await sha256Hex(gzip)) !== manifest.sha256) {
        throw new Error('Report parts corrupt: sha256 mismatch');
    }
    return JSON.parse(await inflateGzipToText(gzip));
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
