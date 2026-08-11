// src/shared/commanderMetrics/shared.ts
// Shared helpers used across multiple commanderMetrics sections.

import type { Player } from '../dpsReportTypes';
import { PROFESSION_COLORS } from '../professionUtils';

// ---------------------------------------------------------------------------
// Buff IDs
// ---------------------------------------------------------------------------

/** Stability buff id per EI GW2 buff data. Confirmed present in fixture buffMap as b1122. */
export const STAB_BUFF_ID = 1122;
export const RESISTANCE_BUFF_ID = 26980;
export const AEGIS_BUFF_ID = 743;

// ---------------------------------------------------------------------------
// Profession set
// ---------------------------------------------------------------------------

/** Set of all known playable profession/elite-spec names for NPC filtering. */
export const KNOWN_PROFESSIONS = new Set(Object.keys(PROFESSION_COLORS).filter(k => k !== 'Unknown'));

// ---------------------------------------------------------------------------
// Buff-state helpers
// ---------------------------------------------------------------------------

/**
 * Given a player's `buffUptimes` array and a buff id, return the stack count
 * of that buff at `tMs` milliseconds into the fight (or 0 if not found).
 *
 * EI `states` is a sorted array of `[timeMs, stackCount]` state-change pairs.
 * The effective stack count at `tMs` is the last entry whose `timeMs ≤ tMs`.
 */
export function buffStackAtMs(player: Player, buffId: number, tMs: number): number {
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
export function buffActiveAtSec(player: Player, buffId: number, t: number): number {
  return buffStackAtMs(player, buffId, t * 1000) > 0 ? 1 : 0;
}

/**
 * Compute the mean uptime (0..1) of a given buff across all `squadPlayers`
 * at the given second `t`.
 */
export function squadBuffUptimeAtSec(
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
export function playerPosAt(
  player: Player,
  tSec: number,
  framesPerSec: number,
): [number, number] | null {
  const positions = player.combatReplayData?.positions;
  if (!positions || positions.length === 0) return null;
  // `combatReplayData.start` is MILLISECONDS, not a frame index. Subtracting
  // it from a frame number made every mid-fight joiner unresolvable: a player
  // starting at t=38317ms yielded `frame - 38317`, permanently negative, so
  // this returned null for them at every single second of the fight.
  // The first sample sits at poll `ceil(start / pollingRate)`, and
  // `pollingRate === 1000 / framesPerSec`.
  const startMs = player.combatReplayData?.start ?? 0;
  const startFrame = startMs > 0 ? Math.ceil((startMs * framesPerSec) / 1000) : 0;
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
export function dist2d(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the population standard deviation of an array of numbers.
 * Returns 0 for arrays with fewer than 2 elements.
 */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Compute the centroid (mean position) of an array of [x, y] points.
 * Returns null if the array is empty.
 */
export function centroid(pts: [number, number][]): [number, number] | null {
  if (pts.length === 0) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; }
  return [sx / pts.length, sy / pts.length];
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
export function buildSquadPositionSeries(
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

// ---------------------------------------------------------------------------
// Series helpers
// ---------------------------------------------------------------------------

/**
 * Convert a cumulative per-second array (EI `*1S` format) into a per-second
 * delta array of length `len`.  EI stores running totals; adjacent-element
 * differences give the value for each individual second.
 */
export function cumulativeToDelta(arr: number[], len: number): number[] {
  const out = new Array<number>(len).fill(0);
  for (let i = 0; i < len; i++) {
    const cur = arr[i] ?? 0;
    const prev = i > 0 ? (arr[i - 1] ?? 0) : 0;
    out[i] = cur - prev;
  }
  return out;
}
