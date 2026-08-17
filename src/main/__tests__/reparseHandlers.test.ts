/**
 * The handler's whole job is to be the ONE path that can restore `.native`, so
 * the tests are mostly about the four ways it must refuse. Two of the refusals
 * are load-bearing rather than defensive: it will not re-parse for a user who
 * chose the Elite Insights engine (that would silently change their numbers to
 * a different parser's), and it will not hand back details that parsed but hold
 * no usable fight (which would overwrite a working copy with a worse one).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// `fs` is mocked rather than spied: its ESM namespace is not configurable, so
// `vi.spyOn(fs, 'existsSync')` cannot be redefined under vitest.
const existsSync = vi.fn((_path: string) => true);
vi.mock('fs', () => ({ existsSync: (p: string) => existsSync(p) }));

const handlers = new Map<string, (event: unknown, payload: any) => any>();
vi.mock('electron', () => ({
    ipcMain: {
        handle: (channel: string, fn: (event: unknown, payload: any) => any) => {
            handlers.set(channel, fn);
        },
    },
}));

const prune = vi.fn((details: any, _options?: any) => ({ ...details, pruned: true }));
const usable = vi.fn((_details?: any) => true);
vi.mock('../detailsProcessing', () => ({
    pruneDetailsForStats: (details: any, options: any) => prune(details, options),
    hasUsableFightDetails: (details: any) => usable(details),
    attachConditionMetrics: (details: any) => ({ ...details, conditionMetrics: {} }),
}));

import { registerReparseHandlers } from '../handlers/reparseHandlers';

const NATIVE_DETAILS = { players: [{}], native: { axilog: { schema: '1.0' } } };

const setup = (overrides: Partial<Parameters<typeof registerReparseHandlers>[0]> = {}) => {
    const parseLog = vi.fn(async () => ({ ...NATIVE_DETAILS }));
    const setBulkLogDetails = vi.fn();
    handlers.clear();
    registerReparseHandlers({
        getAxilogManager: () => ({ isInstalled: () => true, parseLog } as any),
        getBackend: () => 'axilog',
        getPruneOptions: () => ({ keepReplayPositions: true }),
        setBulkLogDetails,
        ...overrides,
    });
    return {
        parseLog,
        setBulkLogDetails,
        invoke: (payload: any) => handlers.get('log:reparse-native')!(null, payload),
    };
};

describe('log:reparse-native', () => {
    beforeEach(() => {
        prune.mockClear();
        usable.mockReset().mockReturnValue(true);
        existsSync.mockReset().mockReturnValue(true);
    });

    it('re-parses, enriches, prunes, and publishes the healed details', async () => {
        const { parseLog, setBulkLogDetails, invoke } = setup();

        const result = await invoke({ filePath: '/logs/a.zevtc' });

        expect(parseLog).toHaveBeenCalledWith('/logs/a.zevtc', '/logs/a.zevtc');
        expect(result.success).toBe(true);
        // Condition metrics attached BEFORE pruning, exactly as the ingestion
        // paths do it — pruning first would drop what enrichment needs.
        expect(result.details.conditionMetrics).toBeDefined();
        expect(result.details.pruned).toBe(true);
        expect(result.details.native.axilog).toBeDefined();
        // The main-process store must be updated too, or `get-log-details`
        // keeps serving the native-less copy on the next hydration.
        expect(setBulkLogDetails).toHaveBeenCalledWith('/logs/a.zevtc', result.details);
    });

    it('honours the user\'s prune setting rather than a fixed one', async () => {
        const { invoke } = setup({ getPruneOptions: () => ({ keepReplayPositions: false }) });
        await invoke({ filePath: '/logs/a.zevtc' });
        expect(prune).toHaveBeenCalledWith(expect.anything(), { keepReplayPositions: false });
    });

    it('refuses on the Elite Insights engine instead of switching parsers silently', async () => {
        const { parseLog, invoke } = setup({ getBackend: () => 'elite-insights' });

        const result = await invoke({ filePath: '/logs/a.zevtc' });

        expect(result).toMatchObject({ success: false, reason: 'wrong-backend' });
        expect(parseLog).not.toHaveBeenCalled();
    });

    it('refuses when axilog is not available on this platform', async () => {
        const { invoke } = setup({ getAxilogManager: () => null });
        await expect(invoke({ filePath: '/logs/a.zevtc' })).resolves.toMatchObject({
            success: false, reason: 'axilog-unavailable',
        });
    });

    it('refuses when the source log is gone, since nothing else carries native data', async () => {
        existsSync.mockReturnValue(false);
        const { parseLog, invoke } = setup();

        const result = await invoke({ filePath: '/logs/gone.zevtc' });

        expect(result).toMatchObject({ success: false, reason: 'source-missing' });
        expect(parseLog).not.toHaveBeenCalled();
    });

    it('refuses an empty request', async () => {
        const { invoke } = setup();
        await expect(invoke({})).resolves.toMatchObject({ success: false, reason: 'source-missing' });
    });

    it('refuses to publish a parse with no usable fight in it', async () => {
        usable.mockReturnValue(false);
        const { setBulkLogDetails, invoke } = setup();

        const result = await invoke({ filePath: '/logs/a.zevtc' });

        expect(result).toMatchObject({ success: false, reason: 'unusable-details' });
        expect(setBulkLogDetails).not.toHaveBeenCalled();
    });

    it('reports a thrown parse as a failure rather than crashing the main process', async () => {
        const { setBulkLogDetails, invoke } = setup({
            getAxilogManager: () => ({
                isInstalled: () => true,
                parseLog: async () => { throw new Error('corrupt evtc'); },
            } as any),
        });

        const result = await invoke({ filePath: '/logs/a.zevtc' });

        expect(result).toMatchObject({ success: false, reason: 'parse-failed', error: 'corrupt evtc' });
        expect(setBulkLogDetails).not.toHaveBeenCalled();
    });

    it('reports a parser-level error object as a failure', async () => {
        const { invoke } = setup({
            getAxilogManager: () => ({
                isInstalled: () => true,
                parseLog: async () => ({ error: 'unsupported-revision' }),
            } as any),
        });

        await expect(invoke({ filePath: '/logs/a.zevtc' })).resolves.toMatchObject({
            success: false, reason: 'parse-failed', error: 'unsupported-revision',
        });
    });
});
