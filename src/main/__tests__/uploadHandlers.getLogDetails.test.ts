/**
 * `get-log-details` used to answer straight out of the main-process LRU, which
 * is memory-budgeted: a session with a few dozen large logs evicts most of its
 * entries mid-flight. Every evicted log then hydrated as "Details not found",
 * dropped out of the fight count, and rendered with a blank timestamp — even
 * though its pruned details were sitting on disk the whole time. These tests
 * pin the disk fallback that closes that gap.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'node:os';
import path from 'node:path';

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

/**
 * Both cache tiers missing is not the same as the log being unrecoverable:
 * the `.zevtc` is right there, and re-parsing it is exactly what the coverage
 * banner's Re-parse button does. Before this, a user whose index entry had
 * been lost was shown "N logs could not be read back from the cache" and had
 * to click that button by hand.
 */
describe('get-log-details last-resort re-parse', () => {
    let tmpDir: string;
    let logPath: string;

    beforeEach(() => {
        handlers.clear();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'axibridge-getdetails-'));
        logPath = path.join(tmpDir, 'fight.zevtc');
        fs.writeFileSync(logPath, 'not a real log, only its existence matters');
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('re-parses the source log when memory and disk both miss', async () => {
        const reparseLogDetails = vi.fn(async () => DETAILS);
        const { invoke } = setup({ reparseLogDetails });

        expect(await invoke({ filePath: logPath })).toEqual({ success: true, details: DETAILS });
        expect(reparseLogDetails).toHaveBeenCalledWith(logPath);
    });

    it('does not re-parse when the disk copy answered', async () => {
        const reparseLogDetails = vi.fn(async () => DETAILS);
        const { invoke } = setup({
            loadPersistedLogDetails: vi.fn(async () => DETAILS),
            reparseLogDetails,
        });

        expect((await invoke({ filePath: logPath })).success).toBe(true);
        expect(reparseLogDetails).not.toHaveBeenCalled();
    });

    it('coalesces concurrent re-parses of the same log', async () => {
        let resolveParse: (value: any) => void = () => undefined;
        const parse = new Promise<any>((resolve) => { resolveParse = resolve; });
        const reparseLogDetails = vi.fn(() => parse);
        const { invoke } = setup({ reparseLogDetails });

        const first = invoke({ filePath: logPath });
        const second = invoke({ filePath: logPath });
        // Both calls have to clear the awaited disk fallback before either
        // reaches the re-parse, so the resolve cannot be a single microtask.
        await new Promise((resolve) => setTimeout(resolve, 0));
        resolveParse(DETAILS);

        expect((await first).success).toBe(true);
        expect((await second).success).toBe(true);
        expect(reparseLogDetails).toHaveBeenCalledTimes(1);
    });

    it('still reports failure when the source log is gone', async () => {
        const reparseLogDetails = vi.fn(async () => DETAILS);
        const { invoke } = setup({ reparseLogDetails });

        expect(await invoke({ filePath: path.join(tmpDir, 'deleted.zevtc') }))
            .toEqual({ success: false, error: 'Details not found.' });
        expect(reparseLogDetails).not.toHaveBeenCalled();
    });

    it('reports failure when the re-parse itself cannot produce a fight', async () => {
        const { invoke } = setup({ reparseLogDetails: vi.fn(async () => null) });

        expect(await invoke({ filePath: logPath })).toEqual({ success: false, error: 'Details not found.' });
    });
});
