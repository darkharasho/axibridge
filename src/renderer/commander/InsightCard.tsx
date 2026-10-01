import type { DetectorFinding } from './detectors/types';
import { VizRouter } from './viz/VizRouter';

export function InsightCard({ finding }: { finding: DetectorFinding }) {
  return (
    <div
      data-side={finding.side}
      data-status={finding.side === 'good' ? 'ok' : 'danger'}
      className="insight-card axi-panel axi-panel--tile [--axi-panel-pad:10px] grid grid-cols-[1fr_110px] gap-2.5 items-center mb-2"
    >
      <div>
        <div className="text-sm font-medium mb-0.5" style={{ color: 'var(--axi-text)' }}>{finding.headline}</div>
        <div className="text-[11px] font-mono" style={{ color: 'var(--axi-text-dim)' }}>{finding.evidence}</div>
        <div className="text-[10px] mt-0.5" style={{ color: 'var(--axi-text-faint)' }}>{finding.threshold}</div>
      </div>
      <div className="flex items-center justify-center">
        <VizRouter kind={finding.vizKind} data={finding.vizData} />
      </div>
    </div>
  );
}
