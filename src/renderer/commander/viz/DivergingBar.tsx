import type { CSSProperties } from 'react';

interface DivergingBarProps {
  positive: number;
  negative: number;
  width?: number | string;
}

export function DivergingBar({ positive, negative, width = '100%' }: DivergingBarProps) {
  const p = Math.abs(positive);
  const n = Math.abs(negative);
  const total = Math.max(1e-9, p + n);
  const posPct = (p / total) * 100;
  const negPct = (n / total) * 100;

  return (
    <div
      className="axi-meter"
      style={{ width, '--axi-meter-h': '6px' } as CSSProperties}
      data-role="diverging-bar"
    >
      <div
        data-role="positive"
        className="axi-meter__fill"
        style={{ '--axi-meter-v': `${posPct}%`, '--axi-series': 'var(--axi-ok)' } as CSSProperties}
      />
      <div
        data-role="negative"
        className="axi-meter__fill"
        style={{ '--axi-meter-v': `${negPct}%`, '--axi-series': 'var(--axi-danger)' } as CSSProperties}
      />
    </div>
  );
}
