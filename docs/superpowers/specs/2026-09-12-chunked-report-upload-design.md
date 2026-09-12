# Chunked, gzipped web report upload — design

Date: 2026-09-12
Status: approved design, pending spec review

## Problem

Web report publishing fails for users on slower upload links with
`GitHub API error (401) creating blob for reports/<id>/report.json: Bad credentials`
(Discord support thread 1494033198458343626). Reconnecting OAuth or switching
GitHub accounts does not help.

A size probe against a throwaway repo on 2026-09-12 established:

| Raw content | Upload rate | Duration | Result |
|---|---|---|---|
| 1–38 MB | unthrottled | 1–3 s | 201 |
| 40–75 MB | unthrottled | 2–13 s | 422 "input too large" |
| 10 MB | 256 KB/s | 55 s | 201 |
| 30 MB | 1 MB/s | 43 s | 201 |
| 45 MB | 1 MB/s | 60 s | **401 Bad credentials** |
| 36 MB | 512 KB/s | 96 s | **401 Bad credentials** |
| 20 MB | 256 KB/s | 107 s | **401 Bad credentials** |
| 30 MB | 256 KB/s | 160 s | 502 |

Conclusions:

1. `POST /git/blobs` answers a fake `401 Bad credentials` (sometimes `502`) once a
   single request body takes longer than roughly 60 s to transmit. The token is
   valid — the ref/commit/tree reads that precede the blob upload succeed.
2. The real per-blob ceiling is between 38 MB raw (50.7 MB request body) and
   40 MB raw (53.3 MB body). `MAX_GITHUB_BLOB_BYTES = 50 MB` is stale.

Today `report.json` is uploaded as one uncompressed blob, and a Pages-hosted replay
sidecar (`replay.json.gz`, used when R2 is not configured) as one blob up to 50 MB.
Both are exposed to the duration limit.

## Goals

- Every blob POST during a publish carries at most ~5.3 MB of request body, so a
  publish succeeds on upload links down to ~90 KB/s.
- Previously published (plain `report.json`) reports keep loading in the new viewer.
- An old viewer that meets a new report shows an explicit "open with a newer
  AxiBridge" message instead of crashing or showing nothing.
- A genuine failure reports an accurate cause, not "Bad credentials".

## Non-goals

- Changing R2 uploads (replay/slice sidecars on R2). R2 has no such limit.
- Changing `index.json`, `rollup.json` or `attendance.json` formats. They are small.
  (If `rollup.json` ever approaches the limit it can adopt the same codec later.)
- Parallel blob uploads.

## Published format

Per report under `reports/<id>/`:

### `report.json` — stub-manifest

```jsonc
{
  "meta": { /* real report meta */, "title": "<title> — open with AxiBridge 3.10 or newer to view" },
  "stats": { /* minimal stats the pre-3.10 viewer renders without throwing */ },
  "axibridgeParts": {
    "version": 1,
    "encoding": "gzip",
    "originalTitle": "<title>",
    "totalBytes": 12345678,          // gzipped size, sum of part bytes
    "sha256": "<hex of full gzip>",
    "parts": [
      { "path": "report.json.gz.000", "bytes": 4194304 },
      { "path": "report.json.gz.001", "bytes": 3151374 }
    ]
  }
}
```

- Part paths are relative to the manifest's own URL.
- `meta.title` is overwritten only in the stub; the new viewer uses the title from
  the inflated payload (`originalTitle` is kept for list views that only read the stub).
- The minimal `stats` shape is whatever the currently released viewer (v3.9.0)
  needs to render the header without an exception; it is determined empirically
  (see Testing — old-viewer check) and pinned by a unit test.

### `report.json.gz.NNN` — parts

The level-9 gzip of the full report JSON (the exact buffer that would have been
`report.json`), split into consecutive slices of at most `PART_BYTES = 4 MiB`.
Three-digit zero-padded suffix. A small report still produces a stub plus one part,
so there is a single code path.

### Pages-hosted replay

When `planSidecarHosting` chooses `pages`, instead of `replay.json.gz` the writer emits
`replay.parts.json` (a bare `axibridgeParts` object, no stub — no old viewer is
affected because an old viewer would be loading the old stub report and never
reaches the replay) plus `replay.json.gz.NNN`. `stats.replayDataUrl` points to
`replay.parts.json`. The `pages` size gate now compares the gzipped size against the
new `MAX_GITHUB_BLOB_BYTES` total ceiling (it is no longer a single-blob limit, but
it still bounds Pages storage). R2 hosting is unchanged.

## Components

### 1. `src/shared/chunkedGzip.ts` (pure, no Node/DOM specifics)

- `PARTS_FORMAT_VERSION = 1`, `PART_BYTES = 4 * 1024 * 1024`.
- `splitIntoParts(gzip: Uint8Array, baseName: string, partBytes = PART_BYTES): { parts: Array<{ path; data: Uint8Array }>; manifest: PartsManifest }`
- `isPartsManifest(value: unknown): value is PartsManifest` — version and shape check.
- `readPartsManifest(json: unknown): PartsManifest | null` — accepts either a stub
  report (`json.axibridgeParts`) or a bare manifest.
- `joinParts(chunks: Uint8Array[], manifest): Uint8Array` — checks part count, each
  part length and total length; throws a descriptive error on mismatch.
- SHA-256 verification is done by callers with their environment's crypto
  (`crypto.subtle` in browser, `node:crypto` in main) via a small injected
  `sha256Hex` function, keeping this module pure.

