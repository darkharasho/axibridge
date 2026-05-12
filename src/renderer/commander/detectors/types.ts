import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

export type VizKind =
  | 'sparkline'
  | 'threshold-bar'
  | 'diverging-bar'
  | 'mini-timeline'
  | 'tag-bubble'
  | 'stacked-count'
  | 'donut'
  | 'comp-bars';

export interface DetectorFinding {
  id: string;
  side: 'good' | 'bad';
  severity: number;
  headline: string;
  evidence: string;
  threshold: string;
  vizKind: VizKind;
  vizData: unknown;
}

export type Detector = (
  fight: CommanderFightData,
  thresholds: CommanderThresholds,
) => DetectorFinding | null;
