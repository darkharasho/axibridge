import type { ShareTarget } from './shareService';

/**
 * The GitHub API call `createGithubShareTarget` needs, injected so the target
 * can be tested without a network or an `electron` import. `githubHandlers`
 * passes its own `githubApiRequest`; tests pass a fake.
 */
export type GithubRequestFn = (
    method: string,
    apiPath: string,
    token: string,
    body?: any
) => Promise<{ status: number; data: any }>;

export interface GithubShareTargetOptions {
    owner: string;
    repo: string;
    branch: string;
    token: string;
    /** Public Pages origin for `repo`, e.g. `https://user.github.io/axibridge-fights`. */
    baseUrl: string;
    request: GithubRequestFn;
    /** Refuse anything larger. Mirrors `MAX_GITHUB_BLOB_BYTES`. */
    maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 35 * 1024 * 1024;

const encodeGitPath = (value: string) =>
    value.split('/').map((part) => encodeURIComponent(part)).join('/');

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Tier 1 storage backed by the user's managed fights repo on GitHub Pages.
 *
 * This is the second rung of the ladder the design specifies — R2 if connected,
 * else Pages — and it exists so that sharing does not require a Cloudflare
 * account. Two things make it simpler than the R2 target rather than harder:
 *
 * 1. No `ensureCors`. GitHub Pages serves `Access-Control-Allow-Origin: *` on
 *    every asset, so the viewer can fetch cross-origin with no per-bucket
 *    setup. The `ShareTarget.ensureCors` member is optional precisely so a
 *    target with nothing to configure can omit it.
 * 2. No Content-Encoding negotiation. Pages cannot set response headers, but
 *    nothing needs it to: `shareService` gzips the body and the viewer inflates
 *    it client-side via `DecompressionStream('gzip')` (see
 *    `src/web/share/shareBodyDecode.ts`), so the bytes are opaque in transit
 *    either way.
 *
 * Writes go through the Contents API rather than the blob/tree/commit dance the
 * report publisher uses. A share is a single file with no sibling updates to
 * make atomic, and the Contents API creates the branch as a side effect on a
 * fresh repo — which is exactly the state a just-provisioned fights repo is in.
 */
export const createGithubShareTarget = (opts: GithubShareTargetOptions): ShareTarget => {
    const { owner, repo, branch, token, request } = opts;
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const baseUrl = opts.baseUrl.replace(/\/+$/, '');

    const contentsPath = (key: string) =>
        `/repos/${encodeGitPath(owner)}/${encodeGitPath(repo)}/contents/${encodeGitPath(key)}`;

    /**
     * The blob sha of an existing file, or null when it does not exist.
     *
     * The Contents API requires `sha` to overwrite and REJECTS it when the file
     * is absent, so "does it already exist" has to be answered before every
     * write rather than inferred from a failure.
     */
    const existingSha = async (key: string): Promise<string | null> => {
        const resp = await request(
            'GET',
            `${contentsPath(key)}?ref=${encodeURIComponent(branch)}`,
            token
        );
        if (resp.status === 404) return null;
        if (resp.status >= 300) {
            throw new Error(`GitHub API error (${resp.status}) checking ${key}`);
        }
        return typeof resp.data?.sha === 'string' ? resp.data.sha : null;
    };

    const write = async (key: string, body: Buffer, sha: string | null) =>
        request('PUT', contentsPath(key), token, {
            message: `share: ${key}`,
            content: body.toString('base64'),
            branch,
            ...(sha ? { sha } : {})
        });

    return {
        async putObject(key, body, _contentType) {
            if (body.length > maxBytes) {
                return {
                    success: false,
                    error:
                        `This report (${formatMb(body.length)}) is too large to host on GitHub Pages `
                        + `(limit ${formatMb(maxBytes)}). Connect Cloudflare R2 in Settings to share `
                        + 'sessions this size.'
                };
            }

            try {
                let resp = await write(key, body, await existingSha(key));

                // 409/422 here means the sha we read went stale between the GET
                // and the PUT — another share of the same log raced us. Re-read
                // and retry once; a second conflict is a real problem.
                if (resp.status === 409 || resp.status === 422) {
                    resp = await write(key, body, await existingSha(key));
                }

                if (resp.status >= 300) {
                    const detail = typeof resp.data?.message === 'string' ? resp.data.message : 'Unknown error';
                    return { success: false, error: `GitHub API error (${resp.status}) storing report: ${detail}` };
                }

                return { success: true, url: `${baseUrl}/${key}` };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to store the report on GitHub.' };
            }
        },

        /**
         * The tombstone rung: stop hosting the report bytes entirely. The share
         * link keeps working — the pointer and its summary card are in KV, and
         * the Worker renders that card for a tombstoned pointer — so this is
         * the one deletion the demote-never-delete rule permits.
         *
         * An already-absent file is reported as SUCCESS. Retention is
         * idempotent by design (an interrupted run is re-run from the ledger),
         * and the post-condition this call promises is "the object is gone",
         * which a 404 already satisfies.
         */
        async deleteObject(key) {
            try {
                const sha = await existingSha(key);
                if (!sha) return { success: true };

                const resp = await request('DELETE', contentsPath(key), token, {
                    message: `share: tombstone ${key}`,
                    sha,
                    branch
                });
                if (resp.status >= 300) {
                    const detail = typeof resp.data?.message === 'string' ? resp.data.message : 'Unknown error';
                    return { success: false, error: `GitHub API error (${resp.status}) removing report: ${detail}` };
                }
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err?.message || 'Failed to remove the report from GitHub.' };
            }
        }
    };
};
