// src/shared/commanderMetrics/shared.ts
// Shared helpers used across multiple commanderMetrics sections.

import type { Player } from '../dpsReportTypes';
import { PROFESSION_COLORS } from '../professionUtils';
import { buildNativeMovement, positionAtOrBefore, type PositionTrack } from '../movementData';
import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';

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
 * A squad member's native position track, tagged with the identity key the
 * rest of the commander metrics join on (`DeathEvent.account`, straggler sets).
 */
export interface SquadTrack {
  key: string;
  track: PositionTrack;
}

/**
 * Collect the squad's native position tracks.
 *
 * Every distance these tracks produce is in WORLD INCHES — game units — which
 * is the unit every threshold in `commanderThresholds.ts` is written in (600u
 * tag radius, 900u spread, 1500u straggler). The EI predecessor fed replay
 * PIXELS into those same comparisons; at ~0.0085 px/inch, 900u is 7.7px on a
 * 523×750 canvas, so `timeSpread900PlusSec` and `stragglersAtBomb` were
 * always 0 and `inTagBubbleAtEngage` was always the whole squad.
 */
export function buildSquadTracks(json: unknown): { tracks: SquadTrack[]; pollMs: number } {
  const movement = buildNativeMovement(json);
  if (!movement) return { tracks: [], pollMs: 300 };
  const tracks: SquadTrack[] = [];
  for (const entity of squadEntities((json as { native?: unknown })?.native ?? {})) {
    const track = movement.tracks.get(entity.id);
    if (!track) continue;
    tracks.push({ key: entity.account ?? String(entity.id), track });
  }
  return { tracks, pollMs: movement.pollMs };
}

/**
 * Where a squad member was at second `tSec`, in world inches, or null.
 *
 * Whole seconds do not land on the polling grid (t=1s sits between the 900ms
 * and 1200ms samples), so this asks "where were they last seen" with a
 * one-poll staleness bound rather than demanding an exact hit. Past that bound
 * — a tracking gap, or the end of the track — the answer is null, not a stale
 * position carried forward forever.
 *
 * There is no start-frame derivation here: native samples carry their own
 * timestamps. The mid-fight joiner that the EI path resolved to null at every
 * second of the fight is structurally impossible.
 */
export function squadPosAt(
  t: SquadTrack,
  tSec: number,
  pollMs: number,
): [number, number] | null {
  return positionAtOrBefore(t.track, tSec * 1000, pollMs);
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
 * Build per-second position data for the squad, in world inches.
 *
 * Returns an array of length `seriesLen`, where each entry is the positions of
 * the squad members tracked at that second — empty when nobody is.
 */
export function buildSquadPositionSeries(
  tracks: SquadTrack[],
  pollMs: number,
  seriesLen: number,
): Array<[number, number][]> {
  const perSecondPositions: Array<[number, number][]> = [];
  for (let t = 0; t < seriesLen; t++) {
    const pts: [number, number][] = [];
    for (const st of tracks) {
      const pos = squadPosAt(st, t, pollMs);
      if (pos !== null) pts.push(pos);
    }
    perSecondPositions.push(pts);
  }
  return perSecondPositions;
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
