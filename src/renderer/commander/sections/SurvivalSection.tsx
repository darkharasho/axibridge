import { MetricCard } from './MetricCard';
import { StackedCountBar } from '../viz/StackedCountBar';
import { MiniTimeline } from '../viz/MiniTimeline';
import { Donut } from '../viz/Donut';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

function fmtTSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SurvivalSection({ fight, thresholds }: { fight: CommanderFightData; thresholds: CommanderThresholds }) {
  const s = fight.survival;
  const aliveFrac = s.squadAliveAtEnd / Math.max(1, s.squadTotal);

  const firstDeathSev: 'green' | 'yellow' | 'red' = s.firstSquadDeath
    ? s.firstSquadDeath.tSec < thresholds.firstDeathMinSec
      ? 'red'
      : 'yellow'
    : 'green';

  const firstSupportSev: 'green' | 'yellow' | 'red' = s.firstSupportDeath
    ? s.firstSupportDeath.tSec < thresholds.firstDeathMinSec
      ? 'red'
      : 'yellow'
    : 'green';

  const aliveSev: 'green' | 'yellow' | 'red' = aliveFrac >= 0.8 ? 'green' : aliveFrac >= 0.5 ? 'yellow' : 'red';
  const rallySev: 'green' | 'yellow' | 'red' = s.rallyRate >= thresholds.rallyGood ? 'green' : s.rallyRate >= 0.3 ? 'yellow' : 'red';

  const deathMarkers = fight.series.deathsTimeline.map((d) => ({
    tSec: d.tSec,
    color: (d.role === 'support' ? 'red' : 'yellow') as 'red' | 'yellow',
    label: `${d.account} ${d.profession}`,
  }));

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <MetricCard
        label="First squad death"
        value={s.firstSquadDeath ? fmtTSec(s.firstSquadDeath.tSec) : '—'}
        meta={s.firstSquadDeath ? `${s.firstSquadDeath.account} (${s.firstSquadDeath.profession})` : 'no deaths'}
        severity={firstDeathSev}
      />
      <MetricCard
        label="First support death"
        value={s.firstSupportDeath ? fmtTSec(s.firstSupportDeath.tSec) : '—'}
        meta={s.firstSupportDeath ? `${s.firstSupportDeath.account} (${s.firstSupportDeath.profession})` : '—'}
        severity={firstSupportSev}
      />
      <MetricCard
        label="Squad alive at end"
        value={`${s.squadAliveAtEnd}/${s.squadTotal}`}
        meta={`${Math.round(aliveFrac * 100)}%`}
        severity={aliveSev}
      >
        <StackedCountBar alive={s.squadAliveAtEnd} dead={Math.max(0, s.squadTotal - s.squadAliveAtEnd)} />
      </MetricCard>
      <MetricCard
        label="Rally rate"
        value={`${Math.round(s.rallyRate * 100)}%`}
        meta={`${s.rallies}/${s.downs} downs`}
        severity={rallySev}
      >
        <Donut pct={s.rallyRate} color={rallySev} />
      </MetricCard>
      <MetricCard
        label="Deaths timeline"
        value={`${fight.series.deathsTimeline.length}`}
        meta={s.avgTimeDownedSec > 0 ? `${s.avgTimeDownedSec.toFixed(1)}s avg down` : ''}
        severity={fight.series.deathsTimeline.length > 0 ? 'yellow' : 'green'}
      >
        <MiniTimeline duration={Math.max(1, fight.duration)} markers={deathMarkers} />
      </MetricCard>
    </div>
  );
}
