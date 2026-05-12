import type { DetectorFinding } from './detectors/types';
import { VizRouter } from './viz/VizRouter';

export function InsightCard({ finding }: { finding: DetectorFinding }) {
  const borderColor = finding.side === 'good' ? 'border-l-emerald-500' : 'border-l-rose-500';
  return (
    <div className={`grid grid-cols-[1fr_110px] gap-2.5 items-center rounded-md bg-slate-900 border-l-4 ${borderColor} p-2.5 mb-2`}>
      <div>
        <div className="text-sm text-slate-200 font-medium mb-0.5">{finding.headline}</div>
        <div className="text-[11px] text-slate-400 font-mono">{finding.evidence}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">{finding.threshold}</div>
      </div>
      <div className="flex items-center justify-center">
        <VizRouter kind={finding.vizKind} data={finding.vizData} side={finding.side} />
      </div>
    </div>
  );
}
