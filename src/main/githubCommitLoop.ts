/**
 * Commit to a branch other people also push to.
 *
 * A fast-forward-only ref update 422s when someone else moved the branch
 * after we read it. Re-parenting the same tree onto the new HEAD is NOT
 * enough: files we derived from the old HEAD (reports/index.json, the
 * rollup, attendance, the stale-asset sweep) would overwrite the other
 * publisher's additions. So every attempt re-reads the base and rebuilds
 * everything that depends on it.
 */

export interface CommitBase {
    headSha: string;
    treeSha: string;
    treeEntries: any[];
    treeMap: Map<string, string>;
}

export type CommitEntry = { path: string; sha: string | null };

export const SITE_BUSY_MESSAGE = 'The site was updated by someone else while publishing. Try again.';

export class SiteBusyError extends Error {
    constructor() {
        super(SITE_BUSY_MESSAGE);
        this.name = 'SiteBusyError';
    }
}

export const isRefConflict = (err: unknown): boolean => {
    const e = err as any;
    return Number(e?.status) === 422 || String(e?.message || '').includes('(422)');
};

/** A 403 from the git-data API means the token cannot push to this repo. */
export const toPushAccessError = (err: unknown, owner: string, repo: string): unknown => {
    const e = err as any;
    if (Number(e?.status) === 403 || String(e?.message || '').includes('(403)')) {
        return new Error(`You don't have push access to ${owner}/${repo}. Ask the site admin to add you.`);
    }
    return err;
};

export interface CommitLoopOptions<T> {
    readBase: () => Promise<CommitBase>;
    build: (base: CommitBase, attempt: number) => Promise<{ entries: CommitEntry[]; result: T }>;
    commit: (base: CommitBase, entries: CommitEntry[]) => Promise<string>;
    maxAttempts?: number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    onRetry?: (attempt: number) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const commitWithRebase = async <T>(
    opts: CommitLoopOptions<T>
): Promise<{ commitSha: string | null; result: T; attempts: number }> => {
    const maxAttempts = opts.maxAttempts ?? 3;
    const sleep = opts.sleep ?? defaultSleep;
    const random = opts.random ?? Math.random;
    for (let attempt = 1; ; attempt += 1) {
        const base = await opts.readBase();
        const { entries, result } = await opts.build(base, attempt);
        if (entries.length === 0) return { commitSha: null, result, attempts: attempt };
        try {
            const commitSha = await opts.commit(base, entries);
            return { commitSha, result, attempts: attempt };
        } catch (err) {
            if (!isRefConflict(err)) throw err;
            if (attempt >= maxAttempts) throw new SiteBusyError();
            opts.onRetry?.(attempt);
            await sleep(250 + Math.floor(random() * 750));
        }
    }
};
