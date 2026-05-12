interface TagBubbleProps {
  inside: number;
  outside: number;
  tagRadius?: number;
  outliers?: number;
}

// Deterministic pseudo-random based on index for stable layout.
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 9301 + salt * 49297) * 233280;
  return x - Math.floor(x);
}

export function TagBubble({ inside, outside, tagRadius = 24, outliers = 0 }: TagBubbleProps) {
  const size = 80;
  const cx = size / 2;
  const cy = size / 2;
  const r = tagRadius;

  const insideDots = Array.from({ length: Math.max(0, inside) }, (_, i) => {
    const angle = seeded(i, 1) * Math.PI * 2;
    const dist = seeded(i, 2) * (r - 4);
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
  });

  const outsideDots = Array.from({ length: Math.max(0, outside) }, (_, i) => {
    const angle = seeded(i, 3) * Math.PI * 2;
    const dist = r + 4 + seeded(i, 4) * (size / 2 - r - 6);
    return { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
  });

  return (
    <svg width={size} height={size} data-role="tag-bubble" viewBox={`0 0 ${size} ${size}`}>
      <circle
        data-role="tag-radius"
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#94a3b8"
        strokeDasharray="3 3"
        strokeWidth={1}
      />
      {insideDots.map((d, i) => (
        <circle
          key={`in-${i}`}
          data-role="dot-inside"
          cx={d.x}
          cy={d.y}
          r={1.5}
          fill="#10b981"
        />
      ))}
      {outsideDots.map((d, i) => (
        <circle
          key={`out-${i}`}
          data-role="dot-outside"
          cx={d.x}
          cy={d.y}
          r={1.5}
          fill="#f43f5e"
        />
      ))}
      {outliers > 0 && (
        <text
          data-role="outliers"
          x={size - 4}
          y={10}
          fontSize={8}
          textAnchor="end"
          fill="#f59e0b"
        >
          +{outliers}
        </text>
      )}
    </svg>
  );
}
