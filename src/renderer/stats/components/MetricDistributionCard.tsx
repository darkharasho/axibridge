// src/renderer/stats/components/MetricDistributionCard.tsx
import React from 'react';
import { computeSquadStat, type SquadStatPlayer } from '../../../shared/squadStats';

export interface MetricDistributionCardProps {
  title: string;
  accentColor: string;
  higherIsBetter: boolean;
  players: SquadStatPlayer[];
  formatValue: (n: number) => string;
  unit?: string;
  renderProfessionIcon?: (
    profession: string,
    professionList: string[] | undefined,
    className: string,
  ) => React.ReactNode;
}

export const MetricDistributionCard: React.FC<MetricDistributionCardProps> = ({
  title,
  accentColor,
  higherIsBetter,
  players,
  formatValue,
  unit = '',
  renderProfessionIcon,
}) => {
  const s = computeSquadStat(players, higherIsBetter);
  const range = s.max - s.min;
  const pos = (v: number) => (range > 0 ? ((v - s.min) / range) * 100 : 50);
  const outlierKeys = new Set(s.needsImprovementOutliers.map((p) => p.account));

  // σ band as a fraction of the plotted range, centered on the mean
  const bandLeft = range > 0 ? Math.max(0, ((s.mean - s.stdDev - s.min) / range) * 100) : 0;
  const bandRight = range > 0 ? Math.min(100, ((s.mean + s.stdDev - s.min) / range) * 100) : 100;

  return (
    <div
      className="border rounded-[var(--radius-md)] p-4 flex flex-col gap-3"
      style={{ borderColor: 'var(--border-default)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div
          className="text-xs font-bold uppercase tracking-wider truncate"
          style={{ color: 'var(--text-secondary)' }}
        >
          {title}
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">{s.count} players</div>
      </div>

      {/* Hard numbers */}
      <div className="flex items-end gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">Avg</div>
          <div data-testid="metric-card-mean" className="text-2xl font-bold text-white">
            {formatValue(s.mean)} <span className="text-sm font-normal text-[color:var(--text-secondary)]">{unit}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">σ Deviation</div>
          <div data-testid="metric-card-stddev" className="text-lg font-semibold text-[color:var(--text-secondary)]">
            {formatValue(s.stdDev)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">Range</div>
          <div className="text-sm text-[color:var(--text-secondary)]">
            {formatValue(s.min)}–{formatValue(s.max)}
          </div>
        </div>
      </div>

      {/* Dot-plot: every player a neutral dot; σ band shaded; mean line. */}
      <div className="relative h-8 mt-1">
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full"
          style={{ left: `${bandLeft}%`, width: `${Math.max(0, bandRight - bandLeft)}%`, background: `${accentColor}22` }}
        />
        <div
          className="absolute top-0 bottom-0 w-px"
          style={{ left: `${pos(s.mean)}%`, background: 'var(--border-hover)' }}
        />
        {s.players.map((p) => (
          <div
            key={p.account}
            title={`${p.account}: ${formatValue(p.value)}`}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
            style={{
              left: `${pos(p.value)}%`,
              background: outlierKeys.has(p.account) ? accentColor : 'var(--text-muted)',
              outline: outlierKeys.has(p.account) ? `1px solid ${accentColor}` : 'none',
            }}
          />
        ))}
      </div>

      {/* Needs-improvement callouts (neutral language, low/bad end only) */}
      <div
        data-testid="metric-card-outliers"
        className="border-t border-[color:var(--border-subtle)] pt-2 text-xs text-[color:var(--text-secondary)]"
      >
        {s.needsImprovementOutliers.length ? (
          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">
              Most room to improve
            </div>
            {s.needsImprovementOutliers.map((p) => (
              <div key={p.account} className="flex items-center gap-2 min-w-0">
                {renderProfessionIcon?.(p.profession || 'Unknown', p.professionList, 'w-4 h-4')}
                <span className="truncate flex-1">{p.account}</span>
                <span className="font-mono text-[color:var(--text-secondary)]">{formatValue(p.value)}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[color:var(--text-muted)]">Squad is consistent here.</span>
        )}
      </div>
    </div>
  );
};
