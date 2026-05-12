import { MetricCard } from './MetricCard';
import { ThresholdBar } from '../viz/ThresholdBar';
import { CompBars } from '../viz/CompBars';
import { TagBubble } from '../viz/TagBubble';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

function durStr(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function severityForRatio(ratio: number, outnumberedRatio: number): 'green' | 'yellow' | 'red' {
  if (ratio >= 1.0) return 'green';
  if (ratio >= outnumberedRatio) return 'yellow';
  return 'red';
}

export function MatchupSection({ fight, thresholds }: { fight: CommanderFightData; thresholds: CommanderThresholds }) {
  const m = fight.matchup;
  const ratioSev = severityForRatio(m.effectiveRatio, thresholds.outnumberedRatio);
  const outPct = Math.round(100 * m.timeOutnumberedSec / Math.max(1, fight.duration));
  const tagPct = m.inTagBubbleAtEngage / Math.max(1, m.squadCount);
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <MetricCard
        label="Sq / Ally / Enemy"
        value={
          <span>
            <span style={{ color: 'rgb(110, 231, 183)' }}>{m.squadCount}</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'rgb(252, 211, 77)' }}>{m.alliesCount}</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'rgb(253, 164, 175)' }}>{m.enemyCount}</span>
          </span>
        }
        description="Bodies on the field: your squad, pugs fighting with you, and enemies."
        meta={`peak enemy ${m.enemyPeak}`}
        severity={ratioSev}
      />
      <MetricCard
        label="Effective ratio"
        value={`${m.effectiveRatio.toFixed(2)}×`}
        description="Squad plus allies divided by enemies — under 1× means you were outnumbered."
        meta="(sq+ally) / enemy"
        severity={ratioSev}
      >
        <ThresholdBar value={m.effectiveRatio} max={2} threshold={1} severity={ratioSev} />
      </MetricCard>
      <MetricCard
        label="Time outnumbered"
        value={durStr(m.timeOutnumberedSec)}
        description="How long you were outmanned during the fight."
        meta={`${outPct}% of fight`}
        severity={m.timeOutnumberedSec > fight.duration * 0.5 ? 'red' : m.timeOutnumberedSec > 0 ? 'yellow' : 'green'}
      >
        <ThresholdBar value={m.timeOutnumberedSec} max={Math.max(1, fight.duration)} severity={'red'} />
      </MetricCard>
      <MetricCard
        label="Enemy comp"
        value={m.enemyComp.slice(0, 2).map((e) => `${e.count}${e.profession[0] ?? '?'}`).join(' · ') || '—'}
        description="What the enemy group was running — top professions stacked."
        meta=""
        severity="yellow"
      >
        <CompBars comp={m.enemyComp} />
      </MetricCard>
      <MetricCard
        label="In tag bubble"
        value={`${m.inTagBubbleAtEngage}/${m.squadCount}`}
        description="How many were stacked on tag when the fight kicked off."
        meta="at engage start"
        severity={tagPct > 0.8 ? 'green' : tagPct > 0.5 ? 'yellow' : 'red'}
      >
        <TagBubble inside={m.inTagBubbleAtEngage} outside={Math.max(0, m.squadCount - m.inTagBubbleAtEngage)} />
      </MetricCard>
    </div>
  );
}
