/**
 * Get a publish commit onto the live GitHub Pages site, and repair sites
 * where that silently did not happen.
 *
 * Pushing the commit is not publishing: GitHub then builds and deploys Pages,
 * and the site keeps serving the previous tree until that finishes. Three
 * things GitHub does make the obvious approach wrong (all observed on
 * gw2eww/fight-reports, 2026-11-06/07):
 *
 *  - `/pages/builds` is not trustworthy. It recorded a deploy that went live
 *    in 16 seconds as `errored` and never corrected it, and right after a
 *    publish its "latest" is the previous commit's build. The Deployments API
 *    (`environment=github-pages`) reports each attempt's real result, so that
 *    is the only thing read here.
 *  - A deploy can wedge per commit: it hangs in `syncing_files` until GitHub
 *    kills it at ~10 minutes, and rebuilding the SAME commit wedges again.
 *    A new commit deploys normally. So recovery is an empty commit (same tree,
 *    new sha), never `POST /pages/builds`.
 *  - Any new commit or build request cancels the deploy in flight. A deploy
 *    that is still progressing normally must be left alone.
 *
 * The app can quit mid-deploy, so the watch alone cannot be relied on;
 * `healPagesDeploy` re-checks a repo's head on startup and repairs it.
 *
 * Pure apart from the injected API calls and clock.
 */

export interface PagesDeploymentSnapshot {
    /**
     * Latest status of the newest github-pages deployment for a commit:
     * waiting | queued | in_progress | success | inactive | failure | error,
     * or null when it has no status yet.
     */
    state: string | null;
    /** When the deployment was created (ms). */
    createdAt: number;
}

export type PagesDeploymentAssessment =
    /** Deployed. `inactive` is a success later superseded, still live content. */
    | 'live'
    /** Still within a normal deploy's time; leave it alone. */
    | 'pending'
    /** GitHub gave up on it. */
    | 'failed'
    /** Missing or in progress far longer than a normal deploy takes. */
    | 'stuck';

/**
 * Normal deploys on a 300 MB report site take 15-30s, after a ~1-2 min build.
 * These leave a wide margin before calling one stuck, because redeploying
 * cancels whatever is running.
 */
export const DEFAULT_STUCK_AFTER_MS = 5 * 60 * 1000;
export const DEFAULT_MISSING_AFTER_MS = 4 * 60 * 1000;

export const assessPagesDeployment = (
    deployment: PagesDeploymentSnapshot | null,
    {
        now,
        commitAt,
        stuckAfterMs = DEFAULT_STUCK_AFTER_MS,
        missingAfterMs = DEFAULT_MISSING_AFTER_MS,
    }: { now: number; commitAt: number; stuckAfterMs?: number; missingAfterMs?: number }
): PagesDeploymentAssessment => {
    if (!deployment) {
        return now - commitAt >= missingAfterMs ? 'stuck' : 'pending';
    }
    const state = deployment.state;
    if (state === 'success' || state === 'inactive') return 'live';
    if (state === 'failure' || state === 'error') return 'failed';
    return now - deployment.createdAt >= stuckAfterMs ? 'stuck' : 'pending';
};

export type PagesDeployOutcome =
    /** The commit (or a later one containing it) is live. */
    | 'built'
    /** Every deploy failed, including the redeploys. */
    | 'errored'
    /** Still deploying when we stopped watching. Not a failure. */
    | 'timeout'
    /** Deployment status could not be read at all. */
    | 'unknown';

export interface PagesDeployResult {
    outcome: PagesDeployOutcome;
    /** The commit whose deploy decided the outcome. */
    sha: string;
    /** Empty commits pushed to get past a failed or wedged deploy. */
    redeploys: number;
    error?: string;
}

export interface PagesDeployApi {
    getHeadSha: () => Promise<string>;
    getDeployment: (sha: string) => Promise<PagesDeploymentSnapshot | null>;
    /**
     * Push an empty commit (parent's tree) on top of `parentSha` and return
     * its sha, or null if the branch moved first (someone else's commit will
     * deploy instead).
     */
    pushRedeployCommit: (parentSha: string) => Promise<string | null>;
}

