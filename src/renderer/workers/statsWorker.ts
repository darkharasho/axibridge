import { computeStatsAggregation } from '../stats/computeStatsAggregation';
import { isStatsPrunedLog, pruneLogForStats } from '../stats/utils/pruneStatsLog';

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

const computeAndPost = () => {
    if (!latestPayload) return;
    computeId += 1;
    const flushId = pendingFlushId;
    pendingFlushId = null;
    const result = computeStatsAggregation(latestPayload);
    (self as any).postMessage({
        type: 'result',
        result,
        computeId,
        logCount: latestPayload.logs.length,
        token: currentToken,
        completedAt: Date.now(),
        flushId
    });
};

self.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (data?.type === 'reset') {
        latestPayload = { logs: [] };
        if (typeof data.token === 'number') {
            currentToken = data.token;
        }
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
        latestPayload.logs.push(isStatsPrunedLog(data.payload) ? data.payload : pruneLogForStats(data.payload));
        return;
    }
    if (data?.type === 'flush') {
        if (typeof data.flushId === 'number') {
            pendingFlushId = data.flushId;
        }
        computeAndPost();
    }
};
