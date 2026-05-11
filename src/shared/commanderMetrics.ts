// src/shared/commanderMetrics.ts
// Pure function: DPSReportJSON → CommanderFightData (skeleton)
// Real metric computations are filled in by Tasks 3–8.

import type { DPSReportJSON, Player } from './dpsReportTypes';
import { PROFESSION_COLORS } from './professionUtils';
import type { ComputeCommanderFightData, CommanderFightData, DeathEvent, BombWindow, CommanderComputeOptions } from './commanderTypes';

// ---------------------------------------------------------------------------
// Buff-state helpers
// ---------------------------------------------------------------------------

/**
 * Stability buff id per EI GW2 buff data.
 * Confirmed present in fixture buffMap as b1122.
 */
const STAB_BUFF_ID = 1122;
const RESISTANCE_BUFF_ID = 26980;
const AEGIS_BUFF_ID = 743;

/**
 * Key skill name substrings for "engage readiness" classification.
 * A player is counted as having used a key CD in 0–10s if any rotation entry
 * whose castTime ∈ [0, 10000) ms matches one of these patterns.
 */
const KEY_SKILL_PATTERNS: readonly string[] = [
  'Stand Your Ground',
  'Wall of Reflection',
  'Stability',
  'Mantra of Solace',
  'Glyph of Tides',
  'Winds of Disenchantment',
  'Well of Precognition',
  'Lightning Storm',
  'Tome of Resolve',
  '"Stand Your Ground!"',
];

/**
 * Given a player's `buffUptimes` array and a buff id, return the stack count
 * of that buff at `tMs` milliseconds into the fight (or 0 if not found).
 *
 * EI `states` is a sorted array of `[timeMs, stackCount]` state-change pairs.
 * The effective stack count at `tMs` is the last entry whose `timeMs ≤ tMs`.
 */
function buffStackAtMs(player: Player, buffId: number, tMs: number): number {
  const entry = player.buffUptimes?.find(b => b.id === buffId);
  if (!entry) return 0;
  const states = (entry as { states?: Array<[number, number]> }).states;
  if (!states || states.length === 0) return 0;
  let stackCount = 0;
  for (const [stateMs, count] of states) {
    if (stateMs <= tMs) {
      stackCount = count;
    } else {
      break;
    }
  }
  return stackCount;
}

/**
 * Return 1 if the given buff was active (stack > 0) for a player at second `t`,
 * or 0 otherwise.
 */
function buffActiveAtSec(player: Player, buffId: number, t: number): number {
  return buffStackAtMs(player, buffId, t * 1000) > 0 ? 1 : 0;
}

/**
 * Compute the mean uptime (0..1) of a given buff across all `squadPlayers`
 * at the given second `t`.
 */
function squadBuffUptimeAtSec(
  squadPlayers: Player[],
  buffId: number,
  t: number,
): number {
  if (squadPlayers.length === 0) return 0;
  let active = 0;
  for (const p of squadPlayers) {
    active += buffActiveAtSec(p, buffId, t);
  }
  return active / squadPlayers.length;
}

/**
 * Compute the per-second Stability uptime series across all squad players.
 *
 * For each second `t ∈ [0, seriesLen)`, the value is the fraction of squad
 * players who had Stability stacks > 0 at the *start* of that second.
 * Uses `buffUptimes[id=1122].states` (an array of `[timeMs, stackCount]` pairs).
 */
