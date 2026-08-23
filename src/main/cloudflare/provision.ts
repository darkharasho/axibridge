import log from 'electron-log';
import {
    CF_ERR_BUCKET_EXISTS,
    cloudflareJson,
    cloudflareRequest,
    type CloudflareFailure
} from './restClient';
import { createOAuthUploader } from './uploader';

// ─── R2 provisioning ──────────────────────────────────────────────────────────
//
// Turns a fresh OAuth grant into a working bucket, in the order the REST API
// requires: pick an account, create (or adopt) the bucket, publish it on r2.dev,
// allow the report origin through CORS, and only then prove the whole thing
// works by writing an object and reading it back over the public URL.
//
// The proof at the end is the point. Today a bad R2 setup is discovered at
// publish time, halfway through someone's upload; this flow must never report
// "connected" without having completed one real round trip.

export const DEFAULT_BUCKET_NAME = 'axibridge-reports';

/** Which step failed, so the UI can say what to do rather than just what broke. */
export type ProvisionStep =
    | 'list-accounts'
    | 'create-bucket'
    | 'enable-public-url'
    | 'configure-cors'
    | 'verify';

export interface ProvisionFailure {
    step: ProvisionStep;
    failure: CloudflareFailure;
}

export interface CloudflareAccount {
    id: string;
    name: string;
}

export interface ProvisionResult {
    accountId: string;
    bucketName: string;
    publicUrl: string;
    /** True when the bucket already existed and was adopted rather than created. */
    adoptedExisting: boolean;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: ProvisionFailure };

const fail = (step: ProvisionStep, failure: CloudflareFailure): Outcome<never> => ({
    ok: false,
    error: { step, failure }
});

/**
 * The accounts this grant covers.
 *
 * An empty list is not a network problem and must not be reported as one: an
 * account administrator can switch off *Manage Account → Members → Settings →
 * Public OAuth App access*, and the only visible symptom is that the account
 * silently does not appear here.
 */
export const listAccounts = async (accessToken: string): Promise<Outcome<CloudflareAccount[]>> => {
    const result = await cloudflareJson<Array<{ id?: string; name?: string }>>({
        method: 'GET',
        path: '/client/v4/accounts',
        accessToken
    });
    if (!result.ok) return fail('list-accounts', result.failure);

    const accounts = (result.result ?? [])
        .filter((account): account is { id: string; name?: string } => typeof account?.id === 'string')
        .map((account) => ({ id: account.id, name: account.name ?? account.id }));

    if (accounts.length === 0) {
        return fail('list-accounts', {
            kind: 'unauthorized',
            message: 'Cloudflare authorized the sign-in but shared no accounts. This usually means an account '
                + 'administrator has turned off "Public OAuth App access" under Manage Account → Members → '
                + 'Settings. Ask them to enable it, or use the manual credential fields instead.'
        });
    }
    return { ok: true, value: accounts };
};

/** Create the bucket, or adopt the one already there under the same name. */
export const ensureBucket = async (
    accessToken: string,
    accountId: string,
    bucketName: string
): Promise<Outcome<{ adoptedExisting: boolean }>> => {
    const result = await cloudflareJson<unknown>({
        method: 'POST',
        path: `/client/v4/accounts/${accountId}/r2/buckets`,
        accessToken,
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify({ name: bucketName }), 'utf-8')
    });
    if (result.ok) return { ok: true, value: { adoptedExisting: false } };

    if (result.failure.code === CF_ERR_BUCKET_EXISTS) {
        log.info(`[Main] R2 bucket ${bucketName} already exists on this account — adopting it`);
        return { ok: true, value: { adoptedExisting: true } };
    }
    return fail('create-bucket', result.failure);
};

/**
 * Switch on the public development URL and return the hostname it hands back.
 *
 * The PUT response carries the `pub-<hash>.r2.dev` domain itself, so there is no
 * follow-up GET to make.
 */
export const enablePublicDevUrl = async (
    accessToken: string,
    accountId: string,
    bucketName: string
): Promise<Outcome<string>> => {
    const result = await cloudflareJson<{ domain?: string; enabled?: boolean }>({
        method: 'PUT',
        path: `/client/v4/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/domains/managed`,
        accessToken,
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify({ enabled: true }), 'utf-8')
    });
    if (!result.ok) return fail('enable-public-url', result.failure);

    const domain = result.result?.domain;
    if (!domain) {
        return fail('enable-public-url', {
            kind: 'http',
            message: 'Cloudflare enabled the public URL but did not say what it is. '
                + 'Copy the bucket\'s public r2.dev address from the dashboard into the Public URL field.'
        });
    }
    return { ok: true, value: `https://${domain}` };
};

