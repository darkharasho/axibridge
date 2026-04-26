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
    p25: number;
    median: number;
    p75: number;
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

const median = (sortedAsc: number[]): number => {
    if (sortedAsc.length === 0) return 0;
    const n = sortedAsc.length;
    if (n % 2 === 1) return sortedAsc[(n - 1) / 2];
    return (sortedAsc[n / 2 - 1] + sortedAsc[n / 2]) / 2;
};

const nearestRankPercentile = (sortedAsc: number[], percentile: number): number => {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.max(0, Math.ceil(percentile * sortedAsc.length) - 1);
    return sortedAsc[idx];
};

export const finalizeDistanceToTag = (contributions: DistanceContribution[]): DistanceToTagResult => {
    if (contributions.length === 0) return { rows: [], commanderCount: 0 };

    // Group contributions by account.
    const byAccount = new Map<string, DistanceContribution[]>();
    for (const c of contributions) {
        const list = byAccount.get(c.account);
        if (list) list.push(c);
        else byAccount.set(c.account, [c]);
    }

    // Identify commander accounts (any fight where they were commander).
    const commanderAccounts = new Set<string>();
    for (const [account, list] of byAccount) {
        if (list.some(c => c.isCommander)) commanderAccounts.add(account);
    }
    const commanderCount = commanderAccounts.size;
    const includeCommanders = commanderCount > 2;

    const rows: DistanceToTagRow[] = [];

    for (const [account, list] of byAccount) {
        const isCommander = commanderAccounts.has(account);
        if (isCommander && !includeCommanders) continue;

        const fightIds = new Set<string>();
        const sources = new Set<DistanceContributionSource>();
        for (const c of list) {
            fightIds.add(c.fightId);
            sources.add(c.source);
        }

        const sourceLabel: DistanceToTagRow['source'] =
            sources.size > 1 ? 'mixed' : (sources.has('replay') ? 'replay' : 'fightAvg');

        // Profession bookkeeping.
        const professionList = Array.from(new Set(list.map(c => c.profession).filter(p => p && p !== 'Unknown')));
        const profession = list[list.length - 1].profession;

        let values: number[];
        if (sourceLabel === 'replay') {
            // Pure replay: pool every sample.
            values = [];
            for (const c of list) {
                if (c.samples.length > 0) {
                    for (const s of c.samples) values.push(s);
                } else {
                    values.push(c.fightMean);
                }
            }
        } else {
            // fightAvg or mixed: per-fight values.
            values = list.map(c => c.fightMean);
        }

        if (values.length === 0) continue;

        const sorted = [...values].sort((a, b) => a - b);
        const avg = values.reduce((s, v) => s + v, 0) / values.length;

        rows.push({
            account,
            profession,
            professionList,
            fightCount: fightIds.size,
            sampleCount: values.length,
            avg: Math.round(avg),
            p25: Math.round(nearestRankPercentile(sorted, 0.25)),
            median: Math.round(median(sorted)),
            p75: Math.round(nearestRankPercentile(sorted, 0.75)),
            p95: Math.round(nearestRankPercentile(sorted, 0.95)),
            source: sourceLabel,
            isCommander,
        });
    }

    return { rows, commanderCount };
};

export const computeDistanceToTag = (sortedFightLogs: Array<{ log: any }>): DistanceToTagResult => {
    const all: DistanceContribution[] = [];
    sortedFightLogs.forEach(({ log }, idx) => {
        all.push(...ingestLogDistanceToTag(log, idx));
    });
    return finalizeDistanceToTag(all);
};
