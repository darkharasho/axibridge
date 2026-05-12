import type { Detector } from './types';

/** WvW reality: you rarely *out*-cleanse incoming condi outright. So fire
 *  good when cleanses kept up with at least 60% of what hit the squad
 *  (or when condi was negligible to begin with). */
const detector: Detector = (fight) => {
  const cleanses = fight.sustain.cleansesApplied;
  const taken = fight.sustain.conditionsTaken;
  if (taken < 20 && cleanses < 20) return null; // not a meaningful sample
  const ratio = cleanses / Math.max(1, taken);
  if (ratio < 0.6) return null;

  const net = cleanses - taken;
  return {
    id: 'cleanse-race-won',
    side: 'good',
    severity: 0.5 + 0.5 * Math.min(1, ratio - 0.6),
    headline: net > 0 ? 'Winning the cleanse race' : 'Cleanses kept pace with condi',
    evidence: `${cleanses} cleanses vs ${taken} condis taken (${Math.round(ratio * 100)}%)`,
    threshold: 'good if cleanses >= 60% of conditions taken',
    vizKind: 'diverging-bar',
    vizData: {
      positive: cleanses,
      negative: taken,
      net,
    },
  };
};

export default detector;
