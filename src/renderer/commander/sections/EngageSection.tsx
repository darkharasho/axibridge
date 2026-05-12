import { MetricCard } from './MetricCard';
import { Donut } from '../viz/Donut';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

const DODGE_LABEL: Record<'low' | 'med' | 'high', string> = {
  low: 'low',
  med: 'med',
  high: 'high',
};

const DODGE_SEV: Record<'low' | 'med' | 'high', 'green' | 'yellow' | 'red'> = {
  low: 'green',
  med: 'yellow',
  high: 'red',
};

export function EngageSection({ fight, thresholds }: { fight: CommanderFightData; thresholds: CommanderThresholds }) {
  const e = fight.engage;
  const hpSev: 'green' | 'yellow' | 'red' = e.squadHpAtEngage >= 0.9 ? 'green' : e.squadHpAtEngage >= 0.7 ? 'yellow' : 'red';
  const cdSev: 'green' | 'yellow' | 'red' = e.keyCdsUsed0to10s >= 0.7 ? 'green' : e.keyCdsUsed0to10s >= 0.4 ? 'yellow' : 'red';
  const preEngageSev: 'green' | 'yellow' | 'red' = e.preEngageDowns === 0 ? 'green' : e.preEngageDowns <= 1 ? 'yellow' : 'red';
  const stabSev: 'green' | 'yellow' | 'red' =
    e.stab0to10s >= thresholds.stabGoodEngage
      ? 'green'
      : e.stab0to10s >= thresholds.stabBadInBomb
      ? 'yellow'
      : 'red';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <MetricCard
        label="Squad HP at engage"
        value={`${Math.round(e.squadHpAtEngage * 100)}%`}
        meta=""
        severity={hpSev}
      >
        <Donut pct={e.squadHpAtEngage} color={hpSev} />
      </MetricCard>
      <MetricCard
        label="Key CDs 0–10s"
        value={`${Math.round(e.keyCdsUsed0to10s * 100)}%`}
        meta="stab/heal/CC"
        severity={cdSev}
      >
        <Donut pct={e.keyCdsUsed0to10s} color={cdSev} />
      </MetricCard>
      <MetricCard
        label="Pre-engage downs"
        value={`${e.preEngageDowns}`}
        meta=""
        severity={preEngageSev}
      />
      <MetricCard
        label="Stab 0–10s"
        value={`${Math.round(e.stab0to10s * 100)}%`}
        meta=""
        severity={stabSev}
      >
        <Donut pct={e.stab0to10s} color={stabSev} />
      </MetricCard>
      <MetricCard
        label="Dodge starvation"
        value={DODGE_LABEL[e.dodgeStarvation]}
        meta="heuristic"
        severity={DODGE_SEV[e.dodgeStarvation]}
      />
    </div>
  );
}
