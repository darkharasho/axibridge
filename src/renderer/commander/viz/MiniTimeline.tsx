import type { CSSProperties } from 'react';

type MarkerColor = 'green' | 'yellow' | 'red';

interface MiniTimelineProps {
  duration: number;
  markers: Array<{ tSec: number; color: MarkerColor; label?: string }>;
}

/* A marker on a timeline is a status mark, which the language draws as a
   diamond in the status ink (rule 5). */
const MARKER_CLASS: Record<MarkerColor, string> = {
  green: 'axi-diamond--ok',
  yellow: 'axi-diamond--warn',
  red: 'axi-diamond--danger',
};

export function MiniTimeline({ duration, markers }: MiniTimelineProps) {
  const safeDuration = Math.max(1e-9, duration);

  return (
    <div className="axi-meter relative w-full overflow-visible" style={{ '--axi-meter-h': '12px' } as CSSProperties} data-role="timeline">
      {markers.map((m, i) => {
        const pct = Math.max(0, Math.min(100, (m.tSec / safeDuration) * 100));
        return (
          <span
            key={i}
            data-role="marker"
            data-color={m.color}
            title={m.label}
            className={`axi-diamond absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${MARKER_CLASS[m.color]}`}
            style={{ left: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}
