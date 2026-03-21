import { computeStatsAggregation } from '../stats/computeStatsAggregation';

type WorkerPayload = {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: any;
    statsViewSettings?: any;
    disruptionMethod?: any;
};

let latestPayload: WorkerPayload | null = null;
let computeId = 0;
let currentToken = 0;
let pendingFlushId: number | null = null;
let expectedLogCount = 0;
let droppedLogMessages = 0;

const hasMismatchedToken = (data: any) =>
    typeof data?.token === 'number' && data.token !== currentToken;

const stripTransferHeavySkillRows = (result: any) => {
    const stats = result?.stats;
    if (!stats || typeof stats !== 'object') {
        return {
            spikeSkillRowsRemoved: 0,
            incomingSkillRowsRemoved: 0,
            playerSkillMapsRemoved: 0
        };
    }
    const stripRowsFromFights = (dataset: any) => {
        let removed = 0;
        const fights = Array.isArray(dataset?.fights) ? dataset.fights : [];
        fights.forEach((fight: any) => {
            if (!fight || typeof fight !== 'object') return;
            const values = fight.values;
            if (!values || typeof values !== 'object') return;
            Object.values(values).forEach((entry: any) => {
                if (!entry || typeof entry !== 'object') return;
                if (Array.isArray(entry.skillRows)) {
                    delete entry.skillRows;
                    removed += 1;
                }
            });
        });
        return removed;
    };
    const spikeSkillRowsRemoved = stripRowsFromFights(stats.spikeDamage);
    const incomingSkillRowsRemoved = stripRowsFromFights(stats.incomingStrikeDamage);
    let playerSkillMapsRemoved = 0;
    const playerSkillBreakdowns = Array.isArray(stats.playerSkillBreakdowns) ? stats.playerSkillBreakdowns : [];
    playerSkillBreakdowns.forEach((entry: any) => {
        if (!entry || typeof entry !== 'object') return;
        if (entry.skillMap && typeof entry.skillMap === 'object') {
            delete entry.skillMap;
            playerSkillMapsRemoved += 1;
        }
    });
    return {
        spikeSkillRowsRemoved,
        incomingSkillRowsRemoved,
        playerSkillMapsRemoved
    };
};

const computeAndPost = () => {
    if (!latestPayload) return;
    computeId += 1;
    const flushId = pendingFlushId;
    pendingFlushId = null;
    const computeStartedAt = performance.now();
    const result = computeStatsAggregation({ ...latestPayload, includePlayerSkillMap: false });
    const transferStripStats = stripTransferHeavySkillRows(result);
    const computeMs = Math.max(0, performance.now() - computeStartedAt);
    const stats = result?.stats;
    (self as any).postMessage({
        type: 'result',
        result,
        computeId,
        logCount: latestPayload.logs.length,
        token: currentToken,
        completedAt: Date.now(),
        flushId,
        diagnostics: {
            computeMs,
            logsInPayload: latestPayload.logs.length,
            expectedLogCount,
            droppedLogMessages,
            transferStripStats,
            counts: {
                playerSkillBreakdowns: Array.isArray(stats?.playerSkillBreakdowns) ? stats.playerSkillBreakdowns.length : 0,
                spikeFights: Array.isArray(stats?.spikeDamage?.fights) ? stats.spikeDamage.fights.length : 0,
                incomingStrikeFights: Array.isArray(stats?.incomingStrikeDamage?.fights) ? stats.incomingStrikeDamage.fights.length : 0
            }
        }
    });
};

self.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (data?.type === 'reset') {
        latestPayload = { logs: [] };
        if (typeof data.token === 'number') {
            currentToken = data.token;
        }
        expectedLogCount = Math.max(0, Number(data.totalLogs || 0));
        droppedLogMessages = 0;
        pendingFlushId = null;
        return;
    }
    if (hasMismatchedToken(data)) {
        return;
    }
    if (data?.type === 'settings') {
        latestPayload = {
            logs: latestPayload?.logs || [],
            precomputedStats: data.payload?.precomputedStats,
            mvpWeights: data.payload?.mvpWeights,
            statsViewSettings: data.payload?.statsViewSettings,
            disruptionMethod: data.payload?.disruptionMethod
        };
        return;
    }
    if (data?.type === 'log') {
        if (!latestPayload) {
            latestPayload = { logs: [] };
        }
        if (expectedLogCount > 0 && latestPayload.logs.length >= expectedLogCount) {
            droppedLogMessages += 1;
            return;
        }
        latestPayload.logs.push(data.payload);
        return;
    }
    if (data?.type === 'flush') {
        if (typeof data.flushId === 'number') {
            pendingFlushId = data.flushId;
        }
        computeAndPost();
    }
};
