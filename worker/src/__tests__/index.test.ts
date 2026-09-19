import { describe, expect, it, vi } from 'vitest';
import { handleRequest, type Env } from '../index';
import type { KVLike } from '../auth';
import type { PointerRecord } from '../pointer';

const fakeKv = (): KVLike & { store: Map<string, string> } => {
    const store = new Map<string, string>();
    return {
        store,
        get: async (key) => store.get(key) ?? null,
        put: async (key, value) => { store.set(key, value); },
        delete: async (key) => { store.delete(key); }
    };
};

/** A KV fake whose `put` always rejects, to simulate the ~1 write/sec KV ceiling. */
const flakyKv = (): KVLike & { store: Map<string, string> } => {
    const store = new Map<string, string>();
    return {
        store,
        get: async (key) => store.get(key) ?? null,
        put: async () => { throw new Error('KV rate limited'); },
        delete: async (key) => { store.delete(key); }
    };
};

/** A KV fake whose `get` always rejects, to simulate a transient KV read failure. */
const unreadableKv = (): KVLike => ({
    get: async () => { throw new Error('KV unavailable'); },
    put: async () => {},
    delete: async () => {}
});

/**
 * A KV fake whose `put` genuinely defers its mutation past the current
 * synchronous/microtask turn (via a real `setTimeout`), unlike `fakeKv`'s
 * `put`, which mutates its Map synchronously inside the async function body
 * before its first `await` — indistinguishable from a deferred write for
 * every other test, but unable to prove that a stamp is off the response
 * path, since the mutation would already have happened by the time the
 * response resolves regardless of whether it went through `ctx.waitUntil`.
 */
const delayedKv = (): KVLike & { store: Map<string, string> } => {
    const store = new Map<string, string>();
    return {
        store,
        get: async (key) => store.get(key) ?? null,
        put: (key, value) => new Promise((resolve) => {
            setTimeout(() => { store.set(key, value); resolve(); }, 0);
        }),
        delete: async (key) => { store.delete(key); }
    };
};

/**
 * A KV fake that can hold writes open. While the gate is set, every `put`
 * resolves only once the gate promise does — which lets a test interleave a
 * slow in-flight write against another request that commits in the meantime.
 */
const gatedKv = (): KVLike & { store: Map<string, string>; gate: Promise<void> | null } => {
    const store = new Map<string, string>();
    const kv = {
        store,
        gate: null as Promise<void> | null,
        get: async (key: string) => store.get(key) ?? null,
        put: (key: string, value: string) => {
            const gate = kv.gate;
            if (!gate) {
                store.set(key, value);
                return Promise.resolve();
            }
            return gate.then(() => { store.set(key, value); });
        },
        delete: async (key: string) => { store.delete(key); }
    };
    return kv;
};

const env = (kv: KVLike): Env => ({ SHARE: kv, VIEWER_URL: 'https://bridge.axi.link/view' });

const okUser = () => vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ login: 'darkharasho' }), { status: 200 })
);

const summary = { f: 'Detonator', m: 'Eternal Battlegrounds', d: 182000, t: 1758240000000, sq: 42, en: 51 };

const record = (over: Partial<PointerRecord> = {}): PointerRecord => ({
    v: 1,
    loc: 'https://cdn.example.com/a.br',
    stage: 'full',
    sum: summary,
    created: 1,
    seen: 1,
    owner: 'darkharasho',
    ...over
});

const post = (body: unknown, token = 'gho_valid') =>
    new Request('https://bridge.axi.link/r', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });

const postRaw = (rawBody: string, url = 'https://bridge.axi.link/r', token = 'gho_valid') =>
    new Request(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: rawBody
    });

/**
 * A POST whose body is a stream, so the runtime sends it chunked and sets NO
 * `content-length`. That is the case `Number(null ?? '') === 0` used to wave
 * straight through the pre-check.
 */
const postChunked = (rawBody: string, token = 'gho_valid') =>
    new Request('https://bridge.axi.link/r', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(rawBody));
                controller.close();
            }
        }),
        duplex: 'half'
    } as RequestInit & { duplex: 'half' });

