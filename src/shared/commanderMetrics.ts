// src/shared/commanderMetrics.ts
// Pure function: DPSReportJSON → CommanderFightData (skeleton)
// Real metric computations are filled in by Tasks 3–8.

import type { DPSReportJSON } from './dpsReportTypes';
import { PROFESSION_COLORS } from './professionUtils';
import type { ComputeCommanderFightData, CommanderFightData, DeathEvent, CommanderComputeOptions } from './commanderTypes';

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

/**
 * Build the deathsTimeline: one DeathEvent per squad player who died at least
 * once, recorded at the time of their first death. Sorted chronologically.
 * distFromTag defaults to 0 (positional data is Task 6).
 */
function buildDeathsTimeline(
  json: DPSReportJSON,
  options?: CommanderComputeOptions,
): DeathEvent[] {
  const events: DeathEvent[] = [];
  for (const p of json.players) {
    if (p.notInSquad) continue;
    const dead = p.combatReplayData?.dead;
    if (!dead || dead.length === 0) continue;
    const firstDeadMs = dead[0][0];
    const account = p.account ?? p.name;
    const role = options?.classifyRole ? options.classifyRole(account) : 'unknown';
    events.push({
      tSec: firstDeadMs / 1000,
      account,
      profession: p.profession,
      role,
      distFromTag: 0,
    });
  }
  events.sort((a, b) => a.tSec - b.tSec);
  return events;
}

/**
 * Compute all survival metrics for a fight.
 *
 * Down/death state changes come from player.combatReplayData.dead and .down,
 * each as arrays of [startMs, endMs] pairs.
 *
 * A "rally" is a down event where the player recovered — i.e. no dead event
 * begins within 50 ms of the down's end time.
 */
function computeSurvival(
  json: DPSReportJSON,
  options?: CommanderComputeOptions,
): CommanderFightData['survival'] {
  const squadPlayers = json.players.filter(p => !p.notInSquad);
  const squadTotal = squadPlayers.length;

  let squadAliveAtEnd = 0;
  let downs = 0;
  let rallies = 0;
  let rallyDurationSum = 0;

  // Track the overall earliest squad death for firstSquadDeath
  let firstSquadDeath: DeathEvent | null = null;
  let firstSquadDeathMs = Infinity;

  // Track earliest support death for firstSupportDeath (requires classifyRole)
  let firstSupportDeath: DeathEvent | null = null;
  let firstSupportDeathMs = Infinity;

  for (const p of squadPlayers) {
    const dead = p.combatReplayData?.dead ?? [];
    const downEvents = p.combatReplayData?.down ?? [];
    const account = p.account ?? p.name;
    const role = options?.classifyRole ? options.classifyRole(account) : 'unknown';

    // squadAliveAtEnd: player never entered a dead state
    if (dead.length === 0) {
      squadAliveAtEnd++;
    }

    // Earliest death tracking
    if (dead.length > 0) {
      const deathMs = dead[0][0];
      if (deathMs < firstSquadDeathMs) {
        firstSquadDeathMs = deathMs;
        firstSquadDeath = {
          tSec: deathMs / 1000,
          account,
          profession: p.profession,
          role,
          distFromTag: 0,
        };
      }
      if (role === 'support' && deathMs < firstSupportDeathMs) {
        firstSupportDeathMs = deathMs;
        firstSupportDeath = {
          tSec: deathMs / 1000,
          account,
          profession: p.profession,
          role,
          distFromTag: 0,
        };
      }
    }

    // Down/rally analysis
    for (const [downStart, downEnd] of downEvents) {
      downs++;
      // Rally = the down resolved without a death immediately following
      const diedAfterDown = dead.some(([ds]) => Math.abs(ds - downEnd) < 50);
      if (!diedAfterDown) {
        rallies++;
        rallyDurationSum += (downEnd - downStart) / 1000;
      }
    }
  }

  const rallyRate = downs > 0 ? rallies / downs : 0;
  const avgTimeDownedSec = rallies > 0 ? rallyDurationSum / rallies : 0;

  // If classifyRole is not provided, firstSupportDeath must be null
  if (!options?.classifyRole) {
    firstSupportDeath = null;
  }

  return {
    firstSquadDeath,
    firstSupportDeath,
    squadAliveAtEnd,
    squadTotal,
    rallyRate,
    rallies,
    downs,
    avgTimeDownedSec,
  };
}

export const computeCommanderFightData: ComputeCommanderFightData = (json, options) => {
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

  const survival = computeSurvival(json, options);

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
    deathsTimeline: buildDeathsTimeline(json, options),
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
