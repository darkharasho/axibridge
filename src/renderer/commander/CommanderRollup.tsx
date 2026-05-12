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
    <div className="grid grid-cols-6 gap-2 px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-md mb-3">
      <Item label="Tonight" value={`${rollup.fightCount} fights`} sub={fmtDur(rollup.spanMs / 1000)} />
      <Item label="K / D" value={`${rollup.kills} / ${rollup.squadDeaths}`} sub={`${rollup.ratio.toFixed(2)} ratio`} />
      <Item label="Squad alive avg" value={`${Math.round(rollup.squadAliveAvgPct * 100)}%`} sub="across loaded fights" />
      <Item label="Avg duration" value={fmtMinSec(rollup.avgDurationSec)} sub="" />
      <Item label="Outnumbered" value={`${rollup.outnumberedCount} / ${rollup.fightCount}`} sub="" />
      <div className="flex flex-col gap-0.5">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">Trend</div>
        {rollup.alivePctSeries.length >= 2 ? (
          <Sparkline series={rollup.alivePctSeries} color="red" width={100} height={24} />
        ) : (
          <div className="text-[11px] text-slate-500 italic">need 2+ fights</div>
        )}
      </div>
    </div>
  );
}

function Item({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-[15px] font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
