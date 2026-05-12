import type { Detector } from './types';

const detector: Detector = (fight, thresholds) => {
  if (fight.outcome.squadDeaths < 3) return null;
  const avg = fight.cohesion.avgDistAtDeath;
  if (avg <= thresholds.caughtOutDist) return null;

  const severity = Math.min(1, (avg - thresholds.caughtOutDist) / thresholds.caughtOutDist);
  const deaths = fight.outcome.squadDeaths;
  const radius = thresholds.tagRadius;
  // Heuristic: when avg death distance exceeds tag radius, most deaths happened "outside".
  const outsideRatio = Math.min(1, Math.max(0, (avg - radius) / Math.max(1, radius)));
  const outside = Math.round(deaths * (0.5 + 0.5 * outsideRatio));
  const inside = Math.max(0, deaths - outside);
  return {
    id: 'caught-out-deaths',
    side: 'bad',
    severity: 0.5 + 0.5 * severity,
    headline: 'Squad dying out of position',
    evidence: `avg ${Math.round(avg).toLocaleString()}u from tag at death (threshold ${thresholds.caughtOutDist.toLocaleString()}u) · ${deaths} deaths`,
    threshold: `bad if avgDistAtDeath > ${thresholds.caughtOutDist}u and squadDeaths >= 3`,
    vizKind: 'tag-bubble',
    vizData: { inside, outside, tagRadius: radius },
  };
};

export default detector;
