import { IncrementalAggregator } from '../stats/incrementalAggregation';

let aggregator: IncrementalAggregator | null = null;
let computeId = 0;
let currentToken = 0;
let pendingFlushId: number | null = null;
let expectedLogCount = 0;
let droppedLogMessages = 0;
let ingestedLogCount = 0;
let lastProgressPostAt = 0;

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
    if (!aggregator) return;
    computeId += 1;
    const flushId = pendingFlushId;
    pendingFlushId = null;
    const computeStartedAt = performance.now();
    let result: any;
    try {
        result = aggregator.finalize();
    } catch (err) {
        console.error('[StatsWorker] aggregator.finalize() threw:', err);
        (self as any).postMessage({
            type: 'result',
            result: { stats: null, skillUsageData: null },
            computeId,
            logCount: ingestedLogCount,
            token: currentToken,
            completedAt: Date.now(),
            flushId,
            diagnostics: {
                computeMs: Math.max(0, performance.now() - computeStartedAt),
                logsInPayload: ingestedLogCount,
                expectedLogCount,
                droppedLogMessages,
                error: err instanceof Error ? err.message : String(err)
            }
        });
        return;
    }
    const transferStripStats = stripTransferHeavySkillRows(result);
    const computeMs = Math.max(0, performance.now() - computeStartedAt);
    const stats = result?.stats;
    (self as any).postMessage({
        type: 'result',
        result,
        computeId,
        logCount: ingestedLogCount,
        token: currentToken,
        completedAt: Date.now(),
        flushId,
        diagnostics: {
            computeMs,
            logsInPayload: ingestedLogCount,
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
        aggregator = new IncrementalAggregator();
        ingestedLogCount = 0;
        if (typeof data.token === 'number') {
            currentToken = data.token;
        }
        expectedLogCount = Math.max(0, Number(data.totalLogs || 0));
        droppedLogMessages = 0;
        lastProgressPostAt = 0;
        pendingFlushId = null;
        return;
    }
    if (hasMismatchedToken(data)) return;
    if (data?.type === 'settings') {
        aggregator = new IncrementalAggregator({
            precomputedStats: data.payload?.precomputedStats,
            mvpWeights: data.payload?.mvpWeights,
            statsViewSettings: data.payload?.statsViewSettings,
            disruptionMethod: data.payload?.disruptionMethod,
            preciseReplay: data.payload?.preciseReplay,
        });
        ingestedLogCount = 0;
        return;
    }
    if (data?.type === 'log') {
        if (!aggregator) {
            aggregator = new IncrementalAggregator();
        }
        if (expectedLogCount > 0 && ingestedLogCount >= expectedLogCount) {
            droppedLogMessages += 1;
            return;
        }
        aggregator.ingestLog(data.payload);
        ingestedLogCount += 1;
        // Throttle progress messages to avoid flooding the main thread with
        // renders. Post at most every 250ms, but always post the final one.
        const now = performance.now();
        const isLast = expectedLogCount > 0 && ingestedLogCount >= expectedLogCount;
        if (isLast || now - lastProgressPostAt >= 250) {
            lastProgressPostAt = now;
            (self as any).postMessage({
                type: 'progress',
                ingested: ingestedLogCount,
                total: expectedLogCount,
                token: currentToken
            });
        }
        return;
    }
    if (data?.type === 'flush') {
        if (typeof data.flushId === 'number') {
            pendingFlushId = data.flushId;
        }
        computeAndPost();
    }
};
