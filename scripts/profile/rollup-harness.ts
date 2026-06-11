/**
 * Profiling harness: runs buildRollupData over the real published reports in
 * web-report-staging, replicating what the browser does on every "All Reports"
 * view (fetch all report.json files, parse, aggregate).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { buildRollupData } from '../../src/web/rollup';

const stagingDir = process.argv[2] || `${process.env.HOME}/.config/axibridge/web-report-staging`;

const dirs = fs.readdirSync(stagingDir).filter((d) => {
    try {
        return fs.statSync(path.join(stagingDir, d, 'report.json')).isFile();
    } catch {
        return false;
    }
});
console.log(`Found ${dirs.length} reports with report.json`);

let totalBytes = 0;
let totalGzip = 0;
const parseStart = performance.now();
const reports: any[] = [];
const sizes: Array<{ id: string; mb: number; gzMb: number }> = [];
for (const d of dirs) {
    const raw = fs.readFileSync(path.join(stagingDir, d, 'report.json'));
    totalBytes += raw.length;
    const gz = zlib.gzipSync(raw, { level: 6 }).length;
    totalGzip += gz;
    sizes.push({ id: d, mb: raw.length / 1e6, gzMb: gz / 1e6 });
    reports.push(JSON.parse(raw.toString('utf8')));
}
const parseMs = performance.now() - parseStart;
console.log(`Read+parse all reports: ${Math.round(parseMs)}ms (${Math.round(totalBytes / 1e6)}MB raw, ${Math.round(totalGzip / 1e6)}MB gzipped → ${Math.round((1 - totalGzip / totalBytes) * 100)}% smaller)`);
sizes.sort((a, b) => b.mb - a.mb);
console.log('Largest reports:', sizes.slice(0, 5).map((s) => `${s.id}=${s.mb.toFixed(1)}MB(gz ${s.gzMb.toFixed(1)})`).join(', '));

for (let run = 0; run < 3; run++) {
    const t = performance.now();
    const rollup = buildRollupData(reports);
    const ms = performance.now() - t;
    const out = JSON.stringify(rollup);
    console.log(`buildRollupData run ${run + 1}: ${Math.round(ms)}ms → output ${(out.length / 1e6).toFixed(2)}MB, commanders=${(rollup as any).commanders?.length}, players=${(rollup as any).players?.length}`);
}
console.log(`heap now: ${Math.round(process.memoryUsage().heapUsed / 1e6)}MB`);
