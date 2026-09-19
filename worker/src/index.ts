import { checkRateLimit, resolveOwner, type KVLike } from './auth';
import { renderPointerHtml } from './og';
import {
    generateCode,
    isValidCode,
    parsePointer,
    type PointerRecord,
    type ShareSummary,
    type Stage
} from './pointer';

export interface Env {
    SHARE: KVLike;
    VIEWER_URL: string;
}

const STAGES: readonly Stage[] = ['full', 'demoted', 'tombstone'];

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const bearer = (request: Request): string | null => {
    const header = request.headers.get('Authorization') || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
};

const isSummary = (value: any): value is ShareSummary =>
    !!value
    && typeof value.f === 'string'
    && typeof value.m === 'string'
    && typeof value.d === 'number'
    && typeof value.t === 'number'
    && typeof value.sq === 'number'
    && typeof value.en === 'number';

const key = (code: string) => `p:${code}`;

const createPointer = async (request: Request, env: Env, fetchImpl: typeof fetch): Promise<Response> => {
    const owner = await resolveOwner(bearer(request), fetchImpl);
    if (!owner) return json(401, { error: 'GitHub authentication required.' });
    if (!(await checkRateLimit(env.SHARE, owner))) {
        return json(429, { error: 'Share rate limit reached. Try again later.' });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return json(400, { error: 'Malformed JSON body.' });
    }
    if (typeof body?.loc !== 'string' || !body.loc) return json(400, { error: 'Missing report location.' });
    if (!isSummary(body?.sum)) return json(400, { error: 'Missing or malformed summary.' });

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

    const code = generateCode();
    await env.SHARE.put(key(code), JSON.stringify(record));
    return json(201, { code, url: `https://bridge.axi.link/r/${code}` });
};

const resolvePointer = async (code: string, env: Env): Promise<Response> => {
    const record = parsePointer(await env.SHARE.get(key(code)));
    if (!record) return new Response('Not found', { status: 404 });

    // Stamping every resolve is what makes real least-recently-used retention
    // possible — GitHub Pages cannot tell us whether a report was ever opened.
    await env.SHARE.put(key(code), JSON.stringify({ ...record, seen: Date.now() }));

    return new Response(renderPointerHtml(record, { code, viewerUrl: env.VIEWER_URL }), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
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

    await env.SHARE.put(key(code), JSON.stringify({ ...record, stage: body.stage as Stage }));
    return json(200, { code, stage: body.stage });
};

export const handleRequest = async (
    request: Request,
    env: Env,
    fetchImpl: typeof fetch = fetch
): Promise<Response> => {
    const { pathname } = new URL(request.url);

    if (pathname === '/r' || pathname === '/r/') {
        if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
        return createPointer(request, env, fetchImpl);
    }

    const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
    if (match) {
        const code = match[1];
        if (!isValidCode(code)) return new Response('Not found', { status: 404 });
        if (request.method === 'GET') return resolvePointer(code, env);
        if (request.method === 'PATCH') return patchPointer(code, request, env, fetchImpl);
        return new Response('Method not allowed', { status: 405 });
    }

    return new Response('Not found', { status: 404 });
};

export default {
    fetch: (request: Request, env: Env) => handleRequest(request, env)
};
