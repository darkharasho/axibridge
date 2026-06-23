export interface SquadStatPlayer {
  account: string;
  value: number;
  profession?: string;
  professionList?: string[];
}

export interface SquadStatSummary {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
  players: SquadStatPlayer[];
  needsImprovementOutliers: SquadStatPlayer[];
}

export function computeSquadStat(
  players: SquadStatPlayer[],
  higherIsBetter: boolean,
  sigmaThreshold = 1.5,
): SquadStatSummary {
  const valid = (Array.isArray(players) ? players : [])
    .map((p) => ({ ...p, value: Number(p?.value) }))
    .filter((p) => Number.isFinite(p.value));

  const count = valid.length;
  if (count === 0) {
    return { mean: 0, stdDev: 0, min: 0, max: 0, count: 0, players: [], needsImprovementOutliers: [] };
  }

  const sorted = [...valid].sort((a, b) => a.value - b.value);
  const values = sorted.map((p) => p.value);
  const mean = values.reduce((sum, v) => sum + v, 0) / count;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / count;
  const stdDev = Math.sqrt(variance);
  const min = values[0];
  const max = values[values.length - 1];

  let needsImprovementOutliers: SquadStatPlayer[] = [];
  if (stdDev > 0) {
    const cutoff = sigmaThreshold * stdDev;
    needsImprovementOutliers = sorted.filter((p) =>
      higherIsBetter ? p.value < mean - cutoff : p.value > mean + cutoff,
    );
  }

  return { mean, stdDev, min, max, count, players: sorted, needsImprovementOutliers };
}
