import { computeStatsAggregation } from '../stats/computeStatsAggregation';

type WorkerPayload = {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: any;
    statsViewSettings?: any;
    disruptionMethod?: any;
};

let latestPayload: WorkerPayload | null = null;
let dirty = false;
let timer: number | null = null;
let computeId = 0;
let currentToken = 0;
let pendingFlushId: number | null = null;

const computeAndPost = () => {
    if (!dirty || !latestPayload) return;
    dirty = false;
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

const ensureTimer = () => {
    if (timer !== null) return;
    timer = setInterval(() => {
        computeAndPost();
    }, 5000) as unknown as number;
};

self.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (data?.type === 'reset') {
        latestPayload = { logs: [] };
        if (typeof data.token === 'number') {
            currentToken = data.token;
        }
        dirty = true;
        ensureTimer();
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
        dirty = true;
        ensureTimer();
        return;
    }
    if (data?.type === 'log') {
        if (!latestPayload) {
            latestPayload = { logs: [] };
        }
        latestPayload.logs.push(data.payload);
        dirty = true;
        ensureTimer();
        return;
    }
    if (data?.type === 'flush') {
        if (typeof data.flushId === 'number') {
            pendingFlushId = data.flushId;
        }
        dirty = true;
        computeAndPost();
    }
};
