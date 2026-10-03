/**
 * Wait for a publish commit to actually reach the live GitHub Pages site.
 *
 * Pushing the commit is not publishing. GitHub queues a Pages build afterwards
 * and the site keeps serving the previous tree until that build finishes —
 * anywhere from ~20 seconds to several minutes on a repo with hundreds of
 * reports. The publish flow used to hand the user the report URL the instant
 * the ref moved, so the first thing they saw was the viewer's own
 * "Report not found yet. It may still be deploying." That reads as a failed
 * publish, and the honest fix is to not call it done until it is done.
 *
 * Two failure modes make a naive "poll until status === 'built'" wrong:
 *
 *  - The latest build can be an OLD successful one. A build that errors leaves
 *    the previous `built` record in place for a while, so `status` alone says
 *    everything is fine while the new commit is nowhere on the site. Every
 *    check here is therefore keyed on the build's `commit` sha, not its status.
 *  - The automatic build sometimes never gets queued at all. After
 *    `forceBuildAfterMs` with no build referencing our commit, request one
 *    explicitly (`POST /pages/builds`), which is also the documented remedy
 *    for an errored build.
 *
 * Pure apart from the injected API calls and clock, so the whole state machine
 * is testable without a network or a six-minute wait.
 */

export type PagesBuildStatus = 'queued' | 'building' | 'built' | 'errored' | string;

export interface PagesBuild {
    status?: PagesBuildStatus;
    commit?: string | null;
    error?: { message?: string | null } | null;
}

export type PagesDeployOutcome =
    /** A build for our commit finished successfully; the report is live. */
    | 'built'
    /** A build for our commit failed, and the forced rebuild failed too. */
    | 'errored'
    /** Still queued or building when we stopped waiting. Not a failure. */
    | 'timeout'
    /** We could not read build status at all (no Pages API access, offline). */
    | 'unknown';

export interface PagesDeployResult {
    outcome: PagesDeployOutcome;
    /** The last status we saw, for the message shown to the user. */
    status?: PagesBuildStatus;
    error?: string;
}

export interface WaitForPagesDeployOptions {
    /** The commit whose build we are waiting for. */
    commitSha: string;
    getLatestBuild: () => Promise<PagesBuild | null>;
    requestBuild: () => Promise<void>;
    /** Progress reporting; called once per observed state change. */
    onProgress?: (state: { status: PagesBuildStatus; forced: boolean }) => void;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    pollIntervalMs?: number;
    timeoutMs?: number;
    /** How long to wait for GitHub to queue a build on its own. */
    forceBuildAfterMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForPagesDeploy({
    commitSha,
    getLatestBuild,
    requestBuild,
    onProgress,
    sleep = defaultSleep,
    now = Date.now,
    pollIntervalMs = 8000,
    timeoutMs = 6 * 60 * 1000,
    forceBuildAfterMs = 45000,
}: WaitForPagesDeployOptions): Promise<PagesDeployResult> {
    const startedAt = now();
    let forced = false;
    let lastStatus: PagesBuildStatus | undefined;
    let sawAnyBuild = false;
    let lastError: string | undefined;

    const force = async (): Promise<boolean> => {
        if (forced) return false;
        forced = true;
        try {
            await requestBuild();
            return true;
        } catch (err: any) {
            lastError = err?.message || String(err);
            return false;
        }
    };

    while (now() - startedAt < timeoutMs) {
        let build: PagesBuild | null = null;
        try {
            build = await getLatestBuild();
            sawAnyBuild = true;
        } catch (err: any) {
            lastError = err?.message || String(err);
        }

        // Only a build of OUR commit tells us anything. A `built` record for a
        // previous commit is exactly the lie this function exists to ignore.
        const isOurs = Boolean(build?.commit) && build!.commit === commitSha;
        if (isOurs) {
            const status = build!.status || 'unknown';
            if (status !== lastStatus) {
                lastStatus = status;
                onProgress?.({ status, forced });
            }
            if (status === 'built') {
                return { outcome: 'built', status };
            }
            if (status === 'errored') {
                lastError = build!.error?.message || 'GitHub Pages build failed.';
                // A single errored build is routine and usually clears on a
                // retry; only a second failure is worth telling the user about.
                if (await force()) {
                    await sleep(pollIntervalMs);
                    continue;
                }
                return { outcome: 'errored', status, error: lastError };
            }
        } else if (!forced && now() - startedAt >= forceBuildAfterMs) {
            // Nothing has been queued for our commit in a reasonable window —
            // ask for one rather than waiting out the whole timeout.
            await force();
        }

        await sleep(pollIntervalMs);
    }

    if (!sawAnyBuild) {
        return { outcome: 'unknown', status: lastStatus, error: lastError };
    }
    return { outcome: 'timeout', status: lastStatus, error: lastError };
}

/** The user-facing line for each outcome. */
export const describePagesDeploy = (result: PagesDeployResult): string => {
    switch (result.outcome) {
        case 'built':
            return 'Report published and live.';
        case 'errored':
            return `Published, but the GitHub Pages build failed: ${result.error || 'unknown error'}. `
                + 'The report will appear once a build succeeds — check the repository\'s Pages settings.';
        case 'timeout':
            return 'Published. GitHub Pages is still building, so the report may take a few more minutes to appear.';
        default:
            return 'Published. Could not confirm the GitHub Pages build; the report may take a few minutes to appear.';
    }
};
