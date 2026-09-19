import { gzipSync, constants as zlibConstants } from 'zlib';
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
 * Tier 1 is the native axilog block, gzip at maximum level.
 *
 * NOT brotli, despite brotli compressing this payload measurably better: the
 * viewer decodes these bytes in-browser via `DecompressionStream`, which supports
 * gzip and deflate but not brotli, and `putObject` sets only a Content-Type so
 * there is no `Content-Encoding: br` for `fetch` to auto-inflate. Same reasoning,
 * and same gzip choice, as the replay and slice sidecars
 * (`githubHandlers.ts:1933`, `replaySidecar.ts:10`).
 */
export const compressReport = (details: unknown): Buffer =>
    gzipSync(Buffer.from(JSON.stringify(details), 'utf8'), {
        level: zlibConstants.Z_BEST_COMPRESSION
    });

const errorMessage = (err: unknown, fallback: string): string =>
    (err instanceof Error && err.message) || fallback;

const isHttpsUrl = (value: string): boolean => {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
};

/**
 * Publishes an already-parsed report to the user's own storage, then registers
 * a tiny pointer with the Cloudflare Worker and returns the resulting short
 * link. Never throws — every failure mode (missing auth, a throwing or failing
 * upload — e.g. an expired Cloudflare session — a non-https upload location,
 * worker rejection, or network failure) resolves to `{ success: false, error }`
 * naming the failing step, instead of rejecting.
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

    let body: Buffer;
    try {
        body = compressReport(details);
    } catch (err) {
        return { success: false, error: errorMessage(err, 'Failed to compress the report.') };
    }

    let put: { success: boolean; url?: string; error?: string };
    try {
        put = await deps.target.putObject(`shares/${logId}.json.gz`, body, 'application/gzip');
    } catch (err) {
        return { success: false, error: errorMessage(err, 'Failed to upload the report.') };
    }
    if (!put.success || !put.url) {
        return { success: false, error: put.error || 'Failed to upload the report.' };
    }
    if (!isHttpsUrl(put.url)) {
        return { success: false, error: 'Uploaded report location must be an https URL.' };
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
