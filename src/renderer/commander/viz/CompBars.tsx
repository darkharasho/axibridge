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
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border leading-none"
            style={{
              backgroundColor: hexToRgba(color, 0.18),
              borderColor: hexToRgba(color, 0.45),
              color: color,
            }}
            title={`${entry.profession}: ${entry.count}`}
          >
            <span>{getProfessionAbbrev(entry.profession)}</span>
            <span style={{ color: 'var(--text-primary)' }}>{entry.count}</span>
          </span>
        );
      })}
      {remainder > 0 && (
        <span
          data-role="comp-bar-more"
          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded-sm border leading-none"
          style={{
            background: 'var(--bg-card-inner)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-secondary)',
          }}
        >
          +{remainder}
        </span>
      )}
    </div>
  );
}
