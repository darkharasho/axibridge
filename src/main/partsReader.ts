/**
 * Node-side reader for gzipped parts published by webReportParts.ts. Used by
 * the Electron history view (GitHub API) and the replay proxy (HTTP).
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { assertSupportedManifest, joinParts, readPartsManifest } from '../shared/chunkedGzip';

export const resolvePartsJson = async (json: any, fetchPart: (partPath: string) => Promise<Buffer>): Promise<any> => {
    const manifest = readPartsManifest(json);
    if (!manifest) return json;
    assertSupportedManifest(manifest);
    const chunks: Uint8Array[] = [];
    for (const part of manifest.parts) {
        const buf = await fetchPart(part.path);
        chunks.push(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
    }
    const gzip = joinParts(chunks, manifest);
    if (createHash('sha256').update(gzip).digest('hex') !== manifest.sha256) {
        throw new Error('Report parts corrupt: sha256 mismatch');
    }
    return JSON.parse(gunzipSync(gzip).toString('utf8'));
};
