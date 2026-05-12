import type { Severity } from './ThresholdBar';

interface DonutProps {
  pct: number;
  color: Severity;
  label?: string;
}

const STROKE: Record<Severity, string> = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#f43f5e',
};

const SIZE = 38;
const STROKE_WIDTH = 5;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function Donut({ pct, color, label }: DonutProps) {
  const clamped = Math.max(0, Math.min(1, pct));
  const dash = CIRC * clamped;
  const gap = CIRC - dash;

  return (
    <div className="relative inline-flex items-center justify-center" data-role="donut">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          style={{ stroke: 'var(--bg-card-inner)' }}
        />
        <circle
          data-role="donut-arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={STROKE[color]}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={`${dash.toFixed(3)} ${gap.toFixed(3)}`}
          strokeDashoffset={CIRC / 4}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      {label != null && (
        <span
          data-role="donut-label"
          className="absolute text-[9px] font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
