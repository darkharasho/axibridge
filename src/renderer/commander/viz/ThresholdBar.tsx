export type Severity = 'green' | 'yellow' | 'red';

interface ThresholdBarProps {
  value: number;
  max: number;
  threshold?: number;
  severity: Severity;
  width?: number | string;
}

const FILL_CLASS: Record<Severity, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-rose-500',
};

export function ThresholdBar({ value, max, threshold, severity, width = '100%' }: ThresholdBarProps) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-9, max)) * 100));
  const thresholdPct =
    threshold == null
      ? null
      : Math.max(0, Math.min(100, (threshold / Math.max(1e-9, max)) * 100));

  return (
    <div className="relative h-1.5 rounded-sm bg-slate-800" style={{ width }}>
      <div
        data-role="fill"
        className={`absolute left-0 top-0 bottom-0 rounded-sm ${FILL_CLASS[severity]}`}
        style={{ width: `${pct}%` }}
      />
      {thresholdPct != null && (
        <div
          data-role="threshold"
          className="absolute -top-0.5 -bottom-0.5 w-[2px] bg-slate-200/70"
          style={{ left: `${thresholdPct}%` }}
        />
      )}
    </div>
  );
}
