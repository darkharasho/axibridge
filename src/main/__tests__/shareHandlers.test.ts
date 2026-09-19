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
});
