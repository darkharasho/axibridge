import { MetricCard } from './MetricCard';
import { ThresholdBar } from '../viz/ThresholdBar';
import { Sparkline } from '../viz/Sparkline';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

function fmtTSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CohesionSection({ fight, thresholds }: { fight: CommanderFightData; thresholds: CommanderThresholds }) {
  const c = fight.cohesion;
  const avgDistSev: 'green' | 'yellow' | 'red' =
    c.avgDistFromTag <= thresholds.tagRadius
      ? 'green'
      : c.avgDistFromTag <= thresholds.spreadBad
      ? 'yellow'
      : 'red';
  const spreadSev: 'green' | 'yellow' | 'red' =
    c.peakSpreadStdev <= thresholds.spreadBad
      ? 'green'
      : c.peakSpreadStdev <= thresholds.spreadBad * 1.5
      ? 'yellow'
      : 'red';
  const deathDistSev: 'green' | 'yellow' | 'red' =
    c.avgDistAtDeath <= thresholds.caughtOutDist
      ? 'green'
      : c.avgDistAtDeath <= thresholds.caughtOutDist * 1.5
      ? 'yellow'
      : 'red';
  const stragglersSev: 'green' | 'yellow' | 'red' = c.stragglersAtBomb === 0 ? 'green' : c.stragglersAtBomb <= 2 ? 'yellow' : 'red';
  const timeSpreadSev: 'green' | 'yellow' | 'red' =
    c.timeSpread900PlusSec <= fight.duration * 0.1
      ? 'green'
      : c.timeSpread900PlusSec <= fight.duration * 0.3
      ? 'yellow'
      : 'red';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <MetricCard
        label="Avg dist from tag"
        value={`${Math.round(c.avgDistFromTag)}u`}
        meta={`tag bubble ${thresholds.tagRadius}u`}
        severity={avgDistSev}
      >
        <ThresholdBar
          value={c.avgDistFromTag}
          max={Math.max(thresholds.spreadBad * 2, c.avgDistFromTag)}
          threshold={thresholds.tagRadius}
          severity={avgDistSev}
        />
      </MetricCard>
      <MetricCard
        label="Time spread >900u"
        value={fmtTSec(c.timeSpread900PlusSec)}
        meta={`${Math.round(100 * c.timeSpread900PlusSec / Math.max(1, fight.duration))}% of fight`}
        severity={timeSpreadSev}
      >
        <ThresholdBar value={c.timeSpread900PlusSec} max={Math.max(1, fight.duration)} severity={timeSpreadSev} />
      </MetricCard>
      <MetricCard
        label="Avg dist at death"
        value={`${Math.round(c.avgDistAtDeath)}u`}
        meta=""
        severity={deathDistSev}
      />
      <MetricCard
        label="Peak spread σ"
        value={`${Math.round(c.peakSpreadStdev)}u`}
        meta={`at ${fmtTSec(c.peakSpreadStdevTSec)}`}
        severity={spreadSev}
      >
        <Sparkline series={fight.series.spreadStdev} color={spreadSev === 'red' ? 'red' : spreadSev === 'yellow' ? 'amber' : 'green'} width={100} height={24} />
      </MetricCard>
      <MetricCard
        label="Stragglers at bomb"
        value={`${c.stragglersAtBomb}`}
        meta=">1500u from tag"
        severity={stragglersSev}
      />
    </div>
  );
}
