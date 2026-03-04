import { describe, expect, it } from 'vitest';
import { normalizeQueuedLogStatus } from '../app/hooks/useLogQueue';

describe('normalizeQueuedLogStatus', () => {
    it('keeps pending detail fetches in calculating', () => {
        const result = normalizeQueuedLogStatus({
            id: 'log-1',
            filePath: 'one.zevtc',
            permalink: 'https://dps.report/example',
            status: 'success',
            detailsAvailable: true
        } as ILogData);

        expect(result.status).toBe('calculating');
    });

    it('promotes stale calculating updates once details are already resolved', () => {
        const result = normalizeQueuedLogStatus({
            id: 'log-2',
            filePath: 'two.zevtc',
            permalink: 'https://dps.report/example',
            status: 'calculating',
            detailsAvailable: true,
            details: {
                fightName: 'Fight',
                encounterDuration: '1m',
                success: true,
                uploadTime: 1,
                players: [{ name: 'Player' }]
            } as any
        } as ILogData);

        expect(result.status).toBe('success');
    });

    it('promotes calculating when details are known unavailable', () => {
        const result = normalizeQueuedLogStatus({
            id: 'log-3',
            filePath: 'three.zevtc',
            permalink: 'https://dps.report/example',
            status: 'calculating',
            detailsAvailable: false,
            detailsFetchExhausted: true,
            detailsKnownUnavailable: true
        } as ILogData);

        expect(result.status).toBe('success');
        expect(result.detailsFetchExhausted).toBe(true);
        expect(result.detailsKnownUnavailable).toBe(true);
    });
});
