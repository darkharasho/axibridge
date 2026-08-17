// src/shared/commanderMetrics/cohesion.ts

import type { CommanderFightData, DeathEvent, BombWindow } from '../commanderTypes';
import {
  buildSquadPositionSeries,
  squadPosAt,
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
 */
export interface CohesionContext {
  squadTracks: SquadTrack[];
  pollMs: number;
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
export function computeCohesion(
  ctx: CohesionContext,
): { cohesion: CommanderFightData['cohesion']; spreadStdev: number[] } {
  const { squadTracks, pollMs, seriesLen, bombWindows, deathsTimeline } = ctx;
  const perSecondPositions = buildSquadPositionSeries(squadTracks, pollMs, seriesLen);

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
  // Unique squad players > 1500u from centroid during any bomb window
  const stragglerSet = new Set<string>();
  for (const bw of bombWindows) {
    const tStart = bw.tSec;
    const tEnd = Math.min(bw.tSec + bw.durationSec, seriesLen - 1);
    for (let t = Math.floor(tStart); t <= Math.ceil(tEnd) && t < seriesLen; t++) {
      const pts = perSecondPositions[t];
      if (pts.length === 0) continue;
      const c = centroid(pts)!;
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
