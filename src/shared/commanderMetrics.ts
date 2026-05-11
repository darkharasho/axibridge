// src/shared/commanderMetrics.ts
// Pure function: DPSReportJSON → CommanderFightData (skeleton)
// Real metric computations are filled in by Tasks 3–8.

import type { ComputeCommanderFightData, CommanderFightData } from './commanderTypes';

export const computeCommanderFightData: ComputeCommanderFightData = (json, _options) => {
  // --- root fields -------------------------------------------------------
  // durationMS: milliseconds of fight duration (DPSReportJSON field)
  const duration = json.durationMS / 1000;

  // fightName: human-readable map/fight name (DPSReportJSON field)
  const map = json.fightName ?? '';

  // uploadTime: epoch ms when the log was uploaded (DPSReportJSON field);
  // used as a stable-enough proxy for startedAt (no timeStart in EI JSON)
  const startedAt = json.uploadTime ?? 0;

  // fightId: stable identifier built from fightName + uploadTime
  const fightId = `${map}|${startedAt}`;

  const seriesLen = Math.ceil(duration);
  const zeros = (): number[] => Array<number>(seriesLen).fill(0);

  // TODO(task-3): fill in matchup fields
  const matchup: CommanderFightData['matchup'] = {
    squadCount: 0,
    alliesCount: 0,
    enemyCount: 0,
    enemyPeak: 0,
    effectiveRatio: 0,
    timeOutnumberedSec: 0,
    enemyComp: [],
    inTagBubbleAtEngage: 0,
  };

  // TODO(task-4): fill in survival fields
  const survival: CommanderFightData['survival'] = {
    firstSquadDeath: null,
    firstSupportDeath: null,
    squadAliveAtEnd: 0,
    squadTotal: 0,
    rallyRate: 0,
    rallies: 0,
    downs: 0,
    avgTimeDownedSec: 0,
  };

  // TODO(task-5): fill in burst fields
  const burst: CommanderFightData['burst'] = {
    worst3sIncoming: 0,
    worst3sIncomingTSec: 0,
    inHealRatioAtSpike: 0,
    healAtSpike: 0,
    bombWindowCount: 0,
    bombWindows: [],
    downsInWorst3s: 0,
    stabUptimeInSpike: 0,
  };

  // TODO(task-6): fill in cohesion fields
  const cohesion: CommanderFightData['cohesion'] = {
    avgDistFromTag: 0,
    timeSpread900PlusSec: 0,
    avgDistAtDeath: 0,
    peakSpreadStdev: 0,
    peakSpreadStdevTSec: 0,
    stragglersAtBomb: 0,
  };

  // TODO(task-7): fill in sustain fields
  const sustain: CommanderFightData['sustain'] = {
    cleansesApplied: 0,
    conditionsTaken: 0,
    stripsLanded: 0,
    stripsReceived: 0,
    stabThroughBombs: 0,
    resistanceAtBurst: 0,
    aegisAtBurst: 0,
  };

  // TODO(task-8): fill in engage fields
  const engage: CommanderFightData['engage'] = {
    squadHpAtEngage: 0,
    keyCdsUsed0to10s: 0,
    preEngageDowns: 0,
    stab0to10s: 0,
    dodgeStarvation: 'low',
  };

  // TODO(task-8): fill in outcome fields
  const outcome: CommanderFightData['outcome'] = {
    kills: 0,
    squadDeaths: 0,
    allyDeaths: 0,
    netTrade: 0,
    damageOut: 0,
    damageIn: 0,
    damageOutInRatio: 0,
  };

  const series: CommanderFightData['series'] = {
    incomingDps: zeros(),
    healingThroughput: zeros(),
    stabUptime: zeros(),
    spreadStdev: zeros(),
    deathsTimeline: [],
  };

  return {
    fightId,
    map,
    startedAt,
    duration,
    matchup,
    survival,
    burst,
    cohesion,
    sustain,
    engage,
    outcome,
    series,
    verdictChips: [],
  };
};
