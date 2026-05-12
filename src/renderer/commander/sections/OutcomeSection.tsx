import { MetricCard } from './MetricCard';
import { DivergingBar } from '../viz/DivergingBar';
import { StackedCountBar } from '../viz/StackedCountBar';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

function fmtBigNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${Math.round(n)}`;
}

export function OutcomeSection({ fight }: { fight: CommanderFightData; thresholds: CommanderThresholds }) {
  const o = fight.outcome;
  const tradeSev: 'green' | 'yellow' | 'red' = o.netTrade > 0 ? 'green' : o.netTrade === 0 ? 'yellow' : 'red';
  const dmgSev: 'green' | 'yellow' | 'red' = o.damageOutInRatio >= 1.2 ? 'green' : o.damageOutInRatio >= 0.8 ? 'yellow' : 'red';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <MetricCard label="Kills" value={`${o.kills}`} meta="enemy downs" severity={o.kills > 0 ? 'green' : 'yellow'} />
      <MetricCard label="Squad deaths" value={`${o.squadDeaths}`} meta="" severity={o.squadDeaths === 0 ? 'green' : 'red'} />
      <MetricCard label="Ally deaths" value={`${o.allyDeaths}`} meta="" severity={o.allyDeaths === 0 ? 'green' : 'yellow'}>
        <StackedCountBar alive={0} dead={o.allyDeaths} />
      </MetricCard>
      <MetricCard
        label="Net trade"
        value={`${o.netTrade >= 0 ? '+' : ''}${o.netTrade}`}
        meta="kills − squad deaths"
        severity={tradeSev}
      />
      <MetricCard
        label="Damage out / in"
        value={`${o.damageOutInRatio.toFixed(2)}×`}
        meta={`${fmtBigNum(o.damageOut)} / ${fmtBigNum(o.damageIn)}`}
        severity={dmgSev}
      >
        <DivergingBar positive={o.damageOut} negative={o.damageIn} />
      </MetricCard>
    </div>
  );
}