/**
 * Write an object, read it back over the *public* URL, then delete it.
 *
 * The public read is the part that cannot be skipped. Every preceding step can
 * report success while the bucket is still unreadable from a browser — which is
 * exactly the state that currently surfaces as a broken published report.
 */
export const verifyRoundTrip = async (
    accessToken: string,
    accountId: string,
    bucketName: string,
    publicUrl: string
): Promise<Outcome<null>> => {
    const uploader = createOAuthUploader({
        accountId,
        bucketName,
        publicUrl,
        getAccessToken: async () => accessToken
    });
    const key = '.axibridge/connection-check.json';
    const payload = Buffer.from(JSON.stringify({ axibridge: 'connection-check' }), 'utf-8');

    const put = await uploader.putObject(key, payload, 'application/json');
    if (!put.success) {
        return fail('verify', { kind: 'http', message: put.error ?? 'Could not write a test object to the bucket.' });
    }

    const read = await readPublicObject(put.url ?? `${publicUrl}/${key}`);

    // Clean up whatever the read said. Leaving the probe object behind on a
    // failed verify would make a retry look like a success.
    const removal = await uploader.deleteObject(key);
    if (!removal.success) {
        log.warn(`[Main] Could not remove the R2 connection-check object: ${removal.error}`);
    }

    return read.ok ? { ok: true, value: null } : read;
};

/** Public r2.dev propagation is not instant on a bucket that was just published. */
const PUBLIC_READ_ATTEMPTS = 5;
const PUBLIC_READ_DELAY_MS = 2_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const readPublicObject = async (url: string): Promise<Outcome<null>> => {
    const target = new URL(url);
    let last: CloudflareFailure = { kind: 'network', message: 'The public URL was never reached.' };

    for (let attempt = 1; attempt <= PUBLIC_READ_ATTEMPTS; attempt += 1) {
        try {
            const response = await cloudflareRequest({
                method: 'GET',
                hostname: target.hostname,
                path: target.pathname
                // No access token: this must succeed as an anonymous browser would,
                // which is the whole question being asked.
            });
            if (response.status >= 200 && response.status < 300) return { ok: true, value: null };

            last = {
                kind: response.status === 404 || response.status === 401 ? 'unauthorized' : 'http',
                status: response.status,
                message: `The bucket is not publicly readable yet (HTTP ${response.status} from ${target.hostname}). `
                    + 'Check that the public r2.dev URL is enabled for this bucket.'
            };
        } catch (err) {
            last = { kind: 'network', message: `Could not reach ${target.hostname}: ${(err as Error).message}` };
        }
        if (attempt < PUBLIC_READ_ATTEMPTS) await delay(PUBLIC_READ_DELAY_MS);
    }
    return fail('verify', last);
};

/** The whole sequence, stopping at the first step that fails. */
export const provisionR2 = async (params: {
    accessToken: string;
    accountId: string;
    bucketName?: string;
    corsOrigin?: string;
}): Promise<Outcome<ProvisionResult>> => {
    const { accessToken, accountId } = params;
    const bucketName = params.bucketName?.trim() || DEFAULT_BUCKET_NAME;

    const bucket = await ensureBucket(accessToken, accountId, bucketName);
    if (!bucket.ok) return bucket;

    const publicUrl = await enablePublicDevUrl(accessToken, accountId, bucketName);
    if (!publicUrl.ok) return publicUrl;

    if (params.corsOrigin) {
        const uploader = createOAuthUploader({
            accountId,
            bucketName,
            publicUrl: publicUrl.value,
            getAccessToken: async () => accessToken
        });
        const cors = await uploader.ensureCors(params.corsOrigin);
        if (!cors.success) {
            return fail('configure-cors', {
                kind: 'http',
                message: cors.error ?? 'Could not set the bucket CORS policy.'
            });
        }
    }

    const verified = await verifyRoundTrip(accessToken, accountId, bucketName, publicUrl.value);
    if (!verified.ok) return verified;

    log.info(`[Main] R2 provisioned on account ${accountId}: bucket ${bucketName} at ${publicUrl.value}`);
    return {
        ok: true,
        value: {
            accountId,
            bucketName,
            publicUrl: publicUrl.value,
            adoptedExisting: bucket.value.adoptedExisting
        }
    };
};
