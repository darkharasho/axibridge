import { IncrementalAggregator } from '../stats/incrementalAggregation';
import { buildReplayKey, createReplayElisionState, elideUnchangedReplayFights } from './replayTransfer';

let aggregator: IncrementalAggregator | null = null;
let computeId = 0;
let currentToken = 0;
let pendingFlushId: number | null = null;
let expectedLogCount = 0;
let droppedLogMessages = 0;
let ingestedLogCount = 0;
let lastProgressPostAt = 0;
let ingestedLogIds: string[] = [];
// Ids of ingested logs that carried a sectorOwners snapshot — part of the
// replay elision key, since ownership patches change payload contents without
// changing the log set.
let ingestedOwnedLogIds: string[] = [];
let currentPreciseReplay: boolean | undefined = undefined;
// Survives resets on purpose: tracks the replay payload last posted to the main
// thread so identical payloads (same logs, same preciseReplay) are not re-cloned.
const replayElisionState = createReplayElisionState();
// Survives resets on purpose: log payloads received from the main thread, keyed
// by log identity. Restarts re-send unchanged logs as tiny `ref` messages instead
// of multi-MB structured clones; the main thread bounds this store via 'forget'.
const payloadStore = new Map<string, any>();

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

const computeAndPost = (skipReplay = false) => {
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
    let replayElided = false;
    if (skipReplay && Array.isArray(result?.stats?.replayFights) && result.stats.replayFights.length > 0) {
        // Mid-bulk flush: drop the replay payload without recording it as posted,
        // so the settling flush transfers it in full.
        delete result.stats.replayFights;
        result.stats.replayFightsElided = true;
        replayElided = true;
    } else {
        replayElided = elideUnchangedReplayFights(
            result,
            buildReplayKey(ingestedLogIds, currentPreciseReplay, ingestedOwnedLogIds),
            replayElisionState
        );
    }
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
            replayElided,
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
        ingestedLogIds = [];
        ingestedOwnedLogIds = [];
        currentPreciseReplay = undefined;
        if (typeof data.token === 'number') {
            currentToken = data.token;
        }
        expectedLogCount = Math.max(0, Number(data.totalLogs || 0));
        droppedLogMessages = 0;
        lastProgressPostAt = 0;
        pendingFlushId = null;
        return;
    }
    if (data?.type === 'resetReplayElision') {
        // Recovery path: the main thread is stuck with an elided replay payload it
        // never received in full (e.g. the settling flush ran with skipReplay while
        // a log's details were still pending). Clear the tracked key so the next
        // flush re-transfers replayFights in full instead of eliding again.
        replayElisionState.lastKey = '';
        return;
    }
    if (data?.type === 'forget') {
        // Cache-coherence message — must apply regardless of token.
        const keys = Array.isArray(data.keys) ? data.keys : [];
        keys.forEach((key: unknown) => {
            if (typeof key === 'string') payloadStore.delete(key);
        });
        return;
    }
    // Store full log payloads even when the token is stale: the main thread's
    // sent-map assumes every keyed payload it posted is in the store.
    if (data?.type === 'log' && typeof data.key === 'string' && data.payload !== undefined) {
        payloadStore.set(data.key, data.payload);
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
        ingestedLogIds = [];
        ingestedOwnedLogIds = [];
        currentPreciseReplay = Boolean(data.payload?.preciseReplay);
        return;
    }
    if (data?.type === 'mergeFrames') {
        // The published web report's slice path: no logs, just pre-finalize
        // frames for the fights the viewer selected.
        const settings = data.settings || {};
        aggregator = new IncrementalAggregator({
            mvpWeights: settings.mvpWeights,
            statsViewSettings: settings.statsViewSettings,
            disruptionMethod: settings.disruptionMethod,
        });
        const frames = Array.isArray(data.frames) ? data.frames : [];
        frames.forEach((frame: any) => aggregator!.mergeFrame(frame));
        ingestedLogCount = frames.length;
        ingestedLogIds = frames.map((_: any, i: number) => `slice-${i}`);
        ingestedOwnedLogIds = [];
        expectedLogCount = frames.length;
        droppedLogMessages = 0;
        // Slice mode never renders the map replay, so skip the replay transfer.
        computeAndPost(true);
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
        let payload = data.payload;
        if (payload === undefined && typeof data.ref === 'string') {
            payload = payloadStore.get(data.ref);
            if (payload === undefined) {
                // Protocol guarantees refs are only sent for stored keys; treat a
                // miss as a dropped message rather than ingesting a hole silently.
                droppedLogMessages += 1;
                console.error('[StatsWorker] Missing cached payload for ref:', data.ref);
                return;
            }
        }
        aggregator.ingestLog(payload);
        ingestedLogCount += 1;
        const ingestedId = String(payload?.filePath || payload?.id || `idx-${ingestedLogCount}`);
        ingestedLogIds.push(ingestedId);
        if (payload?.sectorOwners) ingestedOwnedLogIds.push(ingestedId);
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
        computeAndPost(data.skipReplay === true);
    }
};
