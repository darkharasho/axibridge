import { checkRateLimit, resolveOwner, type KVLike } from './auth';
import { durableRateLimiter, type DurableObjectNamespaceLike } from './rateLimiter';
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
    RATE_LIMITER: DurableObjectNamespaceLike;
    VIEWER_URL: string;
}

/**
 * Re-exported so the Durable Object migration in `wrangler.toml` can find the
 * class: `new_sqlite_classes` resolves names against the Worker entrypoint's
 * exports, and a missing export fails the migration at deploy time.
 */
export { ShareRateLimiter } from './rateLimiter';

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
 * The live last-seen timestamp lives in its OWN key, never inside the pointer
 * record, so the unauthenticated read path never has to write `p:<code>`.
 * See the comment on `stampLastSeen` for why that separation is load-bearing.
 */
const seenKey = (code: string) => `s:${code}`;

/**
 * Reads a request body while refusing to buffer more than `max` bytes.
 *
 * `content-length` is absent on a chunked request, so it cannot be the only
 * guard: without this, `await request.text()` would happily buffer up to the
 * runtime's limit before any size check could run. Returns `null` the moment
 * the cap is exceeded, having cancelled the rest of the stream.
 */
const readBodyCapped = async (request: Request, max: number): Promise<string | null> => {
    const stream = request.body;
    if (!stream) return '';
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > max) {
            try {
                await reader.cancel();
            } catch {
                // The body is being abandoned anyway.
            }
            return null;
        }
        chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
};

/**
 * `Number(null)` and `Number('')` are both `0`, so a naive
 * `Number(header) > MAX` pre-check silently passes every request that declares
 * no length at all. Anything missing, non-numeric or non-positive is therefore
 * reported as UNKNOWN, which routes the read through `readBodyCapped`.
 */
const declaredBodyBytes = (request: Request): number | null => {
    const declared = Number(request.headers.get('content-length'));
    return Number.isFinite(declared) && declared > 0 ? declared : null;
};

