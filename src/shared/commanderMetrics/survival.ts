// src/shared/commanderMetrics/survival.ts

import type { DPSReportJSON } from '../dpsReportTypes';
import type { CommanderFightData, DeathEvent, CommanderComputeOptions } from '../commanderTypes';

/**
 * Build the deathsTimeline: one DeathEvent per squad player who died at least
 * once, recorded at the time of their first death. Sorted chronologically.
 * distFromTag defaults to 0 (positional data is Task 6).
 */
export function buildDeathsTimeline(
  json: DPSReportJSON,
  options?: CommanderComputeOptions,
): DeathEvent[] {
  const events: DeathEvent[] = [];
  for (const p of json.players) {
    if (p.notInSquad) continue;
    const dead = p.combatReplayData?.dead;
    if (!dead || dead.length === 0) continue;
    const firstDeadMs = dead[0][0];
    const account = p.account ?? p.name;
    const role = options?.classifyRole ? options.classifyRole(account) : 'unknown';
    events.push({
      tSec: firstDeadMs / 1000,
      account,
      profession: p.profession,
      role,
      distFromTag: 0,
    });
  }
  events.sort((a, b) => a.tSec - b.tSec);
  return events;
}

/**
 * Compute all survival metrics for a fight.
 *
 * Down/death state changes come from player.combatReplayData.dead and .down,
 * each as arrays of [startMs, endMs] pairs.
 *
 * A "rally" is a down event where the player recovered — i.e. no dead event
 * begins within 50 ms of the down's end time.
 */
export function computeSurvival(
  json: DPSReportJSON,
  options?: CommanderComputeOptions,
): CommanderFightData['survival'] {
  const squadPlayers = json.players.filter(p => !p.notInSquad);
  const squadTotal = squadPlayers.length;

  let squadAliveAtEnd = 0;
  let downs = 0;
  let rallies = 0;
  let rallyDurationSum = 0;

  // Track the overall earliest squad death for firstSquadDeath
  let firstSquadDeath: DeathEvent | null = null;
  let firstSquadDeathMs = Infinity;

  // Track earliest support death for firstSupportDeath (requires classifyRole)
  let firstSupportDeath: DeathEvent | null = null;
  let firstSupportDeathMs = Infinity;

  for (const p of squadPlayers) {
    const dead = p.combatReplayData?.dead ?? [];
    const downEvents = p.combatReplayData?.down ?? [];
    const account = p.account ?? p.name;
    const role = options?.classifyRole ? options.classifyRole(account) : 'unknown';

    // squadAliveAtEnd: player never entered a dead state
    if (dead.length === 0) {
      squadAliveAtEnd++;
    }

    // Earliest death tracking
    if (dead.length > 0) {
      const deathMs = dead[0][0];
      if (deathMs < firstSquadDeathMs) {
        firstSquadDeathMs = deathMs;
        firstSquadDeath = {
          tSec: deathMs / 1000,
          account,
          profession: p.profession,
          role,
          distFromTag: 0,
        };
      }
      if (role === 'support' && deathMs < firstSupportDeathMs) {
        firstSupportDeathMs = deathMs;
        firstSupportDeath = {
          tSec: deathMs / 1000,
          account,
          profession: p.profession,
          role,
          distFromTag: 0,
        };
      }
    }

    // Down/rally analysis
    for (const [downStart, downEnd] of downEvents) {
      downs++;
      // Rally = the down resolved without a death immediately following
      const diedAfterDown = dead.some(([ds]) => Math.abs(ds - downEnd) < 50);
      if (!diedAfterDown) {
        rallies++;
        rallyDurationSum += (downEnd - downStart) / 1000;
      }
    }
  }

  const rallyRate = downs > 0 ? rallies / downs : 0;
  const avgTimeDownedSec = rallies > 0 ? rallyDurationSum / rallies : 0;

  // If classifyRole is not provided, firstSupportDeath must be null
  if (!options?.classifyRole) {
    firstSupportDeath = null;
  }

  return {
    firstSquadDeath,
    firstSupportDeath,
    squadAliveAtEnd,
    squadTotal,
    rallyRate,
    rallies,
    downs,
    avgTimeDownedSec,
  };
}
