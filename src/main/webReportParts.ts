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
