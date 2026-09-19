import { checkRateLimit, resolveOwner, type KVLike } from './auth';
import { renderPointerHtml } from './og';
import {
    generateCode,
    isSummary,
    isValidCode,
    parsePointer,
    type PointerRecord,
    type Stage
} from './pointer';

export interface Env {
    SHARE: KVLike;
    VIEWER_URL: string;
}

/** Passed by the Workers runtime; tests calling `handleRequest` directly omit it. */
export interface ExecutionContextLike {
    waitUntil(promise: Promise<unknown>): void;
}

const STAGES: readonly Stage[] = ['full', 'demoted', 'tombstone'];

/** Demote-never-delete is one-way: a PATCH may only move a stage forward (or stay put). */
const STAGE_RANK: Record<Stage, number> = { full: 0, demoted: 1, tombstone: 2 };

/** Keeps the "~300 B pointer" premise true — without this, one identity's
 * 120 requests/hour could each carry an arbitrarily large summary. */
export const MAX_BODY_BYTES = 4096;
export const MAX_LOC_BYTES = 512;
export const MAX_SUMMARY_FIELD = 128;

const MAX_CODE_ATTEMPTS = 5;

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const bearer = (request: Request): string | null => {
    const header = request.headers.get('Authorization') || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
};

const byteLength = (value: string): number => new TextEncoder().encode(value).length;

/**
 * The Worker never fetches `loc` itself — the user's own browser does,
 * client-side — so this is not an SSRF boundary and deliberately does not
 * blocklist private/loopback hosts. Requiring `https:` is what removes the
 * genuinely dangerous schemes (`javascript:`, `file:`, etc.).
 */
const isValidLoc = (loc: string): boolean => {
    if (byteLength(loc) > MAX_LOC_BYTES) return false;
    try {
        return new URL(loc).protocol === 'https:';
    } catch {
        return false;
    }
};

const key = (code: string) => `p:${code}`;

/**
 * `generateCode()` has no built-in uniqueness guarantee. KV has no
 * "put-if-absent", so the best we can do is check-then-set with a bounded
 * number of retries — a collision here would silently overwrite another
 * user's record (and, since PATCH authorizes by `record.owner`, hand them
 * edit rights on top of it).
 */
const allocateCode = async (env: Env): Promise<string | null> => {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
        const candidate = generateCode();
        const existing = await env.SHARE.get(key(candidate));
        if (!existing) return candidate;
    }
    return null;
};

const createPointer = async (request: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> => {
    const owner = await resolveOwner(bearer(request), fetchImpl);
    if (!owner) return json(401, { error: 'GitHub authentication required.' });
    if (!(await checkRateLimit(env.SHARE, owner))) {
        return json(429, { error: 'Share rate limit reached. Try again later.' });
    }

    const contentLength = Number(request.headers.get('content-length') ?? '');
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return json(413, { error: 'Payload too large.' });
    }

    let rawBody: string;
    try {
        rawBody = await request.text();
    } catch {
        return json(400, { error: 'Malformed request body.' });
    }
    if (byteLength(rawBody) > MAX_BODY_BYTES) {
        return json(413, { error: 'Payload too large.' });
    }

    let body: any;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return json(400, { error: 'Malformed JSON body.' });
    }

    if (typeof body?.loc !== 'string' || !body.loc) return json(400, { error: 'Missing report location.' });
    if (!isValidLoc(body.loc)) return json(400, { error: 'Report location must be an https URL.' });
    if (!isSummary(body?.sum)) return json(400, { error: 'Missing or malformed summary.' });
    if (byteLength(body.sum.f) > MAX_SUMMARY_FIELD || byteLength(body.sum.m) > MAX_SUMMARY_FIELD) {
        return json(400, { error: 'Summary field too long.' });
    }

    const now = Date.now();
    const record: PointerRecord = {
        v: 1,
        loc: body.loc,
        stage: 'full',
        sum: body.sum,
        created: now,
        seen: now,
        owner,
        ...(typeof body.raw === 'string' && body.raw ? { raw: body.raw } : {})
    };

    const code = await allocateCode(env);
    if (!code) return json(503, { error: 'Could not allocate a share code. Try again.' });

    await env.SHARE.put(key(code), JSON.stringify(record));
    const origin = new URL(request.url).origin;
    return json(201, { code, url: `${origin}/r/${code}` });
};

