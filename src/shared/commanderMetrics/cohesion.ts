// src/shared/commanderMetrics/cohesion.ts

import type { Player } from '../dpsReportTypes';
import type { CommanderFightData, DeathEvent, BombWindow } from '../commanderTypes';
import {
  buildSquadPositionSeries,
  playerPosAt,
  dist2d,
  centroid,
  stdev,
} from './shared';

export interface CohesionContext {
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
export function computeCohesion(
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
