interface SparklineProps {
  series: number[];
  thresholdLine?: number;
  color: 'green' | 'red' | 'amber';
  secondarySeries?: number[];
  width?: number;
  height?: number;
  markerAt?: { index: number; color?: string };
}

const STROKE: Record<'green' | 'red' | 'amber', string> = {
  green: '#10b981',
  red: '#f43f5e',
  amber: '#f59e0b',
};

function toPoints(series: number[], width: number, height: number, min: number, max: number): string {
  if (series.length === 0) return '';
  const range = max - min || 1;
  const step = series.length === 1 ? 0 : width / (series.length - 1);
  return series
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function Sparkline({
  series,
  thresholdLine,
  color,
  secondarySeries,
  width = 80,
  height = 20,
  markerAt,
}: SparklineProps) {
  const safeSeries: number[] = Array.isArray(series) ? series : [];
  const safeSecondary: number[] | undefined = Array.isArray(secondarySeries) ? secondarySeries : undefined;
  series = safeSeries;
  secondarySeries = safeSecondary;
  const all = [...safeSeries, ...(safeSecondary ?? []), ...(thresholdLine != null ? [thresholdLine] : [])];
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  const primaryPoints = toPoints(series, width, height, min, max);
  const secondaryPoints = secondarySeries ? toPoints(secondarySeries, width, height, min, max) : null;

  let thresholdY: number | null = null;
  if (thresholdLine != null) {
    const range = (max - min) || 1;
    thresholdY = height - ((thresholdLine - min) / range) * height;
  }

  let markerCx: number | null = null;
  let markerCy: number | null = null;
  if (markerAt && markerAt.index >= 0 && markerAt.index < series.length) {
    const step = series.length === 1 ? 0 : width / (series.length - 1);
    markerCx = markerAt.index * step;
    const range = (max - min) || 1;
    markerCy = height - ((series[markerAt.index] - min) / range) * height;
  }

  return (
    <svg width={width} height={height} data-role="sparkline" viewBox={`0 0 ${width} ${height}`}>
      {thresholdY != null && (
        <line
          data-role="threshold-line"
          x1={0}
          x2={width}
          y1={thresholdY}
          y2={thresholdY}
          stroke="#94a3b8"
          strokeDasharray="2 2"
          strokeWidth={1}
        />
      )}
      {secondaryPoints && (
        <polyline
          data-role="secondary"
          fill="none"
          stroke="#64748b"
          strokeWidth={1}
          points={secondaryPoints}
        />
      )}
      <polyline
        data-role="primary"
        fill="none"
        stroke={STROKE[color]}
        strokeWidth={1.5}
        points={primaryPoints}
      />
      {markerCx != null && markerCy != null && (
        <circle
          data-role="marker"
          cx={markerCx}
          cy={markerCy}
          r={2}
          fill={markerAt?.color ?? STROKE[color]}
        />
      )}
    </svg>
  );
}
