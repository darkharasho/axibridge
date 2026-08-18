/**
 * `get-log-details` used to answer straight out of the main-process LRU, which
 * is memory-budgeted: a session with a few dozen large logs evicts most of its
 * entries mid-flight. Every evicted log then hydrated as "Details not found",
 * dropped out of the fight count, and rendered with a blank timestamp — even
 * though its pruned details were sitting on disk the whole time. These tests
 * pin the disk fallback that closes that gap.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const handlers = new Map<string, (event: unknown, payload: any) => any>();
vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, fn: (event: unknown, payload: any) => any) => {
            handlers.set(channel, fn);
        },
        on: () => undefined,
    },
    BrowserWindow: class {},
}));

vi.mock('../detailsProcessing', () => ({
    hasUsableFightDetails: (details: any) => Array.isArray(details?.players) && details.players.length > 0,
}));

import { registerUploadHandlers } from '../handlers/uploadHandlers';

const DETAILS = { players: [{ account: 'a.1234' }], timeStart: 1785573960 };

const setup = (overrides: Partial<Parameters<typeof registerUploadHandlers>[0]> = {}) => {
    const getBulkLogDetails = vi.fn((_filePath: string) => null as any);
    const loadPersistedLogDetails = vi.fn(async (_filePath: string) => null as any);
    handlers.clear();
    registerUploadHandlers({
        store: { get: () => undefined, set: () => undefined },
        getWindow: () => null,
        getWatcher: () => null,
        processLogFile: async () => undefined,
        setBulkUploadMode: () => undefined,
        getActiveUploads: () => new Set<string>(),
        getUploadRetryQueuePayload: () => ({}) as any,
        loadUploadRetryQueue: () => ({}),
        loadUploadRetryState: () => ({}) as any,
        setUploadRetryPaused: () => undefined,
        getBulkLogDetails,
        loadPersistedLogDetails,
        ...overrides,
    } as any);
    return {
        getBulkLogDetails,
        loadPersistedLogDetails,
        invoke: (payload: any) => handlers.get('get-log-details')!(null, payload),
    };
};

describe('get-log-details', () => {
    beforeEach(() => {
        handlers.clear();
    });

    it('serves the in-memory copy without touching disk', async () => {
        const { loadPersistedLogDetails, invoke } = setup({
            getBulkLogDetails: vi.fn(() => DETAILS),
        });

        const result = await invoke({ filePath: '/logs/a.zevtc' });

        expect(result).toEqual({ success: true, details: DETAILS });
        expect(loadPersistedLogDetails).not.toHaveBeenCalled();
    });

    it('falls back to the persisted copy when the LRU has evicted the log', async () => {
        const { invoke } = setup({
            loadPersistedLogDetails: vi.fn(async () => DETAILS),
        });

        const result = await invoke({ filePath: '/logs/a.zevtc' });

        expect(result).toEqual({ success: true, details: DETAILS });
    });

    it('coalesces concurrent rehydrations of the same log', async () => {
        // Details files run to tens of megabytes; the hydration pass fans out
        // over many logs at once and must not read the same one N times.
        let resolveRead: (value: any) => void = () => undefined;
        const loadPersistedLogDetails = vi.fn(() => new Promise<any>((resolve) => { resolveRead = resolve; }));
        const { invoke } = setup({ loadPersistedLogDetails });

        const first = invoke({ filePath: '/logs/a.zevtc' });
        const second = invoke({ filePath: '/logs/a.zevtc' });
        resolveRead(DETAILS);

        expect(await first).toEqual({ success: true, details: DETAILS });
        expect(await second).toEqual({ success: true, details: DETAILS });
        expect(loadPersistedLogDetails).toHaveBeenCalledTimes(1);
    });

    it('retries the disk after a failed rehydration rather than caching the miss', async () => {
        const loadPersistedLogDetails = vi.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(DETAILS);
        const { invoke } = setup({ loadPersistedLogDetails });

        expect((await invoke({ filePath: '/logs/a.zevtc' })).success).toBe(false);
        expect(await invoke({ filePath: '/logs/a.zevtc' })).toEqual({ success: true, details: DETAILS });
        expect(loadPersistedLogDetails).toHaveBeenCalledTimes(2);
    });

    it('reports failure when neither source has a usable fight', async () => {
        const { invoke } = setup({
            loadPersistedLogDetails: vi.fn(async () => ({ players: [] })),
        });

        expect(await invoke({ filePath: '/logs/a.zevtc' })).toEqual({ success: false, error: 'Details not found.' });
    });
});
