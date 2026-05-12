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
}

export function VizRouter({ kind, data }: VizRouterProps) {
  const d = (data ?? {}) as Record<string, unknown>;
  switch (kind) {
    case 'threshold-bar': return <ThresholdBar {...(d as any)} />;
    case 'diverging-bar': return <DivergingBar {...(d as any)} />;
    case 'sparkline':     return <Sparkline    {...(d as any)} />;
    case 'mini-timeline': return <MiniTimeline {...(d as any)} />;
    case 'tag-bubble':    return <TagBubble    {...(d as any)} />;
    case 'stacked-count': return <StackedCountBar {...(d as any)} />;
    case 'comp-bars':     return <CompBars     {...(d as any)} />;
    case 'donut':         return <Donut        {...(d as any)} />;
    default: return null;
  }
}
