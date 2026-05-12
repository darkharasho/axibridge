import { MetricCard } from './MetricCard';
import { DivergingBar } from '../viz/DivergingBar';
import { Donut } from '../viz/Donut';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

function fmtBigNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${Math.round(n)}`;
}

export function SustainSection({ fight, thresholds }: { fight: CommanderFightData; thresholds: CommanderThresholds }) {
  const s = fight.sustain;
  const cleanseNet = s.cleansesApplied - s.conditionsTaken;
  const cleanseSev: 'green' | 'yellow' | 'red' =
    cleanseNet >= 0 ? 'green' : cleanseNet >= thresholds.cleanseDeficitWarn ? 'yellow' : 'red';
  const stripNet = s.stripsLanded - s.stripsReceived;
  const stripSev: 'green' | 'yellow' | 'red' =
    stripNet >= 0 ? 'green' : -stripNet < thresholds.stripDeficitWarn ? 'yellow' : 'red';
  const stabSev: 'green' | 'yellow' | 'red' =
    s.stabThroughBombs >= thresholds.stabGoodEngage
      ? 'green'
      : s.stabThroughBombs >= thresholds.stabBadInBomb
      ? 'yellow'
      : 'red';
  const resSev: 'green' | 'yellow' | 'red' = s.resistanceAtBurst >= 0.5 ? 'green' : s.resistanceAtBurst >= 0.25 ? 'yellow' : 'red';
  const aegisSev: 'green' | 'yellow' | 'red' = s.aegisAtBurst >= 0.5 ? 'green' : s.aegisAtBurst >= 0.25 ? 'yellow' : 'red';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <MetricCard
        label="Cleanse net"
        value={`${cleanseNet >= 0 ? '+' : ''}${cleanseNet}`}
        meta={`${fmtBigNum(s.cleansesApplied)} / ${fmtBigNum(s.conditionsTaken)}`}
        severity={cleanseSev}
      >
        <DivergingBar positive={s.cleansesApplied} negative={s.conditionsTaken} />
      </MetricCard>
      <MetricCard
        label="Strip net"
        value={`${stripNet >= 0 ? '+' : ''}${stripNet}`}
        meta={`${fmtBigNum(s.stripsLanded)} / ${fmtBigNum(s.stripsReceived)}`}
        severity={stripSev}
      >
        <DivergingBar positive={s.stripsLanded} negative={s.stripsReceived} />
      </MetricCard>
      <MetricCard
        label="Stab thru bombs"
        value={`${Math.round(s.stabThroughBombs * 100)}%`}
        meta=""
        severity={stabSev}
      >
        <Donut pct={s.stabThroughBombs} color={stabSev} />
      </MetricCard>
      <MetricCard
        label="Resistance at burst"
        value={`${Math.round(s.resistanceAtBurst * 100)}%`}
        meta=""
        severity={resSev}
      >
        <Donut pct={s.resistanceAtBurst} color={resSev} />
      </MetricCard>
      <MetricCard
        label="Aegis at burst"
        value={`${Math.round(s.aegisAtBurst * 100)}%`}
        meta=""
        severity={aegisSev}
      >
        <Donut pct={s.aegisAtBurst} color={aegisSev} />
      </MetricCard>
    </div>
  );
}
