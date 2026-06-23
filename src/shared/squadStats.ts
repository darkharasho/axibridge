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

export type PlayerRole = 'support' | 'damage';

export interface CohortStatPlayer extends SquadStatPlayer {
  role?: PlayerRole;
}

export interface CohortOutlier extends SquadStatPlayer {
  role?: PlayerRole;
  baseline: 'support' | 'damage' | 'squad';
  sigmaGap: number;
}

export interface CohortStatSummary {
  support?: SquadStatSummary;
  damage?: SquadStatSummary;
  squad: SquadStatSummary;
  needsImprovementOutliers: CohortOutlier[];
}

export function computeCohortStat(
  players: CohortStatPlayer[],
  higherIsBetter: boolean,
  sigmaThreshold = 1.5,
  minCohortSize = 3,
): CohortStatSummary {
  const valid = (Array.isArray(players) ? players : [])
    .map((p) => ({ ...p, value: Number(p?.value) }))
    .filter((p) => Number.isFinite(p.value));

  const squad = computeSquadStat(valid, higherIsBetter, sigmaThreshold);
  const supportPlayers = valid.filter((p) => p.role === 'support');
  const damagePlayers = valid.filter((p) => p.role === 'damage');
  const support = supportPlayers.length >= minCohortSize
    ? computeSquadStat(supportPlayers, higherIsBetter, sigmaThreshold)
    : undefined;
  const damage = damagePlayers.length >= minCohortSize
    ? computeSquadStat(damagePlayers, higherIsBetter, sigmaThreshold)
    : undefined;

  const baselineFor = (role?: PlayerRole): { summary: SquadStatSummary; label: 'support' | 'damage' | 'squad' } => {
    if (role === 'support' && support) return { summary: support, label: 'support' };
    if (role === 'damage' && damage) return { summary: damage, label: 'damage' };
    return { summary: squad, label: 'squad' };
  };

  const needsImprovementOutliers: CohortOutlier[] = [];
  for (const p of valid) {
    const { summary, label } = baselineFor(p.role);
    if (summary.stdDev <= 0) continue;
    const diff = higherIsBetter ? summary.mean - p.value : p.value - summary.mean;
    const sigmaGap = diff / summary.stdDev;
    if (sigmaGap >= sigmaThreshold) {
      needsImprovementOutliers.push({
        account: p.account,
        value: p.value,
        profession: p.profession,
        professionList: p.professionList,
        role: p.role,
        baseline: label,
        sigmaGap,
      });
    }
  }
  needsImprovementOutliers.sort((a, b) => b.sigmaGap - a.sigmaGap);

  return { support, damage, squad, needsImprovementOutliers };
}