function buildStabUptimeSeries(
  squadPlayers: Player[],
  seriesLen: number,
): number[] {
  const out = new Array<number>(seriesLen).fill(0);
  for (let t = 0; t < seriesLen; t++) {
    out[t] = squadBuffUptimeAtSec(squadPlayers, STAB_BUFF_ID, t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sustain helpers
// ---------------------------------------------------------------------------

/**
 * Compute the mean of `series.stabUptime` over all seconds that fall inside
 * any bomb window.  Returns 0 if there are no bomb windows or the series is
 * empty.
 */
function stabThroughBombs(stabUptime: number[], bombWindows: BombWindow[]): number {
  if (bombWindows.length === 0 || stabUptime.length === 0) return 0;
  const values: number[] = [];
  for (const bw of bombWindows) {
    const tStart = Math.floor(bw.tSec);
    const tEnd = Math.min(Math.ceil(bw.tSec + bw.durationSec), stabUptime.length);
    for (let t = tStart; t < tEnd; t++) {
      values.push(stabUptime[t]);
    }
  }
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Compute the mean uptime of a buff across squad over a 3-second window
 * starting at `tStart`.
 */
function meanBuff3s(
  squadPlayers: Player[],
  buffId: number,
  tStart: number,
  seriesLen: number,
): number {
  const tEnd = Math.min(tStart + 3, seriesLen);
  if (tEnd <= tStart) return 0;
  let sum = 0;
  let count = 0;
  for (let t = tStart; t < tEnd; t++) {
    sum += squadBuffUptimeAtSec(squadPlayers, buffId, t);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function computeSustain(
  squadPlayers: Player[],
  stabUptime: number[],
  bombWindows: BombWindow[],
  worst3sIncomingTSec: number,
  seriesLen: number,
): CommanderFightData['sustain'] {
  // cleansesApplied: sum of support[0].condiCleanse across squad
  let cleansesApplied = 0;
  // stripsLanded: sum of support[0].boonStrips across squad
  let stripsLanded = 0;
  // conditionsTaken: sum of defenses[0].conditionDamageTakenCount across squad
  let conditionsTaken = 0;
  // stripsReceived: sum of defenses[0].boonStrips across squad
  let stripsReceived = 0;

  for (const p of squadPlayers) {
    const sup = p.support?.[0];
    if (sup) {
      cleansesApplied += sup.condiCleanse ?? 0;
      stripsLanded += sup.boonStrips ?? 0;
    }
    const def = p.defenses?.[0] as (typeof p.defenses[0] & {
      conditionDamageTakenCount?: number;
      boonStrips?: number;
    });
    if (def) {
      conditionsTaken += def.conditionDamageTakenCount ?? 0;
      stripsReceived += def.boonStrips ?? 0;
    }
  }

  const stabThroughBombsVal = stabThroughBombs(stabUptime, bombWindows);
  const resistanceAtBurst = meanBuff3s(squadPlayers, RESISTANCE_BUFF_ID, worst3sIncomingTSec, seriesLen);
  const aegisAtBurst = meanBuff3s(squadPlayers, AEGIS_BUFF_ID, worst3sIncomingTSec, seriesLen);

  return {
    cleansesApplied,
    conditionsTaken,
    stripsLanded,
    stripsReceived,
    stabThroughBombs: stabThroughBombsVal,
    resistanceAtBurst,
    aegisAtBurst,
  };
}

// ---------------------------------------------------------------------------
// Engage helpers
// ---------------------------------------------------------------------------

/**
 * Compute `keyCdsUsed0to10s`: fraction of squad players who cast at least one
 * "key" skill in the first 10 seconds (castTime ∈ [0, 10000) ms).
 *
 * Key skills are identified by matching the skill name from `json.skillMap`
 * against `KEY_SKILL_PATTERNS`.
 */
function computeKeyCdsUsed0to10s(
  squadPlayers: Player[],
  skillMap: DPSReportJSON['skillMap'],
): number {
  if (squadPlayers.length === 0) return 0;
  let playersWithKey = 0;
  for (const p of squadPlayers) {
    if (!p.rotation) continue;
    let usedKey = false;
    for (const rotEntry of p.rotation) {
      const skillName = skillMap?.['s' + rotEntry.id]?.name ?? '';
      const isKey = KEY_SKILL_PATTERNS.some(pat => skillName.includes(pat));
      if (!isKey) continue;
      const casts = rotEntry.skills;
      if (!casts) continue;
      for (const cast of casts) {
        if (cast.castTime >= 0 && cast.castTime < 10_000) {
          usedKey = true;
          break;
        }
      }
      if (usedKey) break;
    }
    if (usedKey) playersWithKey++;
  }
  return playersWithKey / squadPlayers.length;
}

/**
 * Compute `squadHpAtEngage`: mean healthPercents[0][1] / 100 across squad.
 * healthPercents is `Array<[timeMs, healthPct]>` where healthPct is 0–100.
 * We use the first sample (index 0) which corresponds to the fight start.
 * Defaults to 1.0 if no HP data is available.
 */
function computeSquadHpAtEngage(squadPlayers: Player[]): number {
  let sum = 0;
  let count = 0;
  for (const p of squadPlayers) {
    const hp = p.healthPercents;
    if (Array.isArray(hp) && hp.length > 0) {
      sum += (hp[0][1] ?? 100) / 100;
      count++;
    }
  }
  return count > 0 ? sum / count : 1.0;
}

function computeEngage(
  squadPlayers: Player[],
  skillMap: DPSReportJSON['skillMap'],
  stabUptime: number[],
  seriesLen: number,
): CommanderFightData['engage'] {
  const squadHpAtEngage = computeSquadHpAtEngage(squadPlayers);
  const keyCdsUsed0to10s = computeKeyCdsUsed0to10s(squadPlayers, skillMap);

  // preEngageDowns: count squad down events with tSec < 3
  let preEngageDowns = 0;
  for (const p of squadPlayers) {
    for (const [startMs] of p.combatReplayData?.down ?? []) {
      if (startMs / 1000 < 3) preEngageDowns++;
    }
  }

  // stab0to10s: mean of stabUptime over [0, min(10, seriesLen))
  const stab0to10sLen = Math.min(10, seriesLen);
  const stab0to10s = stab0to10sLen > 0
    ? stabUptime.slice(0, stab0to10sLen).reduce((s, v) => s + v, 0) / stab0to10sLen
    : 0;

  return {
    squadHpAtEngage,
    keyCdsUsed0to10s,
    preEngageDowns,
    stab0to10s,
    dodgeStarvation: 'low', // TODO(task-8): real heuristic deferred
  };
}

// ---------------------------------------------------------------------------
// Position helpers
// ---------------------------------------------------------------------------

/**
 * Get the [x, y] position for a player at a given second `tSec`.
 *
 * EI encodes positions as Array<[number, number]>, where the player's
 * `combatReplayData.start` frame is the absolute frame offset for positions[0].
 * A polling rate of 300 ms → ~3.33 frames per second.
 *
 * Returns null if the player has no position data at that second
 * (not yet spawned, or dead and no longer tracked).
 */
function playerPosAt(
  player: Player,
  tSec: number,
  framesPerSec: number,
): [number, number] | null {
  const positions = player.combatReplayData?.positions;
  if (!positions || positions.length === 0) return null;
  const startFrame = player.combatReplayData?.start ?? 0;
  const frame = Math.round(tSec * framesPerSec);
  const idx = frame - startFrame;
  if (idx < 0 || idx >= positions.length) return null;
  const pt = positions[idx];
  if (!Array.isArray(pt) || pt.length < 2) return null;
  return [pt[0], pt[1]];
}

/**
 * Compute the Euclidean distance between two 2-D points.
 */
function dist2d(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the population standard deviation of an array of numbers.
 * Returns 0 for arrays with fewer than 2 elements.
 */
function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Build per-second position data for the squad.
 *
 * Returns an array of length `seriesLen`, where each entry is either:
 *   - an array of [x, y] positions for squad members present at that second, or
 *   - an empty array (no players visible).
 *
 * Also returns `framesPerSec` for reuse.
 */
function buildSquadPositionSeries(
  squadPlayers: Player[],
  pollingRate: number,
  seriesLen: number,
): { perSecondPositions: Array<[number, number][]>; framesPerSec: number } {
  const framesPerSec = 1000 / pollingRate;
  const perSecondPositions: Array<[number, number][]> = [];

  for (let t = 0; t < seriesLen; t++) {
    const pts: [number, number][] = [];
    for (const p of squadPlayers) {
      const pos = playerPosAt(p, t, framesPerSec);
      if (pos !== null) pts.push(pos);
    }
    perSecondPositions.push(pts);
  }

  return { perSecondPositions, framesPerSec };
}

/**
 * Compute the centroid (mean position) of an array of [x, y] points.
 * Returns null if the array is empty.
 */
function centroid(pts: [number, number][]): [number, number] | null {
  if (pts.length === 0) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  return [sx / pts.length, sy / pts.length];
}

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

// ---------------------------------------------------------------------------
// Cohesion helpers
// ---------------------------------------------------------------------------

interface CohesionContext {
  squadPlayers: Player[];
  pollingRate: number;
  seriesLen: number;
  bombWindows: BombWindow[];
  deathsTimeline: DeathEvent[];
}

/**
 * Compute all cohesion & positioning metrics from per-second position data.
 *
 * This mutates `ctx.deathsTimeline` in-place to fill in `distFromTag` for
 * each death event.
 */
function computeCohesion(
  ctx: CohesionContext,
): { cohesion: CommanderFightData['cohesion']; spreadStdev: number[] } {
  const { squadPlayers, pollingRate, seriesLen, bombWindows, deathsTimeline } = ctx;
  const { perSecondPositions, framesPerSec } = buildSquadPositionSeries(
    squadPlayers, pollingRate, seriesLen,
  );

  // ---- Per-second metrics ----
  const spreadStdev = new Array<number>(seriesLen).fill(0);
  let totalDistSum = 0;
  let totalDistCount = 0;
  let timeSpread900PlusSec = 0;

  for (let t = 0; t < seriesLen; t++) {
    const pts = perSecondPositions[t];
    if (pts.length === 0) continue;

    const c = centroid(pts)!;
    const dists = pts.map(p => dist2d(p, c));

    // Average dist from tag (centroid) across all squad-player-seconds
    for (const d of dists) {
      totalDistSum += d;
      totalDistCount++;
    }

    // Spread σ at this second
    spreadStdev[t] = stdev(dists);

    // Seconds where any player > 900u from tag
    if (dists.some(d => d > 900)) {
      timeSpread900PlusSec++;
    }
  }

  const avgDistFromTag = totalDistCount > 0 ? totalDistSum / totalDistCount : 0;

  // ---- Peak spread ----
  let peakSpreadStdev = 0;
  let peakSpreadStdevTSec = 0;
  for (let t = 0; t < seriesLen; t++) {
    if (spreadStdev[t] > peakSpreadStdev) {
      peakSpreadStdev = spreadStdev[t];
      peakSpreadStdevTSec = t;
    }
  }

  // ---- Fill distFromTag on deathsTimeline entries ----
  for (const death of deathsTimeline) {
    const t = Math.min(Math.floor(death.tSec), seriesLen - 1);
    const pts = perSecondPositions[t];
    if (pts.length === 0) {
      death.distFromTag = 0;
      continue;
    }
    const c = centroid(pts)!;
    // Find this player's position at this second
    const player = squadPlayers.find(p => (p.account ?? p.name) === death.account);
    if (player) {
      const pos = playerPosAt(player, death.tSec, framesPerSec);
      death.distFromTag = pos !== null ? dist2d(pos, c) : 0;
    } else {
      death.distFromTag = 0;
    }
  }

  // ---- avgDistAtDeath ----
  const avgDistAtDeath = deathsTimeline.length > 0
    ? deathsTimeline.reduce((s, d) => s + d.distFromTag, 0) / deathsTimeline.length
    : 0;

  // ---- stragglersAtBomb ----
  // Unique squad players > 1500u from centroid during any bomb window
  const stragglerSet = new Set<string>();
  for (const bw of bombWindows) {
    const tStart = bw.tSec;
    const tEnd = Math.min(bw.tSec + bw.durationSec, seriesLen - 1);
    for (let t = Math.floor(tStart); t <= Math.ceil(tEnd) && t < seriesLen; t++) {
      const pts = perSecondPositions[t];
      if (pts.length === 0) continue;
      const c = centroid(pts)!;
      for (const p of squadPlayers) {
        const pos = playerPosAt(p, t, framesPerSec);
        if (pos === null) continue;
        if (dist2d(pos, c) > 1500) {
          stragglerSet.add(p.account ?? p.name);
        }
      }
    }
  }
  const stragglersAtBomb = stragglerSet.size;

  return {
    cohesion: {
      avgDistFromTag,
      timeSpread900PlusSec,
      avgDistAtDeath,
      peakSpreadStdev,
      peakSpreadStdevTSec,
      stragglersAtBomb,
    },
    spreadStdev,
  };
}

function computeMatchup(
  json: DPSReportJSON,
  squadPlayers: Player[],
  pollingRate: number,
  durationSec: number,
): CommanderFightData['matchup'] {
  // Squad members are players where notInSquad is not set (or false).
  const squadCount = squadPlayers.length;

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

  // ---- timeOutnumberedSec ----
  // If there are no enemy targets, we cannot compute outnumbered status → 0.
  // With real enemies, count seconds where (alive squad + alive allies) < alive enemies.
  // For now we only have squad alive-status from combatReplayData.dead ranges.
  let timeOutnumberedSec = 0;
  if (enemyCount > 0) {
    const allPlayers = json.players;
    const alliesPlayers = allPlayers.filter(p => p.notInSquad === true);
    const seriesLen = Math.ceil(durationSec);
    // A player is alive at second t if they have no dead interval whose start ≤ t*1000
    // (we use the simple approximation: alive = no dead range overlapping second t)
    for (let t = 0; t < seriesLen; t++) {
      const tMs = t * 1000;
      const aliveSquad = squadPlayers.filter(p => {
        const dead = p.combatReplayData?.dead ?? [];
        return !dead.some(([s, e]) => tMs >= s && tMs < e);
      }).length;
      const aliveAllies = alliesPlayers.filter(p => {
        const dead = p.combatReplayData?.dead ?? [];
        return !dead.some(([s, e]) => tMs >= s && tMs < e);
      }).length;
      // For enemies, we can only use a fixed enemyCount (no per-second alive data)
      const aliveEnemies = enemyCount;
      if (aliveSquad + aliveAllies < aliveEnemies) {
        timeOutnumberedSec++;
      }
    }
  }

  // ---- inTagBubbleAtEngage ----
  // Count squad players within 600u of squad centroid at t = min(2, durationSec).
  const TAG_RADIUS = 600;
  const framesPerSec = 1000 / pollingRate;
  const engageSec = Math.min(2, durationSec);
  const engagePts: [number, number][] = [];
  for (const p of squadPlayers) {
    const pos = playerPosAt(p, engageSec, framesPerSec);
    if (pos !== null) engagePts.push(pos);
  }
  const engageCentroid = centroid(engagePts);
  let inTagBubbleAtEngage = 0;
  if (engageCentroid !== null) {
    for (const pos of engagePts) {
      if (dist2d(pos, engageCentroid) <= TAG_RADIUS) {
        inTagBubbleAtEngage++;
      }
    }
  }

  return {
    squadCount,
    alliesCount,
    enemyCount,
    enemyPeak,
    effectiveRatio,
    timeOutnumberedSec,
    enemyComp,
    inTagBubbleAtEngage,
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

  const pollingRate = json.combatReplayMetaData?.pollingRate ?? 300;

  // Build squad players list early — shared across many sub-computations
  const squadPlayers = json.players.filter(p => !p.notInSquad);

  const matchup = computeMatchup(json, squadPlayers, pollingRate, duration);

  const survival = computeSurvival(json, options);

  // Build the deathsTimeline early so burst and cohesion can reference it.
  // distFromTag fields are 0 at this point and will be filled by computeCohesion.
  const deathsTimeline = buildDeathsTimeline(json, options);

  // Build per-second series for burst computation
  const { incomingDps, healingThroughput } = buildSeries(squadPlayers, seriesLen);

  const burst = computeBurst(
    incomingDps,
    healingThroughput,
    seriesLen,
    duration,
    deathsTimeline,
    squadPlayers,
  );

  // Compute cohesion & positioning (also mutates deathsTimeline.distFromTag in place)
  const { cohesion, spreadStdev } = computeCohesion({
    squadPlayers,
    pollingRate,
    seriesLen,
    bombWindows: burst.bombWindows,
    deathsTimeline,
  });

  // Build per-second Stability uptime series (needed by sustain, engage, and burst)
  const stabUptime = buildStabUptimeSeries(squadPlayers, seriesLen);

  // Patch burst.stabUptimeInSpike now that stabUptime is available
  const spikeT = burst.worst3sIncomingTSec;
  const spikeWindow = stabUptime.slice(spikeT, spikeT + 3);
  burst.stabUptimeInSpike = spikeWindow.length > 0
    ? spikeWindow.reduce((s, v) => s + v, 0) / spikeWindow.length
    : 0;

  const sustain = computeSustain(
    squadPlayers,
    stabUptime,
    burst.bombWindows,
    burst.worst3sIncomingTSec,
    seriesLen,
  );

  const engage = computeEngage(
    squadPlayers,
    json.skillMap,
    stabUptime,
    seriesLen,
  );

  // --- outcome ------------------------------------------------------------

  // kills: enemy players who have at least one dead interval in combatReplayData
  const enemyPlayerTargets = json.targets.filter(t => t.enemyPlayer === true);
  const kills = enemyPlayerTargets.filter(t => {
    const dead = (t as unknown as { combatReplayData?: { dead?: Array<[number, number]> } })
      .combatReplayData?.dead;
    return Array.isArray(dead) && dead.length > 0;
  }).length;

  // squadDeaths = total squad members who died at least once
  const squadDeaths = survival.squadTotal - survival.squadAliveAtEnd;

  // allyDeaths = same calculation for off-squad allies (notInSquad === true)
  const allyPlayers = json.players.filter(p => p.notInSquad === true);
  const allyDeaths = allyPlayers.filter(p => {
    const dead = p.combatReplayData?.dead;
    return Array.isArray(dead) && dead.length > 0;
  }).length;

  // damageOut: sum of dpsAll[0].damage across all squad members
  let damageOut = 0;
  for (const p of squadPlayers) {
    damageOut += p.dpsAll?.[0]?.damage ?? 0;
  }

  // damageIn: sum of defenses[0].damageTaken across all squad members
  let damageIn = 0;
  for (const p of squadPlayers) {
    damageIn += p.defenses?.[0]?.damageTaken ?? 0;
  }

  // netTrade: kills / max(1, squadDeaths), but if squadDeaths === 0 and kills > 0 use kills directly
  const netTrade = (squadDeaths === 0 && kills > 0)
    ? kills
    : kills / Math.max(1, squadDeaths);

  // damageOutInRatio: damageOut / max(1, damageIn)
  const damageOutInRatio = damageOut / Math.max(1, damageIn);

  const outcome: CommanderFightData['outcome'] = {
    kills,
    squadDeaths,
    allyDeaths,
    netTrade,
    damageOut,
    damageIn,
    damageOutInRatio,
  };

  // --- verdictChips -------------------------------------------------------
  const verdictChips: CommanderFightData['verdictChips'] = [];

  const isClean = squadDeaths === 0;
  const isWipe = squadDeaths >= Math.ceil(survival.squadTotal * 0.7);

  if (isClean) verdictChips.push('clean');
  if (isWipe) verdictChips.push('wipe');
  if (netTrade > 1.5) verdictChips.push('carry');
  if (netTrade >= 0.66 && netTrade <= 1.5 && !isClean && !isWipe) verdictChips.push('trade');
  if (matchup.effectiveRatio < 0.85 && matchup.enemyCount > 0) verdictChips.push('outnumbered');
  if (survival.firstSquadDeath && survival.firstSquadDeath.tSec < 15) verdictChips.push('caught-engage');
  if (cohesion.avgDistAtDeath > 700) verdictChips.push('caught-out');
  if (burst.bombWindows.some(w => w.outcome === 'broke')) verdictChips.push('bomb-broke-us');

  const series: CommanderFightData['series'] = {
    incomingDps,
    healingThroughput,
    stabUptime,
    spreadStdev,
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
    verdictChips,
  };
};