### 2. `src/shared/inflate.ts` / fetch helpers (renderer + web)

- One `inflateGzip(bytes): Promise<Uint8Array>` using `DecompressionStream('gzip')`,
  replacing the duplicate private `inflate` helpers in
  `src/renderer/stats/replay/fetchReplayJson.ts` and
  `src/renderer/stats/slice/fetchSliceSidecar.ts`.
- `fetchPartsPayload(manifestUrl, manifest)`: fetches parts in parallel
  (`cache: 'no-store'`), joins, verifies SHA-256, inflates, `JSON.parse`s.
- `fetchReportPayload(url)`: fetches `report.json`; if `readPartsManifest` finds a
  manifest, returns `fetchPartsPayload(...)`; otherwise returns the plain JSON.
  Normalization (`normalizeReportPayload`) stays with the callers.
- `fetchReplayJson` additionally accepts a parts manifest URL/response.
- Electron's `fetch-r2-json` IPC path is untouched (R2 only).

### 3. Writer — `src/main/handlers/githubHandlers.ts`

- `MAX_GITHUB_BLOB_BYTES` → `35 * 1024 * 1024`. It continues to gate the uncompressed
  trim loop in `buildWebReportPayload` (bounds viewer memory) and the template/logo
  per-file checks.
- After the report JSON buffer is final: gzip (level 9), `splitIntoParts`, write the
  stub-manifest as `report.json` and parts into `web-report-staging/<id>/`.
- The plain JSON is written to `web-report-local/<id>/report.json` (outside the
  uploaded staging dir). `loadLocalReport` / `loadLocalAttendanceReport` and
  `scripts/profile/rollup-harness.ts` read from `web-report-local` first, falling back
  to `web-report-staging/<id>/report.json` only when that file is not a stub (older
  local copies).
- Pages replay: same splitting into staging, as described above.
- `createGithubBlob` failure handling in the publish loop: on `401` or `5xx`, retry that
  blob once. If it fails again, throw
  `GitHub timed out receiving <path> (<size>). This usually means the upload connection is too slow for the file; try again or enable R2 hosting.`
  with the original status attached. (With 4 MiB parts this should be rare; the
  message matters for the next unknown failure mode.) Other statuses keep the
  existing message.
- `delete-github-reports` already removes every blob under `reports/<id>/` — no change.
- `mock-web-report` (dev) keeps writing plain JSON; the viewer handles both.

### 4. Readers

- `src/web/reportApp.tsx`: `loadReport` and `fetchReportPayloads` use `fetchReportPayload`.
- `get-github-report-detail` (Electron history): read the `download_url` body as a
  `Buffer` (not a utf8 string). If the JSON is a stub, fetch each part via the
  Contents API `download_url` (binary), join, verify, `zlib.gunzipSync`, parse.
  `FightReportHistoryView` is unchanged.
- Rollup and attendance builders — see Writer.

## Error handling

- Missing part / length mismatch / hash mismatch in the viewer → same UI path as a
  failed report load today (`Report not found yet. It may still be deploying.`), with
  the specific cause logged to the console. Pages deploy lag commonly produces a
  missing part for a minute after publish, so that existing message is accurate.
- Unknown `axibridgeParts.version` → error "This report was published by a newer
  AxiBridge; reload the page." (covers stale tabs after a future format bump).

## Compatibility matrix

| Viewer | Report | Result |
|---|---|---|
| new | old plain `report.json` | loads (no manifest → plain path) |
| new | new stub + parts | loads |
| old (≤3.9.0) | old plain | loads (unchanged) |
| old (≤3.9.0) | new stub | renders header "<title> — open with AxiBridge 3.10 or newer to view", no crash |
| old desktop history view | new stub | shows stub (title carries the message) |

## Testing

- **Unit (`chunkedGzip`)**: round trip across sizes 0, 1, `PART_BYTES-1`, `PART_BYTES`,
  `PART_BYTES+1`, `3*PART_BYTES+17`; part count/path naming; `joinParts` rejects wrong
  count/length; `isPartsManifest` rejects wrong version / malformed input.
- **Unit (fetch helpers)**: mocked `fetch` for plain report, stub+parts, missing part,
  hash mismatch; replay manifest path.
- **Unit (writer)**: staging contains stub `report.json` + parts and no plain JSON;
  `web-report-local` has the plain JSON; stub `meta.title` rewritten; Pages replay
  emits `replay.parts.json`; rollup loader reads the local copy and ignores stubs.
- **Unit (retry/error)**: blob POST 401 then 201 succeeds; 401 twice throws the
  timeout message.
- **Unit (stub shape)**: stub `stats` pinned to the empirically determined minimal shape.
- **E2E web**: existing specs keep mocking plain `report.json` (old-report path); add a
  spec that serves a stub + parts fixture and asserts the real report renders.
- **Old-viewer check (manual, recorded in the PR)**: build the v3.9.0 web viewer
  (`git worktree` at `v3.9.0`, `npm run build:web`), serve a generated stub, and confirm
  via Playwright that the page shows the stub title and throws no uncaught error.
  This check also determines the minimal stub `stats`.
- **Probe (manual)**: publish a large real report through a throttled link (or reuse
  the probe script against the throwaway repo) and confirm every blob request stays
  under ~5.3 MB and succeeds.
- `npm run validate`; `npx vitest run --maxWorkers=2`.
