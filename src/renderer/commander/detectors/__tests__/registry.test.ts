import { describe, it, expect } from 'vitest';
import { runAllDetectors, topFindings } from '../index';
import { DEFAULT_COMMANDER_THRESHOLDS } from '../../../../shared/commanderThresholds';
import { computeCommanderFightData } from '../../../../shared/commanderMetrics';
import { commanderTestFixture } from '../../../../shared/__tests__/commander.fixtures';

describe('detector registry', () => {
  it('runs without throwing and returns an array', () => {
    const data = computeCommanderFightData(commanderTestFixture);
    const findings = runAllDetectors(data, DEFAULT_COMMANDER_THRESHOLDS);
    expect(Array.isArray(findings)).toBe(true);
  });

  it('topFindings respects side and limit', () => {
    const data = computeCommanderFightData(commanderTestFixture);
    const findings = runAllDetectors(data, DEFAULT_COMMANDER_THRESHOLDS);
    const top = topFindings(findings, 'bad', 4);
    expect(top.length).toBeLessThanOrEqual(4);
    for (const f of top) expect(f.side).toBe('bad');
  });
});
