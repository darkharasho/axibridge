import { getProfessionColor, getProfessionAbbrev, hexToRgba } from '../../../shared/professionUtils';

interface CompBarsProps {
  comp: Array<{ profession: string; count: number }>;
  maxChips?: number;
}

export function CompBars({ comp, maxChips = 8 }: CompBarsProps) {
  const sorted = [...comp].sort((a, b) => b.count - a.count);
  const visible = sorted.slice(0, maxChips);
  const remainder = sorted.slice(maxChips).reduce((acc, c) => acc + c.count, 0);

  return (
    <div className="flex flex-wrap gap-1" data-role="comp-bars">
      {visible.map((entry) => {
        const color = getProfessionColor(entry.profession);
        return (
          <span
            key={entry.profession}
            data-role="comp-bar"
            data-profession={entry.profession}
            className="axi-chip gap-1 leading-none"
            style={{
              backgroundColor: hexToRgba(color, 0.18),
              borderColor: hexToRgba(color, 0.45),
              color: color,
            }}
            title={`${entry.profession}: ${entry.count}`}
          >
            <span>{getProfessionAbbrev(entry.profession)}</span>
            <span style={{ color: 'var(--axi-text)' }}>{entry.count}</span>
          </span>
        );
      })}
      {remainder > 0 && (
        <span
          data-role="comp-bar-more"
          className="axi-chip leading-none"
          style={{
            background: 'var(--axi-ground)',
            borderColor: 'var(--axi-ink-line)',
            color: 'var(--axi-text-dim)',
          }}
        >
          +{remainder}
        </span>
      )}
    </div>
  );
}
