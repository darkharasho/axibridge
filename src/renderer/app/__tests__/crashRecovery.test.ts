import { describe, expect, it } from 'vitest';
import { toCrashSnapshot, restoreFromCrashSnapshot, CRASH_SNAPSHOT_HEAVY_FIELDS } from '../crashRecovery';

const heavyDetails = {
    fightName: 'Stonemist Castle',
    encounterDuration: '02:41',
    success: true,
    uploadTime: 1,
    players: [{ name: 'A', targetBreakbarDamage1S: new Array(1000).fill(0) }],
    native: { blocks: { replay: { tracks: new Array(1000).fill(0) } } },
};

const fullLog = (): ILogData => ({
    id: 'log-1',
    permalink: 'https://dps.report/abc',
    shareUrl: 'https://bridge.axi.link/r/k3Xm9qR2',
    shareId: 'k3Xm9qR2',
    filePath: '/logs/fight-1.zevtc',
    status: 'success',
    uploadTime: 1700000000,
    encounterDuration: '02:41',
    fightName: 'Stonemist Castle',
    fightLabel: 'SMC',
    detailsStatus: 'loaded',
    parseSource: 'axilog',
    splitEnemiesByTeam: true,
    dashboardSummary: {
        hasPlayers: true, hasTargets: true, squadCount: 42, enemyCount: 51,
        isWin: true, squadDeaths: 3, enemyDeaths: 17,
    },
    details: heavyDetails as any,
    replayDataUrl: 'data:application/json;base64,AAAA',
    sectorOwners: { 1: 'Green' } as any,
    squadGuilds: ['Guild A', 'Guild B'],
});

describe('toCrashSnapshot', () => {
    it('drops every heavy field', () => {
        const [slim] = toCrashSnapshot([fullLog()]);
        for (const field of CRASH_SNAPSHOT_HEAVY_FIELDS) {
            expect(slim).not.toHaveProperty(field);
        }
    });

    it('keeps the identity and presentation fields the log list renders', () => {
        const [slim] = toCrashSnapshot([fullLog()]);
        expect(slim.id).toBe('log-1');
        expect(slim.filePath).toBe('/logs/fight-1.zevtc');
        expect(slim.permalink).toBe('https://dps.report/abc');
        expect(slim.shareUrl).toBe('https://bridge.axi.link/r/k3Xm9qR2');
        expect(slim.shareId).toBe('k3Xm9qR2');
        expect(slim.status).toBe('success');
        expect(slim.fightName).toBe('Stonemist Castle');
        expect(slim.fightLabel).toBe('SMC');
        expect(slim.parseSource).toBe('axilog');
        expect(slim.dashboardSummary?.squadCount).toBe(42);
    });

    /** The whole point: a snapshot that referenced the details graph would pin
     *  every byte the OOM was caused by, in the process meant to survive it. */
    it('retains no reference into the source details graph', () => {
        const snapshot = toCrashSnapshot([fullLog()]);
        const seen = new Set<unknown>();
        const scan = (value: unknown): void => {
            if (value === null || typeof value !== 'object' || seen.has(value)) return;
            seen.add(value);
            expect(value).not.toBe(heavyDetails);
            expect(value).not.toBe(heavyDetails.players);
            expect(value).not.toBe(heavyDetails.native);
            Object.values(value as Record<string, unknown>).forEach(scan);
        };
        scan(snapshot);
    });

    it('survives a structured clone, since it crosses an IPC boundary', () => {
        expect(() => structuredClone(toCrashSnapshot([fullLog()]))).not.toThrow();
    });
});

describe('restoreFromCrashSnapshot', () => {
    it('reopens details hydration for logs that only claimed an in-memory copy', () => {
        // 'loaded'/'available'/'loading' assert a graph this renderer no longer
        // has — the crash took it. IndexedDB may still hold it, so the log must
        // go back to 'idle' for hydration to look.
        for (const status of ['loaded', 'available', 'loading'] as const) {
            const [restored] = restoreFromCrashSnapshot(
                toCrashSnapshot([{ ...fullLog(), detailsStatus: status }])
            );
            expect(restored.detailsStatus).toBe('idle');
        }
    });

    it('preserves statuses that record a settled hydration failure', () => {
        for (const status of ['exhausted', 'unavailable'] as const) {
            const [restored] = restoreFromCrashSnapshot(
                toCrashSnapshot([{ ...fullLog(), detailsStatus: status }])
            );
            expect(restored.detailsStatus).toBe(status);
        }
    });

    it('ignores malformed entries rather than surfacing a broken log row', () => {
        const restored = restoreFromCrashSnapshot([
            null, undefined, 42, 'nope', {}, { id: 'ok', filePath: '/a.zevtc' },
        ] as any);
        expect(restored).toHaveLength(1);
        expect(restored[0].id).toBe('ok');
    });

    it('returns an empty list for a missing snapshot', () => {
        expect(restoreFromCrashSnapshot(null as any)).toEqual([]);
        expect(restoreFromCrashSnapshot(undefined as any)).toEqual([]);
    });
});
