import type { Detector } from './types';

const detector: Detector = (fight, thresholds) => {
  if (fight.burst.bombWindowCount < 1) return null;
  const value = fight.burst.stabUptimeInSpike;
  if (value >= thresholds.stabBadInBomb) return null;

  const denom = Math.max(0.0001, thresholds.stabBadInBomb);
  const severity = Math.min(1, (thresholds.stabBadInBomb - value) / denom);
  return {
    id: 'stab-coverage-bad',
    side: 'bad',
    severity: 0.5 + 0.5 * severity,
    headline: 'Weak stab during the bomb',
    evidence: `${Math.round(value * 100)}% stab in spike (threshold ${Math.round(thresholds.stabBadInBomb * 100)}%)`,
    threshold: `bad if bomb-spike stab < ${Math.round(thresholds.stabBadInBomb * 100)}%`,
    vizKind: 'threshold-bar',
    vizData: { value, threshold: thresholds.stabBadInBomb, max: 1, severity: 'red' },
  };
};

export default detector;
