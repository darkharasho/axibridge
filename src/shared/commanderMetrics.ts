// src/shared/commanderMetrics.ts
// Pure function: DPSReportJSON → CommanderFightData (skeleton)
// Real metric computations are filled in by Tasks 3–8.

import type { DPSReportJSON } from './dpsReportTypes';
import { PROFESSION_COLORS } from './professionUtils';
import type { ComputeCommanderFightData, CommanderFightData } from './commanderTypes';

/** Set of all known playable profession/elite-spec names for NPC filtering. */
const KNOWN_PROFESSIONS = new Set(Object.keys(PROFESSION_COLORS).filter(k => k !== 'Unknown'));

function computeMatchup(json: DPSReportJSON): CommanderFightData['matchup'] {
  // Squad members are players where notInSquad is not set (or false).
  const squadCount = json.players.filter(p => !p.notInSquad).length;

  // Friendly off-group allies are players where notInSquad === true.
  const alliesCount = json.players.filter(p => p.notInSquad === true).length;

  // Enemy players appear as individual Target entries where enemyPlayer === true.
  // NPC bosses/structures are filtered out by this flag.
  // If no enemies are tracked (e.g. older EI WvW logs that lump enemies into a single
  // fake "Enemy Players" target with isFake=true), enemyCount will be 0.
  const enemyTargets = json.targets.filter(t => t.enemyPlayer === true);
  const enemyCount = enemyTargets.length;

  // TODO: enemyPeak should be the maximum number of enemy players alive at any one second.
  // No per-second alive time-series for enemy targets is available in v1; leave equal to
  // enemyCount.
  const enemyPeak = enemyCount;

  const effectiveRatio = (squadCount + alliesCount) / Math.max(1, enemyPeak);

  // Extract profession from enemy target name ("Tempest pl-2421" → "Tempest").
  // Validate against known profession list to guard against unexpected name formats.
  const profMap = new Map<string, number>();
  for (const t of enemyTargets) {
    const profCandidate = t.name.split(' ')[0] ?? '';
    const prof = KNOWN_PROFESSIONS.has(profCandidate) ? profCandidate : 'Unknown';
    profMap.set(prof, (profMap.get(prof) ?? 0) + 1);
  }
  const enemyComp = Array.from(profMap.entries())
    .map(([profession, count]) => ({ profession, count }))
    .sort((a, b) => b.count - a.count);

  return {
    squadCount,
    alliesCount,
    enemyCount,
    enemyPeak,
    effectiveRatio,
    timeOutnumberedSec: 0, // TODO(task-6): needs per-second alive data computed in Task 6
    enemyComp,
    inTagBubbleAtEngage: 0, // TODO(task-6): needs positional data
  };
}

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

  const matchup = computeMatchup(json);

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
