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
      className="relative flex h-1.5 overflow-hidden rounded-sm"
      style={{ width, background: 'var(--bg-card-inner)' }}
      data-role="diverging-bar"
    >
      <div
        data-role="positive"
        className="h-full bg-emerald-500"
        style={{ width: `${posPct}%` }}
      />
      <div
        data-role="negative"
        className="h-full bg-rose-500"
        style={{ width: `${negPct}%` }}
      />
    </div>
  );
}
