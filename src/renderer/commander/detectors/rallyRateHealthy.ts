import type { Detector } from './types';

const detector: Detector = (fight, thresholds) => {
  if (fight.survival.downs < 4) return null;
  if (fight.survival.rallyRate < thresholds.rallyGood) return null;

  return {
    id: 'rally-rate-healthy',
    side: 'good',
    severity: fight.survival.rallyRate,
    headline: 'Squad is rallying through pressure',
    evidence: `${Math.round(fight.survival.rallyRate * 100)}% rally rate (${fight.survival.rallies}/${fight.survival.downs} downs)`,
    threshold: `good if rallyRate >= ${Math.round(thresholds.rallyGood * 100)}% and downs >= 4`,
    vizKind: 'donut',
    vizData: {
      rallied: fight.survival.rallies,
      total: fight.survival.downs,
    },
  };
};

export default detector;
