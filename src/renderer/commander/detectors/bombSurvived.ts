import type { Detector } from './types';

const detector: Detector = (fight) => {
  const total = fight.burst.bombWindowCount;
  if (total < 1) return null;
  const survived = fight.burst.bombWindows.filter((b) => b.outcome === 'survived');
  if (survived.length === 0) return null;

  const ratio = survived.length / total;
  return {
    id: 'bomb-survived',
    side: 'good',
    severity: 0.5 + 0.5 * ratio,
    headline: 'Squad ate the bomb and lived',
    evidence: `survived ${survived.length}/${total} bomb window${total === 1 ? '' : 's'}`,
    threshold: 'good if at least one bomb window survived',
    vizKind: 'mini-timeline',
    vizData: {
      markers: fight.burst.bombWindows.map((b) => ({
        tSec: b.tSec,
        color: b.outcome === 'survived' ? 'green' : 'red',
      })),
      duration: fight.duration,
    },
  };
};

export default detector;
