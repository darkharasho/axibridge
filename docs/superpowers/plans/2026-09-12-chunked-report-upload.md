# Chunked Gzipped Web Report Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish web reports (and Pages-hosted replays) as gzipped ≤4 MiB parts behind a stub-manifest `report.json`, so no GitHub blob POST runs long enough to trigger GitHub's fake `401 Bad credentials`.

**Architecture:** A pure codec in `src/shared/chunkedGzip.ts` splits/joins parts and describes them with a `PartsManifest`. Main writes the stub + parts into the staging dir (plain JSON goes to a local-only dir for rollup/attendance). Browser readers (`fetchReportPayload`, `fetchReplayJson`) and Node readers (`get-github-report-detail`, `fetch-r2-json`) detect a manifest and reassemble; plain JSON still loads. Blob uploads retry once on 401/5xx and then fail with an accurate message.

**Tech Stack:** TypeScript, Electron main (Node `zlib`/`crypto`), React web viewer (`DecompressionStream`, `crypto.subtle`), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-12-chunked-report-upload-design.md`

## Global Constraints

- Part size: `PART_BYTES = 4 * 1024 * 1024`; part suffix three-digit zero-padded (`report.json.gz.000`).
- Manifest: `version: 1`, `encoding: 'gzip'`, `totalBytes` = gzipped size, `sha256` = hex of the full gzip, `parts: [{ path, bytes }]`, paths relative to the manifest URL.
- Gzip level 9 (matches `prepareReplaySidecar`).
- Stub title: `` `${title} — open with AxiBridge 3.10 or newer to view` ``; original kept in `axibridgeParts.originalTitle`.
- `MAX_GITHUB_BLOB_BYTES = 35 * 1024 * 1024`.
- Timeout error text: `` `GitHub timed out receiving ${path} (${formatBytes(bytes)}). This usually means the upload connection is too slow for the file; try again or enable R2 hosting.` ``
- Unsupported manifest version error text: `This report was published by a newer AxiBridge; reload the page.`
- R2 uploads (replay/slice keys) are unchanged. `index.json`, `rollup.json`, `attendance.json` formats are unchanged.
- `src/shared/**` is compiled by `electron/tsconfig.json` too: no DOM types or Node imports in `src/shared/chunkedGzip.ts`.
- vitest: always `npx vitest run --maxWorkers=2 <files>`.
- Git: work only in this checkout/worktree; never `git reset`, `git checkout -- .`, `git stash`, or `git clean` in the main checkout. Run long npm/vitest commands in the foreground.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: Shared parts codec

**Files:**
- Create: `src/shared/chunkedGzip.ts`
- Test: `src/shared/__tests__/chunkedGzip.test.ts`

**Interfaces:**
- Produces:
  - `PARTS_FORMAT_VERSION = 1`, `PART_BYTES = 4194304`
  - `interface PartsManifestPart { path: string; bytes: number }`
  - `interface PartsManifest { version: number; encoding: 'gzip'; totalBytes: number; sha256: string; parts: PartsManifestPart[]; originalTitle?: string }`
  - `partPath(baseName: string, index: number): string`
  - `splitIntoParts(gzip: Uint8Array, baseName: string, sha256: string, partBytes?: number): { parts: Array<{ path: string; data: Uint8Array }>; manifest: PartsManifest }`
  - `readPartsManifest(json: unknown): PartsManifest | null` — accepts a stub report (`{ axibridgeParts }`) or a bare manifest; shape check only.
  - `assertSupportedManifest(manifest: PartsManifest): void` — throws `UNSUPPORTED_PARTS_VERSION_MESSAGE` when `version !== PARTS_FORMAT_VERSION`.
  - `UNSUPPORTED_PARTS_VERSION_MESSAGE: string`
  - `joinParts(chunks: Uint8Array[], manifest: PartsManifest): Uint8Array` — throws on count/length mismatch.
  - `resolvePartUrl(manifestUrl: string, partPath: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/__tests__/chunkedGzip.test.ts
import { describe, expect, it } from 'vitest';
import {
    PART_BYTES,
    PARTS_FORMAT_VERSION,
    UNSUPPORTED_PARTS_VERSION_MESSAGE,
    assertSupportedManifest,
    joinParts,
    partPath,
    readPartsManifest,
    resolvePartUrl,
    splitIntoParts
} from '../chunkedGzip';

const bytes = (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) out[i] = (i * 31 + 7) & 0xff;
    return out;
};

describe('splitIntoParts / joinParts', () => {
    it.each([0, 1, PART_BYTES - 1, PART_BYTES, PART_BYTES + 1, 3 * PART_BYTES + 17])(
        'round-trips %i bytes',
        (size) => {
            const input = bytes(size);
            const { parts, manifest } = splitIntoParts(input, 'report.json.gz', 'abc');
            expect(manifest.parts.length).toBe(Math.max(1, Math.ceil(size / PART_BYTES)));
            expect(parts.every((p) => p.data.length <= PART_BYTES)).toBe(true);
            expect(manifest.totalBytes).toBe(size);
            expect(manifest.parts.map((p) => p.bytes)).toEqual(parts.map((p) => p.data.length));
            expect(Array.from(joinParts(parts.map((p) => p.data), manifest))).toEqual(Array.from(input));
        }
    );

    it('names parts with a three-digit suffix and records the manifest header', () => {
        const { manifest } = splitIntoParts(bytes(10), 'report.json.gz', 'deadbeef', 4);
        expect(manifest).toEqual({
            version: PARTS_FORMAT_VERSION,
            encoding: 'gzip',
            totalBytes: 10,
            sha256: 'deadbeef',
            parts: [
                { path: 'report.json.gz.000', bytes: 4 },
                { path: 'report.json.gz.001', bytes: 4 },
                { path: 'report.json.gz.002', bytes: 2 }
            ]
        });
        expect(partPath('replay.json.gz', 12)).toBe('replay.json.gz.012');
    });

    it('rejects a missing part', () => {
        const { parts, manifest } = splitIntoParts(bytes(10), 'r', 'x', 4);
        expect(() => joinParts(parts.slice(0, 2).map((p) => p.data), manifest)).toThrow(/expected 3 parts, got 2/);
    });

    it('rejects a truncated part', () => {
        const { parts, manifest } = splitIntoParts(bytes(10), 'r', 'x', 4);
        const chunks = parts.map((p) => p.data);
        chunks[1] = chunks[1].subarray(0, 3);
        expect(() => joinParts(chunks, manifest)).toThrow(/part r\.001 is 3 bytes, expected 4/);
    });
});

describe('readPartsManifest', () => {
    const manifest = splitIntoParts(bytes(5), 'report.json.gz', 'x').manifest;

    it('reads a manifest out of a stub report', () => {
        expect(readPartsManifest({ meta: {}, stats: {}, axibridgeParts: manifest })).toEqual(manifest);
    });

    it('reads a bare manifest', () => {
        expect(readPartsManifest(manifest)).toEqual(manifest);
    });

    it('returns null for a plain report and for junk', () => {
        expect(readPartsManifest({ meta: { title: 't' }, stats: { total: 1 } })).toBeNull();
        expect(readPartsManifest(null)).toBeNull();
        expect(readPartsManifest({ axibridgeParts: { version: 1, parts: 'nope' } })).toBeNull();
    });

    it('lets an unknown version through the shape check but fails the support check', () => {
        const future = { ...manifest, version: 2 };
        expect(readPartsManifest(future)).toEqual(future);
        expect(() => assertSupportedManifest(future)).toThrow(UNSUPPORTED_PARTS_VERSION_MESSAGE);
        expect(() => assertSupportedManifest(manifest)).not.toThrow();
    });
});

describe('resolvePartUrl', () => {
    it('resolves next to an absolute manifest URL', () => {
        expect(resolvePartUrl('https://u.github.io/r/reports/a/report.json', 'report.json.gz.000'))
            .toBe('https://u.github.io/r/reports/a/report.json.gz.000');
    });
    it('resolves next to a relative manifest URL and drops a query string', () => {
        expect(resolvePartUrl('./reports/a/replay.parts.json?v=2', 'replay.json.gz.001'))
            .toBe('./reports/a/replay.json.gz.001');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/shared/__tests__/chunkedGzip.test.ts`
Expected: FAIL — cannot resolve `../chunkedGzip`.

- [ ] **Step 3: Write the implementation**

```ts
// src/shared/chunkedGzip.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/shared/__tests__/chunkedGzip.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/chunkedGzip.ts src/shared/__tests__/chunkedGzip.test.ts
git commit -m "feat(web-upload): add chunked gzip parts codec

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Browser fetch helpers (report + replay + shared inflate)

**Files:**
- Create: `src/renderer/stats/utils/fetchParts.ts`
- Test: `src/renderer/stats/utils/__tests__/fetchParts.test.ts`
- Modify: `src/renderer/stats/replay/fetchReplayJson.ts` (use shared inflate; accept a parts manifest)
- Modify: `src/renderer/stats/replay/__tests__/fetchReplayJson.test.ts` (add manifest case)
- Modify: `src/renderer/stats/slice/fetchSliceSidecar.ts:15-18` (replace private `inflate` with `inflateGzipToText`)

**Interfaces:**
- Consumes (Task 1): `readPartsManifest`, `assertSupportedManifest`, `joinParts`, `resolvePartUrl`, `PartsManifest`.
- Produces:
  - `inflateGzipToText(bytes: ArrayBuffer | Uint8Array): Promise<string>`
  - `sha256Hex(bytes: Uint8Array): Promise<string>` (uses `globalThis.crypto.subtle`)
  - `fetchPartsJson(manifestUrl: string, manifest: PartsManifest): Promise<any>` — throws on HTTP error, count/length mismatch, or hash mismatch (`Report parts corrupt: sha256 mismatch`).
  - `fetchReportPayload(url: string): Promise<any>` — throws `HTTP <status>` when `report.json` is not ok; resolves the parsed plain JSON or the reassembled payload.

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/stats/utils/__tests__/fetchParts.test.ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { splitIntoParts, UNSUPPORTED_PARTS_VERSION_MESSAGE } from '../../../../shared/chunkedGzip';
import { fetchPartsJson, fetchReportPayload } from '../fetchParts';

const REPORT = { meta: { title: 'Real title' }, stats: { total: 42, list: Array.from({ length: 500 }, (_, i) => i) } };
const BASE = 'https://u.github.io/r/reports/a/';

const makeParts = (payload: unknown, partBytes = 64) => {
    const gz = new Uint8Array(gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 }));
    const sha = createHash('sha256').update(gz).digest('hex');
    return splitIntoParts(gz, 'report.json.gz', sha, partBytes);
};

const toArrayBuffer = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);

const serveFiles = (files: Record<string, Uint8Array | null>) => {
    const fetchMock = vi.fn(async (url: string) => {
        const body = files[url];
        if (!body) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
        return { ok: true, status: 200, arrayBuffer: async () => toArrayBuffer(body) };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
};

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

afterEach(() => { vi.unstubAllGlobals(); });

describe('fetchReportPayload', () => {
    it('returns a plain report as-is', async () => {
        serveFiles({ [`${BASE}report.json`]: json(REPORT) });
        await expect(fetchReportPayload(`${BASE}report.json`)).resolves.toEqual(REPORT);
    });

    it('reassembles a stub + parts report', async () => {
        const { parts, manifest } = makeParts(REPORT);
        expect(parts.length).toBeGreaterThan(1);
        const files: Record<string, Uint8Array> = {
            [`${BASE}report.json`]: json({ meta: { title: 'stub' }, stats: {}, axibridgeParts: manifest })
        };
        parts.forEach((p) => { files[`${BASE}${p.path}`] = p.data; });
        serveFiles(files);
        await expect(fetchReportPayload(`${BASE}report.json`)).resolves.toEqual(REPORT);
    });

    it('fails when a part is missing (Pages still deploying)', async () => {
        const { parts, manifest } = makeParts(REPORT);
        const files: Record<string, Uint8Array | null> = {
            [`${BASE}report.json`]: json({ meta: {}, stats: {}, axibridgeParts: manifest })
        };
        parts.forEach((p, i) => { files[`${BASE}${p.path}`] = i === 1 ? null : p.data; });
        serveFiles(files);
        await expect(fetchReportPayload(`${BASE}report.json`)).rejects.toThrow('HTTP 404');
    });

    it('fails on a hash mismatch', async () => {
        const { parts, manifest } = makeParts(REPORT);
        const files: Record<string, Uint8Array> = {
            [`${BASE}report.json`]: json({ meta: {}, stats: {}, axibridgeParts: { ...manifest, sha256: '00' } })
        };
        parts.forEach((p) => { files[`${BASE}${p.path}`] = p.data; });
        serveFiles(files);
        await expect(fetchReportPayload(`${BASE}report.json`)).rejects.toThrow('sha256 mismatch');
    });

    it('fails with the reload message on an unknown manifest version', async () => {
        const { manifest } = makeParts(REPORT);
        serveFiles({ [`${BASE}report.json`]: json({ meta: {}, stats: {}, axibridgeParts: { ...manifest, version: 2 } }) });
        await expect(fetchReportPayload(`${BASE}report.json`)).rejects.toThrow(UNSUPPORTED_PARTS_VERSION_MESSAGE);
    });

    it('throws the status when report.json itself is missing', async () => {
        serveFiles({});
        await expect(fetchReportPayload(`${BASE}report.json`)).rejects.toThrow('HTTP 404');
    });
});

describe('fetchPartsJson', () => {
    it('fetches all parts relative to the manifest URL', async () => {
        const { parts, manifest } = makeParts({ replayFights: [1, 2, 3] }, 8);
        const files: Record<string, Uint8Array> = {};
        parts.forEach((p) => { files[`${BASE}${p.path}`] = p.data; });
        const fetchMock = serveFiles(files);
        await expect(fetchPartsJson(`${BASE}replay.parts.json`, manifest)).resolves.toEqual({ replayFights: [1, 2, 3] });
        expect(fetchMock).toHaveBeenCalledTimes(parts.length);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/renderer/stats/utils/__tests__/fetchParts.test.ts`
Expected: FAIL — cannot resolve `../fetchParts`.

- [ ] **Step 3: Write the implementation**

```ts
// src/renderer/stats/utils/fetchParts.ts
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
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
};

export const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/renderer/stats/utils/__tests__/fetchParts.test.ts`
Expected: PASS. If `crypto.subtle` or `DecompressionStream` is missing under the node environment, check `node --version` (needs ≥18) before changing code.

- [ ] **Step 5: Add the replay manifest test**

Append inside the `describe('fetchReplayJson', ...)` block of `src/renderer/stats/replay/__tests__/fetchReplayJson.test.ts`, and add the imports at the top:

```ts
import { createHash } from 'node:crypto';
import { splitIntoParts } from '../../../../shared/chunkedGzip';
```

```ts
    it('follows a Pages replay parts manifest', async () => {
        const gzBytes = gz(PAYLOAD);
        const sha = createHash('sha256').update(gzBytes).digest('hex');
        const { parts, manifest } = splitIntoParts(gzBytes, 'replay.json.gz', sha, 16);
        const base = 'https://user.github.io/repo/reports/a/';
        const files: Record<string, Uint8Array> = {
            [`${base}replay.parts.json`]: plain(manifest)
        };
        parts.forEach((p) => { files[`${base}${p.path}`] = p.data; });
        vi.stubGlobal('fetch', vi.fn(async (url: string) => {
            const body = files[url];
            return body
                ? { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) }
                : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
        }));
        await expect(fetchReplayJson(`${base}replay.parts.json`)).resolves.toEqual(PAYLOAD);
    });
```

Run: `npx vitest run --maxWorkers=2 src/renderer/stats/replay/__tests__/fetchReplayJson.test.ts`
Expected: the new test FAILS (it returns the manifest object).

- [ ] **Step 6: Update `fetchReplayJson.ts`**

Replace the whole file body below the doc comment with:

```ts
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
```

Add one sentence to the file's doc comment: `Replays hosted on GitHub Pages by AxiBridge 3.10+ are a parts manifest (see src/shared/chunkedGzip.ts).`

- [ ] **Step 7: Replace the duplicate inflate in `fetchSliceSidecar.ts`**

Delete the private `inflate` function (and its doc comment) at `src/renderer/stats/slice/fetchSliceSidecar.ts:7-18`, add `import { inflateGzipToText } from '../utils/fetchParts';`, and replace every call `inflate(buffer)` in that file with `inflateGzipToText(buffer)`.

- [ ] **Step 8: Run tests**

Run: `npx vitest run --maxWorkers=2 src/renderer/stats/utils src/renderer/stats/replay src/renderer/stats/slice`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/stats/utils/fetchParts.ts src/renderer/stats/utils/__tests__/fetchParts.test.ts src/renderer/stats/replay src/renderer/stats/slice/fetchSliceSidecar.ts
git commit -m "feat(web-upload): load chunked reports and replays in the browser

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Main-process parts writer and local report copy

**Files:**
- Create: `src/main/webReportParts.ts`
- Test: `src/main/__tests__/webReportParts.test.ts`

**Interfaces:**
- Consumes (Task 1): `splitIntoParts`, `readPartsManifest`, `PartsManifest`.
- Produces:
  - `REPORT_JSON_FILENAME = 'report.json'`, `REPORT_PARTS_BASENAME = 'report.json.gz'`, `REPLAY_PARTS_MANIFEST_FILENAME = 'replay.parts.json'`, `REPLAY_PARTS_BASENAME = 'replay.json.gz'`, `LOCAL_REPORT_DIRNAME = 'web-report-local'`
  - `STUB_TITLE_SUFFIX = ' — open with AxiBridge 3.10 or newer to view'`
  - `buildReportStub(payload: { meta: any; stats: any }, manifest: PartsManifest): { meta: any; stats: any; axibridgeParts: PartsManifest }`
  - `writeReportParts(stagingDir: string, jsonBuffer: Buffer, payload: { meta: any; stats: any }): PartsManifest` — writes stub `report.json` + parts.
  - `writeReplayParts(stagingDir: string, gzipBuffer: Buffer): PartsManifest` — writes `replay.parts.json` + parts.
  - `writeLocalReportCopy(userDataDir: string, reportId: string, jsonBuffer: Buffer): void`
  - `readLocalReport(userDataDir: string, reportId: string): any | null` — `web-report-local/<id>/report.json` first; falls back to `web-report-staging/<id>/report.json` only when that is not a stub.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/__tests__/webReportParts.test.ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { PART_BYTES, joinParts, splitIntoParts } from '../../shared/chunkedGzip';
import {
    STUB_TITLE_SUFFIX,
    buildReportStub,
    readLocalReport,
    writeLocalReportCopy,
    writeReplayParts,
    writeReportParts
} from '../webReportParts';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrp-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const payload = (title: string, fill: number) => ({
    meta: { id: 'r1', title },
    stats: { colorPalette: 'arcane', glassSurfaces: false, glassmorphic: true, blob: 'x'.repeat(fill) }
});

// Incompressible filler so the gzip really spans multiple parts.
const bigPayload = () => ({
    meta: { id: 'r1', title: 'Big' },
    stats: { colorPalette: 'arcane', noise: randomBytes(PART_BYTES).toString('base64') }
});

describe('writeReportParts', () => {
    it('writes a stub report.json plus parts that reassemble to the original JSON', () => {
        const p = bigPayload();
        const jsonBuffer = Buffer.from(JSON.stringify(p));
        const manifest = writeReportParts(dir, jsonBuffer, p);

        const files = fs.readdirSync(dir).sort();
        expect(files[0]).toBe('report.json');
        expect(files.slice(1)).toEqual(manifest.parts.map((part) => part.path));
        expect(manifest.parts.length).toBeGreaterThan(1);

        const stub = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
        expect(stub.meta.title).toBe(`Big${STUB_TITLE_SUFFIX}`);
        expect(stub.axibridgeParts).toEqual({ ...manifest, originalTitle: 'Big' });
        expect(fs.statSync(path.join(dir, 'report.json')).size).toBeLessThan(64 * 1024);

        const gzip = joinParts(manifest.parts.map((part) => new Uint8Array(fs.readFileSync(path.join(dir, part.path)))), manifest);
        expect(createHash('sha256').update(gzip).digest('hex')).toBe(manifest.sha256);
        expect(gunzipSync(gzip).toString('utf8')).toBe(jsonBuffer.toString('utf8'));
    });

    it('writes a single part for a small report', () => {
        const p = payload('Small', 10);
        const manifest = writeReportParts(dir, Buffer.from(JSON.stringify(p)), p);
        expect(manifest.parts.map((part) => part.path)).toEqual(['report.json.gz.000']);
    });

    it('keeps theme fields in the stub so an old viewer still themes the page', () => {
        const p = payload('Small', 10);
        writeReportParts(dir, Buffer.from(JSON.stringify(p)), p);
        const stub = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
        expect(stub.stats).toMatchObject({ colorPalette: 'arcane', glassSurfaces: false, glassmorphic: true });
        expect(stub.stats.blob).toBeUndefined();
    });
});

describe('writeReplayParts', () => {
    it('writes replay.parts.json and parts of the gzip as given', () => {
        const gz = gzipSync(Buffer.from(JSON.stringify({ replayFights: [1] })));
        const manifest = writeReplayParts(dir, gz);
        expect(JSON.parse(fs.readFileSync(path.join(dir, 'replay.parts.json'), 'utf8'))).toEqual(manifest);
        expect(fs.readFileSync(path.join(dir, 'replay.json.gz.000'))).toEqual(gz);
    });
});

describe('readLocalReport', () => {
    it('prefers web-report-local', () => {
        writeLocalReportCopy(dir, 'r1', Buffer.from(JSON.stringify(payload('Local', 1))));
        expect(readLocalReport(dir, 'r1')?.meta.title).toBe('Local');
    });

    it('falls back to a plain staging copy from an older publish', () => {
        const staging = path.join(dir, 'web-report-staging', 'r1');
        fs.mkdirSync(staging, { recursive: true });
        fs.writeFileSync(path.join(staging, 'report.json'), JSON.stringify(payload('Old', 1)));
        expect(readLocalReport(dir, 'r1')?.meta.title).toBe('Old');
    });

    it('ignores a stub staging copy and a missing report', () => {
        const staging = path.join(dir, 'web-report-staging', 'r1');
        const p = payload('Stubbed', 1);
        writeReportParts(staging, Buffer.from(JSON.stringify(p)), p);
        expect(readLocalReport(dir, 'r1')).toBeNull();
        expect(readLocalReport(dir, 'missing')).toBeNull();
    });
});
```

`buildReportStub` and `splitIntoParts` are imported now for Task 8's pin test; if lint flags them unused before then, drop them and re-add in Task 8.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/webReportParts.test.ts`
Expected: FAIL — cannot resolve `../webReportParts`.

- [ ] **Step 3: Write the implementation**

```ts
// src/main/webReportParts.ts
/**
 * Writes a published report (and a Pages-hosted replay) as gzipped parts.
 *
 * GitHub's blob API returns a fake `401 Bad credentials` when one request body
 * takes longer than ~60 s to send, so every file committed to Pages is kept to
 * PART_BYTES. report.json becomes a stub: it carries the manifest for new
 * viewers and a readable "needs a newer AxiBridge" title for old ones.
 *
 * The plain JSON is kept in web-report-local/, which is never uploaded, for the
 * rollup and attendance builders that re-read earlier reports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readPartsManifest, splitIntoParts, type PartsManifest } from '../shared/chunkedGzip';

export const REPORT_JSON_FILENAME = 'report.json';
export const REPORT_PARTS_BASENAME = 'report.json.gz';
export const REPLAY_PARTS_MANIFEST_FILENAME = 'replay.parts.json';
export const REPLAY_PARTS_BASENAME = 'replay.json.gz';
export const LOCAL_REPORT_DIRNAME = 'web-report-local';
const STAGING_DIRNAME = 'web-report-staging';
export const STUB_TITLE_SUFFIX = ' — open with AxiBridge 3.10 or newer to view';

/** Stats fields the stub keeps so a pre-3.10 viewer still themes the page. */
const STUB_STATS_KEYS = ['colorPalette', 'glassSurfaces', 'glassmorphic'] as const;

