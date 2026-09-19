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
