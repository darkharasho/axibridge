/**
 * Profiling harness: feeds real cached pruned-details JSON into
 * IncrementalAggregator to measure ingest vs finalize cost at varying log counts.
 *
 * Bundle with esbuild and run under `node --cpu-prof`:
 *   npx esbuild scripts/profile/aggregation-harness.ts --bundle --platform=node \
 *     --format=cjs --outfile=/tmp/axiprof/harness.cjs
 *   node --cpu-prof --cpu-prof-dir=/tmp/axiprof /tmp/axiprof/harness.cjs <cacheDir> <targetLogCount>
 */
import fs from 'node:fs';
import path from 'node:path';
import { IncrementalAggregator } from '../../src/renderer/stats/incrementalAggregation';

const cacheDir = process.argv[2] || '/tmp/axibridge-dps-report-cache';
const targetCount = Number(process.argv[3] || 30);

const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
    console.error('No cached details found in', cacheDir);
    process.exit(1);
}

console.log(`Loading ${files.length} cached details files...`);
const loadStart = performance.now();
const baseDetails = files.map((f) => {
    const raw = fs.readFileSync(path.join(cacheDir, f), 'utf8');
    return { name: f, details: JSON.parse(raw), bytes: raw.length };
});
console.log(`Parsed ${baseDetails.length} files (${Math.round(baseDetails.reduce((a, b) => a + b.bytes, 0) / 1e6)}MB JSON) in ${Math.round(performance.now() - loadStart)}ms`);

// Build N logs by cycling through the real details. Each duplicate gets a
// distinct id/timestamp offset so the aggregator treats them as separate fights.
const logs: any[] = [];
for (let i = 0; i < targetCount; i++) {
    const base = baseDetails[i % baseDetails.length];
    logs.push({
        id: `log-${i}`,
        filePath: `/fake/${i}-${base.name}.zevtc`,
        status: 'completed',
        details: base.details,
    });
}

const playerCounts = baseDetails.map((b) => (Array.isArray(b.details.players) ? b.details.players.length : 0));
console.log(`Player counts per source log: ${playerCounts.join(', ')}`);
console.log(`\n=== Aggregating ${logs.length} logs ===`);

global.gc?.();
const memBefore = process.memoryUsage().heapUsed;

const agg = new IncrementalAggregator({ disruptionMethod: 'count' });

const ingestTimes: number[] = [];
const totalStart = performance.now();
for (const log of logs) {
    const t = performance.now();
    agg.ingestLog(log);
    ingestTimes.push(performance.now() - t);
}
const ingestTotal = performance.now() - totalStart;

const finStart = performance.now();
const result = agg.finalize();
const finTotal = performance.now() - finStart;

const memAfter = process.memoryUsage().heapUsed;

ingestTimes.sort((a, b) => a - b);
const pct = (p: number) => ingestTimes[Math.min(ingestTimes.length - 1, Math.floor(ingestTimes.length * p))].toFixed(1);

console.log(`ingest total: ${Math.round(ingestTotal)}ms  (avg ${(ingestTotal / logs.length).toFixed(1)}ms/log, p50 ${pct(0.5)}ms, p95 ${pct(0.95)}ms, max ${ingestTimes[ingestTimes.length - 1].toFixed(1)}ms)`);
console.log(`finalize:     ${Math.round(finTotal)}ms`);
console.log(`total:        ${Math.round(ingestTotal + finTotal)}ms`);
console.log(`heap delta:   ${Math.round((memAfter - memBefore) / 1e6)}MB (now ${Math.round(memAfter / 1e6)}MB)`);

// Result payload size approximates the worker postMessage structured-clone cost.
const serStart = performance.now();
const serialized = JSON.stringify(result);
console.log(`result JSON:  ${Math.round(serialized.length / 1e6)}MB, stringify took ${Math.round(performance.now() - serStart)}ms`);

// Simulate the streaming recompute pattern: finalize is also called on flushes
// mid-stream (worker flushes partial results). Measure a second finalize.
const fin2 = performance.now();
agg.finalize();
console.log(`finalize #2:  ${Math.round(performance.now() - fin2)}ms (repeat cost — paid on every mid-stream flush)`);
