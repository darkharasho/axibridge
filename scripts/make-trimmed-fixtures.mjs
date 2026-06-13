// Generates small EI-log fixtures for fast aggregation tests.
// Usage: node scripts/make-trimmed-fixtures.mjs
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'test-fixtures/boon';
const DEST = 'test-fixtures/boon-trimmed';
const KEEP = ['20260117-175120.json', '20260125-202439.json']; // the two smallest runs
const MAX_PLAYERS = 10;
const MAX_TARGETS = 5;

// Per-player tables that no aggregation code path reads (verified against
// computePlayerAggregation.ts + the shared metric extractors).
const DROP_PLAYER_KEYS = [
    'buffUptimesActive',
    'buffVolumes', 'buffVolumesActive',
    'squadBuffVolumes', 'squadBuffVolumesActive',
    'groupBuffVolumes', 'groupBuffVolumesActive',
    'offGroupBuffVolumes', 'offGroupBuffVolumesActive',
    'selfBuffsActive', 'squadBuffsActive', 'groupBuffsActive', 'offGroupBuffsActive'
];
// Aggregation reads only outgoingHealingAllies/totalHealingDist (+ barrier twins).
const KEEP_HEALING_KEYS = ['outgoingHealingAllies', 'totalHealingDist', 'outgoingHealing'];
const KEEP_BARRIER_KEYS = ['outgoingBarrierAllies', 'totalBarrierDist', 'outgoingBarrier'];

const pick = (obj, keys) => {
    if (!obj || typeof obj !== 'object') return obj;
    const out = {};
    for (const key of keys) {
        if (key in obj) out[key] = obj[key];
    }
    return out;
};

fs.mkdirSync(DEST, { recursive: true });
for (const name of KEEP) {
    const details = JSON.parse(fs.readFileSync(path.join(SRC, name), 'utf8'));
    details.players = (details.players || []).slice(0, MAX_PLAYERS).map((p) => {
        const { combatReplayData, ...rest } = p;
        for (const key of DROP_PLAYER_KEYS) delete rest[key];
        if (rest.extHealingStats) rest.extHealingStats = pick(rest.extHealingStats, KEEP_HEALING_KEYS);
        if (rest.extBarrierStats) rest.extBarrierStats = pick(rest.extBarrierStats, KEEP_BARRIER_KEYS);
        return rest;
    });
    details.targets = (details.targets || []).slice(0, MAX_TARGETS).map((t) => {
        const { combatReplayData, ...rest } = t;
        return rest;
    });
    delete details.combatReplayMetaData;
    delete details.mechanics;
    fs.writeFileSync(path.join(DEST, name), JSON.stringify(details));
    const mb = fs.statSync(path.join(DEST, name)).size / 1024 / 1024;
    console.log(`${name}: ${mb.toFixed(2)} MB`);
}
