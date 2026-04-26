export type DistanceContributionSource = 'replay' | 'fightAvg';

/** One player's contribution from a single fight. */
export type DistanceContribution = {
    account: string;
    profession: string;
    isCommander: boolean;
    fightId: string;
    source: DistanceContributionSource;
    /** When source==='replay': raw per-tick distance samples for this fight. */
    samples: number[];
    /** Per-fight mean distance (used in per-fight aggregation mode). */
    fightMean: number;
};

export type DistanceToTagRow = {
    account: string;
    profession: string;
    professionList: string[];
    fightCount: number;
    sampleCount: number;
    avg: number;
    median: number;
    p95: number;
    source: 'replay' | 'fightAvg' | 'mixed';
    isCommander: boolean;
};

export type DistanceToTagResult = {
    rows: DistanceToTagRow[];
    /** Number of distinct commander accounts across all fights. */
    commanderCount: number;
};

export const ingestLogDistanceToTag = (_log: any, _fightIndex: number): DistanceContribution[] => {
    return [];
};

export const finalizeDistanceToTag = (_contributions: DistanceContribution[]): DistanceToTagResult => {
    return { rows: [], commanderCount: 0 };
};

export const computeDistanceToTag = (sortedFightLogs: Array<{ log: any }>): DistanceToTagResult => {
    const all: DistanceContribution[] = [];
    sortedFightLogs.forEach(({ log }, idx) => {
        all.push(...ingestLogDistanceToTag(log, idx));
    });
    return finalizeDistanceToTag(all);
};
