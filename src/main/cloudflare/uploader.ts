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

// ─── Manual transport ─────────────────────────────────────────────────────────

export const createManualUploader = (config: R2Config): R2Uploader => ({
    mode: 'manual',
    bucketName: config.bucketName,
    publicUrl: stripTrailingSlash(config.publicUrl),
    putObject: (key, body, contentType) => r2PutObject(key, body, contentType, config),
    deleteObject: (key) => r2DeleteObject(key, config),
    ensureCors: (origin) => r2EnsureBucketCors(config, origin)
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
            if (!put.ok) return failed(put.failure);
            log.info(`[Main] R2 CORS updated — added origin ${origin} to bucket ${options.bucketName}`);
            return { success: true };
        }
    };
};
