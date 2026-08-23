import https from 'node:https';

/**
 * Cloudflare's WAF rejects default library user-agents: `Python-urllib/3.x`, and
 * by extension a bare Node/Electron request, gets a 403 whose body is the plain
 * text `error code: 1010` from both dash.cloudflare.com and *.r2.dev. It does not
 * need to look like a browser — a plain custom agent passes. Verified 2026-08-23.
 *
 * Every Cloudflare request the app makes must carry this, including the OAuth
 * token exchange and the public r2.dev verification read.
 */
export const CLOUDFLARE_USER_AGENT = 'AxiBridge/1.0 (+https://github.com/darkharasho/axibridge)';

export const CLOUDFLARE_API_HOST = 'api.cloudflare.com';
export const CLOUDFLARE_API_BASE = '/client/v4';

/** Cloudflare error codes this app reacts to by code rather than by status. */
export const CF_ERR_R2_NOT_ENABLED = 10042;
export const CF_ERR_AUTHENTICATION = 10000;
export const CF_ERR_UNAUTHORIZED_RESOURCE = 9109;

export type CloudflareFailureKind =
    | 'waf-blocked'
    | 'r2-not-enabled'
    | 'unauthorized'
    | 'rate-limited'
    | 'http'
    | 'network';

export interface CloudflareFailure {
    kind: CloudflareFailureKind;
    /** HTTP status, absent for transport-level errors. */
    status?: number;
    /** Cloudflare's own error code, when the body carried one. */
    code?: number;
    /** Message intended for display in the UI. */
    message: string;
}

/** Pull Cloudflare's error code out of either body shape it uses. */
const extractErrorCode = (body: string): number | undefined => {
    try {
        const parsed = JSON.parse(body) as { code?: unknown; errors?: Array<{ code?: unknown }> };
        const fromArray = Array.isArray(parsed?.errors) ? parsed.errors[0]?.code : undefined;
        const code = typeof fromArray === 'number' ? fromArray : parsed?.code;
        return typeof code === 'number' ? code : undefined;
    } catch {
        return undefined;
    }
};

/**
 * Map a Cloudflare response onto an actionable failure.
 *
 * Three unrelated problems arrive as a bare 403 — a WAF user-agent block, R2
 * never having been enabled on the account, and a genuinely unauthorized token —
 * and each has a different remedy. Guessing wrong is worse than saying nothing:
 * "sign in again" for a WAF block throws away a working session.
 */
export const classifyCloudflareError = (status: number, body: string): CloudflareFailure => {
    const text = (body || '').trim();

    // Checked before any JSON parse: the WAF body is plain text, so a parse
    // attempt would silently fall through to the generic branch.
    if (/error code:\s*1010/i.test(text)) {
        return {
            kind: 'waf-blocked',
            status,
            message: 'Cloudflare blocked the request at its edge (error 1010). This is not a permissions '
                + 'problem and re-authorising will not help — the request was rejected before it reached '
                + 'the API.'
        };
    }

    const code = extractErrorCode(text);

    if (code === CF_ERR_R2_NOT_ENABLED) {
        return {
            kind: 'r2-not-enabled',
            status,
            code,
            message: 'R2 is not enabled on this Cloudflare account. Enabling it requires a payment method '
                + 'on file, even though the free tier covers 10 GB with no bandwidth charges. Enable R2 in '
                + 'the Cloudflare dashboard, then try again.'
        };
    }

    if (code === CF_ERR_UNAUTHORIZED_RESOURCE || code === CF_ERR_AUTHENTICATION || status === 401) {
        return {
            kind: 'unauthorized',
            status,
            code,
            message: 'Cloudflare rejected the credentials for this request. Sign in to Cloudflare again.'
        };
    }

    if (status === 429) {
        return {
            kind: 'rate-limited',
            status,
            code,
            message: 'Cloudflare rate-limited the request. Wait a minute and try again.'
        };
    }

    return {
        kind: 'http',
        status,
        code,
        message: `Cloudflare request failed: HTTP ${status}${text ? ` — ${text.slice(0, 200)}` : ''}`
    };
};

export interface CloudflareResponse {
    status: number;
    body: string;
    headers: Record<string, string | string[] | undefined>;
}

export interface CloudflareRequestOptions {
    method: string;
    hostname?: string;
    path: string;
    /** Omitted for unauthenticated reads, such as the public r2.dev verification GET. */
    accessToken?: string;
    contentType?: string;
    body?: Buffer;
    /** Extra headers; the User-Agent is always set and cannot be overridden away. */
    headers?: Record<string, string>;
}

/** Issue a request to Cloudflare, always carrying the explicit User-Agent. */
export const cloudflareRequest = (options: CloudflareRequestOptions): Promise<CloudflareResponse> =>
    new Promise((resolve, reject) => {
        const headers: Record<string, string | number> = {
            ...(options.headers ?? {}),
            'User-Agent': CLOUDFLARE_USER_AGENT
        };
        if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
        if (options.contentType) headers['Content-Type'] = options.contentType;
        if (options.body) headers['Content-Length'] = options.body.length;

        const req = https.request(
            {
                method: options.method,
                hostname: options.hostname ?? CLOUDFLARE_API_HOST,
                path: options.path,
                headers
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        body: Buffer.concat(chunks).toString('utf8'),
                        headers: res.headers
                    })
                );
            }
        );
        req.on('error', (err: Error) => reject(err));
        if (options.body) req.write(options.body);
        req.end();
    });

/** As `cloudflareRequest`, but folds transport errors into a `network` failure. */
export const cloudflareJson = async <T>(
    options: CloudflareRequestOptions
): Promise<{ ok: true; result: T } | { ok: false; failure: CloudflareFailure }> => {
    let response: CloudflareResponse;
    try {
        response = await cloudflareRequest(options);
    } catch (err) {
        return {
            ok: false,
            failure: { kind: 'network', message: `Could not reach Cloudflare: ${(err as Error).message}` }
        };
    }

    if (response.status < 200 || response.status >= 300) {
        return { ok: false, failure: classifyCloudflareError(response.status, response.body) };
    }

    try {
        const parsed = JSON.parse(response.body) as { result?: T };
        return { ok: true, result: parsed.result as T };
    } catch {
        return {
            ok: false,
            failure: {
                kind: 'http',
                status: response.status,
                message: 'Cloudflare returned a success status with a body that was not JSON.'
            }
        };
    }
};
