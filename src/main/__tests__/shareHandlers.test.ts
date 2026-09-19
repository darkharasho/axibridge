import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (event: unknown, payload: any) => Promise<unknown>>();

vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, fn: (event: unknown, payload: any) => Promise<unknown>) => {
            handlers.set(channel, fn);
        }
    }
}));

import { registerShareHandlers } from '../handlers/shareHandlers';

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
        expect(result.error).toMatch(/R2|GitHub Pages|storage/i);
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
        expect(putObject).toHaveBeenCalledWith('shares/log-1.json.br', expect.any(Buffer), 'application/json');
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
});
