import { describe, it, expect } from 'vitest';
import { normalizeMvpWeightProfiles } from '../mvpWeightProfiles';
import { DEFAULT_MVP_WEIGHT_PROFILES } from '../../global.d';

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
