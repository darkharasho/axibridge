import { createHash } from 'crypto';
import path from 'path';
import { gzipSync, constants as zlibConstants } from 'zlib';
import { buildShareSummary } from '../shared/shareSummary';

/**
 * Where the share viewer runs. Both the Worker endpoint and the CORS grant the
 * user's bucket needs are derived from this one constant, so they can never
 * drift apart.
 */
export const SHARE_VIEWER_ORIGIN = 'https://bridge.axi.link';

export const DEFAULT_WORKER_URL = `${SHARE_VIEWER_ORIGIN}/r`;

/**
 * The upload seam. Structurally satisfied by the existing `R2Uploader`, so the
 * R2 path passes its resolved uploader straight in with no adapter.
 *
 * `ensureCors` is OPTIONAL so the interface can still describe everything
 * `shareLog` wants without forcing every fake (or any future non-R2 target
 * that has no CORS concept) to implement it.
 */
export interface ShareTarget {
    putObject(
        key: string,
        body: Buffer,
        contentType: string
    ): Promise<{ success: boolean; url?: string; error?: string }>;
    ensureCors?(origin: string): Promise<{ success: boolean; error?: string }>;
}

/** Everything that may appear in an object key without needing URL-encoding. */
const SAFE_KEY_CHARS = /[^A-Za-z0-9._-]/g;

/**
 * Build the Tier 1 object key for a log.
 *
 * The `logId` handed to `shareLog` is, at the real call site, an ABSOLUTE LOCAL
 * FILE PATH (see `getBulkLogDetails(filePath)`), so interpolating it straight
 * into `shares/${logId}.json.gz` published the user's home directory — on Linux
 * including their OS username and Steam Proton prefix — inside a URL posted to
 * Discord. It also produced a broken `loc`: `putObject` encodes the key for the
 * PUT but returns the public URL un-encoded, so a path with a space, `#` or `?`
 * pointed somewhere else entirely and that wrong URL was then stored in KV
 * permanently.
 *
 * So the key is derived, never trusted: directories are dropped, every
 * remaining character outside `[A-Za-z0-9._-]` is replaced, and a short hash of
 * the ORIGINAL id is appended so two distinct logs cannot collide once they
 * have been sanitised down to the same basename.
 */
export const shareObjectKey = (logId: string): string => {
    const original = String(logId ?? '');
    const digest = createHash('sha256').update(original, 'utf8').digest('hex').slice(0, 12);
    const base = path.basename(original.replace(/\\/g, '/'))
        .replace(SAFE_KEY_CHARS, '-')
        .replace(/^-+/, '')
        .slice(0, 64);
    return `shares/${base ? `${base}-` : ''}${digest}.json.gz`;
};

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

    // The share viewer runs at a DIFFERENT origin from the user's own Pages
    // site, so the bucket's existing CORS grant (githubHandlers.ts:1829, which
    // allows only their Pages origin) does not cover it and every share link
    // would fail in the browser with the CORS card from loadShareReport.ts.
    // Non-blocking and warn-only, mirroring that same call site: a bucket whose
    // CORS is already correct, or a token without the permission to set it,
    // must not stop the share.
    if (deps.target.ensureCors) {
        try {
            const cors = await deps.target.ensureCors(SHARE_VIEWER_ORIGIN);
            if (!cors.success) {
                console.warn(
                    `[Share] (non-blocking) Could not grant ${SHARE_VIEWER_ORIGIN} CORS access on the bucket `
                    + `(${cors.error ?? 'unknown error'}). The share link may fail to load in a browser until `
                    + `an AllowedOrigin of "${SHARE_VIEWER_ORIGIN}" with the GET method is added in the `
                    + 'Cloudflare R2 dashboard → your bucket → Settings → CORS.'
                );
            }
        } catch (err) {
            console.warn('[Share] (non-blocking) CORS setup threw:', errorMessage(err, 'unknown error'));
        }
    }

    let put: { success: boolean; url?: string; error?: string };
    try {
        put = await deps.target.putObject(shareObjectKey(logId), body, 'application/gzip');
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
                // DELIBERATE, DOCUMENTED CHOICE — not an oversight.
                //
                // This sends the user's GitHub token to bridge.axi.link, a
                // domain the end user does not control. It is the SAME
                // repo-scoped token the app uses to push to GitHub Pages, i.e.
                // it carries repo WRITE scope, and the Worker forwards it to
                // api.github.com/user solely to read `login` (worker/src/auth.ts,
                // which never logs it and returns only the login).
                //
                // Creating a pointer writes to storage the Worker's owner pays
                // for, so it needs some door; reusing the token the app already
                // holds was chosen over standing up an identity system. See
                // `.superpowers/sdd/2026-09-19-log-share-links/…-design.md`
                // lines 163 and 223. Anything that would narrow this (a
                // dedicated scope-limited token, or a short-lived signed
                // assertion over the log id so the Worker never sees a
                // credential at all) is a follow-up, and changing it here means
                // changing the Worker's auth model too.
                Authorization: `Bearer ${deps.githubToken}`,
                'content-type': 'application/json'
            },
            // `bytes` is what makes budget-driven retention possible later:
            // without a size per pointer nothing can total a user's footprint
            // against the Pages ceiling. Recorded now, acted on by nothing yet.
            body: JSON.stringify({ loc: put.url, sum: buildShareSummary(details), bytes: body.length })
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
