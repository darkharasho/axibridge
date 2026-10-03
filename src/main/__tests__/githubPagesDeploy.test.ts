/**
 * The publish flow handed over the report URL the moment the ref moved, so
 * users opened it to the viewer's "Report not found yet. It may still be
 * deploying." These pin the watch that stops that — in particular the part
 * that makes it non-trivial: `pages/builds/latest` answers with the latest
 * build whoever made it, so straight after a publish it is still the PREVIOUS
 * commit's build, happily reporting `built`.
 */

import { describe, expect, it, vi } from 'vitest';
import { describePagesDeploy, waitForPagesDeploy, type PagesBuild } from '../githubPagesDeploy';

/** A clock the loop drives forward itself, so nothing actually waits. */
const makeHarness = (builds: Array<PagesBuild | null>) => {
    let clock = 0;
    const requestBuild = vi.fn(async () => undefined);
    let index = 0;
    const getLatestBuild = vi.fn(async () => builds[Math.min(index++, builds.length - 1)]);
    return {
        requestBuild,
        getLatestBuild,
        opts: {
            getLatestBuild,
            requestBuild,
            sleep: async (ms: number) => { clock += ms; },
            now: () => clock,
        },
    };
};

describe('waitForPagesDeploy', () => {
    it('resolves built once a build for OUR commit succeeds', async () => {
        const h = makeHarness([
            { status: 'queued', commit: 'abc' },
            { status: 'building', commit: 'abc' },
            { status: 'built', commit: 'abc' },
        ]);
        const progress: string[] = [];

        const result = await waitForPagesDeploy({
            commitSha: 'abc',
            onProgress: ({ status }) => progress.push(status),
            ...h.opts,
        });

        expect(result).toEqual({ outcome: 'built', status: 'built' });
        expect(progress).toEqual(['queued', 'building', 'built']);
        expect(h.requestBuild).not.toHaveBeenCalled();
    });

    it('ignores a successful build of a different commit', async () => {
        // The exact lie that shipped the 404: the previous publish's build is
        // still the latest one and reads `built`.
        const h = makeHarness([
            { status: 'built', commit: 'older' },
            { status: 'built', commit: 'older' },
            { status: 'building', commit: 'abc' },
            { status: 'built', commit: 'abc' },
        ]);

        const result = await waitForPagesDeploy({ commitSha: 'abc', ...h.opts });

        expect(result.outcome).toBe('built');
        expect(h.getLatestBuild.mock.calls.length).toBeGreaterThan(2);
    });

    it('requests a build when none is ever queued for our commit', async () => {
        const h = makeHarness([{ status: 'built', commit: 'older' }]);

        const result = await waitForPagesDeploy({
            commitSha: 'abc',
            timeoutMs: 120000,
            forceBuildAfterMs: 45000,
            ...h.opts,
        });

        expect(h.requestBuild).toHaveBeenCalledTimes(1);
        expect(result.outcome).toBe('timeout');
    });

    it('retries once after an errored build, then reports the failure', async () => {
        const h = makeHarness([
            { status: 'errored', commit: 'abc', error: { message: 'Build exceeded size limit' } },
        ]);

        const result = await waitForPagesDeploy({ commitSha: 'abc', timeoutMs: 60000, ...h.opts });

        expect(h.requestBuild).toHaveBeenCalledTimes(1);
        expect(result.outcome).toBe('errored');
        expect(result.error).toBe('Build exceeded size limit');
    });

    it('clears when the forced rebuild succeeds', async () => {
        const h = makeHarness([
            { status: 'errored', commit: 'abc', error: { message: 'transient' } },
            { status: 'building', commit: 'abc' },
            { status: 'built', commit: 'abc' },
        ]);

        const result = await waitForPagesDeploy({ commitSha: 'abc', ...h.opts });

        expect(h.requestBuild).toHaveBeenCalledTimes(1);
        expect(result.outcome).toBe('built');
    });

    it('reports unknown when build status cannot be read at all', async () => {
        let clock = 0;
        const result = await waitForPagesDeploy({
            commitSha: 'abc',
            getLatestBuild: async () => { throw new Error('404 Pages not enabled'); },
            requestBuild: async () => undefined,
            sleep: async (ms: number) => { clock += ms; },
            now: () => clock,
            timeoutMs: 30000,
        });

        expect(result.outcome).toBe('unknown');
        expect(result.error).toContain('404');
    });

    it('never claims success from a build with no commit sha', async () => {
        const h = makeHarness([{ status: 'built' }]);

        const result = await waitForPagesDeploy({ commitSha: 'abc', timeoutMs: 30000, ...h.opts });

        expect(result.outcome).not.toBe('built');
    });
});

describe('describePagesDeploy', () => {
    it('only says live when the build actually landed', () => {
        expect(describePagesDeploy({ outcome: 'built' })).toContain('live');
        expect(describePagesDeploy({ outcome: 'timeout' })).not.toContain('live');
        expect(describePagesDeploy({ outcome: 'errored', error: 'boom' })).toContain('boom');
        expect(describePagesDeploy({ outcome: 'unknown' })).toContain('few minutes');
    });
});
