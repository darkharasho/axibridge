import log from 'electron-log';
import { cloudflareJson, type CloudflareFailure } from './restClient';
import {
    r2DeleteObject,
    r2EnsureBucketCors,
    r2PutObject,
    type R2Config
} from './r2SigV4';

// ─── The uploader seam ────────────────────────────────────────────────────────
//
// R2 objects reach the bucket over one of two transports that have nothing in
// common: SigV4 against the S3 endpoint (manual key pair), or a bearer token
// against Cloudflare's REST API (OAuth grant). The publish path calls three
// operations across five sites; without a seam those five sites would each have
// to branch on which transport is active, and the two would drift.
//
// Everything above this interface stays ignorant of which one it received.

export type R2AuthMode = 'manual' | 'oauth';

export interface R2OperationResult {
    success: boolean;
    error?: string;
}

export interface R2PutResult extends R2OperationResult {
    /** Public URL of the stored object, on success. */
    url?: string;
}

export interface R2Uploader {
    mode: R2AuthMode;
    bucketName: string;
    /** Public base the stored objects are readable at, without a trailing slash. */
    publicUrl: string;
    putObject(key: string, body: Buffer, contentType: string): Promise<R2PutResult>;
    deleteObject(key: string): Promise<R2OperationResult>;
    ensureCors(origin: string): Promise<R2OperationResult>;
}

const stripTrailingSlash = (value: string) => value.replace(/\/$/, '');

type CorsProbeFetch = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ headers: { get(name: string): string | null } }>;

/**
 * Asks the bucket's public URL whether a browser at `origin` may read from it.
 *
 * Changing a bucket's CORS policy needs an Admin-level R2 key, but a bucket owner
 * commonly hands collaborators an object-only key; reading the policy back is
 * forbidden to that key too. The public endpoint answers with
 * Access-Control-Allow-Origin even for a missing object, so this verifies the
 * grant the owner already made without any credentials at all.
 */
export const probePublicCors = async (publicUrl: string, origin: string, fetchImpl: CorsProbeFetch = fetch): Promise<boolean> => {
    try {
        const res = await fetchImpl(`${stripTrailingSlash(publicUrl)}/.axibridge-cors-probe`, {
            method: 'GET',
            headers: { Origin: origin },
            signal: AbortSignal.timeout(10_000)
        });
        const allowed = res.headers.get('access-control-allow-origin');
        return allowed === origin || allowed === '*';
    } catch {
        return false;
    }
};

const isPermissionError = (error: string | undefined) => /\b403\b|AccessDenied|Unauthorized|not authorized|forbidden/i.test(error ?? '');

/**
 * A failed CORS write is only a problem if the bucket doesn't already allow the
 * origin. When it does (the owner set it up), succeed quietly; when it doesn't,
 * say whose job it is, since a collaborator's key can never fix it.
 */
const settleCorsFailure = async (publicUrl: string, origin: string, failure: R2OperationResult, probe?: CorsProbeFetch): Promise<R2OperationResult> => {
    if (publicUrl && await probePublicCors(publicUrl, origin, probe)) {
        log.info(`[Main] R2 CORS could not be changed with this key, but the bucket already allows ${origin}`);
        return { success: true };
    }
    if (!isPermissionError(failure.error)) return failure;
    return {
        success: false,
        error: `${failure.error} — this R2 key can't change the bucket's CORS settings (that needs an Admin Read & Write token), `
            + `and the bucket doesn't allow ${origin} yet. If the bucket is shared with you, ask its owner to add that origin`
    };
};

// ─── Manual transport ─────────────────────────────────────────────────────────

export const createManualUploader = (config: R2Config, corsProbe?: CorsProbeFetch): R2Uploader => ({
    mode: 'manual',
    bucketName: config.bucketName,
    publicUrl: stripTrailingSlash(config.publicUrl),
    putObject: (key, body, contentType) => r2PutObject(key, body, contentType, config),
    deleteObject: (key) => r2DeleteObject(key, config),
    ensureCors: async (origin) => {
        const result = await r2EnsureBucketCors(config, origin);
        return result.success ? result : settleCorsFailure(config.publicUrl, origin, result, corsProbe);
    }
});

// ─── OAuth transport ──────────────────────────────────────────────────────────

export interface OAuthUploaderOptions {
    accountId: string;
    bucketName: string;
    publicUrl: string;
    /**
     * Supplies a live access token per request rather than a fixed one: tokens
     * expire mid-publish on long uploads, and every caller refreshing for itself
     * would be five refresh races.
     */
    getAccessToken: () => Promise<string>;
    corsProbe?: CorsProbeFetch;
}

/** Object keys carry slashes that must survive as path separators. */
const encodeObjectKey = (key: string) =>
    key.split('/').map(encodeURIComponent).join('/');

interface CorsRule {
    allowed?: { origins?: string[]; methods?: string[]; headers?: string[] };
}

export const createOAuthUploader = (options: OAuthUploaderOptions): R2Uploader => {
    const publicUrl = stripTrailingSlash(options.publicUrl);
    const bucketPath = `/client/v4/accounts/${options.accountId}/r2/buckets/${encodeURIComponent(options.bucketName)}`;

    const failed = (failure: CloudflareFailure): R2OperationResult => ({
        success: false,
        error: failure.message
    });

    return {
        mode: 'oauth',
        bucketName: options.bucketName,
        publicUrl,

        async putObject(key, body, contentType) {
            const accessToken = await options.getAccessToken();
            const result = await cloudflareJson<unknown>({
                method: 'PUT',
                path: `${bucketPath}/objects/${encodeObjectKey(key)}`,
                accessToken,
                contentType,
                body
            });
            if (!result.ok) return failed(result.failure);
            return { success: true, url: `${publicUrl}/${key}` };
        },

        async deleteObject(key) {
            const accessToken = await options.getAccessToken();
            const result = await cloudflareJson<unknown>({
                method: 'DELETE',
                path: `${bucketPath}/objects/${encodeObjectKey(key)}`,
                accessToken
            });
            return result.ok ? { success: true } : failed(result.failure);
        },

        async ensureCors(origin) {
            const accessToken = await options.getAccessToken();

            // Read-merge-write, matching the SigV4 path: a user may host several
            // report sites off one bucket, and a blind PUT would evict the others.
            const existing = await cloudflareJson<{ rules?: CorsRule[] }>({
                method: 'GET',
                path: `${bucketPath}/cors`,
                accessToken
            });

            // A bucket with no CORS config at all reads as an error rather than an
            // empty list, so treat an unreadable config as "nothing configured"
            // and let the PUT below establish it.
            const rules = existing.ok ? (existing.result?.rules ?? []) : [];
            const covered = rules.some((rule) => {
                const origins = rule.allowed?.origins ?? [];
                return origins.includes(origin) || origins.includes('*');
            });
            if (covered) {
                log.info(`[Main] R2 CORS already includes origin ${origin}, skipping update`);
                return { success: true };
            }

            const updated = [...rules, { allowed: { origins: [origin], methods: ['GET'], headers: ['*'] } }];
            const put = await cloudflareJson<unknown>({
                method: 'PUT',
                path: `${bucketPath}/cors`,
                accessToken,
                contentType: 'application/json',
                body: Buffer.from(JSON.stringify({ rules: updated }), 'utf-8')
            });
            if (!put.ok) return settleCorsFailure(publicUrl, origin, failed(put.failure), options.corsProbe);
            log.info(`[Main] R2 CORS updated — added origin ${origin} to bucket ${options.bucketName}`);
            return { success: true };
        }
    };
};
