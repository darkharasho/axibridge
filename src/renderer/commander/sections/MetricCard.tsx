import type { ReactNode } from 'react';
import type { Severity } from '../viz/ThresholdBar';

interface MetricCardProps {
  label: string;
  value: string;
  meta?: string;
  severity: Severity;
  children?: ReactNode;
}

const STRIPE: Record<Severity, string> = {
  green:  'border-l-emerald-500',
  yellow: 'border-l-amber-500',
  red:    'border-l-rose-500',
};

export function MetricCard({ label, value, meta, severity, children }: MetricCardProps) {
  return (
    <div className={`flex flex-col gap-1 rounded-md bg-slate-900 border border-slate-800 border-l-4 ${STRIPE[severity]} px-2.5 py-2 min-h-[92px]`}>
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-[17px] font-semibold text-slate-100 leading-tight text-right">{value}</span>
      </div>
      {meta && <div className="text-[10px] text-slate-400">{meta}</div>}
      {children && <div className="mt-auto">{children}</div>}
    </div>
  );
}
