import type { Detector } from './types';

const detector: Detector = (fight, thresholds) => {
  const deficit = fight.sustain.stripsReceived - fight.sustain.stripsLanded;
  if (deficit <= thresholds.stripDeficitWarn) return null;

  const severity = Math.min(1, (deficit - thresholds.stripDeficitWarn) / 100);
  return {
    id: 'strip-race-lost',
    side: 'bad',
    severity: 0.5 + 0.5 * severity,
    headline: 'Getting stripped more than we strip',
    evidence: `+${deficit} strips received over landed (${fight.sustain.stripsReceived} in vs ${fight.sustain.stripsLanded} out)`,
    threshold: `bad if stripsReceived - stripsLanded > ${thresholds.stripDeficitWarn}`,
    vizKind: 'diverging-bar',
    vizData: {
      positive: fight.sustain.stripsLanded,
      negative: fight.sustain.stripsReceived,
      net: -deficit,
    },
  };
};

export default detector;
