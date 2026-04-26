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

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

const getStackDist = (player: any): number | null => {
    const stats = player?.statsAll?.[0];
    const v = stats?.stackDist;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

export const ingestLogDistanceToTag = (log: any, fightIndex: number): DistanceContribution[] => {
    const details = log?.details;
    const fightId = log?.filePath || `fight-${fightIndex}`;
    const players = Array.isArray(details?.players) ? details.players : [];
    const squadPlayers = players.filter((p: any) => !p?.notInSquad);
    if (squadPlayers.length === 0) return [];

    const replayMeta = details?.combatReplayMetaData || {};
    const pollingRate = replayMeta?.pollingRate > 0 ? replayMeta.pollingRate : 0;
    const inchToPixel = replayMeta?.inchToPixel > 0 ? replayMeta.inchToPixel : 0;

    const commander = squadPlayers.find((p: any) => p?.hasCommanderTag);
    const tagPositions: Array<[number, number]> = commander?.combatReplayData?.positions || [];
    const replayUsable = !!commander && tagPositions.length > 0 && pollingRate > 0 && inchToPixel > 0;

    const out: DistanceContribution[] = [];

    for (const player of squadPlayers) {
        const account = player?.account || 'Unknown';
        const profession = player?.profession || 'Unknown';
        const isCommander = !!player?.hasCommanderTag;

        const playerPositions: Array<[number, number]> | undefined = player?.combatReplayData?.positions;
        if (replayUsable && Array.isArray(playerPositions) && playerPositions.length > 0) {
            const playerStart = Number(player?.combatReplayData?.start || 0);
            const playerOffset = Math.floor(playerStart / pollingRate);
            const samples: number[] = [];
            for (let i = 0; i < playerPositions.length; i++) {
                const tagIdx = clamp(i + playerOffset, 0, tagPositions.length - 1);
                const [px, py] = playerPositions[i];
                const [tx, ty] = tagPositions[tagIdx];
                const dist = isCommander ? 0 : Math.hypot(px - tx, py - ty) / inchToPixel;
                samples.push(dist);
            }
            const fightMean = samples.length > 0
                ? samples.reduce((s, v) => s + v, 0) / samples.length
                : 0;
            out.push({ account, profession, isCommander, fightId, source: 'replay', samples, fightMean });
            continue;
        }

        const stack = getStackDist(player);
        if (stack === null) continue;
        out.push({
            account, profession, isCommander, fightId,
            source: 'fightAvg', samples: [], fightMean: stack,
        });
    }

    return out;
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
