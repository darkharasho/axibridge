import type { VizKind } from '../detectors/types';
import { ThresholdBar } from './ThresholdBar';
import { DivergingBar } from './DivergingBar';
import { Sparkline } from './Sparkline';
import { MiniTimeline } from './MiniTimeline';
import { TagBubble } from './TagBubble';
import { StackedCountBar } from './StackedCountBar';
import { CompBars } from './CompBars';
import { Donut } from './Donut';

interface VizRouterProps {
  kind: VizKind;
  data: unknown;
  side?: 'good' | 'bad';
}

type AnyRecord = Record<string, unknown>;

function pickSeverity(side: 'good' | 'bad' | undefined): 'green' | 'red' {
  return side === 'good' ? 'green' : 'red';
}

function adaptDonut(data: AnyRecord, side: 'good' | 'bad' | undefined) {
  if ('pct' in data) return data;
  const rallied = Number(data.rallied ?? 0);
  const total = Number(data.total ?? 0);
  return {
    pct: total > 0 ? rallied / total : 0,
    color: pickSeverity(side),
    label: `${Math.round(total > 0 ? (rallied / total) * 100 : 0)}%`,
  };
}

function adaptSparkline(data: AnyRecord, side: 'good' | 'bad' | undefined) {
  const baseColor = side === 'good' ? 'green' : 'red';
  // detector shape: { incoming, heal, marker } — two-series overlay
  if ('incoming' in data || 'heal' in data) {
    const marker = data.marker as { tSec?: number; color?: string } | undefined;
    return {
      series: (data.incoming as number[]) ?? [],
      secondarySeries: (data.heal as number[]) ?? undefined,
      color: baseColor,
      markerAt:
        marker?.tSec != null
          ? { index: Math.max(0, Math.floor(marker.tSec)), color: marker.color }
          : undefined,
    };
  }
  // detector shape: { series, marker: { tSec }, thresholdLine }
  const marker = data.marker as { tSec?: number; color?: string } | undefined;
  return {
    series: (data.series as number[]) ?? [],
    thresholdLine: data.thresholdLine as number | undefined,
    color: baseColor,
    markerAt:
      marker?.tSec != null
        ? { index: Math.max(0, Math.floor(marker.tSec)), color: marker.color }
        : undefined,
  };
}

function adaptThresholdBar(data: AnyRecord, side: 'good' | 'bad' | undefined) {
  if ('severity' in data) return data;
  return { ...data, severity: pickSeverity(side) };
}

function adaptTagBubble(data: AnyRecord) {
  if ('inside' in data || 'outside' in data) return data;
  // detector shape: { radius, avgDistAtDeath, deaths }
  const deaths = Number(data.deaths ?? 0);
  const radius = Number(data.radius ?? 600);
  const avg = Number(data.avgDistAtDeath ?? 0);
  // Approximate: if avg is well past radius, treat all deaths as "outside".
  const outsideRatio = Math.min(1, Math.max(0, (avg - radius) / Math.max(1, radius)));
  const outside = Math.round(deaths * (0.5 + 0.5 * outsideRatio));
  const inside = Math.max(0, deaths - outside);
  return { inside, outside, tagRadius: radius };
}

export function VizRouter({ kind, data, side }: VizRouterProps) {
  const d = (data ?? {}) as AnyRecord;
  switch (kind) {
    case 'threshold-bar': return <ThresholdBar {...(adaptThresholdBar(d, side) as any)} />;
    case 'diverging-bar': return <DivergingBar {...(d as any)} />;
    case 'sparkline':     return <Sparkline    {...(adaptSparkline(d, side) as any)} />;
    case 'mini-timeline': return <MiniTimeline {...(d as any)} />;
    case 'tag-bubble':    return <TagBubble    {...(adaptTagBubble(d) as any)} />;
    case 'stacked-count': return <StackedCountBar {...(d as any)} />;
    case 'comp-bars':     return <CompBars     {...(d as any)} />;
    case 'donut':         return <Donut        {...(adaptDonut(d, side) as any)} />;
    default: return null;
  }
}
