/**
 * Pins the Pages deploy watch and the startup heal against what GitHub
 * actually did to gw2eww/fight-reports on 2026-11-06/07:
 *
 *  - `/pages/builds` lies. It recorded a deploy that went live in 16s as
 *    `errored`, so nothing here reads it; the Deployments API is the truth.
 *  - A deploy can wedge per commit (stuck in `syncing_files` until GitHub
 *    kills it at 10 min). Rebuilding the SAME commit wedged three more times;
 *    a NEW commit deployed in 16s. So recovery is an empty commit, never a
 *    rebuild request.
 *  - Any new commit or build request cancels the deploy in flight, so a
 *    healthy in-progress deploy must be left alone.
 */

import { describe, expect, it, vi } from 'vitest';
import {
    assessPagesDeployment,
    describePagesDeploy,
    healPagesDeploy,
    watchPagesDeploy,
    type PagesDeploymentSnapshot,
} from '../githubPagesDeploy';

const MIN = 60 * 1000;

const dep = (state: string | null, createdAt: number): PagesDeploymentSnapshot => ({ state, createdAt });

/**
 * A fake repo: a branch head, per-sha deployment timelines keyed on elapsed
 * time, and a redeploy that pushes a new sha. The loop drives the clock.
 */
const makeRepo = (opts: {
    head: string;
    timelines: Record<string, Array<[number, PagesDeploymentSnapshot | null]>>;
}) => {
    let clock = 0;
    let head = opts.head;
    let redeployCount = 0;
    const timelines = { ...opts.timelines };
    const pushedAt: Record<string, number> = { [opts.head]: 0 };
    const getDeployment = vi.fn(async (sha: string) => {
        const timeline = timelines[sha] || [];
        const since = clock - (pushedAt[sha] ?? 0);
        let current: PagesDeploymentSnapshot | null = null;
        for (const [at, snap] of timeline) {
            if (since >= at) current = snap && { ...snap, createdAt: (pushedAt[sha] ?? 0) + snap.createdAt };
        }
        return current;
    });
    const pushRedeployCommit = vi.fn(async (parentSha: string) => {
        redeployCount += 1;
        const sha = `redeploy${redeployCount}`;
        expect(parentSha).toBe(head);
        head = sha;
        pushedAt[sha] = clock;
        return sha;
    });
    return {
        getDeployment,
        pushRedeployCommit,
        setHead: (sha: string) => { head = sha; pushedAt[sha] = clock; },
        setTimeline: (sha: string, t: Array<[number, PagesDeploymentSnapshot | null]>) => { timelines[sha] = t; },
        opts: {
            getHeadSha: async () => head,
            getDeployment,
            pushRedeployCommit,
            sleep: async (ms: number) => { clock += ms; },
            now: () => clock,
        },
    };
};

describe('assessPagesDeployment', () => {
    const now = 20 * MIN;
    it('treats success and inactive (superseded success) as live', () => {
        expect(assessPagesDeployment(dep('success', 0), { now, commitAt: 0 })).toBe('live');
        expect(assessPagesDeployment(dep('inactive', 0), { now, commitAt: 0 })).toBe('live');
    });
    it('treats failure and error as failed', () => {
        expect(assessPagesDeployment(dep('failure', now), { now, commitAt: now })).toBe('failed');
        expect(assessPagesDeployment(dep('error', now), { now, commitAt: now })).toBe('failed');
    });
    it('leaves a young in-progress deploy alone', () => {
        expect(assessPagesDeployment(dep('in_progress', now - MIN), { now, commitAt: now - 2 * MIN })).toBe('pending');
    });
    it('calls an in-progress deploy stuck well past a normal deploy', () => {
        expect(assessPagesDeployment(dep('in_progress', now - 6 * MIN), { now, commitAt: now - 7 * MIN })).toBe('stuck');
        expect(assessPagesDeployment(dep(null, now - 6 * MIN), { now, commitAt: now - 7 * MIN })).toBe('stuck');
    });
    it('gives GitHub time to create a deployment before calling it missing', () => {
        expect(assessPagesDeployment(null, { now, commitAt: now - MIN })).toBe('pending');
        expect(assessPagesDeployment(null, { now, commitAt: now - 5 * MIN })).toBe('stuck');
    });
});

