import { MetricCard } from './MetricCard';
import { ThresholdBar } from '../viz/ThresholdBar';
import { DivergingBar } from '../viz/DivergingBar';
import { Donut } from '../viz/Donut';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

function fmtTSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtBigNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${Math.round(n)}`;
}

export function BurstSection({ fight, thresholds }: { fight: CommanderFightData; thresholds: CommanderThresholds }) {
  const b = fight.burst;
  const ratioSev: 'green' | 'yellow' | 'red' =
    b.inHealRatioAtSpike >= thresholds.bombRatio ? 'red' : b.inHealRatioAtSpike >= 1.5 ? 'yellow' : 'green';
  const bombBrokeCount = b.bombWindows.filter((w) => w.outcome === 'broke').length;
  const bombSev: 'green' | 'yellow' | 'red' = bombBrokeCount > 0 ? 'red' : b.bombWindowCount > 0 ? 'yellow' : 'green';
  const stabSev: 'green' | 'yellow' | 'red' =
    b.stabUptimeInSpike >= thresholds.stabGoodEngage
      ? 'green'
      : b.stabUptimeInSpike >= thresholds.stabBadInBomb
      ? 'yellow'
      : 'red';
  const downsSev: 'green' | 'yellow' | 'red' = b.downsInWorst3s === 0 ? 'green' : b.downsInWorst3s <= 2 ? 'yellow' : 'red';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      <MetricCard
        label="Worst 3s incoming"
        value={fmtBigNum(b.worst3sIncoming)}
        meta={`at ${fmtTSec(b.worst3sIncomingTSec)}`}
        severity={ratioSev}
      >
        <ThresholdBar value={b.worst3sIncoming} max={Math.max(1, b.worst3sIncoming)} severity={ratioSev} />
      </MetricCard>
      <MetricCard
        label="In/Heal at spike"
        value={`${b.inHealRatioAtSpike.toFixed(2)}×`}
        meta={`heal ${fmtBigNum(b.healAtSpike)}`}
        severity={ratioSev}
      >
        <DivergingBar positive={Math.max(0, b.healAtSpike)} negative={Math.max(0, b.worst3sIncoming)} />
      </MetricCard>
      <MetricCard
        label="Bomb windows"
        value={`${b.bombWindowCount}`}
        meta={`${bombBrokeCount} broke us`}
        severity={bombSev}
      />
      <MetricCard
        label="Downs in worst 3s"
        value={`${b.downsInWorst3s}`}
        meta=""
        severity={downsSev}
      />
      <MetricCard
        label="Stab in spike"
        value={`${Math.round(b.stabUptimeInSpike * 100)}%`}
        meta="uptime"
        severity={stabSev}
      >
        <Donut pct={b.stabUptimeInSpike} color={stabSev} />
      </MetricCard>
    </div>
  );
}
