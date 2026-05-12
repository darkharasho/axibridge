import type { ReactNode } from 'react';
import type { Severity } from '../viz/ThresholdBar';

interface MetricCardProps {
  label: string;
  value: string;
  description?: string;
  meta?: string;
  severity: Severity;
  children?: ReactNode;
}

const STRIPE: Record<Severity, string> = {
  green:  'border-l-emerald-500',
  yellow: 'border-l-amber-500',
  red:    'border-l-rose-500',
};

export function MetricCard({ label, value, description, meta, severity, children }: MetricCardProps) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-md border border-l-4 ${STRIPE[severity]} px-2.5 py-2 min-h-[108px]`}
      style={{
        background: 'var(--bg-card)',
        borderTopColor: 'var(--border-default)',
        borderRightColor: 'var(--border-default)',
        borderBottomColor: 'var(--border-default)',
      }}
    >
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="text-[17px] font-semibold leading-tight text-right" style={{ color: 'var(--text-primary)' }}>{value}</span>
      </div>
      {description && (
        <div className="text-[10px] italic leading-snug" style={{ color: 'var(--text-muted)' }}>{description}</div>
      )}
      {meta && <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{meta}</div>}
      {children && <div className="mt-auto">{children}</div>}
    </div>
  );
}
