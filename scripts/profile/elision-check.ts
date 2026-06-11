import fs from 'node:fs';
import path from 'node:path';
import { IncrementalAggregator } from '../../src/renderer/stats/incrementalAggregation';
import { buildReplayKey, createReplayElisionState, elideUnchangedReplayFights, reinjectElidedReplayFights } from '../../src/renderer/workers/replayTransfer';

const cacheDir = '/tmp/axibridge-dps-report-cache';
const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith('.json'));
const base = files.map((f) => JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8')));
const ids: string[] = [];
const buildAgg = () => {
    const agg = new IncrementalAggregator({ disruptionMethod: 'count' });
    for (let i = 0; i < 60; i++) {
        const id = `/fake/${i}.zevtc`;
        if (ids.length < 60) ids.push(id);
        agg.ingestLog({ id: `log-${i}`, filePath: id, details: base[i % base.length] });
    }
    return agg;
};

const state = createReplayElisionState();
const key = buildReplayKey(ids, false);

const r1: any = buildAgg().finalize();
elideUnchangedReplayFights(r1, key, state);
console.log('flush 1 payload:', Math.round(JSON.stringify(r1).length / 1e6) + 'MB');

// Same logs again (settings change / view switch restart)
const r2: any = buildAgg().finalize();
const elided = elideUnchangedReplayFights(r2, key, state);
console.log('flush 2 payload:', Math.round(JSON.stringify(r2).length / 1e6) + 'MB', '(elided:', elided + ')');

// Receiving side reconstructs
let kept = reinjectElidedReplayFights(r1, null);
kept = reinjectElidedReplayFights(r2, kept);
console.log('reinjected fights on flush 2:', Array.isArray(r2.stats.replayFights), 'count:', r2.stats.replayFights?.length);
