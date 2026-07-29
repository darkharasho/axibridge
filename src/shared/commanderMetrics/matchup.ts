// src/shared/commanderMetrics/matchup.ts

import type { DPSReportJSON, Player } from '../dpsReportTypes';
import type { CommanderFightData } from '../commanderTypes';
import { KNOWN_PROFESSIONS, playerPosAt, dist2d, centroid } from './shared';
import { getWvwTeamColor, teamMapFromLog } from '../wvwTeams';
import { partitionSquadPlayers, getPlayerAccountKey } from '../playerIdentity';

export function computeMatchup(
  json: DPSReportJSON,
  squadPlayers: Player[],
  pollingRate: number,
  durationSec: number,
): CommanderFightData['matchup'] {
  // squadCount/alliesCount are DISTINCT-PERSON counts: arcdps emits a new
  // players[] entry per agent instance, so one person who relogs/build-swaps/
  // changes subgroup mid-fight can appear as several raw entries. `squadPlayers`
  // itself is left untouched below — every downstream series/sum computation
  // (alive-time, positions, stab uptime, etc.) must keep iterating every entry,
  // since each entry is a real, disjoint time-slice of that player's fight.
  const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(json.players);
  const squadCount = squadPrimaries.length;
  const alliesCount = pugPrimaries.length;

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
  // Position/centroid math stays entry-based (every tracked squadPlayers entry
  // still contributes a point, unchanged). Only the final "how many are on tag"
  // count is deduped by identity, so it stays comparable to the distinct-person
  // squadCount it's reported against (MatchupSection's tagPct = this / squadCount).
  const TAG_RADIUS = 600;
  const framesPerSec = 1000 / pollingRate;
  const engageSec = Math.min(2, durationSec);
  const engagePts: [number, number][] = [];
  const engagePtOwners: Player[] = [];
  for (const p of squadPlayers) {
    const pos = playerPosAt(p, engageSec, framesPerSec);
    if (pos !== null) {
      engagePts.push(pos);
      engagePtOwners.push(p);
    }
  }
  const engageCentroid = centroid(engagePts);
  let inTagBubbleAtEngage = 0;
  if (engageCentroid !== null) {
    const onTagKeys = new Set<string>();
    let onTagKeylessCount = 0;
    engagePts.forEach((pos, i) => {
      if (dist2d(pos, engageCentroid) <= TAG_RADIUS) {
        const key = getPlayerAccountKey(engagePtOwners[i]);
        if (key !== null) onTagKeys.add(key);
        else onTagKeylessCount++;
      }
    });
    inTagBubbleAtEngage = onTagKeys.size + onTagKeylessCount;
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
