import type { Detector } from './types';

/** Squad mostly stayed alive — fire good when fewer than 20% of squad died
 *  in a fight that had at least 10 squad members. */
const detector: Detector = (fight) => {
  const squad = fight.survival.squadTotal;
  if (squad < 10) return null;
  const dead = fight.outcome.squadDeaths;
  const deathPct = dead / squad;
  if (deathPct >= 0.2) return null;

  const aliveAtEnd = fight.survival.squadAliveAtEnd;
  return {
    id: 'low-squad-casualties',
    side: 'good',
    severity: 0.5 + 0.5 * (1 - deathPct / 0.2),
    headline: dead === 0 ? 'Clean fight — no squad deaths' : 'Squad mostly stayed alive',
    evidence: `${dead}/${squad} squad deaths (${aliveAtEnd} alive at end)`,
    threshold: 'good if < 20% of squad died',
    vizKind: 'stacked-count',
    vizData: { alive: aliveAtEnd, dead },
  };
};

export default detector;