describe('watchPagesDeploy', () => {
    it('resolves built when our commit deploys', async () => {
        const repo = makeRepo({
            head: 'abc',
            timelines: { abc: [[60000, dep('queued', 60000)], [70000, dep('in_progress', 60000)], [90000, dep('success', 60000)]] },
        });
        const progress: string[] = [];

        const result = await watchPagesDeploy({ commitSha: 'abc', onProgress: (p) => progress.push(p.phase), ...repo.opts });

        expect(result).toMatchObject({ outcome: 'built', sha: 'abc', redeploys: 0 });
        expect(repo.pushRedeployCommit).not.toHaveBeenCalled();
        expect(progress).toContain('deploying');
    });

    it('does NOT redeploy while a healthy deploy is in progress', async () => {
        // Redeploying here would cancel a deploy that was about to succeed.
        const repo = makeRepo({
            head: 'abc',
            timelines: { abc: [[60000, dep('in_progress', 60000)], [4 * MIN, dep('success', 60000)]] },
        });

        const result = await watchPagesDeploy({ commitSha: 'abc', ...repo.opts });

        expect(result.outcome).toBe('built');
        expect(repo.pushRedeployCommit).not.toHaveBeenCalled();
    });

    it('redeploys with a new commit when the deploy fails, then follows the new sha', async () => {
        const repo = makeRepo({
            head: 'abc',
            timelines: {
                abc: [[60000, dep('in_progress', 60000)], [11 * MIN, dep('failure', 60000)]],
                redeploy1: [[60000, dep('in_progress', 60000)], [80000, dep('success', 60000)]],
            },
        });

        const result = await watchPagesDeploy({ commitSha: 'abc', stuckAfterMs: 20 * MIN, ...repo.opts });

        expect(repo.pushRedeployCommit).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ outcome: 'built', sha: 'redeploy1', redeploys: 1 });
    });

    it('redeploys a deploy wedged in progress instead of waiting out GitHub\'s 10 minutes', async () => {
        const repo = makeRepo({
            head: 'abc',
            timelines: {
                abc: [[60000, dep('in_progress', 60000)]],
                redeploy1: [[60000, dep('success', 60000)]],
            },
        });

        const result = await watchPagesDeploy({ commitSha: 'abc', ...repo.opts });

        expect(repo.pushRedeployCommit).toHaveBeenCalledTimes(1);
        expect(result.outcome).toBe('built');
    });

    it('gives up after maxRedeploys and reports errored', async () => {
        const repo = makeRepo({
            head: 'abc',
            timelines: {
                abc: [[60000, dep('failure', 60000)]],
                redeploy1: [[60000, dep('error', 60000)]],
                redeploy2: [[60000, dep('failure', 60000)]],
            },
        });

        const result = await watchPagesDeploy({ commitSha: 'abc', maxRedeploys: 2, ...repo.opts });

        expect(repo.pushRedeployCommit).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ outcome: 'errored', sha: 'redeploy2', redeploys: 2 });
    });

    it('follows someone else\'s newer commit instead of redeploying over it', async () => {
        // Their commit descends from ours, so its deploy publishes our report too.
        const repo = makeRepo({
            head: 'abc',
            timelines: { abc: [[30000, dep('in_progress', 30000)]] },
        });
        repo.setTimeline('theirs', [[60000, dep('success', 60000)]]);
        const sleep = repo.opts.sleep;
        let polls = 0;
        const result = await watchPagesDeploy({
            commitSha: 'abc',
            ...repo.opts,
            sleep: async (ms) => { if (++polls === 2) repo.setHead('theirs'); await sleep(ms); },
        });

        expect(repo.pushRedeployCommit).not.toHaveBeenCalled();
        expect(result).toMatchObject({ outcome: 'built', sha: 'theirs', redeploys: 0 });
    });

    it('reports unknown when deployments cannot be read at all', async () => {
        let clock = 0;
        const result = await watchPagesDeploy({
            commitSha: 'abc',
            getHeadSha: async () => 'abc',
            getDeployment: async () => { throw new Error('GitHub API error (404)'); },
            pushRedeployCommit: vi.fn(),
            sleep: async (ms) => { clock += ms; },
            now: () => clock,
            timeoutMs: 2 * MIN,
        });

        expect(result.outcome).toBe('unknown');
        expect(result.error).toContain('404');
    });

    it('stops redeploying when the redeploy push itself fails', async () => {
        const repo = makeRepo({ head: 'abc', timelines: { abc: [[60000, dep('failure', 60000)]] } });
        repo.pushRedeployCommit.mockRejectedValueOnce(new Error('no push access'));

        const result = await watchPagesDeploy({ commitSha: 'abc', ...repo.opts });

        expect(result.outcome).toBe('errored');
        expect(result.error).toContain('no push access');
        expect(repo.pushRedeployCommit).toHaveBeenCalledTimes(1);
    });
});

