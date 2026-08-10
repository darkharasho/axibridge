import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISCORD_PERMALINK_WAIT_MS, waitForPermalink } from '../permalinkWait';
import type { UploadResult } from '../uploader';

const ok = (permalink: string): UploadResult => ({ id: 'a', permalink, userToken: '' });

describe('waitForPermalink', () => {
    it('returns the permalink once the parallel upload resolves', async () => {
        await expect(waitForPermalink(Promise.resolve(ok('https://dps.report/abc')))).resolves.toBe(
            'https://dps.report/abc'
        );
    });

    it('returns empty string when there is no upload in flight', async () => {
        await expect(waitForPermalink(null)).resolves.toBe('');
    });

    it('returns empty string when the upload errored', async () => {
        const errored = { id: 'a', permalink: '', userToken: '', error: 'timeout' } as UploadResult;
        await expect(waitForPermalink(Promise.resolve(errored))).resolves.toBe('');
    });

    it('returns empty string when the upload rejects', async () => {
        await expect(waitForPermalink(Promise.reject(new Error('boom')))).resolves.toBe('');
    });

    describe('with fake timers', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it('gives up after the timeout rather than blocking the Discord post', async () => {
            const never = new Promise<UploadResult | null>(() => { });
            const pending = waitForPermalink(never, 50);
            await vi.advanceTimersByTimeAsync(50);
            await expect(pending).resolves.toBe('');
        });

        it('defaults to a bounded wait', async () => {
            const never = new Promise<UploadResult | null>(() => { });
            const pending = waitForPermalink(never);
            await vi.advanceTimersByTimeAsync(DISCORD_PERMALINK_WAIT_MS);
            await expect(pending).resolves.toBe('');
        });
    });
});
