// src/shared/commanderMetrics/sustainAndEngage.ts

import type { DPSReportJSON, Player } from '../dpsReportTypes';
import type { CommanderFightData, BombWindow } from '../commanderTypes';
import {
  STAB_BUFF_ID,
  RESISTANCE_BUFF_ID,
  AEGIS_BUFF_ID,
  squadBuffUptimeAtSec,
} from './shared';

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

// ---------------------------------------------------------------------------
// Stab series
// ---------------------------------------------------------------------------

/**
 * Compute the per-second Stability uptime series across all squad players.
 *
 * For each second `t ∈ [0, seriesLen)`, the value is the fraction of squad
 * players who had Stability stacks > 0 at the *start* of that second.
 * Uses `buffUptimes[id=1122].states` (an array of `[timeMs, stackCount]` pairs).
 */
export function buildStabUptimeSeries(
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

export function computeSustain(
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

export function computeEngage(
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
