import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the stats worker's onmessage protocol directly (no real Worker):
 * stub `self`, import the module fresh, and feed it message events.
 * Focus: the payload ref-cache — store coherence across resets, 'forget'
 * eviction, ref-miss handling, and stale-token payload retention.
 */
const bootWorker = async () => {
    vi.resetModules();
    const posted: any[] = [];
    const fakeSelf: any = {
        postMessage: (message: any) => posted.push(message)
    };
    vi.stubGlobal('self', fakeSelf);
    await import('../statsWorker');
    return {
        posted,
        send: (data: any) => fakeSelf.onmessage({ data } as MessageEvent),
        lastResult: () => [...posted].reverse().find((m) => m?.type === 'result')
    };
};

const makeLogPayload = (id: string) => ({
    id,
    filePath: `/logs/${id}.zevtc`,
    status: 'success',
    details: { players: [], targets: [] }
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('statsWorker payload ref-cache protocol', () => {
    it('resolves ref messages from payloads stored in a previous session', async () => {
        const { send, lastResult } = await bootWorker();

        // Session 1: full payload transfer.
        send({ type: 'reset', token: 1, totalLogs: 1 });
        send({ type: 'settings', token: 1, payload: {} });
        send({ type: 'log', token: 1, key: '/logs/a.zevtc', payload: makeLogPayload('a') });
        send({ type: 'flush', token: 1 });
        let result = lastResult();
        expect(result.logCount).toBe(1);
        expect(result.diagnostics.droppedLogMessages).toBe(0);

        // Session 2: same log sent as a ref only — store must survive the reset.
        send({ type: 'reset', token: 2, totalLogs: 1 });
        send({ type: 'settings', token: 2, payload: {} });
        send({ type: 'log', token: 2, ref: '/logs/a.zevtc' });
        send({ type: 'flush', token: 2 });
        result = lastResult();
        expect(result.token).toBe(2);
        expect(result.logCount).toBe(1);
        expect(result.diagnostics.droppedLogMessages).toBe(0);
    });

    it('drops (and counts) refs to forgotten payloads instead of ingesting holes', async () => {
        const { send, lastResult } = await bootWorker();

        send({ type: 'reset', token: 1, totalLogs: 1 });
        send({ type: 'log', token: 1, key: '/logs/a.zevtc', payload: makeLogPayload('a') });
        send({ type: 'flush', token: 1 });

        send({ type: 'forget', keys: ['/logs/a.zevtc'] });

        send({ type: 'reset', token: 2, totalLogs: 1 });
        send({ type: 'log', token: 2, ref: '/logs/a.zevtc' });
        send({ type: 'flush', token: 2 });
        const result = lastResult();
        expect(result.logCount).toBe(0);
        expect(result.diagnostics.droppedLogMessages).toBe(1);
    });

    it('stores keyed payloads even when the token is stale', async () => {
        const { send, lastResult } = await bootWorker();

        send({ type: 'reset', token: 5, totalLogs: 1 });
        // Stale token: must not ingest, but MUST store the payload — the main
        // thread's sent-map assumes every keyed payload it posted is retained.
        send({ type: 'log', token: 4, key: '/logs/a.zevtc', payload: makeLogPayload('a') });
        send({ type: 'flush', token: 5 });
        let result = lastResult();
        expect(result.logCount).toBe(0);

        send({ type: 'reset', token: 6, totalLogs: 1 });
        send({ type: 'log', token: 6, ref: '/logs/a.zevtc' });
        send({ type: 'flush', token: 6 });
        result = lastResult();
        expect(result.logCount).toBe(1);
        expect(result.diagnostics.droppedLogMessages).toBe(0);
    });

    it('applies forget regardless of token', async () => {
        const { send, lastResult } = await bootWorker();

        send({ type: 'reset', token: 1, totalLogs: 1 });
        send({ type: 'log', token: 1, key: '/logs/a.zevtc', payload: makeLogPayload('a') });
        send({ type: 'flush', token: 1 });

        // No token on forget — it is a cache-coherence message.
        send({ type: 'forget', keys: ['/logs/a.zevtc'] });

        send({ type: 'reset', token: 2, totalLogs: 1 });
        send({ type: 'log', token: 2, ref: '/logs/a.zevtc' });
        send({ type: 'flush', token: 2 });
        expect(lastResult().diagnostics.droppedLogMessages).toBe(1);
    });
});
