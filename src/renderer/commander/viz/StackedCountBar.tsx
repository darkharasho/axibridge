import type { CSSProperties } from 'react';

interface StackedCountBarProps {
  alive: number;
  downed?: number;
  dead: number;
  aliveColor?: string;
  width?: number | string;
}

export function StackedCountBar({
  alive,
  downed = 0,
  dead,
  aliveColor,
  width = '100%',
}: StackedCountBarProps) {
  const total = Math.max(1e-9, alive + downed + dead);
  const alivePct = (alive / total) * 100;
  const downedPct = (downed / total) * 100;
  const deadPct = (dead / total) * 100;

  return (
    <div
      className="axi-meter"
      style={{ width, '--axi-meter-h': '6px' } as CSSProperties}
      data-role="stacked-bar"
    >
      <div
        data-role="alive"
        className="axi-meter__fill"
        style={{ '--axi-meter-v': `${alivePct}%`, '--axi-series': aliveColor ?? 'var(--axi-ok)' } as CSSProperties}
      />
      {downed > 0 && (
        <div
          data-role="downed"
          className="axi-meter__fill"
          style={{ '--axi-meter-v': `${downedPct}%`, '--axi-series': 'var(--axi-warn)' } as CSSProperties}
        />
      )}
      <div
        data-role="dead"
        className="axi-meter__fill"
        style={{ '--axi-meter-v': `${deadPct}%`, '--axi-series': 'var(--axi-danger)' } as CSSProperties}
      />
    </div>
  );
}