/**
 * lastSeen is a retention hint feeding an LRU, never load-bearing for
 * correctness — under demote-never-delete the worst case of a stale/failed
 * stamp is an early demote, which is reversible by re-publishing. It must
 * never turn into a failed read: KV allows only ~1 write/sec to a single
 * key, and this same key is written on every resolve of a popular link.
 */
const stampLastSeen = async (code: string, record: PointerRecord, env: Env): Promise<void> => {
    try {
        await env.SHARE.put(key(code), JSON.stringify({ ...record, seen: Date.now() }));
    } catch {
        // Never fail the read over a retention hint.
    }
};

const resolvePointer = async (code: string, env: Env, ctx?: ExecutionContextLike): Promise<Response> => {
    const record = parsePointer(await env.SHARE.get(key(code)));
    if (!record) return new Response('Not found', { status: 404 });

    const stamp = stampLastSeen(code, record, env);
    if (ctx) {
        ctx.waitUntil(stamp);
    } else {
        await stamp;
    }

    return new Response(renderPointerHtml(record, { code, viewerUrl: env.VIEWER_URL }), {
        status: 200,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            // Blunts the ~1 write/sec KV ceiling at the edge as a side effect.
            'cache-control': 'public, s-maxage=60'
        }
    });
};

const patchPointer = async (
    code: string,
    request: Request,
    env: Env,
    fetchImpl: typeof fetch
): Promise<Response> => {
    const owner = await resolveOwner(bearer(request), fetchImpl);
    if (!owner) return json(401, { error: 'GitHub authentication required.' });

    const record = parsePointer(await env.SHARE.get(key(code)));
    if (!record) return new Response('Not found', { status: 404 });
    if (record.owner !== owner) return json(403, { error: 'Not your share link.' });

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json(400, { error: 'Malformed JSON body.' });
    }
    if (!STAGES.includes(body?.stage)) return json(400, { error: 'Unknown stage.' });
    const nextStage = body.stage as Stage;
    if (STAGE_RANK[nextStage] < STAGE_RANK[record.stage]) {
        return json(400, { error: 'Stage changes are one-way (demote-only).' });
    }

    await env.SHARE.put(key(code), JSON.stringify({ ...record, stage: nextStage }));
    return json(200, { code, stage: nextStage });
};

/**
 * This endpoint is unauthenticated on the GET path, so a transient KV read
 * failure (or any unexpected throw from rendering) must never surface raw —
 * no exception message or stack, just a generic body.
 */
const INTERNAL_ERROR_RESPONSE = () => json(500, { error: 'internal error' });

export const handleRequest = async (
    request: Request,
    env: Env,
    fetchImpl: typeof fetch = fetch,
    ctx?: ExecutionContextLike
): Promise<Response> => {
    try {
        const { pathname } = new URL(request.url);

        if (pathname === '/r' || pathname === '/r/') {
            if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
            return await createPointer(request, env, fetchImpl);
        }

        const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
        if (match) {
            const code = match[1];
            if (!isValidCode(code)) return new Response('Not found', { status: 404 });
            if (request.method === 'GET') return await resolvePointer(code, env, ctx);
            if (request.method === 'PATCH') return await patchPointer(code, request, env, fetchImpl);
            return new Response('Method not allowed', { status: 405 });
        }

        return new Response('Not found', { status: 404 });
    } catch {
        return INTERNAL_ERROR_RESPONSE();
    }
};

export default {
    fetch: async (request: Request, env: Env, ctx?: ExecutionContextLike): Promise<Response> => {
        try {
            return await handleRequest(request, env, fetch, ctx);
        } catch {
            return INTERNAL_ERROR_RESPONSE();
        }
    }
};
