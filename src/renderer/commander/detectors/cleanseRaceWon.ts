import type { Detector } from './types';

const detector: Detector = (fight) => {
  const net = fight.sustain.cleansesApplied - fight.sustain.conditionsTaken;
  if (net <= 0) return null;

  const severity = Math.min(1, net / 100);
  return {
    id: 'cleanse-race-won',
    side: 'good',
    severity: 0.5 + 0.5 * severity,
    headline: 'Winning the cleanse race',
    evidence: `+${net} net cleanses (${fight.sustain.cleansesApplied} applied vs ${fight.sustain.conditionsTaken} taken)`,
    threshold: 'good if cleansesApplied - conditionsTaken > 0',
    vizKind: 'diverging-bar',
    vizData: {
      positive: fight.sustain.cleansesApplied,
      negative: fight.sustain.conditionsTaken,
      net,
    },
  };
};

export default detector;
