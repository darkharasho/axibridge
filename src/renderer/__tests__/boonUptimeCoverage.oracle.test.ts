/**
 * axilog publishes `uptime_pct` per entity per buff. The uptime timeline does
 * not read it -- it rebuilds coverage from `per_source.by_source` states so it
 * can also draw a per-bucket heatmap -- which makes `uptime_pct` a free oracle
 * for the rebuild.
 *
 * It caught a real defect: the old sampler read the state at the *start* of
 * each bucket, so bucket 0 sampled fight start (states open `[[0, 0], ...]`)
 * and uptime was capped at (n-1)/n. Across these seven fights that ran 3 to
 * 7.5 points low, worst on the short fights that make up most of a WvW
 * session. Time-weighted coverage matches the oracle outright.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeBoonUptimeTimeline } from '../stats/computeBoonUptimeTimeline';

const FIXTURES = [
    '20260117-175120', '20260117-180135', '20260117-180259', '20260117-180458',
    '20260117-180636', '20260117-180826', '20260117-181030',
];

const loadFixture = (name: string): any =>
    JSON.parse(readFileSync(resolve(process.cwd(), `test-fixtures/native/${name}.json`), 'utf8'));

/** Protection: a duration buff, so `uptime_pct` is a straight percentage. */
const PROTECTION = 717;

describe.each(FIXTURES)('boon uptime coverage vs axilog uptime_pct (%s)', (name) => {
    const details = loadFixture(name);
    const durationMs = Number(details.native.encounter.duration_ms);
    const result = computeBoonUptimeTimeline(
        [{ filePath: `${name}.zevtc`, details }],
        { boonBucketIntervalMs: 5000, stackingBoonBucketIntervalMs: 5000 },
    );
    const protection = result.find((boon: any) => boon.id === `b${PROTECTION}`);
    const fight = protection?.fights?.[0];

    it('reproduces every squad member\'s Protection uptime', () => {
        expect(fight).toBeDefined();

        const byEntity = details.native.blocks.boons.by_entity;
        const squad = details.native.entities.filter((entity: any) => entity.role === 'squad');
        const compared: Array<{ account: string; oracle: number; ours: number }> = [];

        squad.forEach((entity: any) => {
            const oracle = Number(byEntity?.[String(entity.id)]?.[String(PROTECTION)]?.uptime_pct ?? 0);
            if (!(oracle > 0)) return;
            const value = fight.values[String(entity.account)];
            if (!value) return;
            compared.push({
                account: String(entity.account),
                oracle,
                ours: (Number(value.weightedMs) / durationMs) * 100,
            });
        });

        // Guard against a vacuous pass if the roster ever stops matching up.
        // 20260117-175120 is a five-man squad, three of whom ran Protection.
        expect(compared.length).toBeGreaterThan(2);
        compared.forEach(({ account, oracle, ours }) => {
            expect(`${account}: ${ours.toFixed(2)}`).toBe(`${account}: ${oracle.toFixed(2)}`);
        });
    });

    it('keeps the bucket heatmap in step with that coverage', () => {
        const intervalMs = protection.intervalMs;
        Object.values<any>(fight.values).forEach((value) => {
            // Buckets are fractions of their own span; the last one is short
            // when the fight does not divide evenly, so weight by real span.
            const fromBuckets = value.buckets.reduce((sum: number, bucket: number, index: number) => {
                const span = Math.min(intervalMs, durationMs - index * intervalMs);
                return sum + bucket * Math.max(0, span);
            }, 0);
            // Buckets are stored rounded to three decimals, so compare the
            // reconstruction as a share of the fight rather than in raw ms.
            expect((fromBuckets / durationMs) * 100)
                .toBeCloseTo((Number(value.weightedMs) / durationMs) * 100, 1);
        });
    });
});
