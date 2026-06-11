import fs from 'node:fs';
import path from 'node:path';
import { IncrementalAggregator } from '../../src/renderer/stats/incrementalAggregation';

const cacheDir = '/tmp/axibridge-dps-report-cache';
const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'));
const base = files.map((f) => JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8')));
const agg = new IncrementalAggregator({ disruptionMethod: 'count' });
for (let i = 0; i < 60; i++) agg.ingestLog({ id: `log-${i}`, filePath: `/fake/${i}.zevtc`, details: base[i % base.length] });
const result: any = agg.finalize();
// replicate worker strip
const strip = (dataset: any) => {
    (Array.isArray(dataset?.fights) ? dataset.fights : []).forEach((fight: any) => {
        Object.values(fight?.values || {}).forEach((entry: any) => { if (entry && typeof entry === 'object') delete (entry as any).skillRows; });
    });
};
strip(result.stats?.spikeDamage);
strip(result.stats?.incomingStrikeDamage);
(result.stats?.playerSkillBreakdowns || []).forEach((e: any) => { if (e?.skillMap) delete e.skillMap; });
const sizes = Object.entries(result.stats || {}).map(([k, v]) => [k, JSON.stringify(v)?.length || 0] as const).sort((a, b) => b[1] - a[1]);
console.log('total post-strip:', Math.round(JSON.stringify(result).length / 1e6) + 'MB');
for (const [k, s] of sizes.slice(0, 15)) console.log((s / 1e6).toFixed(2).padStart(7) + 'MB  stats.' + k);
const topLevel = Object.entries(result).filter(([k]) => k !== 'stats').map(([k, v]) => [k, JSON.stringify(v)?.length || 0] as const).sort((a, b) => b[1] - a[1]);
for (const [k, s] of topLevel.slice(0, 5)) console.log((s / 1e6).toFixed(2).padStart(7) + 'MB  ' + k);
