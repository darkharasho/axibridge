import { describe, it, expect } from 'vitest';
import { computeBoonTimeline } from '../stats/computeBoonTimeline';

/**
 * Two entities, one boon (id 717, non-stacking "Protection"), both in the
 * same subgroup so groupCount = squadCount = 2 and every generation category
 * (self/group/squad) has a nonzero member count. Entity 1 receives the boon
 * from entity 2's applications, whose per-source state is on for the whole
 * fight.
 *
 * `generationPcts` controls how many of the three categories actually
 * generate for entity 1, which is exactly the axis the regression targets:
 * the bucket-timeline attribution must be identical regardless of how many
 * categories generated.
 */
const makeMockLog = (generationPcts: { self: number; group: number; squad: number }) => ({
    filePath: 'test-log.zevtc',
    details: {
        durationMS: 10000,
        timeStartStd: '2026-01-01T00:00:00Z',
        native: {
            encounter: { duration_ms: 10000 },
            entities: [
                {
                    id: 1, account: 'A.1234', character: 'CharA', role: 'squad', profession: 'Guardian', subgroup: 1,
                },
                {
                    id: 2, account: 'B.5678', character: 'CharB', role: 'squad', profession: 'Firebrand', subgroup: 1,
                },
            ],
            catalogs: {
                buffs: {
                    717: { name: 'Protection', kind: 'boon', stacking: 'duration', max_stacks: 1 },
                },
            },
            blocks: {
                boons: {
                    by_entity: {
                        '1': {
                            717: {
                                generation: {
                                    self_pct: generationPcts.self,
                                    group_pct: generationPcts.group,
                                    squad_pct: generationPcts.squad,
                                    self_wasted: 0,
                                    group_wasted: 0,
                                    squad_wasted: 0,
                                },
                                per_source: { by_source: { '2': [[0, 1]] } },
                            },
                        },
                        // Entity 2 needs a nonzero generation total of its own so its
                        // key survives into the output `values` map -- that map is
                        // only populated for players with generationMs > 0, and the
                        // bucket weights entity 1 attributes to entity 2 (as the
                        // source of entity 1's own uptime) are keyed under entity 2.
                        '2': {
                            717: {
                                generation: {
                                    self_pct: 10, group_pct: 0, squad_pct: 0, self_wasted: 0, group_wasted: 0, squad_wasted: 0,
                                },
                                per_source: { by_source: {} },
                            },
                        },
                    },
                },
            },
        },
    },
});

describe('computeBoonTimeline bucket-timeline attribution', () => {
    // durationMs 10000 / 5000ms buckets = 2 buckets. The source (entity 2)
    // is "on" for the whole fight, so a single attribution of its states
    // spreads evenly: 5000ms of weight in each bucket.
    const SINGLE_ATTRIBUTION_BUCKETS = [5000, 5000];

    it('attributes the source once when generation fires in all three categories', () => {
        const log = makeMockLog({ self: 50, group: 50, squad: 50 });
        const result = computeBoonTimeline([log]);

        const protBoon = result.find((b: any) => b.name === 'Protection');
        expect(protBoon).toBeDefined();
        const fight = protBoon!.fights[0];
        const sourceValue = fight.values['B.5678'];
        expect(sourceValue).toBeDefined();
        expect(sourceValue.bucketWeights5s).toEqual(SINGLE_ATTRIBUTION_BUCKETS);
    });

    it('attributes the same weights when generation fires in exactly one category', () => {
        const log = makeMockLog({ self: 50, group: 0, squad: 0 });
        const result = computeBoonTimeline([log]);

        const protBoon = result.find((b: any) => b.name === 'Protection');
        expect(protBoon).toBeDefined();
        const fight = protBoon!.fights[0];
        const sourceValue = fight.values['B.5678'];
        expect(sourceValue).toBeDefined();
        // Under the pre-existing bug, the three-category case above would
        // have tripled these weights (one addBucketWeightsFromStates call
        // per generating category); the single-category case would have
        // matched what's asserted here. The fix (single attribution per
        // entity+boon, done once after the category loop) makes both cases
        // agree exactly -- that agreement is the point of this test.
        expect(sourceValue.bucketWeights5s).toEqual(SINGLE_ATTRIBUTION_BUCKETS);
    });
});
