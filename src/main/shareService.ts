import { brotliCompressSync, constants as zlibConstants } from 'zlib';
import { buildShareSummary } from '../shared/shareSummary';

export const DEFAULT_WORKER_URL = 'https://bridge.axi.link/r';

/**
 * The upload seam. Structurally satisfied by the existing `R2Uploader`, so the
 * R2 path passes its resolved uploader straight in with no adapter.
 */
export interface ShareTarget {
    putObject(
        key: string,
        body: Buffer,
        contentType: string
    ): Promise<{ success: boolean; url?: string; error?: string }>;
}

export interface ShareDeps {
    target: ShareTarget;
    githubToken: string | null;
    fetchImpl?: typeof fetch;
    workerUrl?: string;
}

export interface ShareResult {
    success: boolean;
    code?: string;
    url?: string;
    error?: string;
}

/**
 * Tier 1 is the native axilog block, brotli quality 11. Measured: ~0.78 MB for a
 * typical 42-player fight, ~4.2 MB for a large one.
 */
export const compressReport = (details: unknown): Buffer =>
    brotliCompressSync(Buffer.from(JSON.stringify(details), 'utf8'), {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 }
    });

/**
 * Publishes an already-parsed report to the user's own storage, then registers
 * a tiny pointer with the Cloudflare Worker and returns the resulting short
 * link. Never throws — every failure mode (missing auth, upload failure,
 * worker rejection, network failure) resolves to `{ success: false, error }`.
 *
 * The Worker's `POST /r` contract (worker/src/index.ts) returns 201 with
 * `{ code, url }` on success and 400/401/413/429/503/500 with `{ error }`
 * otherwise. Only an exact 201 counts as success here — checking `response.ok`
 * alone would also accept any other 2xx the Worker never actually sends, so
 * status is checked explicitly.
 */
export const shareLog = async (
    details: any,
    logId: string,
    deps: ShareDeps
): Promise<ShareResult> => {
    if (!deps.githubToken) {
        return { success: false, error: 'Connect GitHub in Settings to create share links.' };
    }

    const body = compressReport(details);
    const put = await deps.target.putObject(`shares/${logId}.json.br`, body, 'application/json');
    if (!put.success || !put.url) {
        return { success: false, error: put.error || 'Failed to upload the report.' };
    }

    const fetchImpl = deps.fetchImpl ?? fetch;
    let response: Response;
    try {
        response = await fetchImpl(deps.workerUrl ?? DEFAULT_WORKER_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${deps.githubToken}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ loc: put.url, sum: buildShareSummary(details) })
        });
    } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to reach the share service.' };
    }

    const payload = await response.json().catch(() => ({})) as { code?: string; url?: string; error?: string };
    if (response.status !== 201) {
        return { success: false, error: payload.error || `Share service returned ${response.status}.` };
    }
    return { success: true, code: payload.code, url: payload.url };
};
