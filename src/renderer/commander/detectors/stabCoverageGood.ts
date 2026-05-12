import type { Detector } from './types';

const detector: Detector = (fight, thresholds) => {
  const value = fight.engage.stab0to10s;
  if (value < thresholds.stabGoodEngage) return null;

  const denom = Math.max(0.0001, 1 - thresholds.stabGoodEngage);
  const severity = Math.min(1, (value - thresholds.stabGoodEngage) / denom);
  return {
    id: 'stab-coverage-good',
    side: 'good',
    severity: 0.5 + 0.5 * severity,
    headline: 'Strong stab coverage on engage',
    evidence: `${Math.round(value * 100)}% stab uptime 0-10s (threshold ${Math.round(thresholds.stabGoodEngage * 100)}%)`,
    threshold: `good if engage stab >= ${Math.round(thresholds.stabGoodEngage * 100)}%`,
    vizKind: 'sparkline',
    vizData: {
      series: fight.series.stabUptime,
      thresholdLine: thresholds.stabGoodEngage,
      color: 'green',
    },
  };
};

export default detector;
