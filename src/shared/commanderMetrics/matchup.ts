// src/shared/commanderMetrics/matchup.ts

import type { DPSReportJSON, Player } from '../dpsReportTypes';
import type { CommanderFightData } from '../commanderTypes';
import { KNOWN_PROFESSIONS, playerPosAt, dist2d, centroid } from './shared';
import { getWvwTeamColor, teamMapFromLog } from '../wvwTeams';

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

  // Enemy split by teamID, resolved to real Red/Green/Blue colors. Prefer EI's
  // authoritative wvWMapData; fall back to the fixed id-table for older logs.
  const wvwMap = teamMapFromLog(json);
  const teamMap = new Map<number, number>();
  for (const t of enemyTargets) {
    if (typeof t.teamID === 'number') {
      teamMap.set(t.teamID, (teamMap.get(t.teamID) ?? 0) + 1);
    }
  }
  const enemyByTeam = Array.from(teamMap.entries())
    .map(([teamID, count]) => ({ teamID, count, color: getWvwTeamColor(teamID, wvwMap) }))
    // Kept in body-count order (largest first) so the proportional bar reads naturally;
    // the Discord and per-log surfaces order teams by fixed color instead.
    .sort((a, b) => b.count - a.count);

  // Squad's own team color (from the first squad player that has a teamID).
  const squadTeamId = squadPlayers.map((p) => p.teamID).find((id) => typeof id === 'number' && id > 0);
  const squadColorResolved = squadTeamId !== undefined ? getWvwTeamColor(squadTeamId, wvwMap) : 'unknown';
  const squadColor = squadColorResolved === 'unknown' ? null : squadColorResolved;

  // ---- timeOutnumberedSec ----
  // If there are no enemy targets, we cannot compute outnumbered status → 0.
  // With real enemies, count seconds where (alive squad + alive allies) < alive enemies.
  // For now we only have squad alive-status from combatReplayData.dead ranges.
  let timeOutnumberedSec = 0;
  if (enemyCount > 0) {
    const alliesPlayers = json.players.filter(p => p.notInSquad === true);
    const seriesLen = Math.ceil(durationSec);

    // Precompute per-player alive[t] arrays once, then per second it's just a sum.
    // alive[t] = no dead range overlaps second t (in ms).
    const buildAliveArr = (p: Player): Uint8Array => {
      const arr = new Uint8Array(seriesLen).fill(1);
      const dead = p.combatReplayData?.dead ?? [];
      for (const [s, e] of dead) {
        const tStart = Math.max(0, Math.floor(s / 1000));
        const tEnd = Math.min(seriesLen - 1, Math.ceil(e / 1000) - 1);
        for (let t = tStart; t <= tEnd; t++) {
          // Match the exact original predicate: tMs >= s && tMs < e
          const tMs = t * 1000;
          if (tMs >= s && tMs < e) arr[t] = 0;
        }
      }
      return arr;
    };

    const squadAlive = squadPlayers.map(buildAliveArr);
    const alliesAlive = alliesPlayers.map(buildAliveArr);

    for (let t = 0; t < seriesLen; t++) {
      let aliveSquad = 0;
      for (const arr of squadAlive) aliveSquad += arr[t];
      let aliveAllies = 0;
      for (const arr of alliesAlive) aliveAllies += arr[t];
      if (aliveSquad + aliveAllies < enemyCount) {
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
    squadColor,
    inTagBubbleAtEngage,
  };
}
