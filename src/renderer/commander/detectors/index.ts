import type { Detector, DetectorFinding } from './types';
import type { CommanderFightData } from '../../../shared/commanderTypes';
import type { CommanderThresholds } from '../../../shared/commanderThresholds';

import firstSquadDeathEarly from './firstSquadDeathEarly';
import firstSupportDeathPreBomb from './firstSupportDeathPreBomb';

const DETECTORS: Detector[] = [
  firstSquadDeathEarly,
  firstSupportDeathPreBomb,
];

export function runAllDetectors(
  fight: CommanderFightData,
  thresholds: CommanderThresholds,
): DetectorFinding[] {
  const results: DetectorFinding[] = [];
  for (const d of DETECTORS) {
    const out = d(fight, thresholds);
    if (out) results.push(out);
  }
  return results;
}

export function topFindings(
  findings: DetectorFinding[],
  side: 'good' | 'bad',
  n = 4,
): DetectorFinding[] {
  return findings
    .filter((f) => f.side === side)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, n);
}
