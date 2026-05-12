import type { Detector } from './types';

const detector: Detector = (fight, thresholds) => {
  const net = fight.sustain.cleansesApplied - fight.sustain.conditionsTaken;
  // cleanseDeficitWarn is negative (e.g. -50). Fire if net < threshold.
  if (net >= thresholds.cleanseDeficitWarn) return null;

  const magnitude = Math.abs(net - thresholds.cleanseDeficitWarn);
  const severity = Math.min(1, magnitude / 100);
  return {
    id: 'cleanse-race-lost',
    side: 'bad',
    severity: 0.5 + 0.5 * severity,
    headline: 'Losing the cleanse race',
    evidence: `${net} net cleanses (${fight.sustain.cleansesApplied} applied vs ${fight.sustain.conditionsTaken} taken)`,
    threshold: `bad if net cleanses < ${thresholds.cleanseDeficitWarn}`,
    vizKind: 'diverging-bar',
    vizData: {
      positive: fight.sustain.cleansesApplied,
      negative: fight.sustain.conditionsTaken,
      net,
    },
  };
};

export default detector;
