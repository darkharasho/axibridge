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
        description="How far the squad sat from tag on average — bigger numbers mean spread out."
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
        description="How long the squad was spread too wide for boons and heals to reach everyone."
        meta={`${Math.round(100 * c.timeSpread900PlusSec / Math.max(1, fight.duration))}% of fight`}
        severity={timeSpreadSev}
      >
        <ThresholdBar value={c.timeSpread900PlusSec} max={Math.max(1, fight.duration)} severity={timeSpreadSev} />
      </MetricCard>
      <MetricCard
        label="Avg dist at death"
        value={`${Math.round(c.avgDistAtDeath)}u`}
        description="How far from tag squad members were when they died — high means caught out."
        meta=""
        severity={deathDistSev}
      />
      <MetricCard
        label="Peak spread σ"
        value={`${Math.round(c.peakSpreadStdev)}u`}
        description="The most spread-out the squad ever got during the fight."
        meta={`at ${fmtTSec(c.peakSpreadStdevTSec)}`}
        severity={spreadSev}
      >
        <Sparkline series={fight.series.spreadStdev} color={spreadSev === 'red' ? 'red' : spreadSev === 'yellow' ? 'amber' : 'green'} width={100} height={24} />
      </MetricCard>
      <MetricCard
        label="Stragglers at bomb"
        value={`${c.stragglersAtBomb}`}
        description="How many were way out of range of tag when the bomb dropped on you."
        meta=">1500u from tag"
        severity={stragglersSev}
      />
      <MetricCard
        label="Not in the fight"
        value={`${c.detachedMembers}`}
        description="Squad members who spent the whole fight somewhere else on the map. They're left out of every number in this section — one of them would otherwise decide all of them."
        meta="never within 5000u"
        severity={c.detachedMembers === 0 ? 'green' : 'yellow'}
      />
    </div>
  );
}
