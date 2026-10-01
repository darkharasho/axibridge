import { useEffect, useRef, useState } from 'react';
import type { CommanderFightData, VerdictChip } from '../../shared/commanderTypes';
import { normalizeMapLabel } from '../stats/utils/labelUtils';

interface CommanderHeaderProps {
  fight: CommanderFightData;
  fightLabel?: string;
  availableFights: Array<{ id: string; label: string }>;
  selectedFightId: string;
  onSelectFight: (id: string) => void;
}

/* A verdict is a status, and rule 5 says a status is filled: ink text on the
   status colour, which is also what makes eight chips in a row legible at
   the micro size. The caught-* pair is commentary about the fight rather
   than a judgement of it, so it takes the meta chip - the outlined one. */
const CHIP_STYLE: Record<VerdictChip, string> = {
  'wipe':          'axi-chip--danger',
  'trade':         'axi-chip--warn',
  'carry':         'axi-chip--ok',
  'clean':         'axi-chip--ok',
  'outnumbered':   'axi-chip--warn',
  'caught-engage': 'axi-chip--meta',
  'caught-out':    'axi-chip--meta',
  'bomb-broke-us': 'axi-chip--danger',
};

function fmtTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CommanderHeader({ fight, fightLabel, availableFights, selectedFightId, onSelectFight }: CommanderHeaderProps) {
  const m = fight.matchup;
  return (
    <div
      className="commander-panel axi-panel axi-panel--tile [--axi-panel-pad:10px_12px] flex flex-col gap-2 mb-3"
      style={{ background: 'var(--axi-surface-paint)', borderColor: 'var(--axi-ink-line)' }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-lg font-semibold leading-none" style={{ color: 'var(--axi-text)' }}>
              {fightLabel || normalizeMapLabel(fight.map)}
            </h2>
            <span className="text-xs" style={{ color: 'var(--axi-text-dim)' }}>
              {fmtTime(fight.startedAt)} · {fmtDuration(fight.duration)}
            </span>
          </div>
          <div className="text-[12px]" style={{ color: 'var(--axi-text-dim)' }}>
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
              data-verdict={chip}
              className={`commander-chip axi-chip font-semibold ${CHIP_STYLE[chip]}`}
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
        aria-expanded={open}
        className="axi-picker__btn justify-between"
      >
        <span className="truncate">{selected?.label}</span>
      </button>
      {open && (
        <div
          className="app-dropdown axi-panel axi-panel--tile axi-panel--float absolute right-0 top-[calc(100%+4px)] z-20 max-h-72 overflow-y-auto [--axi-panel-pad:0]"
          style={{ minWidth: '100%' }}
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
                  background: isSelected ? 'var(--axi-surface-paint)' : 'transparent',
                  color: isSelected ? 'var(--axi-accent)' : 'var(--axi-text)',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--axi-surface-raised-paint)';
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