export interface WatchPagesDeployOptions extends PagesDeployApi {
    commitSha: string;
    onProgress?: (state: { phase: 'waiting' | 'deploying' | 'redeploying'; sha: string }) => void;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    pollIntervalMs?: number;
    /** Longer than GitHub's own ~10 min deploy timeout, plus a redeploy. */
    timeoutMs?: number;
    maxRedeploys?: number;
    stuckAfterMs?: number;
    missingAfterMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const errorText = (err: unknown) => (err as any)?.message || String(err);

export async function watchPagesDeploy({
    commitSha,
    getHeadSha,
    getDeployment,
    pushRedeployCommit,
    onProgress,
    sleep = defaultSleep,
    now = Date.now,
    pollIntervalMs = 10000,
    timeoutMs = 20 * 60 * 1000,
    maxRedeploys = 2,
    stuckAfterMs,
    missingAfterMs,
}: WatchPagesDeployOptions): Promise<PagesDeployResult> {
    const startedAt = now();
    let sha = commitSha;
    let shaSince = startedAt;
    let redeploys = 0;
    let readAnything = false;
    let lastError: string | undefined;
    let lastPhase: string | undefined;
    const ours = new Set([commitSha]);

    const report = (phase: 'waiting' | 'deploying' | 'redeploying') => {
        const key = `${phase}:${sha}`;
        if (key === lastPhase) return;
        lastPhase = key;
        onProgress?.({ phase, sha });
    };

    while (now() - startedAt < timeoutMs) {
        try {
            // Someone else publishing on top of us supersedes our deploy, and
            // their commit descends from ours, so its deploy carries our
            // report. Follow it rather than redeploying over it.
            const head = await getHeadSha();
            if (head && head !== sha && !ours.has(head)) {
                sha = head;
                shaSince = now();
            }

            const deployment = await getDeployment(sha);
            readAnything = true;
            const assessment = assessPagesDeployment(deployment, {
                now: now(),
                commitAt: shaSince,
                stuckAfterMs,
                missingAfterMs,
            });

            if (assessment === 'live') {
                return { outcome: 'built', sha, redeploys };
            }
            if (assessment === 'pending') {
                report(deployment ? 'deploying' : 'waiting');
            } else {
                if (assessment === 'failed') lastError = `GitHub Pages deploy of ${sha.slice(0, 7)} failed`;
                else lastError = `GitHub Pages deploy of ${sha.slice(0, 7)} got stuck`;
                if (redeploys >= maxRedeploys) {
                    return { outcome: 'errored', sha, redeploys, error: lastError };
                }
                report('redeploying');
                redeploys += 1;
                let next: string | null;
                try {
                    next = await pushRedeployCommit(sha);
                } catch (err) {
                    return { outcome: 'errored', sha, redeploys, error: errorText(err) };
                }
                if (next) {
                    sha = next;
                    ours.add(next);
                    shaSince = now();
                }
            }
        } catch (err) {
            lastError = errorText(err);
        }
        await sleep(pollIntervalMs);
    }

    return { outcome: readAnything ? 'timeout' : 'unknown', sha, redeploys, error: lastError };
}

/** The last startup heal this app pushed to a repo, persisted per repo. */
export interface PagesHealRecord {
    sha: string;
    count: number;
}

export interface HealPagesDeployOptions extends PagesDeployApi {
    getCommitTime: (sha: string) => Promise<number>;
    /** False when the repo has never had a github-pages deployment. */
    hasAnyDeployment: () => Promise<boolean>;
    previous?: PagesHealRecord | null;
    /** Heals in a row (each on top of the last) before giving up. */
    maxConsecutive?: number;
    now?: () => number;
    stuckAfterMs?: number;
    missingAfterMs?: number;
}

export type PagesHealResult =
    | { action: 'healthy' | 'pending'; sha: string }
    | { action: 'skipped'; sha: string; reason: string }
    | { action: 'redeployed'; sha: string; from: string; reason: PagesDeploymentAssessment; record: PagesHealRecord };

/**
 * Check a repo's current head deployed, and push an empty commit if it
 * failed or wedged. Stateless apart from `previous`, so it also repairs
 * deploys started by other publishers or by a session that quit early.
 */
export async function healPagesDeploy({
    getHeadSha,
    getDeployment,
    pushRedeployCommit,
    getCommitTime,
    hasAnyDeployment,
    previous,
    maxConsecutive = 2,
    now = Date.now,
    stuckAfterMs,
    missingAfterMs,
}: HealPagesDeployOptions): Promise<PagesHealResult> {
    const head = await getHeadSha();
    const deployment = await getDeployment(head);
    if (!deployment && !(await hasAnyDeployment())) {
        // Pages is off or deploys from elsewhere; an empty commit fixes nothing.
        return { action: 'skipped', sha: head, reason: 'no github-pages deployments' };
    }
    const commitAt = deployment ? deployment.createdAt : await getCommitTime(head);
    const assessment = assessPagesDeployment(deployment, { now: now(), commitAt, stuckAfterMs, missingAfterMs });
    if (assessment === 'live') return { action: 'healthy', sha: head };
    if (assessment === 'pending') return { action: 'pending', sha: head };

    const chained = previous?.sha === head;
    const count = chained ? previous!.count : 0;
    if (count >= maxConsecutive) {
        return { action: 'skipped', sha: head, reason: `${count} redeploys in a row already failed` };
    }
    const next = await pushRedeployCommit(head);
    if (!next) return { action: 'pending', sha: head };
    return { action: 'redeployed', sha: next, from: head, reason: assessment, record: { sha: next, count: count + 1 } };
}

/** The user-facing line for each outcome. */
export const describePagesDeploy = (result: PagesDeployResult): string => {
    switch (result.outcome) {
        case 'built':
            return result.redeploys > 0
                ? 'Report published and live. GitHub\'s first deploy failed, so AxiBridge redeployed it.'
                : 'Report published and live.';
        case 'errored':
            return `Published, but GitHub Pages failed to deploy it${result.redeploys > 0 ? ` (retried ${result.redeploys}×)` : ''}. `
                + 'AxiBridge will retry the next time it starts, or publishing again will redeploy it.';
        case 'timeout':
            return 'Published. GitHub Pages is still deploying, so the report may take a few more minutes to appear.';
        default:
            return 'Published. Could not confirm the GitHub Pages deploy; the report may take a few minutes to appear.';
    }
};
