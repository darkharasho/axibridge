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
  switch (kind) {
    case 'threshold-bar': return <ThresholdBar {...(data as any)} />;
    case 'diverging-bar': return <DivergingBar {...(data as any)} />;
    case 'sparkline':     return <Sparkline    {...(data as any)} />;
    case 'mini-timeline': return <MiniTimeline {...(data as any)} />;
    case 'tag-bubble':    return <TagBubble    {...(data as any)} />;
    case 'stacked-count': return <StackedCountBar {...(data as any)} />;
    case 'comp-bars':     return <CompBars     {...(data as any)} />;
    case 'donut':         return <Donut        {...(data as any)} />;
    default: return null;
  }
}
