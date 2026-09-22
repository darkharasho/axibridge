import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { selectReportsToCompact } from '../handlers/githubHandlers';
import { buildReportPartFiles, REPORT_JSON_FILENAME, STUB_TITLE_SUFFIX } from '../webReportParts';
import { readPartsManifest, joinParts } from '../../shared/chunkedGzip';

const blob = (path: string, size: number) => ({ path, type: 'blob', size });

describe('selectReportsToCompact', () => {
    const budget = 100;

    it('picks legacy reports largest-first', () => {
        const entries = [
            blob('reports/a/report.json', 10),
            blob('reports/b/report.json', 30),
            blob('reports/c/report.json', 20)
        ];
        expect(selectReportsToCompact(entries, '', budget).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    });

    it('skips reports that already have parts', () => {
        // The whole migration has to be idempotent: a converted report must be
        // invisible to every later publish, or each one re-uploads it forever.
        const entries = [
            blob('reports/done/report.json', 50),
            blob('reports/done/report.json.gz.000', 8),
            blob('reports/todo/report.json', 10)
        ];
        expect(selectReportsToCompact(entries, '', budget).map((r) => r.id)).toEqual(['todo']);
    });

    it('accumulates up to the byte budget, then stops', () => {
        // Stops at the first report that does not fit rather than skipping down
        // to a smaller one, so the selection stays a prefix of largest-first.
        const entries = [
            blob('reports/a/report.json', 40),
            blob('reports/b/report.json', 30),
            blob('reports/c/report.json', 50)
        ];
        expect(selectReportsToCompact(entries, '', 100).map((r) => r.id)).toEqual(['c', 'a']);
    });

    it('still takes one report larger than the whole budget', () => {
        // Otherwise a site whose every report exceeds the budget never drains.
        const entries = [blob('reports/huge/report.json', 999)];
        expect(selectReportsToCompact(entries, '', 100).map((r) => r.id)).toEqual(['huge']);
    });

    it('excludes the report this publish is already writing', () => {
        const entries = [blob('reports/current/report.json', 50), blob('reports/other/report.json', 10)];
        const picked = selectReportsToCompact(entries, '', budget, new Set(['current']));
        expect(picked.map((r) => r.id)).toEqual(['other']);
    });

    it('ignores index.json, rollup.json and anything that is not a report payload', () => {
        const entries = [
            blob('reports/index.json', 40),
            blob('reports/rollup.json', 40),
            blob('reports/attendance.json', 40),
            blob('index.html', 40),
            blob('reports/a/replay.json.gz.000', 40),
            blob('reports/a/report.json', 10)
        ];
        expect(selectReportsToCompact(entries, '', budget).map((r) => r.id)).toEqual(['a']);
    });

    it('scopes to the configured pages subdirectory', () => {
        const entries = [blob('docs/reports/a/report.json', 10), blob('reports/b/report.json', 90)];
        const picked = selectReportsToCompact(entries, 'docs', budget);
        expect(picked).toEqual([{ id: 'a', path: 'docs/reports/a/report.json', size: 10 }]);
    });

    it('ignores tree entries that are not blobs', () => {
        const entries = [{ path: 'reports/a', type: 'tree' }, blob('reports/a/report.json', 10)];
        expect(selectReportsToCompact(entries, '', budget).map((r) => r.id)).toEqual(['a']);
    });
});

describe('buildReportPartFiles', () => {
    const payload = {
        meta: { id: '20260921-abc', title: 'Mesmer Kamoidra' },
        stats: { colorPalette: ['#fff'], players: [{ name: 'x'.repeat(200) }] }
    };

    it('round-trips through the parts the viewer reads', () => {
        const json = Buffer.from(JSON.stringify(payload));
        const { files, manifest } = buildReportPartFiles(json, payload);

        const stub = JSON.parse(files.find((f) => f.name === REPORT_JSON_FILENAME)!.data.toString('utf8'));
        // A superset: the stub's copy also carries originalTitle.
        expect(readPartsManifest(stub)).toMatchObject(manifest);

        const chunks = manifest.parts.map((part) => new Uint8Array(files.find((f) => f.name === part.path)!.data));
        expect(Buffer.from(gunzipSync(joinParts(chunks, manifest))).toString('utf8')).toEqual(json.toString('utf8'));
    });

    it('leaves a title an older viewer can read', () => {
        const { files } = buildReportPartFiles(Buffer.from(JSON.stringify(payload)), payload);
        const stub = JSON.parse(files.find((f) => f.name === REPORT_JSON_FILENAME)!.data.toString('utf8'));
        expect(stub.meta.title).toBe(`Mesmer Kamoidra${STUB_TITLE_SUFFIX}`);
        expect(stub.axibridgeParts.originalTitle).toBe('Mesmer Kamoidra');
    });
});
