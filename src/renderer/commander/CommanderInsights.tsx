import { InsightCard } from './InsightCard';
import { topFindings } from './detectors';
import type { DetectorFinding } from './detectors/types';

export function CommanderInsights({ findings }: { findings: DetectorFinding[] }) {
  const good = topFindings(findings, 'good', 4);
  const bad  = topFindings(findings, 'bad',  4);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
      <Column title="What went right" tone="good" findings={good} />
      <Column title="Could've gone better" tone="bad" findings={bad} />
    </div>
  );
}

function Column({ title, tone, findings }: { title: string; tone: 'good' | 'bad'; findings: DetectorFinding[] }) {
  const titleColor = tone === 'good' ? 'text-emerald-400' : 'text-rose-400';
  const emptyMsg = tone === 'good'
    ? 'No standout wins this fight — the detectors look for big damage trades, kept-pace cleanses, low casualties, and surviving bombs.'
    : 'No major failures detected — first-death timing, bomb survival, condi/strip races, and squad cohesion all came in inside thresholds.';
  return (
    <section
      className="rounded-md border p-3"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}
    >
      <div className={`text-[12px] uppercase tracking-[0.06em] mb-2 ${titleColor}`}>{title}</div>
      {findings.length === 0
        ? <div className="text-[11px] italic leading-snug" style={{ color: 'var(--text-muted)' }}>{emptyMsg}</div>
        : findings.map(f => <InsightCard key={f.id} finding={f} />)}
    </section>
  );
}
