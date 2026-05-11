// src/shared/commanderMetrics.ts
// Pure function: DPSReportJSON → CommanderFightData (skeleton)
// Real metric computations are filled in by Tasks 3–8.

import type { DPSReportJSON, Player } from './dpsReportTypes';
import { PROFESSION_COLORS } from './professionUtils';
import type { ComputeCommanderFightData, CommanderFightData, DeathEvent, BombWindow, CommanderComputeOptions } from './commanderTypes';

/** Set of all known playable profession/elite-spec names for NPC filtering. */
const KNOWN_PROFESSIONS = new Set(Object.keys(PROFESSION_COLORS).filter(k => k !== 'Unknown'));

// ---------------------------------------------------------------------------
// Series helpers
// ---------------------------------------------------------------------------

/**
 * Convert a cumulative per-second array (EI `*1S` format) into a per-second
 * delta array of length `len`.  EI stores running totals; adjacent-element
 * differences give the value for each individual second.
 */
function cumulativeToDelta(arr: number[], len: number): number[] {
  const out = new Array<number>(len).fill(0);
  for (let i = 0; i < len; i++) {
    const cur = arr[i] ?? 0;
    const prev = i > 0 ? (arr[i - 1] ?? 0) : 0;
    out[i] = cur - prev;
  }
  return out;
}

/**
 * Build the `incomingDps` and `healingThroughput` per-second series from the
 * squad player list.
 *
 * - `incomingDps`: sum of `player.damageTaken1S[0]` (phase 0, cumulative)
 *   diffed across all squad members.
 * - `healingThroughput`: sum of `player.extHealingStats.healing1S[0]` (total
 *   outgoing healing per second) across all squad members.  This is outgoing
 *   healing from each squad member to any target; it is the closest available
 *   proxy for "healing applied to squad" without target-filtering.
 */
function buildSeries(
  squadPlayers: Player[],
  seriesLen: number,
): { incomingDps: number[]; healingThroughput: number[] } {
  const incomingDps = new Array<number>(seriesLen).fill(0);
  const healingThroughput = new Array<number>(seriesLen).fill(0);

  for (const p of squadPlayers) {
    const dmgArr = p.damageTaken1S?.[0];
    if (dmgArr) {
      const delta = cumulativeToDelta(dmgArr, seriesLen);
      for (let i = 0; i < seriesLen; i++) incomingDps[i] += delta[i];
    }

    const healArr = p.extHealingStats?.healing1S?.[0];
    if (healArr) {
      const delta = cumulativeToDelta(healArr, seriesLen);
      for (let i = 0; i < seriesLen; i++) healingThroughput[i] += delta[i];
    }
  }

  return { incomingDps, healingThroughput };
}

// ---------------------------------------------------------------------------
// Burst helpers
// ---------------------------------------------------------------------------

/**
 * Compute the 75th-percentile value of an array of numbers.
 * Returns 0 for empty arrays.
 */
function p75(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.75)];
}

/**
 * Compute all burst metrics and bomb-window detection from the per-second
 * series and combat-replay data.
 *
 * Damage taken source : `player.damageTaken1S[0]` (cumulative, diffed)
 * Healing source      : `player.extHealingStats.healing1S[0]` (cumulative,
 *                       diffed) – total outgoing healing from squad members
 *                       (proxy for healing applied to squad).
 */
