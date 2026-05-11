// src/shared/commanderThresholds.ts
export interface CommanderThresholds {
  firstDeathMinSec: number;          // 15
  firstDeathMaxDist: number;         // 900
  bombRatio: number;                 // 2.5
  bombFloor: number | 'auto';        // 'auto' = max(150_000, p75 of 3s windows)
  stabGoodEngage: number;            // 0.75
  stabBadInBomb: number;             // 0.50
  cleanseDeficitWarn: number;        // -50
  stripDeficitWarn: number;          // 40
  rallyGood: number;                 // 0.55
  caughtOutDist: number;             // 700
  spreadBad: number;                 // 600
  outnumberedRatio: number;          // 0.85
  tagRadius: number;                 // 600
  supportPreBombLeadSec: number;     // 5
}

export const DEFAULT_COMMANDER_THRESHOLDS: CommanderThresholds = {
  firstDeathMinSec: 15,
  firstDeathMaxDist: 900,
  bombRatio: 2.5,
  bombFloor: 'auto',
  stabGoodEngage: 0.75,
  stabBadInBomb: 0.50,
  cleanseDeficitWarn: -50,
  stripDeficitWarn: 40,
  rallyGood: 0.55,
  caughtOutDist: 700,
  spreadBad: 600,
  outnumberedRatio: 0.85,
  tagRadius: 600,
  supportPreBombLeadSec: 5,
};
