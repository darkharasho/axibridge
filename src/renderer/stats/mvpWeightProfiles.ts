import { MVP_WEIGHTABLE_STATS, mvpStatLabel, type TopStatDef } from './topStatsCatalog';
import { DEFAULT_MVP_WEIGHT_PROFILES, type IMvpWeightProfiles } from '../global.d';

// Only MVP-weightable ids may carry a weight. A stat that is excluded from the
// picker must also be rejected on load, or a hand-edited or stale settings file
// could re-introduce the duplicate weight the exclusion exists to prevent.
const VALID_IDS = new Set(MVP_WEIGHTABLE_STATS.map((d) => d.id));

const LEGACY_MAP: Record<string, [keyof IMvpWeightProfiles, string]> = {
  offensiveDownContribution: ['offensive', 'downContrib'],
  offensiveDps: ['offensive', 'dps'],
  offensiveDamage: ['offensive', 'damage'],
  generalStrips: ['general', 'strips'],
  generalCc: ['general', 'cc'],
  generalDistanceToTag: ['general', 'closestToTag'],
  generalParticipation: ['general', 'participation'],
  generalDodging: ['general', 'dodges'],
  defensiveHealing: ['defensive', 'healing'],
  defensiveDownedHealing: ['defensive', 'downedHealing'],
  defensiveCleanses: ['defensive', 'cleanses'],
  defensiveStability: ['defensive', 'stability'],
  defensiveRevives: ['defensive', 'revives'],
};

const cleanBucket = (raw: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [id, w] of Object.entries(raw as Record<string, unknown>)) {
      const n = Number(w);
      if (VALID_IDS.has(id) && Number.isFinite(n) && n > 0) out[id] = n;
    }
  }
  return out;
};

const isProfiles = (v: any): boolean =>
  v && typeof v === 'object' && ('general' in v || 'offensive' in v || 'defensive' in v)
    && !('offensiveDownContribution' in v);

export const normalizeMvpWeightProfiles = (value: unknown): IMvpWeightProfiles => {
  if (isProfiles(value)) {
    const v = value as Partial<IMvpWeightProfiles>;
    return { general: cleanBucket(v.general), offensive: cleanBucket(v.offensive), defensive: cleanBucket(v.defensive) };
  }
  if (value && typeof value === 'object') {
    const out: IMvpWeightProfiles = { general: {}, offensive: {}, defensive: {} };
    let matched = false;
    for (const [legacyKey, [bucket, id]] of Object.entries(LEGACY_MAP)) {
      const n = Number((value as Record<string, unknown>)[legacyKey]);
      if (Number.isFinite(n)) { matched = true; if (n > 0) out[bucket][id] = n; }
    }
    if (matched) return out;
  }
  return {
    general: { ...DEFAULT_MVP_WEIGHT_PROFILES.general },
    offensive: { ...DEFAULT_MVP_WEIGHT_PROFILES.offensive },
    defensive: { ...DEFAULT_MVP_WEIGHT_PROFILES.defensive },
  };
};

const DEFAULT_TABLE: Array<[keyof IMvpWeightProfiles, string, number]> = [
  ['offensive', 'downContrib', 1], ['offensive', 'dps', 0.2], ['offensive', 'damage', 0.2],
  ['general', 'strips', 1], ['general', 'cc', 0.7], ['general', 'closestToTag', 0.7],
  ['general', 'participation', 0.7], ['general', 'dodges', 0.4],
  ['defensive', 'healing', 1], ['defensive', 'downedHealing', 0.7], ['defensive', 'cleanses', 1],
  ['defensive', 'stability', 1], ['defensive', 'revives', 0.7],
];
export const DEFAULT_MVP_WEIGHT_PROFILES_FROM_CATALOG: IMvpWeightProfiles = (() => {
  const out: IMvpWeightProfiles = { general: {}, offensive: {}, defensive: {} };
  for (const [bucket, id, w] of DEFAULT_TABLE) {
    if (!VALID_IDS.has(id)) throw new Error(`Unknown MVP default stat id: ${id}`);
    out[bucket][id] = w;
  }
  return out;
})();

export interface MvpMetric {
  name: string;
  weight: number;
  leaderboard: any[];
  getter: (s: any) => number;
  higher?: boolean;
}

export const buildMvpMetrics = (
  weights: Record<string, number>,
  leaderboards: Record<string, any[]>,
  boonLeaderboards: Record<string, any[]>,
  getVal: (s: any, key: string) => number,
): MvpMetric[] => {
  const metrics: MvpMetric[] = [];
  for (const def of MVP_WEIGHTABLE_STATS as TopStatDef[]) {
    const weight = weights[def.id] || 0;
    if (weight <= 0) continue;
    if (def.source.kind === 'boon') {
      const lb = boonLeaderboards[def.source.boonId] || [];
      const valueByAccount = new Map<string, number>(lb.map((r: any) => [String(r.account), Number(r.value) || 0]));
      metrics.push({ name: mvpStatLabel(def), weight, higher: def.higherIsBetter, leaderboard: lb, getter: (s) => valueByAccount.get(String(s.account)) ?? 0 });
    } else {
      const key = def.source.key;
      // `defensiveRevives` (legacy weight key -> catalog id 'revives') used to
      // score attempts. Attempts are attribution-free but mean "tried", not
      // "picked someone up" -- score completed revives instead. The leaderboard
      // (used for the `best` normalization denominator AND the rank shown in
      // the MVP breakdown) is repointed to match: scoring completed revives
      // against the attempts leaderboard would systematically deflate every
      // ratio. The picker and breakdown name comes from `mvpLabel`, so what the
      // user selects is named for what is actually scored.
      //
      // A null `revivesCompleted` means "unknown" (the log lacked the
      // rotation/replay data), never "revived nobody". Return NaN so
      // computeCategoryScores' `!Number.isFinite(val)` guard drops the metric
      // for that player entirely. Falling back to ATTEMPTS here was worse than
      // a zero: attempts are an incommensurable, systematically larger quantity,
      // so val/best against a completed-revives `best` could exceed 1.0 and let
      // one metric outweigh every other bounded contribution in the sum.
      const isReviveOverride = def.id === 'revives';
      const completedLeaderboard = leaderboards['revivesCompleted'];
      const leaderboard = isReviveOverride
        ? ((completedLeaderboard && completedLeaderboard.length > 0) ? completedLeaderboard : (leaderboards[key] || []))
        : (leaderboards[key] || []);
      const getter = isReviveOverride
        ? (s: any) => (s?.revivesCompleted ?? NaN)
        : (s: any) => getVal(s, key);
      metrics.push({ name: mvpStatLabel(def), weight, higher: def.higherIsBetter, leaderboard, getter });
    }
  }
  return metrics;
};
