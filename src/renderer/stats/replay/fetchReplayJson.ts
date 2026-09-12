/**
 * Fetch a published report's replay object.
 *
 * The bytes are gzipped (see `src/main/cloudflare/replaySidecar.ts`) and served
 * with no `Content-Encoding`, so the browser hands them over compressed and
 * this is where they are inflated. Reports published before compression landed
 * serve plain JSON from the same kind of URL, so the format is decided by the
 * gzip magic number rather than by the file extension.
 * Replays hosted on GitHub Pages by AxiBridge 3.10+ are a parts manifest (see src/shared/chunkedGzip.ts).
 */

import { readPartsManifest } from '../../../shared/chunkedGzip';
import { fetchPartsJson, inflateGzipToText } from '../utils/fetchParts';

const isGzipped = (bytes: Uint8Array): boolean =>
    bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

export async function fetchReplayJson(url: string): Promise<any> {
    // In Electron, proxy through the main process to avoid CORS restrictions.
    // The main process resolves parts manifests itself (fetch-r2-json).
    const electronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (electronAPI?.fetchR2Json) {
        const result = await electronAPI.fetchR2Json(url);
        if (!result.success) throw new Error(result.error ?? 'Fetch failed');
        return result.json;
    }

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const json = JSON.parse(isGzipped(bytes) ? await inflateGzipToText(bytes) : new TextDecoder().decode(bytes));
    // Pages-hosted replays from 3.10+ are a manifest over gzipped parts.
    const manifest = readPartsManifest(json);
    return manifest ? fetchPartsJson(url, manifest) : json;
}
