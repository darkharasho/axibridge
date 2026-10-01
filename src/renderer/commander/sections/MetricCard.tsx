import type { ReactNode } from 'react';
import type { Severity } from '../viz/ThresholdBar';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  description?: string;
  meta?: string;
  severity: Severity;
  children?: ReactNode;
}

/* The verdict is a cap across the head of the tile, in the status ink, drawn
   by the language from `data-status` (rule 5: a full-height stripe is the
   card's frame, and five in a row are five coloured frames). */
const STATUS: Record<Severity, 'ok' | 'warn' | 'danger'> = { green: 'ok', yellow: 'warn', red: 'danger' };

export function MetricCard({ label, value, description, meta, severity, children }: MetricCardProps) {
  return (
    <div
      data-severity={severity}
      data-status={STATUS[severity]}
      className="commander-metric axi-panel axi-panel--tile [--axi-panel-pad:8px_10px] flex flex-col gap-1 min-h-[108px]"
    >
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--axi-text-faint)' }}>{label}</span>
        <span className="text-[17px] font-semibold leading-tight text-right" style={{ color: 'var(--axi-text)' }}>{value}</span>
      </div>
      {description && (
        <div className="text-[10px] italic leading-snug" style={{ color: 'var(--axi-text-faint)' }}>{description}</div>
      )}
      {meta && <div className="text-[10px]" style={{ color: 'var(--axi-text-dim)' }}>{meta}</div>}
      {children && <div className="mt-auto">{children}</div>}
    </div>
  );
}
