import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CommanderFightData, VerdictChip } from '../../shared/commanderTypes';
import { normalizeMapLabel } from '../stats/utils/labelUtils';

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
    <div
      className="flex flex-col gap-2 px-3 py-2.5 border rounded-md mb-3"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-lg font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
              {normalizeMapLabel(fight.map)}
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escClose);
    function escClose(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', escClose);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0" style={{ minWidth: '200px' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 border text-xs rounded pl-2.5 pr-2 py-1.5 cursor-pointer transition-colors"
        style={{
          background: 'var(--bg-input)',
          borderColor: open ? 'var(--brand-primary)' : 'var(--border-default)',
          color: 'var(--text-primary)',
        }}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--text-secondary)' }}
        />
      </button>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-y-auto border rounded shadow-lg"
          style={{
            background: 'var(--bg-card)',
            borderColor: 'var(--border-default)',
            boxShadow: 'var(--shadow-dropdown)',
            minWidth: '100%',
          }}
        >
          {options.map((opt) => {
            const isSelected = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => { onChange(opt.id); setOpen(false); }}
                className="block w-full text-left text-xs px-2.5 py-1.5 transition-colors whitespace-nowrap"
                style={{
                  background: isSelected ? 'var(--accent-bg)' : 'transparent',
                  color: isSelected ? 'var(--brand-primary)' : 'var(--text-primary)',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
