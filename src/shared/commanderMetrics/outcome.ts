// src/shared/commanderMetrics/outcome.ts

import type { DPSReportJSON, Player } from '../dpsReportTypes';
import type { CommanderFightData } from '../commanderTypes';

export function computeOutcome(
  json: DPSReportJSON,
  squadPlayers: Player[],
  survival: CommanderFightData['survival'],
  matchup: CommanderFightData['matchup'],
  cohesion: CommanderFightData['cohesion'],
  burst: CommanderFightData['burst'],
): {
  outcome: CommanderFightData['outcome'];
  verdictChips: CommanderFightData['verdictChips'];
} {
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

  return { outcome, verdictChips };
}
