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
        const res = await handleRequest(post({ loc: 'x', sum: { f: 'a' } }), env(fakeKv()), okUser() as any);
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

    it('rejects an oversized body with 413', async () => {
        const res = await handleRequest(
            postRaw(JSON.stringify({ loc: 'https://cdn.example.com/a.br', sum: summary, filler: 'x'.repeat(5000) })),
            env(fakeKv()),
            okUser() as any
        );
        expect(res.status).toBe(413);
    });

    it('rejects an oversized loc with 400', async () => {
        const res = await handleRequest(
            post({ loc: `https://cdn.example.com/${'a'.repeat(600)}`, sum: summary }),
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

    it('stamps lastSeen so retention can sort by least-recently-used', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ seen: 1 })));
        await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(JSON.parse(kv.store.get('p:k3Xm9qR2')!).seen).toBeGreaterThan(1);
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
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record({ seen: 1 })));
        const waitUntil = vi.fn();
        const res = await handleRequest(
            new Request('https://bridge.axi.link/r/k3Xm9qR2'),
            env(kv),
            okUser() as any,
            { waitUntil }
        );
        expect(res.status).toBe(200);
        expect(waitUntil).toHaveBeenCalledTimes(1);
    });

    it('sets a short edge cache-control on the HTML response', async () => {
        const kv = fakeKv();
        await kv.put('p:k3Xm9qR2', JSON.stringify(record()));
        const res = await handleRequest(new Request('https://bridge.axi.link/r/k3Xm9qR2'), env(kv), okUser() as any);
        expect(res.headers.get('cache-control')).toBe('public, s-maxage=60');
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
