// src/shared/commanderMetrics/index.ts
// Orchestrator: calls each section helper and assembles the final CommanderFightData.

import type { ComputeCommanderFightData } from '../commanderTypes';
import { computeMatchup } from './matchup';
import { computeSurvival, buildDeathsTimeline } from './survival';
import { buildSeries, computeBurst } from './burstAndSeries';
import { computeCohesion } from './cohesion';
import { buildStabUptimeSeries, computeSustain, computeEngage } from './sustainAndEngage';
import { computeOutcome } from './outcome';
import { buildSquadTracks } from './shared';

export const computeCommanderFightData: ComputeCommanderFightData = (json, options) => {
  // --- root fields -------------------------------------------------------
  const duration = json.durationMS / 1000;
  const map = json.fightName ?? '';
  const startedAt = json.uploadTime ?? 0;
  const fightId = `${map}|${startedAt}`;

  const seriesLen = Math.ceil(duration);

  // Positions come from native tracks, in world inches. Nothing here reads
  // `combatReplayMetaData` any more — not its pollingRate, not its pixel space.
  const { tracks: squadTracks, pollMs } = buildSquadTracks(json);

  // Build squad players list early — shared across many sub-computations
  const squadPlayers = json.players.filter(p => !p.notInSquad);

  const matchup = computeMatchup(json, squadPlayers, squadTracks, pollMs, duration);

  const survival = computeSurvival(json, options);

  // Build the deathsTimeline early so burst and cohesion can reference it.
  // distFromTag fields are 0 at this point and will be filled by computeCohesion.
  const deathsTimeline = buildDeathsTimeline(json, options);

  // Build per-second series for burst computation
  const { incomingDps, healingThroughput } = buildSeries(squadPlayers, seriesLen);

  const burst = computeBurst(
    incomingDps,
    healingThroughput,
    seriesLen,
    duration,
    deathsTimeline,
    squadPlayers,
  );

  // Compute cohesion & positioning (also mutates deathsTimeline.distFromTag in place)
  const { cohesion, spreadStdev } = computeCohesion({
    squadTracks,
    pollMs,
    seriesLen,
    bombWindows: burst.bombWindows,
    deathsTimeline,
  });

  // Build per-second Stability uptime series (needed by sustain, engage, and burst)
  const stabUptime = buildStabUptimeSeries(squadPlayers, seriesLen);

  // Patch burst.stabUptimeInSpike now that stabUptime is available
  const spikeT = burst.worst3sIncomingTSec;
  const spikeWindow = stabUptime.slice(spikeT, spikeT + 3);
  burst.stabUptimeInSpike = spikeWindow.length > 0
    ? spikeWindow.reduce((s, v) => s + v, 0) / spikeWindow.length
    : 0;

  const sustain = computeSustain(
    squadPlayers,
    stabUptime,
    burst.bombWindows,
    burst.worst3sIncomingTSec,
    seriesLen,
  );

  const engage = computeEngage(
    squadPlayers,
    json.skillMap,
    stabUptime,
    seriesLen,
  );

  const { outcome, verdictChips } = computeOutcome(
    json,
    squadPlayers,
    survival,
    matchup,
    cohesion,
    burst,
  );

  const series: import('../commanderTypes').CommanderFightData['series'] = {
    incomingDps,
    healingThroughput,
    stabUptime,
    spreadStdev,
    deathsTimeline,
  };

  return {
    fightId,
    map,
    startedAt,
    duration,
    matchup,
    survival,
    burst,
    cohesion,
    sustain,
    engage,
    outcome,
    series,
    verdictChips,
  };
};
