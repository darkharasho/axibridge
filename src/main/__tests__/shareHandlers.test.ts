import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (event: unknown, payload: any) => Promise<unknown>>();

vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, fn: (event: unknown, payload: any) => Promise<unknown>) => {
            handlers.set(channel, fn);
        }
    }
}));

import { registerShareHandlers } from '../handlers/shareHandlers';
import { shareObjectKey } from '../shareService';

const details = {
    fightName: 'Detonator',
    zone: 'Eternal Battlegrounds',
    durationMS: 182000,
    timeStart: 1758240000000,
    players: [{ name: 'A' }],
    targets: [{ name: 'E' }]
};

const invoke = (channel: string, payload: any) => handlers.get(channel)!(null, payload);

describe('share IPC handlers', () => {
    beforeEach(() => {
        handlers.clear();
        vi.restoreAllMocks();
        // `restoreAllMocks` does NOT undo `vi.stubGlobal`, so without this a
        // `fetch` stubbed by one test leaks into every later one — which would
        // either silently serve a stale stub or, once the stub is removed, let
        // a test reach the real network.
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('rejects sharing a log with no details rather than uploading nothing', async () => {
        const resolveTarget = vi.fn().mockReturnValue({ putObject: vi.fn() });
        registerShareHandlers({ store: { get: () => 'gho_valid' }, getDetails: () => null, resolveTarget });
        const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not parsed|no details/i);
        // Naive/broken code would call resolveTarget and attempt the upload even
        // with null details, so this also proves the early return actually fires.
        expect(resolveTarget).not.toHaveBeenCalled();
    });

    it('reports when no storage target is configured', async () => {
        registerShareHandlers({
            store: { get: () => 'gho_valid' },
            getDetails: () => details,
            resolveTarget: () => null
        });
        const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
        expect(result.success).toBe(false);
        // `resolveTarget` is now the two-rung ladder, so this message is only
        // reached when BOTH rungs are unavailable and it must name both. It
        // leads with GitHub: that rung needs no Cloudflare account, and most
        // users have already connected it to publish web reports.
        expect(result.error).toMatch(/GitHub/i);
        expect(result.error).toMatch(/R2/i);
        expect(result.error.indexOf('GitHub')).toBeLessThan(result.error.indexOf('R2'));
    });

    it('returns a share url on the happy path', async () => {
        const putObject = vi.fn().mockResolvedValue({ success: true, url: 'https://cdn.example.com/a.br' });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ code: 'k3Xm9qR2', url: 'https://bridge.axi.link/r/k3Xm9qR2' }), { status: 201 })
        ));
        registerShareHandlers({
            store: { get: (k: string) => (k === 'githubToken' ? 'gho_valid' : undefined) },
            getDetails: () => details,
            resolveTarget: () => ({ putObject })
        });
        const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; url: string };
        expect(result).toMatchObject({ success: true, url: 'https://bridge.axi.link/r/k3Xm9qR2' });
        // Proves the uploaded key is actually derived from the logId passed in —
        // a handler that hardcoded a key or dropped logId would still pass the
        // shape assertion above but fail this one.
        expect(putObject).toHaveBeenCalledWith(shareObjectKey('log-1'), expect.any(Buffer), 'application/gzip');
    });

    it('shares a log whose details are only in the on-disk cache, not the LRU', async () => {
        // I4: the wiring in index.ts used to pass `getBulkLogDetails` alone — a
        // memory-budgeted LRU — so a log evicted by a heavy session was reported
        // as "parse it before sharing" even though its details were on disk.
        // This models the fixed wiring: LRU miss, then persisted hit.
        const getBulkLogDetails = vi.fn().mockReturnValue(null);
        const loadPersistedLogDetails = vi.fn().mockResolvedValue(details);
        const putObject = vi.fn().mockResolvedValue({ success: true, url: 'https://cdn.example.com/a.gz' });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ code: 'k3Xm9qR2', url: 'https://bridge.axi.link/r/k3Xm9qR2' }), { status: 201 })
        ));
        registerShareHandlers({
            store: { get: (k: string) => (k === 'githubToken' ? 'gho_valid' : undefined) },
            getDetails: async (logId: string) => getBulkLogDetails(logId) ?? (await loadPersistedLogDetails(logId)),
            resolveTarget: () => ({ putObject })
        });
        const result = await invoke('share-log', { logId: '/logs/a.zevtc' }) as { success: boolean; url: string };
        expect(getBulkLogDetails).toHaveBeenCalledWith('/logs/a.zevtc');
        expect(loadPersistedLogDetails).toHaveBeenCalledWith('/logs/a.zevtc');
        expect(result).toMatchObject({ success: true, url: 'https://bridge.axi.link/r/k3Xm9qR2' });
    });

    it('plans retention from the entries it is handed', async () => {
        registerShareHandlers({ store: { get: () => undefined }, getDetails: () => details, resolveTarget: () => null });
        const result = await invoke('share-plan-retention', {
            entries: [
                { id: 'a', bytes: 900, stage: 'full', seen: 1, pinned: false },
                { id: 'b', bytes: 200, stage: 'full', seen: 2, pinned: false }
            ],
            budgetBytes: 1000,
            highWaterPct: 0.8
        }) as { success: boolean; actions: Array<{ id: string }> };
        expect(result.success).toBe(true);
        expect(result.actions[0].id).toBe('a');
        // A handler that swallowed budgetBytes/highWaterPct and used the module
        // defaults (1 GiB budget) would see 1100 bytes under budget and plan
        // zero actions here — this length assertion catches that.
        expect(result.actions.length).toBeGreaterThan(0);
    });

    it('plans nothing for an empty repository', async () => {
        registerShareHandlers({ store: { get: () => undefined }, getDetails: () => details, resolveTarget: () => null });
        const result = await invoke('share-plan-retention', { entries: [] }) as { actions: unknown[] };
        expect(result.actions).toEqual([]);
    });

    describe('adversarial dependencies never escape as rejections', () => {
        // Fix-round 1: the handler's own pre-work (getDetails, resolveTarget,
        // store.get) was called with no try/catch, so a throwing dependency or a
        // null store propagated as an unhandled rejection out of ipcMain.handle
        // instead of the documented `{ success: false, error }` shape. Every case
        // below drives the handler with a dependency that throws (or a store
        // that is missing/broken) and asserts the promise still *resolves* to a
        // failure object — the specific wrong behaviour each one catches is an
        // escaped exception / rejected promise, not merely a wrong error string.

        it('share-log: getDetails throwing resolves to a failure object, not a rejection', async () => {
            registerShareHandlers({
                store: { get: () => 'gho_valid' },
                getDetails: () => { throw new Error('disk read failed'); },
                resolveTarget: () => ({ putObject: vi.fn() })
            });
            const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
            expect(result).toEqual({ success: false, error: 'disk read failed' });
        });

        it('share-log: resolveTarget throwing resolves to a failure object, not a rejection', async () => {
            registerShareHandlers({
                store: { get: () => 'gho_valid' },
                getDetails: () => details,
                resolveTarget: () => { throw new Error('R2 credentials malformed'); }
            });
            const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
            expect(result).toEqual({ success: false, error: 'R2 credentials malformed' });
        });

        it('share-log: a null store does not throw when reading githubToken', async () => {
            const putObject = vi.fn().mockResolvedValue({ success: true, url: 'https://cdn.example.com/a.br' });
            registerShareHandlers({
                store: null,
                getDetails: () => details,
                resolveTarget: () => ({ putObject })
            });
            const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error?: string };
            // No token can be read from a null store, so shareLog's own contract
            // (never throws, reports missing auth) takes over from here — the
            // point of this test is only that we got a returned object at all.
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/github/i);
        });

        it('share-log: a throwing store.get resolves to a failure object, not a rejection', async () => {
            registerShareHandlers({
                store: { get: () => { throw new Error('store corrupted'); } },
                getDetails: () => details,
                resolveTarget: () => ({ putObject: vi.fn() })
            });
            const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
            expect(result).toEqual({ success: false, error: 'store corrupted' });
        });

        it('share-log: an undefined payload resolves to a failure object, not a rejection', async () => {
            registerShareHandlers({
                store: { get: () => 'gho_valid' },
                getDetails: () => details,
                resolveTarget: () => ({ putObject: vi.fn() })
            });
            const result = await invoke('share-log', undefined) as { success: boolean; error: string };
            expect(result).toEqual({ success: false, error: 'No log specified.' });
        });

        it('share-plan-retention: an undefined payload resolves cleanly with no actions', async () => {
            registerShareHandlers({ store: { get: () => undefined }, getDetails: () => details, resolveTarget: () => null });
            const result = await invoke('share-plan-retention', undefined) as { success: boolean; actions: unknown[] };
            expect(result).toEqual({ success: true, actions: [] });
        });
    });

    describe('async-rejecting dependencies (fix round 2)', () => {
        // Round 1 wrapped getDetails/resolveTarget/store.get in try/catch but
        // never awaited them, so a dependency returning a REJECTED PROMISE
        // (rather than throwing synchronously) sailed straight past the
        // try/catch. For getDetails/store.get, the specific wrong behaviour
        // this used to produce was the handler's own returned promise
        // REJECTING with `TypeError: Cannot read properties of undefined
        // (reading 'success')` (from `shareLog(details, ...)` receiving an
        // unresolved Promise as `details`) instead of resolving to
        // `{ success: false, error }`. For resolveTarget, the wrong behaviour
        // was that the real rejection reason was silently discarded and
        // replaced with a misleading `target.putObject is not a function`
        // once the un-awaited Promise object was used as if it were a
        // ShareTarget. These tests fail against the pre-await code (verified
        // by reverting `await` locally) and pass now that all three are
        // awaited inside their existing try blocks.

        it('share-log: getDetails rejecting resolves to a failure object, not a rejection', async () => {
            registerShareHandlers({
                store: { get: () => 'gho_valid' },
                getDetails: () => Promise.reject(new Error('async disk read failed')),
                resolveTarget: () => ({ putObject: vi.fn() })
            });
            const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
            expect(result).toEqual({ success: false, error: 'async disk read failed' });
        });

        it('share-log: store.get rejecting resolves to a failure object, not a rejection', async () => {
            registerShareHandlers({
                store: { get: () => Promise.reject(new Error('async store corrupted')) },
                getDetails: () => details,
                resolveTarget: () => ({ putObject: vi.fn() })
            });
            const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
            expect(result).toEqual({ success: false, error: 'async store corrupted' });
        });

        it('share-log: resolveTarget rejecting surfaces the real error, not a misleading putObject message', async () => {
            registerShareHandlers({
                store: { get: () => 'gho_valid' },
                getDetails: () => details,
                resolveTarget: () => Promise.reject(new Error('async R2 credentials malformed')) as any
            });
            const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
            expect(result).toEqual({ success: false, error: 'async R2 credentials malformed' });
        });

        it('share-log: a dependency rejecting with a plain string still resolves to a failure object', async () => {
            registerShareHandlers({
                store: { get: () => 'gho_valid' },
                getDetails: () => Promise.reject('plain string rejection'),
                resolveTarget: () => ({ putObject: vi.fn() })
            });
            const result = await invoke('share-log', { logId: 'log-1' }) as { success: boolean; error: string };
            expect(result.success).toBe(false);
            expect(typeof result.error).toBe('string');
        });

    });
});