/** Reads a body under `MAX_BODY_BYTES`, or returns the response to send instead. */
const readBoundedBody = async (request: Request): Promise<{ body: string } | { response: Response }> => {
    const declared = declaredBodyBytes(request);
    if (declared !== null && declared > MAX_BODY_BYTES) {
        return { response: json(413, { error: 'Payload too large.' }) };
    }

    let raw: string | null;
    try {
        raw = declared !== null ? await request.text() : await readBodyCapped(request, MAX_BODY_BYTES);
    } catch {
        return { response: json(400, { error: 'Malformed request body.' }) };
    }
    // Backstop: a lying `content-length` still gets caught by the real size.
    if (raw === null || byteLength(raw) > MAX_BODY_BYTES) {
        return { response: json(413, { error: 'Payload too large.' }) };
    }
    return { body: raw };
};

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
    if (!(await checkRateLimit(durableRateLimiter(env.RATE_LIMITER), owner))) {
        return json(429, { error: 'Share rate limit reached. Try again later.' });
    }

    const bounded = await readBoundedBody(request);
    if ('response' in bounded) return bounded.response;

    let body: any;
    try {
        body = JSON.parse(bounded.body);
    } catch {
        return json(400, { error: 'Malformed JSON body.' });
    }

    if (typeof body?.loc !== 'string' || !body.loc) return json(400, { error: 'Missing report location.' });
    if (!isValidLoc(body.loc)) return json(400, { error: 'Report location must be an https URL.' });
    if (!isSummary(body?.sum)) return json(400, { error: 'Missing or malformed summary.' });
    if (byteLength(body.sum.f) > MAX_SUMMARY_FIELD || byteLength(body.sum.m) > MAX_SUMMARY_FIELD) {
        return json(400, { error: 'Summary field too long.' });
    }
    if (typeof body.raw === 'string' && body.raw && !isValidLoc(body.raw)) {
        return json(400, { error: 'Report location must be an https URL.' });
    }

    const now = Date.now();
    const record: PointerRecord = {
        v: 1,
        loc: body.loc,
        stage: 'full',
        // Rebuilt field-by-field rather than stored verbatim: `isSummary` is a
        // duck-type check with no "and nothing else" clause, so a caller could
        // otherwise hang arbitrary extra keys off `sum` and have them persisted
        // and re-served — up to the body cap, i.e. ~15x the stated pointer size.
        sum: {
            f: body.sum.f,
            m: body.sum.m,
            d: body.sum.d,
            t: body.sum.t,
            sq: body.sum.sq,
            en: body.sum.en
        },
        created: now,
        seen: now,
        owner,
        ...(Number.isFinite(body.bytes) && body.bytes > 0 ? { bytes: Math.floor(body.bytes) } : {}),
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
 * stamp is an early demote, which is reversible by re-publishing.
 *
 * The hard rule here is that the READ PATH MUST NEVER WRITE `p:<code>`. This
 * used to write the whole record back as `{ ...record, seen: Date.now() }`,
 * from a snapshot taken before the response was even rendered. Any owner
 * `PATCH` committing inside that window was then overwritten by the stale
 * snapshot — an unauthenticated GET silently un-demoting a tombstone back to
 * `full`, re-emitting a `loc` whose bytes the user had already deleted, and
 * making the "stage changes are one-way" invariant false in practice.
 *
 * So the live timestamp lives in its own key. The pointer keeps the `seen`
 * field it was created with (retention reads the `s:` key for the live value),
 * which leaves `parsePointer` and every existing consumer unchanged. A failed
 * stamp is still swallowed: never fail a read over a retention hint.
 */
const stampLastSeen = async (code: string, env: Env): Promise<void> => {
    try {
        await env.SHARE.put(seenKey(code), String(Date.now()));
    } catch {
        // Never fail the read over a retention hint.
    }
};

/**
 * Defence-in-depth for a page that embeds attacker-influenced JSON and then
 * renders a report fetched from an arbitrary https origin.
 *
 * Every directive here is the minimum the page actually needs:
 * - `script-src` is the viewer bundle's own origin (derived from
 *   `env.VIEWER_URL`, never hardcoded, so a staging VIEWER_URL still works).
 *   The boot payload is a `type="application/json"` data block, which the HTML
 *   spec never prepares as a script, so it needs no `'unsafe-inline'`.
 * - `style-src 'unsafe-inline'` because the viewer injects its compiled CSS as
 *   a `<style>` tag (viewerMain.tsx) and uses React inline `style` props. The
 *   explicit `fonts.googleapis.com` is NOT redundant with `'unsafe-inline'`:
 *   `src/renderer/index.css` opens with a remote `@import`, which survives into
 *   the bundle, and an `@import`ed stylesheet is a separate fetch that
 *   `style-src` governs on its own. Without it the share page silently loses
 *   Cinzel/Inter. `font-src` already covers the gstatic files that stylesheet
 *   then references.
 * - `connect-src https:` because the report bytes live at an arbitrary
 *   user-chosen `loc`; `img-src` is equally open because the report supplies
 *   its own icon/map-tile URLs.
 * - `base-uri`/`form-action`/`frame-ancestors` are pinned shut; none are used.
 */
export const contentSecurityPolicy = (viewerUrl: string): string => {
    let scriptSrc = "'self'";
    try {
        scriptSrc = `'self' ${new URL(viewerUrl).origin}`;
    } catch {
        // A malformed VIEWER_URL must not produce a malformed CSP.
    }
    return [
        "default-src 'none'",
        `script-src ${scriptSrc}`,
        `worker-src ${scriptSrc} blob:`,
        "style-src 'unsafe-inline' https://fonts.googleapis.com",
        'img-src https: data: blob:',
        'font-src https: data:',
        'connect-src https:',
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'"
    ].join('; ');
};

const resolvePointer = async (code: string, env: Env, ctx?: ExecutionContextLike): Promise<Response> => {
    const record = parsePointer(await env.SHARE.get(key(code)));
    if (!record) return new Response('Not found', { status: 404 });

    const stamp = stampLastSeen(code, env);
    if (ctx) {
        ctx.waitUntil(stamp);
    } else {
        await stamp;
    }

    return new Response(renderPointerHtml(record, { code, viewerUrl: env.VIEWER_URL }), {
        status: 200,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            // Also keeps the per-key stamp write rate down at the edge.
            'cache-control': 'public, s-maxage=60',
            'x-content-type-options': 'nosniff',
            'content-security-policy': contentSecurityPolicy(env.VIEWER_URL)
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
    // PATCH costs the same as POST: an uncached api.github.com/user round-trip
    // plus a KV write, so it shares the same per-owner ceiling — same limiter,
    // same limit, same owner key. It gets no budget of its own.
    if (!(await checkRateLimit(durableRateLimiter(env.RATE_LIMITER), owner))) {
        return json(429, { error: 'Share rate limit reached. Try again later.' });
    }

    // Capped before parsing, exactly as POST is — `request.json()` would
    // otherwise buffer an unbounded body first.
    const bounded = await readBoundedBody(request);
    if ('response' in bounded) return bounded.response;

    const record = parsePointer(await env.SHARE.get(key(code)));
    if (!record) return new Response('Not found', { status: 404 });
    if (record.owner !== owner) return json(403, { error: 'Not your share link.' });

    let body: any;
    try {
        body = JSON.parse(bounded.body);
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
