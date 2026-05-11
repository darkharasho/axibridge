import type { Detector } from './types';

const detector: Detector = (fight, thresholds) => {
  if (fight.cohesion.peakSpreadStdev <= thresholds.spreadBad) return null;
  const peakT = fight.cohesion.peakSpreadStdevTSec;

  const inBomb = fight.burst.bombWindows.some(
    (b) => peakT >= b.tSec && peakT <= b.tSec + b.durationSec,
  );
  if (!inBomb) return null;

  const severity = Math.min(1, (fight.cohesion.peakSpreadStdev - thresholds.spreadBad) / thresholds.spreadBad);
  return {
    id: 'fragmented-at-bomb',
    side: 'bad',
    severity: 0.5 + 0.5 * severity,
    headline: 'Squad fragmented during the bomb',
    evidence: `peak spread ${Math.round(fight.cohesion.peakSpreadStdev).toLocaleString()}u stdev at ${Math.floor(peakT / 60)}:${Math.floor(peakT % 60).toString().padStart(2, '0')}`,
    threshold: `bad if peak spread > ${thresholds.spreadBad}u during bomb window`,
    vizKind: 'sparkline',
    vizData: {
      series: fight.series.spreadStdev,
      marker: { tSec: peakT, color: 'red' },
      thresholdLine: thresholds.spreadBad,
    },
  };
};

export default detector;
