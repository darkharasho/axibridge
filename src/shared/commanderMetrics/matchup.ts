// src/shared/commanderMetrics/matchup.ts

import type { DPSReportJSON, Player } from '../dpsReportTypes';
import type { CommanderFightData } from '../commanderTypes';
import { KNOWN_PROFESSIONS, playerPosAt, dist2d, centroid } from './shared';

export function computeMatchup(
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

  // Enemy split by teamID (WvW shows two opposing teams; if EI didn't tag teamID
  // on this log, this stays empty and the UI hides the breakdown).
  const teamMap = new Map<number, number>();
  for (const t of enemyTargets) {
    if (typeof t.teamID === 'number') {
      teamMap.set(t.teamID, (teamMap.get(t.teamID) ?? 0) + 1);
    }
  }
  const enemyByTeam = Array.from(teamMap.entries())
    .map(([teamID, count]) => ({ teamID, count }))
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
    enemyByTeam,
    inTagBubbleAtEngage,
  };
}
