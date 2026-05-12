import type { DetectorFinding } from './detectors/types';
import { VizRouter } from './viz/VizRouter';

export function InsightCard({ finding }: { finding: DetectorFinding }) {
  const borderColor = finding.side === 'good' ? 'border-l-emerald-500' : 'border-l-rose-500';
  return (
    <div
      className={`grid grid-cols-[1fr_110px] gap-2.5 items-center rounded-md border-l-4 ${borderColor} p-2.5 mb-2`}
      style={{ background: 'var(--bg-card-inner)' }}
    >
      <div>
        <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>{finding.headline}</div>
        <div className="text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>{finding.evidence}</div>
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{finding.threshold}</div>
      </div>
      <div className="flex items-center justify-center">
        <VizRouter kind={finding.vizKind} data={finding.vizData} side={finding.side} />
      </div>
    </div>
  );
}