describe('healPagesDeploy', () => {
    const now = 60 * MIN;
    const base = (snapshot: PagesDeploymentSnapshot | null, extra: Partial<Parameters<typeof healPagesDeploy>[0]> = {}) => {
        const pushRedeployCommit = vi.fn(async () => 'fresh');
        return {
            pushRedeployCommit,
            run: () => healPagesDeploy({
                getHeadSha: async () => 'head',
                getCommitTime: async () => now - 30 * MIN,
                getDeployment: async () => snapshot,
                hasAnyDeployment: async () => true,
                pushRedeployCommit,
                now: () => now,
                ...extra,
            }),
        };
    };

    it('leaves a live site alone', async () => {
        const h = base(dep('success', now - 29 * MIN));
        expect(await h.run()).toMatchObject({ action: 'healthy' });
        expect(h.pushRedeployCommit).not.toHaveBeenCalled();
    });

    it('redeploys a head whose deploy failed while nobody was watching', async () => {
        const h = base(dep('failure', now - 29 * MIN));
        expect(await h.run()).toMatchObject({ action: 'redeployed', sha: 'fresh', record: { sha: 'fresh', count: 1 } });
        expect(h.pushRedeployCommit).toHaveBeenCalledWith('head');
    });

    it('redeploys a head stuck in progress', async () => {
        const h = base(dep('in_progress', now - 29 * MIN));
        expect(await h.run()).toMatchObject({ action: 'redeployed' });
    });

    it('waits on a young deploy', async () => {
        const h = base(dep('in_progress', now - MIN), { getCommitTime: async () => now - 2 * MIN });
        expect(await h.run()).toMatchObject({ action: 'pending' });
        expect(h.pushRedeployCommit).not.toHaveBeenCalled();
    });

    it('never pushes to a repo that has no Pages deployments at all', async () => {
        // Pages off, or served from another branch: an empty commit fixes nothing.
        const h = base(null, { hasAnyDeployment: async () => false });
        expect(await h.run()).toMatchObject({ action: 'skipped' });
        expect(h.pushRedeployCommit).not.toHaveBeenCalled();
    });

    it('stops after repeated heals of its own commits fail', async () => {
        // Head is our previous heal commit and that failed too, twice over.
        const h = base(dep('failure', now - 29 * MIN), { previous: { sha: 'head', count: 2 }, maxConsecutive: 2 });
        expect(await h.run()).toMatchObject({ action: 'skipped' });
        expect(h.pushRedeployCommit).not.toHaveBeenCalled();
    });

    it('counts consecutive heals only while head is still our heal commit', async () => {
        const chained = base(dep('failure', now - 29 * MIN), { previous: { sha: 'head', count: 1 } });
        expect(await chained.run()).toMatchObject({ record: { sha: 'fresh', count: 2 } });
        const fresh = base(dep('failure', now - 29 * MIN), { previous: { sha: 'someone-else', count: 2 } });
        expect(await fresh.run()).toMatchObject({ record: { sha: 'fresh', count: 1 } });
    });
});

describe('describePagesDeploy', () => {
    it('only says live when the deploy actually landed', () => {
        expect(describePagesDeploy({ outcome: 'built', sha: 'a', redeploys: 0 })).toContain('live');
        expect(describePagesDeploy({ outcome: 'built', sha: 'a', redeploys: 1 })).toMatch(/redeploy/i);
        expect(describePagesDeploy({ outcome: 'timeout', sha: 'a', redeploys: 0 })).not.toContain('live');
        expect(describePagesDeploy({ outcome: 'errored', sha: 'a', redeploys: 2 })).toMatch(/next time/i);
        expect(describePagesDeploy({ outcome: 'unknown', sha: 'a', redeploys: 0 })).toContain('few minutes');
    });
});
