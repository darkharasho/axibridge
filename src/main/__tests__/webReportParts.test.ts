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

describe('buildReportStub', () => {
    it('matches the shape verified against the v3.9.0 viewer', () => {
        const { manifest } = splitIntoParts(new Uint8Array(3), 'report.json.gz', 'x');
        const stub = buildReportStub({ meta: { id: 'a', title: 'T' }, stats: { colorPalette: 'arcane', huge: [1] } }, manifest);
        expect(Object.keys(stub.stats).sort()).toMatchSnapshot();
        expect(stub.meta).toEqual({ id: 'a', title: 'T — open with AxiBridge 3.10 or newer to view' });
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
