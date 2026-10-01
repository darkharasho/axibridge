import type { CSSProperties } from 'react';

export type Severity = 'green' | 'yellow' | 'red';

interface ThresholdBarProps {
  value: number;
  max: number;
  threshold?: number;
  severity: Severity;
  width?: number | string;
}

/* Rule 5: a filled shape in a status ink IS the verdict, so the fill reads the
   status token for the severity rather than a palette hue. */
const SERIES: Record<Severity, string> = {
  green: 'var(--axi-ok)',
  yellow: 'var(--axi-warn)',
  red: 'var(--axi-danger)',
};

export function ThresholdBar({ value, max, threshold, severity, width = '100%' }: ThresholdBarProps) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-9, max)) * 100));
  const thresholdPct =
    threshold == null
      ? null
      : Math.max(0, Math.min(100, (threshold / Math.max(1e-9, max)) * 100));

  return (
    <div className="axi-meter relative overflow-visible" style={{ width, '--axi-meter-h': '6px' } as CSSProperties}>
      <div
        data-role="fill"
        className="axi-meter__fill"
        style={{ '--axi-meter-v': `${pct}%`, '--axi-series': SERIES[severity] } as CSSProperties}
      />
      {thresholdPct != null && (
        <div
          data-role="threshold"
          className="absolute -top-0.5 -bottom-0.5 w-[2px]"
          style={{ left: `${thresholdPct}%`, background: 'var(--axi-text)' }}
        />
      )}
    </div>
  );
}
