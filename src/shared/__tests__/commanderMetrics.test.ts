// src/shared/__tests__/commanderMetrics.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { computeCommanderFightData } from '../commanderMetrics';
import { commanderTestFixture } from './commander.fixtures';
import type { CommanderFightData } from '../commanderTypes';

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

describe('matchup', () => {
  let data: CommanderFightData;
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('squadCount is positive', () => {
    expect(data.matchup.squadCount).toBeGreaterThanOrEqual(1);
  });

  it('enemyPeak >= enemyCount', () => {
    expect(data.matchup.enemyPeak).toBeGreaterThanOrEqual(data.matchup.enemyCount);
  });

  it('effectiveRatio = (squad+allies)/enemyPeak', () => {
    expect(data.matchup.effectiveRatio).toBeCloseTo(
      (data.matchup.squadCount + data.matchup.alliesCount) / Math.max(1, data.matchup.enemyPeak),
      2,
    );
  });

  it('enemyComp counts sum to enemyCount', () => {
    const total = data.matchup.enemyComp.reduce((a, e) => a + e.count, 0);
    expect(total).toBe(data.matchup.enemyCount);
  });

  it('enemyComp is sorted by count descending', () => {
    for (let i = 1; i < data.matchup.enemyComp.length; i++) {
      expect(data.matchup.enemyComp[i - 1].count).toBeGreaterThanOrEqual(data.matchup.enemyComp[i].count);
    }
  });
});

describe('survival', () => {
  let data: CommanderFightData;
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('first squad death (if any) has a non-negative tSec within fight duration', () => {
    if (data.survival.firstSquadDeath) {
      expect(data.survival.firstSquadDeath.tSec).toBeGreaterThanOrEqual(0);
      expect(data.survival.firstSquadDeath.tSec).toBeLessThanOrEqual(data.duration);
    }
  });

  it('firstSupportDeath is null when classifyRole is not provided', () => {
    expect(data.survival.firstSupportDeath).toBeNull();
  });

  it('rallyRate equals rallies / downs when downs > 0', () => {
    if (data.survival.downs > 0) {
      expect(data.survival.rallyRate).toBeCloseTo(data.survival.rallies / data.survival.downs, 5);
    } else {
      expect(data.survival.rallyRate).toBe(0);
    }
  });

  it('deathsTimeline length equals squadDeaths', () => {
    const deadSquad = data.survival.squadTotal - data.survival.squadAliveAtEnd;
    expect(data.series.deathsTimeline.length).toBe(deadSquad);
  });

  it('deathsTimeline is in chronological order', () => {
    for (let i = 1; i < data.series.deathsTimeline.length; i++) {
      expect(data.series.deathsTimeline[i].tSec)
        .toBeGreaterThanOrEqual(data.series.deathsTimeline[i - 1].tSec);
    }
  });

  it('squadAliveAtEnd <= squadTotal', () => {
    expect(data.survival.squadAliveAtEnd).toBeLessThanOrEqual(data.survival.squadTotal);
  });
});

describe('burst & series', () => {
  let data: CommanderFightData;
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('series.incomingDps and healingThroughput have correct length', () => {
    expect(data.series.incomingDps.length).toBe(Math.ceil(data.duration));
    expect(data.series.healingThroughput.length).toBe(Math.ceil(data.duration));
  });

  it('worst3sIncoming matches the max sliding-3s sum of incomingDps', () => {
    const s = data.series.incomingDps;
    let maxSum = 0;
    for (let i = 0; i + 3 <= s.length; i++) {
      const sum = s[i] + s[i+1] + s[i+2];
      if (sum > maxSum) maxSum = sum;
    }
    expect(data.burst.worst3sIncoming).toBeCloseTo(maxSum, 0);
  });

  it('worst3sIncomingTSec is within fight duration', () => {
    expect(data.burst.worst3sIncomingTSec).toBeGreaterThanOrEqual(0);
    expect(data.burst.worst3sIncomingTSec).toBeLessThanOrEqual(data.duration);
  });

  it('bombWindow outcomes are valid and references are in-range', () => {
    for (const w of data.burst.bombWindows) {
      expect(['survived', 'broke']).toContain(w.outcome);
      expect(w.tSec).toBeGreaterThanOrEqual(0);
      expect(w.tSec + w.durationSec).toBeLessThanOrEqual(data.duration + 1);
    }
  });

  it('bombWindowCount equals bombWindows.length', () => {
    expect(data.burst.bombWindowCount).toBe(data.burst.bombWindows.length);
  });

  it('inHealRatioAtSpike is non-negative', () => {
    expect(data.burst.inHealRatioAtSpike).toBeGreaterThanOrEqual(0);
  });
});

describe('cohesion & positioning', () => {
  let data: CommanderFightData;
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('avgDistFromTag is non-negative and finite', () => {
    expect(data.cohesion.avgDistFromTag).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(data.cohesion.avgDistFromTag)).toBe(true);
  });

  it('timeSpread900Plus <= fight duration', () => {
    expect(data.cohesion.timeSpread900PlusSec).toBeLessThanOrEqual(data.duration);
  });

  it('series.spreadStdev length matches series.incomingDps length', () => {
    expect(data.series.spreadStdev.length).toBe(data.series.incomingDps.length);
  });

  it('peakSpreadStdev is the max of series.spreadStdev', () => {
    const max = Math.max(...data.series.spreadStdev);
    expect(data.cohesion.peakSpreadStdev).toBeCloseTo(max, 5);
  });

  it('peakSpreadStdevTSec corresponds to the peak index', () => {
    if (data.cohesion.peakSpreadStdev > 0) {
      const idx = data.series.spreadStdev.indexOf(data.cohesion.peakSpreadStdev);
      expect(data.cohesion.peakSpreadStdevTSec).toBe(idx);
    }
  });

  it('deaths timeline entries have non-negative distFromTag', () => {
    for (const d of data.series.deathsTimeline) {
      expect(d.distFromTag).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(d.distFromTag)).toBe(true);
    }
  });

  it('stragglersAtBomb is non-negative integer', () => {
    expect(Number.isInteger(data.cohesion.stragglersAtBomb)).toBe(true);
    expect(data.cohesion.stragglersAtBomb).toBeGreaterThanOrEqual(0);
  });
});
