import { Sparkline } from './viz/Sparkline';
import type { CommanderRollup } from './hooks/useCommanderRollup';

function fmtDur(sec: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtMinSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CommanderRollup({ rollup }: { rollup: CommanderRollup | null }) {
  if (!rollup) return null;
  return (
    <div
      className="grid grid-cols-6 gap-2 axi-well axi-well--sm [--axi-well-pad:10px_12px] mb-3"
      style={{ background: 'var(--axi-surface-paint)', borderColor: 'var(--axi-ink-line)' }}
    >
      <Item label="Tonight" value={`${rollup.fightCount} fights`} sub={fmtDur(rollup.spanMs / 1000)} />
      <Item label="K / D" value={`${rollup.kills} / ${rollup.squadDeaths}`} sub={`${rollup.ratio.toFixed(2)} ratio`} />
      <Item label="Squad alive avg" value={`${Math.round(rollup.squadAliveAvgPct * 100)}%`} sub="across loaded fights" />
      <Item label="Avg duration" value={fmtMinSec(rollup.avgDurationSec)} sub="" />
      <Item label="Outnumbered" value={`${rollup.outnumberedCount} / ${rollup.fightCount}`} sub="" />
      <div className="flex flex-col gap-0.5">
        <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--axi-text-faint)' }} title="Squad alive % at the end of each fight, oldest → newest">
          Squad alive % over fights
        </div>
        {rollup.alivePctSeries.length >= 2 ? (
          <div className="flex items-center gap-1.5">
            <Sparkline series={rollup.alivePctSeries} color="red" width={80} height={20} />
            <span className="text-[11px] font-mono" style={{ color: 'var(--axi-text-dim)' }}>
              {Math.round(rollup.alivePctSeries[0] * 100)}%
              <span style={{ color: 'var(--axi-text-faint)' }}> → </span>
              {Math.round(rollup.alivePctSeries[rollup.alivePctSeries.length - 1] * 100)}%
            </span>
          </div>
        ) : (
          <div className="text-[11px] italic" style={{ color: 'var(--axi-text-faint)' }}>need 2+ fights</div>
        )}
      </div>
    </div>
  );
}

function Item({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--axi-text-faint)' }}>{label}</div>
      <div className="text-[15px] font-semibold" style={{ color: 'var(--axi-text)' }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: 'var(--axi-text-dim)' }}>{sub}</div>}
    </div>
  );
}
