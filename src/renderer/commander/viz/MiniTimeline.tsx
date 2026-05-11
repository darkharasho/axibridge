type MarkerColor = 'green' | 'yellow' | 'red';

interface MiniTimelineProps {
  duration: number;
  markers: Array<{ tSec: number; color: MarkerColor; label?: string }>;
}

const MARKER_CLASS: Record<MarkerColor, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-rose-500',
};

export function MiniTimeline({ duration, markers }: MiniTimelineProps) {
  const safeDuration = Math.max(1e-9, duration);

  return (
    <div className="relative h-3 w-full rounded-sm bg-slate-800" data-role="timeline">
      {markers.map((m, i) => {
        const pct = Math.max(0, Math.min(100, (m.tSec / safeDuration) * 100));
        return (
          <div
            key={i}
            data-role="marker"
            data-color={m.color}
            title={m.label}
            className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 ${MARKER_CLASS[m.color]}`}
            style={{ left: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}