describe('POST /r', () => {
    it('creates a pointer and returns a valid code and url', async () => {
        const kv = fakeKv();
        const res = await handleRequest(post({ loc: 'https://cdn.example.com/a.br', sum: summary }), env(kv), okUser() as any);
        expect(res.status).toBe(201);
        const body = await res.json() as { code: string; url: string };
        expect(body.code).toMatch(/^[0-9A-Za-z]{8}$/);
        expect(body.url).toBe(`https://bridge.axi.link/r/${body.code}`);
        expect(kv.store.size).toBe(2); // pointer + rate-limit counter
    });

    it('stores the owner resolved from the token', async () => {
        const kv = fakeKv();
        const res = await handleRequest(post({ loc: 'https://cdn.example.com/a.br', sum: summary }), env(kv), okUser() as any);
        const { code } = await res.json() as { code: string };
        expect(JSON.parse(kv.store.get(`p:${code}`)!).owner).toBe('darkharasho');
    });

    it('rejects an unauthenticated request', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
        const res = await handleRequest(post({ loc: 'x', sum: summary }, 'bad'), env(fakeKv()), fetchImpl as any);
        expect(res.status).toBe(401);
    });

    it('rejects a body with no location', async () => {
        const res = await handleRequest(post({ sum: summary }), env(fakeKv()), okUser() as any);
        expect(res.status).toBe(400);
    });

    it('rejects a body with a malformed summary', async () => {
        const res = await handleRequest(
            post({ loc: 'https://x.example/a.br', sum: { f: 'a' } }),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(400);
    });

    it('rejects once the owner is over the rate limit', async () => {
        const kv = fakeKv();
        await kv.put('rl:darkharasho', '120');
        const res = await handleRequest(post({ loc: 'x', sum: summary }), env(kv), okUser() as any);
        expect(res.status).toBe(429);
    });

    it.each([
        ['javascript:alert(1)'],
        ['http://example.com/r.json'],
        ['file:///etc/passwd']
    ])('rejects a %s location', async (loc) => {
        const res = await handleRequest(post({ loc, sum: summary }), env(fakeKv()), okUser() as any);
        expect(res.status).toBe(400);
    });

    it('accepts a normal https location', async () => {
        const res = await handleRequest(post({ loc: 'https://cdn.example.com/a.br', sum: summary }), env(fakeKv()), okUser() as any);
        expect(res.status).toBe(201);
    });

    it('rejects an oversized body with a 413 JSON body', async () => {
        const res = await handleRequest(
            postRaw(JSON.stringify({ loc: 'https://cdn.example.com/a.br', sum: summary, filler: 'x'.repeat(5000) })),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(413);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json() as { error: string };
        expect(typeof body.error).toBe('string');
    });

    it('rejects an oversized loc with 400', async () => {
        const res = await handleRequest(
            post({ loc: `https://cdn.example.com/${'a'.repeat(600)}`, sum: summary }),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(400);
    });

    it('rejects a javascript: URI in raw with 400', async () => {
        // Pre-fix: raw had zero validation, so this was stored verbatim and
        // returned 201 — a stored XSS payload once a viewer renders `raw` as an href.
        const res = await handleRequest(
            post({ loc: 'https://cdn.example.com/a.br', sum: summary, raw: 'javascript:alert(1)' }),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toBe('Report location must be an https URL.');
    });

    it('rejects a non-https raw URL with 400', async () => {
        // Pre-fix: http:// (and any other scheme) passed through unchecked.
        const res = await handleRequest(
            post({ loc: 'https://cdn.example.com/a.br', sum: summary, raw: 'http://cdn.example.com/a.zevtc' }),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toBe('Report location must be an https URL.');
    });

    it('rejects a raw URL over the 512-byte location cap with 400', async () => {
        // There is no raw-specific size rule: `raw` goes through the very same
        // `isValidLoc` as `loc`, whose MAX_LOC_BYTES (512) clause is what
        // rejects this 3000-character URL — hence the *location* error message
        // below rather than a payload-size one. Removing that clause from
        // `isValidLoc` makes this test fail, which is exactly what it guards.
        // (The 4096-byte MAX_BODY_BYTES cap is a separate, larger backstop and
        // is never reached here.)
        const res = await handleRequest(
            post({ loc: 'https://cdn.example.com/a.br', sum: summary, raw: `https://cdn.example.com/${'a'.repeat(3000)}` }),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toBe('Report location must be an https URL.');
    });

    it('accepts and stores a valid https raw', async () => {
        const kv = fakeKv();
        const res = await handleRequest(
            post({ loc: 'https://cdn.example.com/a.br', sum: summary, raw: 'https://cdn.example.com/a.zevtc' }),
            env(kv),
            okUser() as any
        );
        expect(res.status).toBe(201);
        const body = await res.json() as { code: string };
        expect(JSON.parse(kv.store.get(`p:${body.code}`)!).raw).toBe('https://cdn.example.com/a.zevtc');
    });

    it('still succeeds when raw is absent', async () => {
        const res = await handleRequest(
            post({ loc: 'https://cdn.example.com/a.br', sum: summary }),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(201);
    });

    it('rejects an oversized sum.f with 400', async () => {
        const res = await handleRequest(
            post({ loc: 'https://cdn.example.com/a.br', sum: { ...summary, f: 'f'.repeat(200) } }),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(400);
    });

    it('rejects a sum.m over the byte cap even when its character count is under it', async () => {
        // 50 copies of a 3-byte CJK character = 150 bytes but only 50 chars —
        // a `.length`-based cap would wrongly let this through at
        // MAX_SUMMARY_FIELD = 128.
        const res = await handleRequest(
            post({ loc: 'https://cdn.example.com/a.br', sum: { ...summary, m: '字'.repeat(50) } }),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(400);
    });

    it('rejects an oversized summary field with 400', async () => {
        const res = await handleRequest(
            post({ loc: 'https://cdn.example.com/a.br', sum: { ...summary, m: 'm'.repeat(200) } }),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(400);
    });

    it('does not overwrite an existing record on code collision', async () => {
        const kv = fakeKv();
        await kv.put('p:00000000', JSON.stringify(record({ owner: 'someone-else' })));
        const spy = vi.spyOn(globalThis.crypto, 'getRandomValues')
            .mockImplementationOnce(((arr: Uint8Array) => { arr.fill(0); return arr; }) as any)
            .mockImplementationOnce(((arr: Uint8Array) => { arr.fill(1); return arr; }) as any);
        try {
            const res = await handleRequest(
                post({ loc: 'https://cdn.example.com/a.br', sum: summary }),
                env(kv),
                okUser() as any
            );
            expect(res.status).toBe(201);
            const body = await res.json() as { code: string };
            expect(body.code).toBe('11111111');
            expect(JSON.parse(kv.store.get('p:00000000')!).owner).toBe('someone-else');
        } finally {
            spy.mockRestore();
        }
    });

    it('503s when every code attempt collides', async () => {
        const kv = fakeKv();
        const spy = vi.spyOn(globalThis.crypto, 'getRandomValues')
            .mockImplementation(((arr: Uint8Array) => { arr.fill(0); return arr; }) as any);
        await kv.put('p:00000000', JSON.stringify(record({ owner: 'someone-else' })));
        try {
            const res = await handleRequest(
                post({ loc: 'https://cdn.example.com/a.br', sum: summary }),
                env(kv),
                okUser() as any
            );
            expect(res.status).toBe(503);
        } finally {
            spy.mockRestore();
        }
    });

    it('rejects an oversized chunked body with 413 even with no content-length header', async () => {
        // Pre-fix: `Number(null ?? '')` is 0, which is finite and under the cap,
        // so a body with no declared length skipped the header pre-check and
        // `await request.text()` buffered the whole thing before the byteLength
        // backstop could reject it.
        const request = postChunked(
            JSON.stringify({ loc: 'https://cdn.example.com/a.br', sum: summary, filler: 'x'.repeat(50000) })
        );
        expect(request.headers.get('content-length')).toBeNull();
        const res = await handleRequest(request, env(fakeKv()), okUser() as any);
        expect(res.status).toBe(413);
    });

    it('stops pulling an oversized chunked body instead of buffering all of it', async () => {
        // The post-read `byteLength` backstop alone would also answer 413 — but
        // only after `request.text()` had buffered the entire body. This asserts
        // the capped reader abandons the stream partway, which is the actual
        // fix: with `await request.text()` every chunk is pulled.
        let pulled = 0;
        const chunk = new TextEncoder().encode('x'.repeat(2000));
        const request = new Request('https://bridge.axi.link/r', {
            method: 'POST',
            headers: { Authorization: 'Bearer gho_valid', 'content-type': 'application/json' },
            body: new ReadableStream({
                pull(controller) {
                    pulled += 1;
                    if (pulled > 20) {
                        controller.close();
                        return;
                    }
                    controller.enqueue(chunk);
                }
            }),
            duplex: 'half'
        } as RequestInit & { duplex: 'half' });
        const res = await handleRequest(request, env(fakeKv()), okUser() as any);
        expect(res.status).toBe(413);
        expect(pulled).toBeLessThan(20);
    });

    it('accepts a normal chunked body with no content-length header', async () => {
        const res = await handleRequest(
            postChunked(JSON.stringify({ loc: 'https://cdn.example.com/a.br', sum: summary })),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(201);
    });

    it('accepts extra keys on sum but never persists them', async () => {
        // `isSummary` is a duck-type check with no "no extra keys" clause, so the
        // request is legal; the record must nonetheless be rebuilt from the six
        // known fields rather than storing `body.sum` verbatim.
        const kv = fakeKv();
        const res = await handleRequest(
            post({
                loc: 'https://cdn.example.com/a.br',
                sum: { ...summary, junk: 'x'.repeat(1000), nested: { a: 1 } }
            }),
            env(kv),
            okUser() as any
        );
        expect(res.status).toBe(201);
        const { code } = await res.json() as { code: string };
        const stored = JSON.parse(kv.store.get(`p:${code}`)!);
        expect(Object.keys(stored.sum).sort()).toEqual(['d', 'en', 'f', 'm', 'sq', 't']);
        expect(stored.sum).toEqual(summary);
    });

    it('derives the returned url from the request origin', async () => {
        const res = await handleRequest(
            postRaw(
                JSON.stringify({ loc: 'https://cdn.example.com/a.br', sum: summary }),
                'https://staging.workers.dev/r'
            ),
            env(fakeKv()),
            okUser() as any
        );
        const body = await res.json() as { code: string; url: string };
        expect(body.url).toBe(`https://staging.workers.dev/r/${body.code}`);
    });
});

describe('GET /r/:code', () => {
    it('serves HTML carrying the Open Graph title', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        expect(await res.text()).toContain('og:title');
    });

    it('stamps lastSeen into its own key so retention can sort by least-recently-used', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ seen: 1 })));
        await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(Number(kv.store.get('s:k3Xm9qR2'))).toBeGreaterThan(1);
    });

    it('never writes the pointer record from the read path', async () => {
        const kv = fakeKv();
        const before = JSON.stringify(record({ seen: 1 }));
        await kv.put('p:k3Xm9qR2', before);
        const putSpy = vi.spyOn(kv, 'put');
        await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(putSpy.mock.calls.map(([k]) => k)).toEqual(['s:k3Xm9qR2']);
        expect(kv.store.get('p:k3Xm9qR2')).toBe(before);
        putSpy.mockRestore();
    });

    it('a slow lastSeen stamp cannot revert a PATCH that commits while it is in flight', async () => {
        // C1 regression. The stamp used to write the WHOLE pointer record back
        // from a snapshot read before the response was rendered. This test
        // drives that exact interleaving:
        //   1. GET reads the record (stage: full) and starts its stamp write,
        //      which is held open by the gate.
        //   2. The owner PATCHes to `tombstone`; that write commits.
        //   3. Only then does the held stamp write land.
        // Pre-fix, step 3 wrote `{ ...snapshot, seen }` — stage `full` — so an
        // unauthenticated GET promoted a tombstone back and re-emitted a `loc`
        // whose bytes the user had already deleted. It must now end at
        // `tombstone`, because the read path writes only `s:<code>`.
        const kv = gatedKv();
        kv.store.set('p:k3Xm9qR2', JSON.stringify(record({ stage: 'full', seen: 1 })));

        let release!: () => void;
        kv.gate = new Promise<void>((resolve) => { release = resolve; });

        let stamp: Promise<unknown> | undefined;
        const getRes = await handleRequest(
            new Request('https://bridge.axi.link/r/k3Xm9qR2'),
            env(kv),
            okUser() as any,
            { waitUntil: (p: Promise<unknown>) => { stamp = p; } }
        );
        expect(getRes.status).toBe(200);
        expect(stamp).toBeDefined();

        // The stamp is still in flight here — nothing it wrote has landed yet.
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('full');

        // Owner demotes all the way to tombstone while that write is pending.
        kv.gate = null;
        const patchRes = await handleRequest(
            new Request('https://bridge.axi.link/r/k3Xm9qR2', {
                method: 'PATCH',
                headers: { Authorization: 'Bearer gho_valid', 'content-type': 'application/json' },
                body: JSON.stringify({ stage: 'tombstone' })
            }),
            env(kv),
            okUser() as any
        );
        expect(patchRes.status).toBe(200);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('tombstone');

        // Now let the stamp complete. It must not resurrect the old snapshot.
        release();
        await stamp;
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('tombstone');

        // And a subsequent read must render the tombstone card, not a live loc.
        const after = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        const html = await after.text();
        expect(html).toContain('no longer stored');
        expect(html).not.toContain('https://cdn.example.com/a.br');
    });

    it('404s an unknown code', async () => {
        const res = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(fakeKv()), okUser() as any);
        expect(res.status).toBe(404);
    });

    it('404s a malformed code without touching KV', async () => {
        const kv = fakeKv();
        const getSpy = vi.spyOn(kv, 'get');
        const res = await handleRequest(new Request('https://bridge.axi.link/r/nope'), env(kv), okUser() as any);
        expect(res.status).toBe(404);
        expect(getSpy).not.toHaveBeenCalled();
    });

    it('still serves a tombstone rather than 404ing', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ stage: 'tombstone' })));
        const res = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('no longer stored');
    });

    it('still returns 200 when the lastSeen stamp write rejects', async () => {
        const kv = flakyKv();
        kv.store.set('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('og:title');
    });

    it('defers the lastSeen stamp to waitUntil when a ctx is provided', async () => {
        const kv = delayedKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ seen: 1 })));
        let captured: Promise<unknown> | undefined;
        const waitUntil = vi.fn((p: Promise<unknown>) => { captured = p; });
        const res = await handleRequest(
            new Request('https://bridge.axi.link/r/k3Xm9qR2'),
            env(kv),
            okUser() as any,
            { waitUntil }
        );
        expect(res.status).toBe(200);
        expect(waitUntil).toHaveBeenCalledTimes(1);

        // The stamp must be off the response path: at the moment the response
        // comes back, the stamp key must not exist yet.
        expect(kv.store.get('s:k3Xm9qR2')).toBeUndefined();

        await captured;
        expect(Number(kv.store.get('s:k3Xm9qR2'))).toBeGreaterThan(1);
    });

    it('sets a short edge cache-control on the HTML response', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(res.headers.get('cache-control')).toBe('public, s-maxage=60');
    });

    it('hardens the HTML response with nosniff and a CSP scoped to the viewer origin', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
        const csp = res.headers.get('content-security-policy')!;
        expect(csp).toContain("default-src 'none'");
        expect(csp).toContain("script-src 'self' https://bridge.axi.link");
        expect(csp).toContain("frame-ancestors 'none'");
        // The report bytes and its icons come from arbitrary https origins.
        expect(csp).toContain('connect-src https:');
        expect(csp).toContain('img-src https: data: blob:');
        // No blanket inline scripting: the boot payload is an inert data block.
        expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    });

    it('derives the CSP script origin from VIEWER_URL rather than hardcoding it', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(
            new Request('https://bridge.axi.link/r/k3Xm9qR2'),
            { SHARE: kv, VIEWER_URL: 'https://staging.example.test/view' },
            okUser() as any
        );
        expect(res.headers.get('content-security-policy')).toContain('https://staging.example.test');
    });

    it('returns a clean 500 JSON body when a KV read fails, with no leaked internals', async () => {
        const res = await handleRequest(
            new Request('https://bridge.axi.link/r/k3Xm9qR2'),
            env(unreadableKv()),
            okUser() as any
        );
        expect(res.status).toBe(500);
        expect(res.headers.get('content-type')).toContain('application/json');
        const body = await res.json() as { error: string };
        expect(body.error).toBe('internal error');
        expect(JSON.stringify(body)).not.toMatch(/KV unavailable|at Object|\.ts:\d+/);
    });
});

