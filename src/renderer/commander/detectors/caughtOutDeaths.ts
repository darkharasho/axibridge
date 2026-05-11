import type { Detector } from './types';

const detector: Detector = (fight, thresholds) => {
  if (fight.outcome.squadDeaths < 3) return null;
  const avg = fight.cohesion.avgDistAtDeath;
  if (avg <= thresholds.caughtOutDist) return null;

  const severity = Math.min(1, (avg - thresholds.caughtOutDist) / thresholds.caughtOutDist);
  return {
    id: 'caught-out-deaths',
    side: 'bad',
    severity: 0.5 + 0.5 * severity,
    headline: 'Squad dying out of position',
    evidence: `avg ${Math.round(avg).toLocaleString()}u from tag at death (threshold ${thresholds.caughtOutDist.toLocaleString()}u) · ${fight.outcome.squadDeaths} deaths`,
    threshold: `bad if avgDistAtDeath > ${thresholds.caughtOutDist}u and squadDeaths >= 3`,
    vizKind: 'tag-bubble',
    vizData: {
      radius: thresholds.tagRadius,
      avgDistAtDeath: avg,
      deaths: fight.outcome.squadDeaths,
    },
  };
};

export default detector;
