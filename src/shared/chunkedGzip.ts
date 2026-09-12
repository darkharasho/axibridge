/**
 * Split a gzipped artifact into small parts described by a manifest.
 *
 * GitHub's blob API answers a fake `401 Bad credentials` once a single request
 * body takes longer than ~60 s to send, so on slow upload links one large
 * report.json or replay.json.gz can never publish. Parts cap every request at
 * PART_BYTES (≈5.3 MB once base64'd). Pure: no DOM or Node APIs, because this
 * file is compiled for Electron main, the renderer and the web viewer.
 */

export const PARTS_FORMAT_VERSION = 1;
export const PART_BYTES = 4 * 1024 * 1024;
export const UNSUPPORTED_PARTS_VERSION_MESSAGE = 'This report was published by a newer AxiBridge; reload the page.';

export interface PartsManifestPart {
    path: string;
    bytes: number;
}

export interface PartsManifest {
    version: number;
    encoding: 'gzip';
    totalBytes: number;
    sha256: string;
    parts: PartsManifestPart[];
    originalTitle?: string;
}

export const partPath = (baseName: string, index: number): string =>
    `${baseName}.${String(index).padStart(3, '0')}`;

export const splitIntoParts = (
    gzip: Uint8Array,
    baseName: string,
    sha256: string,
    partBytes: number = PART_BYTES
): { parts: Array<{ path: string; data: Uint8Array }>; manifest: PartsManifest } => {
    const parts: Array<{ path: string; data: Uint8Array }> = [];
    const count = Math.max(1, Math.ceil(gzip.length / partBytes));
    for (let i = 0; i < count; i += 1) {
        parts.push({ path: partPath(baseName, i), data: gzip.subarray(i * partBytes, (i + 1) * partBytes) });
    }
    return {
        parts,
        manifest: {
            version: PARTS_FORMAT_VERSION,
            encoding: 'gzip',
            totalBytes: gzip.length,
            sha256,
            parts: parts.map((part) => ({ path: part.path, bytes: part.data.length }))
        }
    };
};

const isManifestShape = (value: any): value is PartsManifest =>
    !!value
    && typeof value === 'object'
    && typeof value.version === 'number'
    && value.encoding === 'gzip'
    && typeof value.totalBytes === 'number'
    && typeof value.sha256 === 'string'
    && Array.isArray(value.parts)
    && value.parts.every((part: any) => part && typeof part.path === 'string' && typeof part.bytes === 'number');

export const readPartsManifest = (json: unknown): PartsManifest | null => {
    if (!json || typeof json !== 'object') return null;
    const candidate = (json as any).axibridgeParts ?? json;
    return isManifestShape(candidate) ? candidate : null;
};

export const assertSupportedManifest = (manifest: PartsManifest): void => {
    if (manifest.version !== PARTS_FORMAT_VERSION) {
        throw new Error(UNSUPPORTED_PARTS_VERSION_MESSAGE);
    }
};

export const joinParts = (chunks: Uint8Array[], manifest: PartsManifest): Uint8Array => {
    if (chunks.length !== manifest.parts.length) {
        throw new Error(`Report parts incomplete: expected ${manifest.parts.length} parts, got ${chunks.length}`);
    }
    chunks.forEach((chunk, i) => {
        const expected = manifest.parts[i];
        if (chunk.length !== expected.bytes) {
            throw new Error(`Report parts corrupt: part ${expected.path} is ${chunk.length} bytes, expected ${expected.bytes}`);
        }
    });
    const out = new Uint8Array(manifest.totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    if (offset !== manifest.totalBytes) {
        throw new Error(`Report parts corrupt: joined ${offset} bytes, expected ${manifest.totalBytes}`);
    }
    return out;
};

export const resolvePartUrl = (manifestUrl: string, path: string): string => {
    const withoutQuery = manifestUrl.split(/[?#]/)[0];
    const slash = withoutQuery.lastIndexOf('/');
    return `${slash >= 0 ? withoutQuery.slice(0, slash + 1) : ''}${path}`;
};
