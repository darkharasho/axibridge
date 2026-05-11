// src/shared/__tests__/commanderMetrics.test.ts
import { describe, it, expect } from 'vitest';
import { computeCommanderFightData } from '../commanderMetrics';
import { commanderTestFixture } from './commander.fixtures';

describe('computeCommanderFightData', () => {
  it('returns a fully-shaped CommanderFightData for a real fixture', () => {
    const data = computeCommanderFightData(commanderTestFixture);
    expect(data.fightId).toBeTruthy();
    expect(data.duration).toBeGreaterThan(0);
    expect(data.series.incomingDps.length).toBe(Math.ceil(data.duration));
    expect(data.series.healingThroughput.length).toBe(Math.ceil(data.duration));
    expect(data.series.stabUptime.length).toBe(Math.ceil(data.duration));
    expect(data.series.spreadStdev.length).toBe(Math.ceil(data.duration));
    // matchup, survival, etc. all present (zero values are fine for skeleton)
    expect(data.matchup).toBeDefined();
    expect(data.survival).toBeDefined();
    expect(data.burst).toBeDefined();
    expect(data.cohesion).toBeDefined();
    expect(data.sustain).toBeDefined();
    expect(data.engage).toBeDefined();
    expect(data.outcome).toBeDefined();
    expect(Array.isArray(data.verdictChips)).toBe(true);
  });
});
