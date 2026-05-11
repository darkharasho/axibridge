// src/shared/commanderMetrics/burstAndSeries.ts

import type { Player } from '../dpsReportTypes';
import type { CommanderFightData, DeathEvent, BombWindow } from '../commanderTypes';
import { cumulativeToDelta } from './shared';

/**
 * Build the `incomingDps` and `healingThroughput` per-second series from the
 * squad player list.
 *
 * - `incomingDps`: sum of `player.damageTaken1S[0]` (phase 0, cumulative)
 *   diffed across all squad members.
 * - `healingThroughput`: sum of `player.extHealingStats.healing1S[0]` (total
 *   outgoing healing per second) across all squad members.  This is outgoing
 *   healing from each squad member to any target; it is the closest available
 *   proxy for "healing applied to squad" without target-filtering.
 */
export function buildSeries(
  squadPlayers: Player[],
  seriesLen: number,
): { incomingDps: number[]; healingThroughput: number[] } {
  const incomingDps = new Array<number>(seriesLen).fill(0);
  const healingThroughput = new Array<number>(seriesLen).fill(0);

  for (const p of squadPlayers) {
    const dmgArr = p.damageTaken1S?.[0];
    if (dmgArr) {
      const delta = cumulativeToDelta(dmgArr, seriesLen);
      for (let i = 0; i < seriesLen; i++) incomingDps[i] += delta[i];
    }

    const healArr = p.extHealingStats?.healing1S?.[0];
    if (healArr) {
      const delta = cumulativeToDelta(healArr, seriesLen);
      for (let i = 0; i < seriesLen; i++) healingThroughput[i] += delta[i];
    }
  }

  return { incomingDps, healingThroughput };
}

/**
 * Compute the 75th-percentile value of an array of numbers.
 * Returns 0 for empty arrays.
 */
function p75(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.75)];
}

/**
 * Compute all burst metrics and bomb-window detection from the per-second
 * series and combat-replay data.
 *
 * Damage taken source : `player.damageTaken1S[0]` (cumulative, diffed)
 * Healing source      : `player.extHealingStats.healing1S[0]` (cumulative,
 *                       diffed) – total outgoing healing from squad members
 *                       (proxy for healing applied to squad).
 */
export function computeBurst(
  incomingDps: number[],
  healingThroughput: number[],
  seriesLen: number,
  durationSec: number,
  deathsTimeline: DeathEvent[],
  squadPlayers: Player[],
): CommanderFightData['burst'] {
  // ----- Sliding 3-second window sums -----
  interface Window3s { t: number; inc: number; heal: number }
  const windows: Window3s[] = [];
  for (let i = 0; i + 3 <= seriesLen; i++) {
    windows.push({
      t: i,
      inc: incomingDps[i] + incomingDps[i + 1] + incomingDps[i + 2],
      heal: healingThroughput[i] + healingThroughput[i + 1] + healingThroughput[i + 2],
    });
  }

  // ----- Worst 3-second window -----
  let worst: Window3s = { t: 0, inc: 0, heal: 0 };
  for (const w of windows) {
    if (w.inc > worst.inc) worst = w;
  }
  const worst3sIncoming = worst.inc;
  const worst3sIncomingTSec = worst.t;
  const healAtSpike = worst.heal;
  const inHealRatioAtSpike = worst.inc / Math.max(1, worst.heal);

  // ----- Bomb-floor -----
  const bombFloor = Math.max(150_000, p75(windows.map(w => w.inc)));

  // ----- Bomb candidates -----
  const candidates = windows.filter(
    w => w.inc > bombFloor && w.inc / Math.max(1, w.heal) > 2.5,
  );

  // ----- Merge overlapping / adjacent candidates (within 1 second) -----
  const groups: Window3s[][] = [];
  let group: Window3s[] = [];
  for (const c of candidates) {
    if (group.length === 0 || c.t - group[group.length - 1].t <= 1) {
      group.push(c);
    } else {
      groups.push(group);
      group = [c];
    }
  }
  if (group.length > 0) groups.push(group);

  // ----- Build BombWindow objects -----
  // Collect down-event start times (ms → s) for all squad members
  const downStartsSec: number[] = [];
  for (const p of squadPlayers) {
    for (const [startMs] of p.combatReplayData?.down ?? []) {
      downStartsSec.push(startMs / 1000);
    }
  }

  const bombWindows: BombWindow[] = groups.map(grp => {
    const tSec = grp[0].t;
    const lastT = grp[grp.length - 1].t;
    // Cover all merged 3-second windows; cap at fight end
    const windowDurationSec = Math.min(lastT + 3 - tSec, durationSec - tSec);
    const endSec = tSec + windowDurationSec;

    // incoming = peak incoming of any constituent window
    const incoming = grp.reduce((best, w) => Math.max(best, w.inc), 0);
    // heal = sum of heal over covered window seconds
    let heal = 0;
    for (let s = tSec; s < endSec && s < seriesLen; s++) {
      heal += healingThroughput[s];
    }

    // Deaths: first-death events from deathsTimeline within [tSec, endSec]
    const windowDeaths = deathsTimeline.filter(
      e => e.tSec >= tSec && e.tSec < endSec,
    ).length;

    const outcome: BombWindow['outcome'] = windowDeaths >= 2 ? 'broke' : 'survived';

    return { tSec, durationSec: windowDurationSec, incoming, heal, outcome };
  });

  // ----- Downs in worst 3-second window -----
  // Combine deathsTimeline entries AND combatReplayData.down start times
  const worstEnd = worst3sIncomingTSec + 3;
  const deathCountInWorst = deathsTimeline.filter(
    e => e.tSec >= worst3sIncomingTSec && e.tSec < worstEnd,
  ).length;
  const downCountInWorst = downStartsSec.filter(
    t => t >= worst3sIncomingTSec && t < worstEnd,
  ).length;
  const downsInWorst3s = deathCountInWorst + downCountInWorst;

  return {
    worst3sIncoming,
    worst3sIncomingTSec,
    inHealRatioAtSpike,
    healAtSpike,
    bombWindowCount: bombWindows.length,
    bombWindows,
    downsInWorst3s,
    stabUptimeInSpike: 0, // patched by orchestrator after stabUptime is computed
  };
}