const writeParts = (dir: string, gzip: Buffer, baseName: string): PartsManifest => {
    const sha256 = createHash('sha256').update(gzip).digest('hex');
    const { parts, manifest } = splitIntoParts(new Uint8Array(gzip.buffer, gzip.byteOffset, gzip.length), baseName, sha256);
    fs.mkdirSync(dir, { recursive: true });
    for (const part of parts) {
        fs.writeFileSync(path.join(dir, part.path), part.data);
    }
    return manifest;
};

export const buildReportStub = (payload: { meta: any; stats: any }, manifest: PartsManifest) => {
    const title = String(payload?.meta?.title ?? 'Report');
    const stats: Record<string, unknown> = {};
    for (const key of STUB_STATS_KEYS) {
        if (payload?.stats?.[key] !== undefined) stats[key] = payload.stats[key];
    }
    return {
        meta: { ...payload.meta, title: `${title}${STUB_TITLE_SUFFIX}` },
        stats,
        axibridgeParts: { ...manifest, originalTitle: title }
    };
};

export const writeReportParts = (stagingDir: string, jsonBuffer: Buffer, payload: { meta: any; stats: any }): PartsManifest => {
    const manifest = writeParts(stagingDir, gzipSync(jsonBuffer, { level: 9 }), REPORT_PARTS_BASENAME);
    fs.writeFileSync(path.join(stagingDir, REPORT_JSON_FILENAME), JSON.stringify(buildReportStub(payload, manifest)));
    return manifest;
};

