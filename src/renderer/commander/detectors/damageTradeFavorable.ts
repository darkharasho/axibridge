import type { Detector } from './types';

/** Fire good when the squad dealt meaningfully more damage than it took.
 *  Uses 1.2× as the floor — the trade is favorable, not just even. */
const detector: Detector = (fight) => {
  const out = fight.outcome.damageOut;
  const inc = fight.outcome.damageIn;
  if (out <= 0 || inc <= 0) return null;
  const ratio = out / inc;
  if (ratio < 1.2) return null;

  return {
    id: 'damage-trade-favorable',
    side: 'good',
    severity: 0.5 + 0.5 * Math.min(1, (ratio - 1.2) / 1.5),
    headline: 'Damage trade favored the squad',
    evidence: `${ratio.toFixed(2)}× out/in (${fmtBig(out)} dealt vs ${fmtBig(inc)} taken)`,
    threshold: 'good if damageOut / damageIn >= 1.20',
    vizKind: 'diverging-bar',
    vizData: { positive: out, negative: inc, net: out - inc },
  };
};

function fmtBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

export default detector;