function computeBurst(
  incomingDps: number[],
  healingThroughput: number[],
  seriesLen: number,
  durationSec: number,
  deathsTimeline: DeathEvent[],
  squadPlayers: Player[],
): CommanderFightData['burst'] {
  // ----- Sliding 3-second window sums -----
  interface Window3s { t: number; inc: number; heal: number }
  const windows: Window3s[] = [];
  for (let i = 0; i + 3 <= seriesLen; i++) {
    windows.push({
      t: i,
      inc: incomingDps[i] + incomingDps[i + 1] + incomingDps[i + 2],
      heal: healingThroughput[i] + healingThroughput[i + 1] + healingThroughput[i + 2],
    });
  }

  // ----- Worst 3-second window -----
  let worst: Window3s = { t: 0, inc: 0, heal: 0 };
  for (const w of windows) {
    if (w.inc > worst.inc) worst = w;
  }
  const worst3sIncoming = worst.inc;
  const worst3sIncomingTSec = worst.t;
  const healAtSpike = worst.heal;
  const inHealRatioAtSpike = worst.inc / Math.max(1, worst.heal);

  // ----- Bomb-floor -----
  const bombFloor = Math.max(150_000, p75(windows.map(w => w.inc)));

  // ----- Bomb candidates -----
  const candidates = windows.filter(
    w => w.inc > bombFloor && w.inc / Math.max(1, w.heal) > 2.5,
  );

  // ----- Merge overlapping / adjacent candidates (within 1 second) -----
  const groups: Window3s[][] = [];
  let group: Window3s[] = [];
  for (const c of candidates) {
    if (group.length === 0 || c.t - group[group.length - 1].t <= 1) {
      group.push(c);
    } else {
      groups.push(group);
      group = [c];
    }
  }
  if (group.length > 0) groups.push(group);

  // ----- Build BombWindow objects -----
  // Collect down-event start times (ms → s) for all squad members
  const downStartsSec: number[] = [];
  for (const p of squadPlayers) {
    for (const [startMs] of p.combatReplayData?.down ?? []) {
      downStartsSec.push(startMs / 1000);
    }
  }

  const bombWindows: BombWindow[] = groups.map(grp => {
    const tSec = grp[0].t;
    const lastT = grp[grp.length - 1].t;
    // Cover all merged 3-second windows; cap at fight end
    const windowDurationSec = Math.min(lastT + 3 - tSec, durationSec - tSec);
    const endSec = tSec + windowDurationSec;

    // incoming = peak incoming of any constituent window
    const incoming = grp.reduce((best, w) => Math.max(best, w.inc), 0);
    // heal = sum of heal over covered window seconds
    let heal = 0;
    for (let s = tSec; s < endSec && s < seriesLen; s++) {
      heal += healingThroughput[s];
    }

    // Deaths: first-death events from deathsTimeline within [tSec, endSec]
    const windowDeaths = deathsTimeline.filter(
      e => e.tSec >= tSec && e.tSec < endSec,
    ).length;

    const outcome: BombWindow['outcome'] = windowDeaths >= 2 ? 'broke' : 'survived';

    return { tSec, durationSec: windowDurationSec, incoming, heal, outcome };
  });

  // ----- Downs in worst 3-second window -----
  // Combine deathsTimeline entries AND combatReplayData.down start times
  const worstEnd = worst3sIncomingTSec + 3;
  const deathCountInWorst = deathsTimeline.filter(
    e => e.tSec >= worst3sIncomingTSec && e.tSec < worstEnd,
  ).length;
  const downCountInWorst = downStartsSec.filter(
    t => t >= worst3sIncomingTSec && t < worstEnd,
  ).length;
  const downsInWorst3s = deathCountInWorst + downCountInWorst;

  return {
    worst3sIncoming,
    worst3sIncomingTSec,
    inHealRatioAtSpike,
    healAtSpike,
    bombWindowCount: bombWindows.length,
    bombWindows,
    downsInWorst3s,
    stabUptimeInSpike: 0, // TODO(task-7): needs series.stabUptime
  };
}

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

  // Build the deathsTimeline early so burst can reference it
  const deathsTimeline = buildDeathsTimeline(json, options);

  // Build per-second series for burst computation
  const squadPlayers = json.players.filter(p => !p.notInSquad);
  const { incomingDps, healingThroughput } = buildSeries(squadPlayers, seriesLen);

  const burst = computeBurst(
    incomingDps,
    healingThroughput,
    seriesLen,
    duration,
    deathsTimeline,
    squadPlayers,
  );

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
    incomingDps,
    healingThroughput,
    stabUptime: zeros(),
    spreadStdev: zeros(),
    deathsTimeline,
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