describe('PATCH /r/:code', () => {
    const patch = (code: string, stage: string, token = 'gho_valid') =>
        new Request(`https://bridge.axi.link/r/${code}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ stage })
        });

    it('demotes a pointer owned by the caller', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(patch('k3Xm9qR2', 'demoted'), env(kv), okUser() as any);
        expect(res.status).toBe(200);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('demoted');
    });

    it('refuses to modify a pointer owned by someone else', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ owner: 'someone-else' })));
        const res = await handleRequest(patch('k3Xm9qR2', 'demoted'), env(kv), okUser() as any);
        expect(res.status).toBe(403);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('full');
    });

    it('rejects an unknown stage', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(patch('k3Xm9qR2', 'archived'), env(kv), okUser() as any);
        expect(res.status).toBe(400);
    });

    it('rejects promoting a tombstone back to full and leaves it demoted', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ stage: 'demoted' })));
        const res = await handleRequest(patch('k3Xm9qR2', 'full'), env(kv), okUser() as any);
        expect(res.status).toBe(400);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('demoted');
    });

    it('rejects an oversized body with 413 before parsing it', async () => {
        // Pre-fix: PATCH went straight to `await request.json()` with no cap at
        // all, so an authenticated caller could make the Worker buffer an
        // arbitrarily large body.
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(
            new Request('https://bridge.axi.link/r/k3Xm9qR2', {
                method: 'PATCH',
                headers: { Authorization: 'Bearer gho_valid', 'content-type': 'application/json' },
                body: JSON.stringify({ stage: 'demoted', filler: 'x'.repeat(5000) })
            }),
            env(kv),
            okUser() as any
        );
        expect(res.status).toBe(413);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('full');
    });

    it('rejects once the owner is over the rate limit', async () => {
        // Every PATCH costs an uncached api.github.com/user round-trip, so it
        // shares POST's per-owner ceiling instead of being unlimited.
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        await kv.put('rl:darkharasho', '120');
        const res = await handleRequest(patch('k3Xm9qR2', 'demoted'), env(kv), okUser() as any);
        expect(res.status).toBe(429);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('full');
    });

    it('allows an idempotent retry at the same stage', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ stage: 'demoted' })));
        const res = await handleRequest(patch('k3Xm9qR2', 'demoted'), env(kv), okUser() as any);
        expect(res.status).toBe(200);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).stage).toBe('demoted');
    });
});

describe('routing', () => {
    it('404s an unrelated path', async () => {
        const res = await handleRequest(new Request('https://bridge.axi.link/other'), env(fakeKv()), okUser() as any);
        expect(res.status).toBe(404);
    });

    it('405s an unsupported method on a pointer', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(
            new Request('https://bridge.axi.link/r/k3Xm9qR2', { method: 'DELETE' }),
            env(kv),
            okUser() as any
        );
        expect(res.status).toBe(405);
    });
});
