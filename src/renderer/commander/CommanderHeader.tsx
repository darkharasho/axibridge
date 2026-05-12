import type { CommanderFightData, VerdictChip } from '../../shared/commanderTypes';

interface CommanderHeaderProps {
  fight: CommanderFightData;
  availableFights: Array<{ id: string; label: string }>;
  selectedFightId: string;
  onSelectFight: (id: string) => void;
}

const CHIP_STYLE: Record<VerdictChip, string> = {
  'wipe':          'bg-rose-500/15 text-rose-300 border-rose-500/35',
  'trade':         'bg-amber-500/15 text-amber-300 border-amber-500/35',
  'carry':         'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  'clean':         'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  'outnumbered':   'bg-amber-500/15 text-amber-300 border-amber-500/35',
  'caught-engage': 'bg-violet-500/15 text-violet-300 border-violet-500/35',
  'caught-out':    'bg-violet-500/15 text-violet-300 border-violet-500/35',
  'bomb-broke-us': 'bg-rose-500/15 text-rose-300 border-rose-500/35',
};

function fmtTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CommanderHeader({ fight, availableFights, selectedFightId, onSelectFight }: CommanderHeaderProps) {
  const m = fight.matchup;
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-md mb-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-slate-100 leading-none">{fight.map || 'Fight'}</h2>
          <span className="text-xs text-slate-400">{fmtTime(fight.startedAt)} · {fmtDuration(fight.duration)}</span>
        </div>
        {availableFights.length > 1 && (
          <select
            value={selectedFightId}
            onChange={(e) => onSelectFight(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded px-2 py-1"
          >
            {availableFights.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        )}
      </div>
      <div className="text-[12px] text-slate-300">
        Squad {m.squadCount} + Allies {m.alliesCount} vs Enemy ~{m.enemyCount} (peak {m.enemyPeak})
      </div>
      {fight.verdictChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {fight.verdictChips.map((chip) => (
            <span
              key={chip}
              className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-sm border ${CHIP_STYLE[chip]}`}
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
