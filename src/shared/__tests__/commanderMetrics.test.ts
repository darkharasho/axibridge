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

  it('verdictChips includes "outnumbered" iff effectiveRatio < outnumberedRatio threshold', () => {
    const OUTNUMBERED_RATIO = 0.85;
    const shouldHave = data.matchup.effectiveRatio < OUTNUMBERED_RATIO;
    expect(data.verdictChips.includes('outnumbered')).toBe(shouldHave);
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

describe('sustain & engage', () => {
  let data: CommanderFightData;
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('cleansesApplied and conditionsTaken are non-negative integers', () => {
    expect(Number.isInteger(data.sustain.cleansesApplied)).toBe(true);
    expect(data.sustain.cleansesApplied).toBeGreaterThanOrEqual(0);
    expect(data.sustain.conditionsTaken).toBeGreaterThanOrEqual(0);
  });

  it('stabThroughBombs, resistanceAtBurst, aegisAtBurst are in [0, 1]', () => {
    for (const v of [data.sustain.stabThroughBombs, data.sustain.resistanceAtBurst, data.sustain.aegisAtBurst]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('squadHpAtEngage, keyCdsUsed0to10s, stab0to10s are in [0, 1]', () => {
    for (const v of [data.engage.squadHpAtEngage, data.engage.keyCdsUsed0to10s, data.engage.stab0to10s]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('preEngageDowns is non-negative integer', () => {
    expect(Number.isInteger(data.engage.preEngageDowns)).toBe(true);
    expect(data.engage.preEngageDowns).toBeGreaterThanOrEqual(0);
  });

  it('series.stabUptime length matches incomingDps', () => {
    expect(data.series.stabUptime.length).toBe(data.series.incomingDps.length);
  });

  it('stabUptimeInSpike equals avg of stabUptime over worst3s window', () => {
    const start = data.burst.worst3sIncomingTSec;
    const window = data.series.stabUptime.slice(start, start + 3);
    if (window.length > 0) {
      const avg = window.reduce((a, b) => a + b, 0) / window.length;
      expect(data.burst.stabUptimeInSpike).toBeCloseTo(avg, 5);
    }
  });
});

describe('outcome & verdict chips', () => {
  let data: CommanderFightData;
  beforeAll(() => { data = computeCommanderFightData(commanderTestFixture); });

  it('netTrade = kills / max(1, squadDeaths) when squadDeaths > 0', () => {
    if (data.outcome.squadDeaths > 0) {
      expect(data.outcome.netTrade).toBeCloseTo(
        data.outcome.kills / Math.max(1, data.outcome.squadDeaths),
        5,
      );
    }
  });

  it('damageOutInRatio = damageOut / max(1, damageIn)', () => {
    expect(data.outcome.damageOutInRatio).toBeCloseTo(
      data.outcome.damageOut / Math.max(1, data.outcome.damageIn),
      5,
    );
  });

  it('verdictChips contains only valid chip ids', () => {
    const allowed = new Set([
      'wipe','trade','carry','clean',
      'outnumbered','caught-engage','caught-out','bomb-broke-us',
    ]);
    for (const c of data.verdictChips) expect(allowed.has(c)).toBe(true);
  });

  it('wipe and clean are mutually exclusive', () => {
    const has = (chip: string) => data.verdictChips.includes(chip as never);
    expect(has('wipe') && has('clean')).toBe(false);
  });

  it('bomb-broke-us fires iff any bomb window outcome is broke', () => {
    const anyBroke = data.burst.bombWindows.some(w => w.outcome === 'broke');
    expect(data.verdictChips.includes('bomb-broke-us')).toBe(anyBroke);
  });
});
