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
      className="relative flex h-1.5 overflow-hidden rounded-sm"
      style={{ width, background: 'var(--bg-card-inner)' }}
      data-role="stacked-bar"
    >
      <div
        data-role="alive"
        className="h-full bg-emerald-500"
        style={{ width: `${alivePct}%`, backgroundColor: aliveColor }}
      />
      {downed > 0 && (
        <div
          data-role="downed"
          className="h-full bg-amber-500"
          style={{ width: `${downedPct}%` }}
        />
      )}
      <div
        data-role="dead"
        className="h-full bg-rose-500"
        style={{ width: `${deadPct}%` }}
      />
    </div>
  );
}
