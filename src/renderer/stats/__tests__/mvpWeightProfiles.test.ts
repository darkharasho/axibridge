import { describe, it, expect } from 'vitest';
import { normalizeMvpWeightProfiles, buildMvpMetrics } from '../mvpWeightProfiles';
import { DEFAULT_MVP_WEIGHT_PROFILES } from '../../global.d';
import { TOP_STATS_CATALOG, MVP_WEIGHTABLE_STATS, mvpStatLabel } from '../topStatsCatalog';

describe('normalizeMvpWeightProfiles', () => {
  it('returns defaults for undefined', () => {
    expect(normalizeMvpWeightProfiles(undefined)).toEqual(DEFAULT_MVP_WEIGHT_PROFILES);
  });

  it('migrates a legacy flat IMvpWeights object into buckets', () => {
    const legacy = {
      offensiveDownContribution: 1, offensiveDps: 0.2, offensiveDamage: 0.2,
      generalStrips: 1, generalCc: 0.7, generalDistanceToTag: 0.7,
      generalParticipation: 0.7, generalDodging: 0.4,
      defensiveHealing: 1, defensiveDownedHealing: 0.7, defensiveCleanses: 1,
      defensiveStability: 1, defensiveRevives: 0.7,
    };
    const out = normalizeMvpWeightProfiles(legacy);
    expect(out.offensive).toEqual({ downContrib: 1, dps: 0.2, damage: 0.2 });
    expect(out.general).toEqual({ strips: 1, cc: 0.7, closestToTag: 0.7, participation: 0.7, dodges: 0.4 });
    expect(out.defensive).toEqual({ healing: 1, downedHealing: 0.7, cleanses: 1, stability: 1, revives: 0.7 });
  });

  it('keeps an already-profiled object, dropping unknown ids and non-numbers', () => {
    const input = {
      offensive: { downContrib: 0.5, bogus: 3, dps: 'x' as any },
      general: { 'boon:might': 0.3 },
      defensive: {},
    };
    const out = normalizeMvpWeightProfiles(input);
    expect(out.offensive).toEqual({ downContrib: 0.5 });
    expect(out.general).toEqual({ 'boon:might': 0.3 });
    expect(out.defensive).toEqual({});
  });

  it('default profiles match the catalog-derived defaults', async () => {
    const { DEFAULT_MVP_WEIGHT_PROFILES_FROM_CATALOG } = await import('../mvpWeightProfiles');
    expect(DEFAULT_MVP_WEIGHT_PROFILES).toEqual(DEFAULT_MVP_WEIGHT_PROFILES_FROM_CATALOG);
  });
});

describe('buildMvpMetrics: defensiveRevives scores completed revives', () => {
  // `def.id === 'revives'` is the only catalog entry whose getter is repointed
  // away from its own `source.key` leaderboard -- the ratio calculation reads
  // `metric.leaderboard[0].value` as the normalization denominator, so scoring
  // completed revives against the (larger) attempts leaderboard would silently
  // deflate every ratio.
  const getVal = (s: any, k: string) => Number(s?.[k] ?? 0);

  it('scores against the revivesCompleted leaderboard and labels the metric "Revives"', () => {
    const leaderboards = {
      revives: [{ account: 'A', value: 10 }],
      revivesCompleted: [{ account: 'A', value: 4 }],
    };
    const [metric] = buildMvpMetrics({ revives: 1 }, leaderboards, {}, getVal);
    expect(metric.name).toBe('Revives');
    expect(metric.leaderboard).toBe(leaderboards.revivesCompleted);
    // Completed revives, not attempts.
    expect(metric.getter({ revivesCompleted: 3, revives: 10 })).toBe(3);
    // A null completed count is UNKNOWN, not zero, and attempts are not a
    // substitute: they are a systematically larger quantity, so scoring them
    // against a completed-revives denominator produced ratios above 1.0 and let
    // this one weight outweigh every other (bounded) contribution. NaN makes
    // computeCategoryScores skip the metric for that player instead.
    expect(metric.getter({ revivesCompleted: null, revives: 10 })).toBeNaN();
    expect(metric.getter({ revives: 10 })).toBeNaN();
  });

  it('never offers revivesCompleted as a second weight under the same name', () => {
    // `revives` (frozen id, legacy `defensiveRevives`) already scores completed
    // revives, so a `revivesCompleted` weight would be the same quantity a
    // second time — two rows named "Revives" in one MVP breakdown.
    const metrics = buildMvpMetrics(
      { revives: 1, revivesCompleted: 1 },
      { revives: [{ account: 'A', value: 10 }], revivesCompleted: [{ account: 'A', value: 4 }] },
      {}, getVal,
    );
    expect(metrics.map((m) => m.name)).toEqual(['Revives']);
  });

  it('drops a persisted weight for a stat that is not MVP-weightable', () => {
    expect(normalizeMvpWeightProfiles({
      general: {}, offensive: {}, defensive: { revives: 0.7, revivesCompleted: 0.5 },
    }).defensive).toEqual({ revives: 0.7 });
  });

  it('names the weight picker entry after what is actually scored', () => {
    // The catalog CARD is "Resurrect Attempts"; the MVP weight of the same
    // frozen id scores completed revives and must say so at the point of
    // selection.
    const def = TOP_STATS_CATALOG.find((d) => d.id === 'revives')!;
    expect(def.label).toBe('Resurrect Attempts');
    expect(mvpStatLabel(def)).toBe('Revives');
    expect(MVP_WEIGHTABLE_STATS.some((d) => d.id === 'revivesCompleted')).toBe(false);
    // No two MVP-weightable stats may share a picker/breakdown name.
    const names = MVP_WEIGHTABLE_STATS.map(mvpStatLabel);
    expect(new Set(names).size).toBe(names.length);
  });

  it('falls back to the attempts leaderboard when the completed leaderboard is empty', () => {
    const leaderboards = {
      revives: [{ account: 'A', value: 10 }],
      revivesCompleted: [],
    };
    const [metric] = buildMvpMetrics({ revives: 1 }, leaderboards, {}, getVal);
    expect(metric.leaderboard).toBe(leaderboards.revives);
  });
});
