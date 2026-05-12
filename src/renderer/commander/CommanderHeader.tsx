import { ChevronDown } from 'lucide-react';
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

/** EI sets fightName to e.g. "World vs World - Green Alpine Borderlands" or
 *  "Detailed WvW - Green Alpine Borderlands". Strip the boilerplate prefix
 *  so the title is just the map. */
function cleanMapName(raw: string): string {
  return raw
    .replace(/^Detailed WvW\s*-\s*/i, '')
    .replace(/^World vs World\s*-\s*/i, '')
    .trim() || 'WvW Fight';
}

export function CommanderHeader({ fight, availableFights, selectedFightId, onSelectFight }: CommanderHeaderProps) {
  const m = fight.matchup;
  return (
    <div
      className="flex flex-col gap-2 px-3 py-2.5 border rounded-md mb-3"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-lg font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
              {cleanMapName(fight.map)}
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {fmtTime(fight.startedAt)} · {fmtDuration(fight.duration)}
            </span>
          </div>
          <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            Squad {m.squadCount} + Allies {m.alliesCount} vs Enemy ~{m.enemyCount} (peak {m.enemyPeak})
          </div>
        </div>
        {availableFights.length > 1 && (
          <FightSelector
            value={selectedFightId}
            options={availableFights}
            onChange={onSelectFight}
          />
        )}
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

function FightSelector({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (id: string) => void;
}) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none border text-xs rounded pl-2.5 pr-7 py-1.5 cursor-pointer transition-colors focus:outline-none"
        style={{
          background: 'var(--bg-input)',
          borderColor: 'var(--border-default)',
          color: 'var(--text-primary)',
          minWidth: '180px',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--brand-primary)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
      >
        {options.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>
      <ChevronDown
        className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
        style={{ color: 'var(--text-secondary)' }}
      />
    </div>
  );
}
