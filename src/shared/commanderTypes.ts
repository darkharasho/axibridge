// src/shared/commanderTypes.ts
import type { DPSReportJSON } from './dpsReportTypes';

export type VerdictChip =
  | 'wipe' | 'trade' | 'carry' | 'clean'
  | 'outnumbered' | 'caught-engage' | 'caught-out' | 'bomb-broke-us';

export type PlayerRole = 'support' | 'damage' | 'unknown';

export interface DeathEvent {
  tSec: number;
  account: string;
  profession: string;
  role: PlayerRole;
  distFromTag: number;
}

export interface BombWindow {
  tSec: number;
  durationSec: number;
  incoming: number;
  heal: number;
  outcome: 'survived' | 'broke';
}

export interface CommanderFightData {
  fightId: string;
  map: string;
  startedAt: number;        // epoch ms
  duration: number;         // seconds

  matchup: {
    squadCount: number;
    alliesCount: number;
    enemyCount: number;
    enemyPeak: number;
    effectiveRatio: number;            // (squad+allies)/enemyPeak
    timeOutnumberedSec: number;
    enemyComp: Array<{ profession: string; count: number }>;
    enemyByTeam: Array<{ teamID: number; count: number }>;
    inTagBubbleAtEngage: number;
  };

  survival: {
    firstSquadDeath: DeathEvent | null;
    firstSupportDeath: DeathEvent | null;
    squadAliveAtEnd: number;
    squadTotal: number;
    rallyRate: number;                 // 0..1
    rallies: number;
    downs: number;
    avgTimeDownedSec: number;
  };

  burst: {
    worst3sIncoming: number;
    worst3sIncomingTSec: number;
    inHealRatioAtSpike: number;
    healAtSpike: number;
    bombWindowCount: number;
    bombWindows: BombWindow[];
    downsInWorst3s: number;
    stabUptimeInSpike: number;         // 0..1
  };

  cohesion: {
    avgDistFromTag: number;
    timeSpread900PlusSec: number;
    avgDistAtDeath: number;
    peakSpreadStdev: number;
    peakSpreadStdevTSec: number;
    stragglersAtBomb: number;
  };

  sustain: {
    cleansesApplied: number;
    conditionsTaken: number;
    stripsLanded: number;
    stripsReceived: number;
    stabThroughBombs: number;          // 0..1
    resistanceAtBurst: number;         // 0..1
    aegisAtBurst: number;              // 0..1
  };

  engage: {
    squadHpAtEngage: number;           // 0..1
    keyCdsUsed0to10s: number;          // 0..1
    preEngageDowns: number;
    stab0to10s: number;                // 0..1
    dodgeStarvation: 'low' | 'med' | 'high';
  };

  outcome: {
    kills: number;
    squadDeaths: number;
    allyDeaths: number;
    netTrade: number;
    damageOut: number;
    damageIn: number;
    damageOutInRatio: number;
  };

  series: {
    incomingDps: number[];             // per second, length = ceil(duration)
    healingThroughput: number[];
    stabUptime: number[];
    spreadStdev: number[];
    deathsTimeline: DeathEvent[];
  };

  verdictChips: VerdictChip[];
}

/** Optional accountName-keyed role classification, injected by the renderer
 *  (the actual classifier lives in src/renderer/ and cannot be imported here). */
export interface CommanderComputeOptions {
  classifyRole?: (accountName: string) => PlayerRole;
}

export type ComputeCommanderFightData = (
  json: DPSReportJSON,
  options?: CommanderComputeOptions,
) => CommanderFightData;
