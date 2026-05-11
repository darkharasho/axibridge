import type { Detector } from './types';

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const detector: Detector = (fight) => {
  const broke = fight.burst.bombWindows.filter((b) => b.outcome === 'broke');
  if (broke.length === 0) return null;

  let worst = broke[0];
  let worstRatio = worst.incoming / Math.max(1, worst.heal);
  for (const b of broke) {
    const r = b.incoming / Math.max(1, b.heal);
    if (r > worstRatio) {
      worst = b;
      worstRatio = r;
    }
  }

  const severity = Math.min(1, worstRatio / 4);
  return {
    id: 'bomb-overwhelmed-sustain',
    side: 'bad',
    severity: 0.5 + 0.5 * severity,
    headline: 'Bomb overwhelmed sustain',
    evidence: `worst bomb at ${fmtTime(worst.tSec)} · in ${Math.round(worst.incoming).toLocaleString()} vs heal ${Math.round(worst.heal).toLocaleString()} (${worstRatio.toFixed(2)}x)`,
    threshold: 'flag if any bomb window outcome === broke',
    vizKind: 'sparkline',
    vizData: {
      incoming: fight.series.incomingDps,
      heal: fight.series.healingThroughput,
      marker: { tSec: worst.tSec, color: 'red' },
    },
  };
};

export default detector;