export const writeReplayParts = (stagingDir: string, gzipBuffer: Buffer): PartsManifest => {
    const manifest = writeParts(stagingDir, gzipBuffer, REPLAY_PARTS_BASENAME);
    fs.writeFileSync(path.join(stagingDir, REPLAY_PARTS_MANIFEST_FILENAME), JSON.stringify(manifest));
    return manifest;
};

export const writeLocalReportCopy = (userDataDir: string, reportId: string, jsonBuffer: Buffer): void => {
    const dir = path.join(userDataDir, LOCAL_REPORT_DIRNAME, reportId);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, REPORT_JSON_FILENAME), jsonBuffer);
};

const readJson = (filePath: string): any | null => {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
};

export const readLocalReport = (userDataDir: string, reportId: string): any | null => {
    const local = readJson(path.join(userDataDir, LOCAL_REPORT_DIRNAME, reportId, REPORT_JSON_FILENAME));
    if (local) return local;
    // Publishes before 3.10 left the plain payload in staging.
    const staged = readJson(path.join(userDataDir, STAGING_DIRNAME, reportId, REPORT_JSON_FILENAME));
    return staged && !readPartsManifest(staged) ? staged : null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/webReportParts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/webReportParts.ts src/main/__tests__/webReportParts.test.ts
git commit -m "feat(web-upload): write reports and Pages replays as gzipped parts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the writer into `upload-web-report`, lower the cap, move replay hosting to parts

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` — `MAX_GITHUB_BLOB_BYTES` (~line 45-48), `planSidecarHosting` pages URL (~line 675), staging block (~line 1938-1950), `loadLocalReport` (~2112-2121), `loadLocalAttendanceReport` (~2155-2164)
- Modify: `src/main/handlers/__tests__/r2ReplayHosting.test.ts:89` and `:123-128`
- Modify: `scripts/profile/rollup-harness.ts` (read local copies)

**Interfaces:**
- Consumes (Task 3): `writeReportParts`, `writeReplayParts`, `writeLocalReportCopy`, `readLocalReport`, `REPLAY_PARTS_MANIFEST_FILENAME`, `LOCAL_REPORT_DIRNAME`.
- Produces: Pages replay URL `reports/<id>/replay.parts.json`; `MAX_GITHUB_BLOB_BYTES = 35 MiB`.

- [ ] **Step 1: Update the tests first**

In `src/main/handlers/__tests__/r2ReplayHosting.test.ts` change line 89 to:

```ts
        expect(plan.url).toBe(`${BASE}/reports/a/replay.parts.json`);
```

Replace the `describe('MAX_GITHUB_BLOB_BYTES', ...)` block with:

```ts
describe('MAX_GITHUB_BLOB_BYTES', () => {
    // Probed 2026-09-12: GitHub 422s a blob between 38 MB and 40 MB raw.
    it('stays under the measured single-blob ceiling', () => {
        expect(MAX_GITHUB_BLOB_BYTES).toBeLessThanOrEqual(35 * 1024 * 1024);
    });
});
```

Run: `npx vitest run --maxWorkers=2 src/main/handlers/__tests__/r2ReplayHosting.test.ts`
Expected: FAIL on both changed tests.

- [ ] **Step 2: Change the cap and the Pages replay URL**

At `githubHandlers.ts:45-47` replace the comment and constant with:

```ts
// GitHub 422s a single blob somewhere between 38 MB and 40 MB raw (probed
// 2026-09-12). Report and Pages-replay uploads are split into 4 MiB parts
// regardless (see webReportParts.ts); this still bounds the uncompressed
// report the viewer has to hold, and single template/logo files.
export const MAX_GITHUB_BLOB_BYTES = 35 * 1024 * 1024;
```

In `planSidecarHosting`, replace

```ts
    const relativePath = `reports/${reportId}/${REPLAY_SIDECAR_FILENAME}`;
```

with

```ts
    const relativePath = `reports/${reportId}/${REPLAY_PARTS_MANIFEST_FILENAME}`;
```

and add to the imports at the top of the file:

```ts
import {
    REPLAY_PARTS_MANIFEST_FILENAME,
    readLocalReport,
    writeLocalReportCopy,
    writeReplayParts,
    writeReportParts
} from '../webReportParts';
```

Run: `npx vitest run --maxWorkers=2 src/main/handlers/__tests__/r2ReplayHosting.test.ts`
Expected: PASS.

- [ ] **Step 3: Write parts into staging**

In the staging block, replace

```ts
            if (replayBuffer && replayHostedOnPages) {
                // Lands in reports/<id>/replay.json.gz via the staging-dir upload below.
                fs.writeFileSync(path.join(stagingRoot, REPLAY_SIDECAR_FILENAME), replayBuffer);
            }
```

with

```ts
            if (replayBuffer && replayHostedOnPages) {
                // Lands in reports/<id>/replay.parts.json + replay.json.gz.NNN via the staging-dir upload below.
                writeReplayParts(stagingRoot, replayBuffer);
            }
```

and replace

```ts
            fs.writeFileSync(path.join(stagingRoot, 'report.json'), builtReport.jsonBuffer);
```

with

```ts
            // report.json is a stub over gzipped parts; the plain payload stays local
            // for the rollup/attendance builders and is never uploaded.
            const reportParts = writeReportParts(stagingRoot, builtReport.jsonBuffer, builtReport.payload);
            writeLocalReportCopy(app.getPath('userData'), reportMeta.id, builtReport.jsonBuffer);
            log.info(
                `[Main] Report ${reportMeta.id}: ${formatBytes(builtReport.jsonBuffer.length)} → `
                + `${formatBytes(reportParts.totalBytes)} gzipped in ${reportParts.parts.length} part(s).`
            );
```

If `REPLAY_SIDECAR_FILENAME` is now unused in `githubHandlers.ts` apart from the R2 key, leave the import (the R2 key still uses it). If lint reports it unused, remove it from the import.

- [ ] **Step 4: Point the rollup/attendance loaders at the local copy**

Replace the body of `loadLocalReport` (and delete the now-unused `stagingParent` const above it):

```ts
                const loadLocalReport = (id: string): RollupReportPayload | null =>
                    readLocalReport(app.getPath('userData'), id);
```

Replace `loadLocalAttendanceReport` the same way (and delete `attendanceStagingParent`):

```ts
                const loadLocalAttendanceReport = (id: string): RollupReportPayload | null =>
                    readLocalReport(app.getPath('userData'), id);
```

- [ ] **Step 5: Update the profiling harness**

In `scripts/profile/rollup-harness.ts`, change the default directory and doc comment so it reads the plain local copies:

```ts
/**
 * Profiling harness: runs buildRollupData over the real published reports kept
 * locally in web-report-local (plain JSON; web-report-staging holds stub +
 * gzipped parts since 3.10), replicating what the browser does on every
 * "All Reports" view (fetch all report.json files, parse, aggregate).
 */
```

```ts
const stagingDir = process.argv[2] || `${process.env.HOME}/.config/axibridge/web-report-local`;
```

- [ ] **Step 6: Typecheck and run affected tests**

Run: `npm run typecheck`
Expected: exit 0.
Run: `npx vitest run --maxWorkers=2 src/main`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/handlers/githubHandlers.ts src/main/handlers/__tests__/r2ReplayHosting.test.ts scripts/profile/rollup-harness.ts
git commit -m "fix(web-upload): publish report.json and Pages replays as 4 MiB parts

GitHub answers a fake 401 Bad credentials when one blob POST takes more
than ~60s to send, which a large report.json does on slow upload links.
Also lower MAX_GITHUB_BLOB_BYTES to 35 MB (GitHub 422s at ~38-40 MB).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Blob upload retry and accurate timeout error

**Files:**
- Modify: `src/main/handlers/githubHandlers.ts` — add exported `uploadBlobWithRetry` near `createGithubBlob` (~line 279); use it in the `upload-web-report` loop (~line 2201-2204); export `formatBytes` is not needed (helper lives in the same file)
- Test: `src/main/handlers/__tests__/blobUploadRetry.test.ts`

**Interfaces:**
- Produces: `uploadBlobWithRetry<T>(attempt: () => Promise<T>, blobPath: string, bytes: number): Promise<T>`

- [ ] **Step 1: Write the failing test**

```ts
// src/main/handlers/__tests__/blobUploadRetry.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    app: { isPackaged: false, getPath: () => '/tmp', getAppPath: () => '/tmp' },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() }
}));
vi.mock('electron-log', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { uploadBlobWithRetry } from '../githubHandlers';

const httpError = (status: number) => Object.assign(new Error(`GitHub API error (${status}) creating blob: Bad credentials`), { status });

describe('uploadBlobWithRetry', () => {
    it('returns the first success without retrying', async () => {
        const attempt = vi.fn(async () => ({ sha: 'a' }));
        await expect(uploadBlobWithRetry(attempt, 'reports/x/report.json.gz.000', 10)).resolves.toEqual({ sha: 'a' });
        expect(attempt).toHaveBeenCalledTimes(1);
    });

    it.each([401, 502])('retries once after a %i', async (status) => {
        const attempt = vi.fn()
            .mockRejectedValueOnce(httpError(status))
            .mockResolvedValueOnce({ sha: 'b' });
        await expect(uploadBlobWithRetry(attempt, 'p', 10)).resolves.toEqual({ sha: 'b' });
        expect(attempt).toHaveBeenCalledTimes(2);
    });

    it('reports a timeout instead of bad credentials when the retry also fails', async () => {
        const attempt = vi.fn().mockRejectedValue(httpError(401));
        const err: any = await uploadBlobWithRetry(attempt, 'reports/x/report.json.gz.003', 4 * 1024 * 1024).catch((e) => e);
        expect(attempt).toHaveBeenCalledTimes(2);
        expect(err.message).toMatch(/^GitHub timed out receiving reports\/x\/report\.json\.gz\.003 \(4(\.0)? MB\)\. /);
        expect(err.message).toContain('try again or enable R2 hosting');
        expect(err.message).not.toContain('Bad credentials');
        expect(err.status).toBe(401);
    });

    it('does not retry other failures', async () => {
        const attempt = vi.fn().mockRejectedValue(httpError(422));
        await expect(uploadBlobWithRetry(attempt, 'p', 10)).rejects.toThrow('(422)');
        expect(attempt).toHaveBeenCalledTimes(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/main/handlers/__tests__/blobUploadRetry.test.ts`
Expected: FAIL — `uploadBlobWithRetry` is not exported.

- [ ] **Step 3: Check `formatBytes` output for 4 MiB**

Read `formatBytes` at `githubHandlers.ts:617`. If it prints something other than `4 MB`/`4.0 MB` for `4 * 1024 * 1024`, adjust the regex in the test to its real output (e.g. `4.00 MB`) — do not change `formatBytes`.

- [ ] **Step 4: Implement**

Add after `createGithubBlob`:

```ts
const isTransientBlobStatus = (status: number) => status === 401 || status >= 500;

/**
 * GitHub answers `401 Bad credentials` (sometimes a 5xx) when a blob POST body
 * takes longer than ~60 s to arrive, even though the token is fine. Retry once;
 * if it happens again, say what actually went wrong so users stop re-authorizing.
 */
export const uploadBlobWithRetry = async <T>(attempt: () => Promise<T>, blobPath: string, bytes: number): Promise<T> => {
    try {
        return await attempt();
    } catch (err: any) {
        if (!isTransientBlobStatus(Number(err?.status))) throw err;
        log.warn(`[Main] Blob upload for ${blobPath} failed with ${err.status}; retrying once.`);
    }
    try {
        return await attempt();
    } catch (err: any) {
        const status = Number(err?.status);
        if (!isTransientBlobStatus(status)) throw err;
        const timeout = new Error(
            `GitHub timed out receiving ${blobPath} (${formatBytes(bytes)}). `
            + 'This usually means the upload connection is too slow for the file; try again or enable R2 hosting.'
        );
        (timeout as any).status = status;
        (timeout as any).cause = err;
        throw timeout;
    }
};
```

`formatBytes` is declared at ~line 617, below this helper; it is a `const` used only inside the function body at call time, so ordering is fine. If `log` is not the imported name in this file, use the existing logger import name.

In the `upload-web-report` loop replace

```ts
                const blob = await createGithubBlob(owner, repo, token, entry.contentBase64, entry.path);
```

with

```ts
                const blob = await uploadBlobWithRetry(
                    () => createGithubBlob(owner, repo, token, entry.contentBase64, entry.path),
                    entry.path,
                    Math.floor(entry.contentBase64.length * 3 / 4)
                );
```

Only this loop (line ~2202) changes; leave the template/logo/delete handlers alone.

- [ ] **Step 5: Run tests**

Run: `npx vitest run --maxWorkers=2 src/main/handlers/__tests__/blobUploadRetry.test.ts src/main/handlers/__tests__/r2ReplayHosting.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/handlers/githubHandlers.ts src/main/handlers/__tests__/blobUploadRetry.test.ts
git commit -m "fix(web-upload): retry slow blob uploads and report timeouts accurately

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Node readers — history detail and Electron replay fetch

**Files:**
- Create: `src/main/partsReader.ts`
- Test: `src/main/__tests__/partsReader.test.ts`
- Modify: `src/main/handlers/githubHandlers.ts:1167-1237` (`get-github-report-detail`)
- Modify: `src/main/handlers/settingsHandlers.ts:373-397` (`fetch-r2-json`)
- Modify: `src/main/handlers/__tests__/fetchR2Json.test.ts` (add manifest case)

**Interfaces:**
- Consumes (Task 1): `readPartsManifest`, `assertSupportedManifest`, `joinParts`, `resolvePartUrl`.
- Produces:
  - `resolvePartsJson(json: any, fetchPart: (partPath: string) => Promise<Buffer>): Promise<any>` — returns `json` unchanged when it is not a manifest; otherwise fetches parts sequentially, joins, verifies sha256 (`Report parts corrupt: sha256 mismatch`), gunzips and parses.

- [ ] **Step 1: Write the failing test**

```ts
// src/main/__tests__/partsReader.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { splitIntoParts } from '../../shared/chunkedGzip';
import { resolvePartsJson } from '../partsReader';

const REPORT = { meta: { title: 'Real' }, stats: { n: Array.from({ length: 300 }, (_, i) => i) } };

const build = () => {
    const gz = gzipSync(Buffer.from(JSON.stringify(REPORT)));
    const sha = createHash('sha256').update(gz).digest('hex');
    return splitIntoParts(new Uint8Array(gz), 'report.json.gz', sha, 50);
};

describe('resolvePartsJson', () => {
    it('passes a plain report through without fetching', async () => {
        const fetchPart = vi.fn();
        await expect(resolvePartsJson(REPORT, fetchPart)).resolves.toBe(REPORT);
        expect(fetchPart).not.toHaveBeenCalled();
    });

    it('reassembles a stub report', async () => {
        const { parts, manifest } = build();
        const byPath = new Map(parts.map((p) => [p.path, Buffer.from(p.data)]));
        const fetchPart = vi.fn(async (p: string) => byPath.get(p)!);
        await expect(resolvePartsJson({ meta: {}, stats: {}, axibridgeParts: manifest }, fetchPart)).resolves.toEqual(REPORT);
        expect(fetchPart.mock.calls.map((c) => c[0])).toEqual(manifest.parts.map((p) => p.path));
    });

    it('rejects a corrupted part', async () => {
        const { parts, manifest } = build();
        const byPath = new Map(parts.map((p) => [p.path, Buffer.from(p.data)]));
        const first = byPath.get(parts[0].path)!;
        first[first.length - 1] ^= 0xff;
        await expect(resolvePartsJson(manifest, async (p) => byPath.get(p)!)).rejects.toThrow('sha256 mismatch');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/partsReader.test.ts`
Expected: FAIL — cannot resolve `../partsReader`.

- [ ] **Step 3: Implement**

```ts
// src/main/partsReader.ts
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
```

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/partsReader.test.ts`
Expected: PASS.

- [ ] **Step 4: Rewrite `get-github-report-detail` to read binary via the blob API**

Add this helper next to `getGithubBlob` in `githubHandlers.ts`:

```ts
/**
 * Read a repository file as bytes. The contents API inlines base64 only up to
 * 1 MB; larger files (report parts are up to 4 MiB) come from the blob API,
 * which has no read limit and never decodes binary as text.
 */
const readGithubFileBuffer = async (owner: string, repo: string, filePath: string, branch: string, token: string): Promise<Buffer | null> => {
    const file = await getGithubFile(owner, repo, filePath, branch, token);
    if (!file) return null;
    if (file.content && file.encoding === 'base64') {
        return Buffer.from(file.content, 'base64');
    }
    if (!file.sha) return null;
    const blob = await getGithubBlob(owner, repo, file.sha, token);
    return blob?.content ? Buffer.from(blob.content, 'base64') : null;
};
```

In the handler, replace everything from `const file = await getGithubFile(owner, repo, filePath, branch, token);` through `const report = JSON.parse(reportJson);` with:

```ts
            const reportBuffer = await readGithubFileBuffer(owner, repo, filePath, branch, token);
            if (!reportBuffer) {
                return { success: false, error: 'Report not found.' };
            }
            const reportDir = filePath.slice(0, filePath.lastIndexOf('/') + 1);
            const report = await resolvePartsJson(JSON.parse(reportBuffer.toString('utf8')), async (partPath) => {
                const part = await readGithubFileBuffer(owner, repo, `${reportDir}${partPath}`, branch, token);
                if (!part) throw new Error(`Report part ${partPath} not found.`);
                return part;
            });
```

Add `import { resolvePartsJson } from '../partsReader';`. If `https` is no longer used anywhere in `githubHandlers.ts` after this, remove its import (check with `grep -n "https\." src/main/handlers/githubHandlers.ts`).

- [ ] **Step 5: Add the manifest case to the `fetch-r2-json` test**

Read `src/main/handlers/__tests__/fetchR2Json.test.ts` to see how it mocks `https.get` and invokes the handler. Add a test in the same style that serves `https://u.github.io/r/reports/a/replay.parts.json` as a manifest JSON body and each `replay.json.gz.NNN` URL as its part bytes (build them with `gzipSync`, `createHash('sha256')` and `splitIntoParts(..., 'replay.json.gz', sha, 16)`), and asserts the handler resolves `{ success: true, json: <original payload> }`.

Run: `npx vitest run --maxWorkers=2 src/main/handlers/__tests__/fetchR2Json.test.ts`
Expected: new test FAILS (returns the manifest as `json`).

- [ ] **Step 6: Resolve manifests in `fetch-r2-json`**

Replace the handler body with:

```ts
    ipcMain.handle('fetch-r2-json', async (_event, url: string) => {
        if (!url || typeof url !== 'string') return { success: false, error: 'Invalid URL.' };
        if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Unsupported URL scheme.' };
        // Chunks are collected as Buffers, not concatenated onto a string:
        // replay objects arrive gzipped, and decoding binary bytes as UTF-8
        // mangles them past recovery.
        const getBuffer = (target: string) => new Promise<Buffer>((resolve, reject) => {
            const lib = target.startsWith('https') ? https : http;
            lib.get(target, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(Buffer.concat(chunks));
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
            }).on('error', reject);
        });
        let body: Buffer;
        try {
            body = await getBuffer(url);
        } catch (err: any) {
            return { success: false, error: err.message };
        }
        let json: any;
        try {
            json = parseMaybeGzippedJson(body);
        } catch {
            return { success: false, error: 'Response is not valid JSON.' };
        }
        try {
            // Pages-hosted replays from 3.10+ are a manifest over gzipped parts.
            return { success: true, json: await resolvePartsJson(json, (partPath) => getBuffer(resolvePartUrl(url, partPath))) };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });
```

Add imports: `import { resolvePartsJson } from '../partsReader';` and `import { resolvePartUrl } from '../../shared/chunkedGzip';`.

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run --maxWorkers=2 src/main`
Expected: PASS (existing fetchR2Json tests still pass — the error strings are unchanged).
Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/main/partsReader.ts src/main/__tests__/partsReader.test.ts src/main/handlers/githubHandlers.ts src/main/handlers/settingsHandlers.ts src/main/handlers/__tests__/fetchR2Json.test.ts
git commit -m "feat(web-upload): read chunked reports in the history view and replay proxy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Web viewer wiring + e2e

**Files:**
- Modify: `src/web/reportApp.tsx:972-979` (`loadReport`) and `:1044-1058` (`fetchReportPayloads`)
- Create: `tests/e2e/web/chunked-report.spec.ts`

**Interfaces:**
- Consumes (Task 2): `fetchReportPayload(url)`.

- [ ] **Step 1: Write the failing e2e spec**

```ts
// tests/e2e/web/chunked-report.spec.ts
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { splitIntoParts } from '../../../src/shared/chunkedGzip';

const fixture = fs.readFileSync(path.resolve(process.cwd(), 'tests/fixtures/report.json'));

test('CHUNK-001: a stub + parts report renders the real dashboard', async ({ page }) => {
    const payload = JSON.parse(fixture.toString('utf8'));
    const gz = gzipSync(fixture, { level: 9 });
    const sha = createHash('sha256').update(gz).digest('hex');
    // Small parts so the fixture (~2 MB → a few hundred KB gzipped) spans several files.
    const { parts, manifest } = splitIntoParts(new Uint8Array(gz), 'report.json.gz', sha, 64 * 1024);
    expect(parts.length).toBeGreaterThan(1);

    const stub = {
        meta: { ...payload.meta, title: `${payload.meta?.title ?? 'Report'} — open with AxiBridge 3.10 or newer to view` },
        stats: {},
        axibridgeParts: { ...manifest, originalTitle: payload.meta?.title }
    };
    await page.route('**/reports/chunked-report/report.json', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stub) }));
    for (const part of parts) {
        await page.route(`**/reports/chunked-report/${part.path}`, (route) =>
            route.fulfill({ status: 200, contentType: 'application/gzip', body: Buffer.from(part.data) }));
    }

    await page.goto('/web/index.html?report=chunked-report');
    await expect(page.getByRole('heading', { name: /Statistics Dashboard/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/open with AxiBridge 3\.10 or newer/)).toHaveCount(0);
});
```

Run: `npx playwright test --config playwright.web.config.ts tests/e2e/web/chunked-report.spec.ts`
Expected: FAIL (the viewer renders the stub, so the dashboard heading never shows or the stub title is visible).

- [ ] **Step 2: Wire `fetchReportPayload` into the viewer**

Add `import { fetchReportPayload } from '../renderer/stats/utils/fetchParts';` to `src/web/reportApp.tsx` (check the relative path matches existing imports of `../renderer/...` in that file).

Replace `loadReport`:

```ts
        const loadReport = () => fetchReportPayload(reportPath)
            .then((data) => {
                if (!isMounted) return;
                const normalized = expandIconIndex(normalizeTopDownContribution(normalizeCommanderDistance(data)));
                setReport(normalized);
                applyPaletteFromReport(normalized);
            })
            .catch((err) => {
                console.warn('[Report] Failed to load report:', err);
                throw err;
            });
```

In `fetchReportPayloads` replace the three lines

```ts
                    const response = await fetch(`${basePath}reports/${entry.id}/report.json`, { cache: 'no-store' });
                    if (!response.ok) return;
                    const payload = await response.json();
```

with

```ts
                    const payload = await fetchReportPayload(`${basePath}reports/${entry.id}/report.json`);
```

The existing `.catch` after `loadReport()` already maps any failure to `Report not found yet. It may still be deploying.` — keep it.

- [ ] **Step 3: Run the e2e specs**

Run: `npx playwright test --config playwright.web.config.ts tests/e2e/web/chunked-report.spec.ts tests/e2e/web/report.spec.ts tests/e2e/web/index.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/web/reportApp.tsx tests/e2e/web/chunked-report.spec.ts
git commit -m "feat(web): load chunked report.json in the web viewer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Old-viewer check and stub stats pin

Verifies the stub renders in the released v3.9.0 viewer without crashing, and pins whatever minimal `stats` it needs.

**Files:**
- Possibly modify: `src/main/webReportParts.ts` (`buildReportStub` stats), `src/main/__tests__/webReportParts.test.ts`
- Temporary, not committed: `/tmp/axibridge-v390` worktree

**Interfaces:**
- Consumes (Task 3): `buildReportStub`.

- [ ] **Step 1: Build the v3.9.0 viewer in a separate worktree**

```bash
git worktree add /tmp/axibridge-v390 v3.9.0
ln -s "$PWD/node_modules" /tmp/axibridge-v390/node_modules
cd /tmp/axibridge-v390 && npx vite build --config vite.web.config.ts && cd -
```

Expected: `/tmp/axibridge-v390/dist-web/index.html` exists. If `build:web`'s `sync:metrics-spec` step is needed, run `npm run build:web` inside the worktree instead.

- [ ] **Step 2: Generate a stub from the current code and place it in that build**

```bash
npx tsx -e "
import fs from 'node:fs';
import { buildReportStub } from './src/main/webReportParts';
import { splitIntoParts } from './src/shared/chunkedGzip';
const payload = JSON.parse(fs.readFileSync('tests/fixtures/report.json', 'utf8'));
const { manifest } = splitIntoParts(new Uint8Array(10), 'report.json.gz', 'x');
const stub = buildReportStub(payload, manifest);
fs.mkdirSync('/tmp/axibridge-v390/dist-web/reports/stub-check', { recursive: true });
fs.writeFileSync('/tmp/axibridge-v390/dist-web/reports/stub-check/report.json', JSON.stringify(stub));
console.log(JSON.stringify(stub.stats), stub.meta.title);
"
```

Expected: prints the stub stats and the suffixed title.

- [ ] **Step 3: Load it in the old viewer**

```bash
npx vite preview --config /tmp/axibridge-v390/vite.web.config.ts --outDir /tmp/axibridge-v390/dist-web --port 4190 --host 127.0.0.1
```

(run in the background), then with Playwright (MCP browser tools or a one-off script) open `http://127.0.0.1:4190/?report=stub-check`, wait 5 s, and collect: page errors / console errors, and whether the text `open with AxiBridge 3.10 or newer` is visible.

Expected: the title text is visible and there are no uncaught page errors.

- [ ] **Step 4: If the old viewer throws, find the minimal stats**

Read the first uncaught error's stack to find the field the v3.9.0 viewer dereferences (e.g. `stats.fightCount`, `stats.overview`). Add the smallest safe default for each such field to `buildReportStub`'s returned `stats` (as an explicit `STUB_STATS_DEFAULTS` object merged under the theme keys), re-run Steps 2–3, and repeat until the page renders without errors. Record each added field and the error it fixes in a comment on `STUB_STATS_DEFAULTS`.

- [ ] **Step 5: Pin the stub shape**

Add to `src/main/__tests__/webReportParts.test.ts` (ensure `buildReportStub` and `splitIntoParts` are in the top-of-file imports):

```ts
describe('buildReportStub', () => {
    it('matches the shape verified against the v3.9.0 viewer', () => {
        const { manifest } = splitIntoParts(new Uint8Array(3), 'report.json.gz', 'x');
        const stub = buildReportStub({ meta: { id: 'a', title: 'T' }, stats: { colorPalette: 'arcane', huge: [1] } }, manifest);
        expect(Object.keys(stub.stats).sort()).toMatchSnapshot();
        expect(stub.meta).toEqual({ id: 'a', title: 'T — open with AxiBridge 3.10 or newer to view' });
    });
});
```

Run: `npx vitest run --maxWorkers=2 src/main/__tests__/webReportParts.test.ts`
Expected: PASS, snapshot written. Inspect the `.snap` file and confirm it lists exactly the theme keys plus any Step 4 defaults.

- [ ] **Step 6: Clean up and commit**

```bash
git worktree remove --force /tmp/axibridge-v390
git add src/main/webReportParts.ts src/main/__tests__/webReportParts.test.ts src/main/__tests__/__snapshots__
git commit -m "test(web-upload): pin the report stub shape verified in the v3.9.0 viewer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Stop the background `vite preview` process. Note the Step 3 result (visible title, error count) for the final report.

---

### Task 9: Full verification

- [ ] **Step 1: Validate**

Run: `npm run validate`
Expected: exit 0 (typecheck + lint with zero warnings).

- [ ] **Step 2: Unit tests**

Run: `npx vitest run --maxWorkers=2`
Expected: PASS. If `src/renderer/__tests__/StatsView.integration.test.tsx` or other suites that were already failing on `main` fail, confirm with `git stash`-free comparison: run the same file on a clean `git worktree add /tmp/axibridge-main main` checkout before attributing it to this change.

- [ ] **Step 3: Web e2e**

Run: `npm run test:e2e:web`
Expected: PASS.

- [ ] **Step 4: Blob size check against real output**

Build a staging dir from a large fixture and confirm every file that would be uploaded is ≤ `PART_BYTES` except `index.html`:

```bash
npx tsx -e "
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { writeReportParts } from './src/main/webReportParts';
const buf = fs.readFileSync('tests/fixtures/report.json');
const big = Buffer.concat(Array.from({ length: 20 }, () => buf)); // ~40 MB of JSON-ish text
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chk-'));
const payload = JSON.parse(buf.toString('utf8'));
const m = writeReportParts(dir, big, payload);
const sizes = fs.readdirSync(dir).map((f) => [f, fs.statSync(path.join(dir, f)).size]);
console.log(sizes, m.parts.length);
if (sizes.some(([, s]) => (s as number) > 4 * 1024 * 1024)) process.exit(1);
"
```

Expected: exit 0; prints part sizes all ≤ 4194304.
