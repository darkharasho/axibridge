// src/shared/commanderMetrics/cohesion.ts

import type { CommanderFightData, DeathEvent, BombWindow } from '../commanderTypes';
import type { PositionTrack } from '../movementData';
import {
  buildSquadPositionSeries,
  squadPosAt,
  tagPosAt,
  dist2d,
  centroid,
  stdev,
  type SquadTrack,
} from './shared';

/**
 * Every distance in this module is in WORLD INCHES (game units), because that
 * is what native tracks store and what the 900u / 1500u literals below have
 * always meant. The EI predecessor fed replay pixels into the same
 * comparisons — see `buildSquadTracks` for why that made these two metrics
 * unconditionally zero.
 *
 * All of them are measured from the COMMANDER, via `tagTrack`, falling back to
 * the squad centroid for any second the tag is not resolvable (and for a fight
 * with no tag at all). The centroid was the EI-era stand-in; see
 * `buildSquadTracks` for what it costs.
 */
export interface CohesionContext {
  squadTracks: SquadTrack[];
  pollMs: number;
  seriesLen: number;
  bombWindows: BombWindow[];
  deathsTimeline: DeathEvent[];
  tagTrack: PositionTrack | null;
}

/**
 * Compute all cohesion & positioning metrics from per-second position data.
 *
 * This mutates `ctx.deathsTimeline` in-place to fill in `distFromTag` for
 * each death event.
 */
export function computeCohesion(
  ctx: CohesionContext,
): { cohesion: CommanderFightData['cohesion']; spreadStdev: number[] } {
  const { squadTracks, pollMs, seriesLen, bombWindows, deathsTimeline, tagTrack } = ctx;
  const perSecondPositions = buildSquadPositionSeries(squadTracks, pollMs, seriesLen);

  /**
   * The point every distance below is measured from at second `t`: the
   * commander, or the squad centroid when the tag has no position there.
   *
   * `pts` is never empty at a call site (each guards on it first), so the
   * centroid fallback is always defined.
   */
  const originAt = (t: number, pts: [number, number][]): [number, number] =>
    tagPosAt(tagTrack, t, pollMs) ?? centroid(pts)!;

  // ---- Per-second metrics ----
  const spreadStdev = new Array<number>(seriesLen).fill(0);
  let totalDistSum = 0;
  let totalDistCount = 0;
  let timeSpread900PlusSec = 0;

  for (let t = 0; t < seriesLen; t++) {
    const pts = perSecondPositions[t];
    if (pts.length === 0) continue;

    const c = originAt(t, pts);
    const dists = pts.map(p => dist2d(p, c));

    // Average dist from tag across all squad-player-seconds
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
    const c = originAt(t, pts);
    // Find this member's position at the instant they died.
    const st = squadTracks.find(s => s.key === death.account);
    if (st) {
      const pos = squadPosAt(st, death.tSec, pollMs);
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
  // Unique squad players > 1500u from the tag during any bomb window
  const stragglerSet = new Set<string>();
  for (const bw of bombWindows) {
    const tStart = bw.tSec;
    const tEnd = Math.min(bw.tSec + bw.durationSec, seriesLen - 1);
    for (let t = Math.floor(tStart); t <= Math.ceil(tEnd) && t < seriesLen; t++) {
      const pts = perSecondPositions[t];
      if (pts.length === 0) continue;
      const c = originAt(t, pts);
      for (const st of squadTracks) {
        const pos = squadPosAt(st, t, pollMs);
        if (pos === null) continue;
        if (dist2d(pos, c) > 1500) {
          stragglerSet.add(st.key);
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
