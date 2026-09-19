import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit, RATE_LIMIT_PER_HOUR, resolveOwner, type KVLike } from '../auth';

const fakeKv = (): KVLike & { store: Map<string, string> } => {
    const store = new Map<string, string>();
    return {
        store,
        get: async (key) => store.get(key) ?? null,
        put: async (key, value) => { store.set(key, value); },
        delete: async (key) => { store.delete(key); }
    };
};

const jsonResponse = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('resolveOwner', () => {
    it('returns the GitHub login for a valid token', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { login: 'darkharasho' }));
        await expect(resolveOwner('gho_valid', fetchImpl as any)).resolves.toBe('darkharasho');
    });

    it('sends the token as a bearer credential', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { login: 'darkharasho' }));
        await resolveOwner('gho_valid', fetchImpl as any);
        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers.Authorization).toBe('Bearer gho_valid');
    });

    it('returns null for a rejected token', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Bad credentials' }));
        await expect(resolveOwner('gho_bad', fetchImpl as any)).resolves.toBeNull();
    });

    it('returns null when no token is supplied', async () => {
        const fetchImpl = vi.fn();
        await expect(resolveOwner(null, fetchImpl as any)).resolves.toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('returns null when GitHub is unreachable', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
        await expect(resolveOwner('gho_valid', fetchImpl as any)).resolves.toBeNull();
    });
});

describe('checkRateLimit', () => {
    it('allows the first request', async () => {
        await expect(checkRateLimit(fakeKv(), 'darkharasho')).resolves.toBe(true);
    });

    it('allows requests up to the limit and denies the next', async () => {
        const kv = fakeKv();
        for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) {
            await expect(checkRateLimit(kv, 'darkharasho')).resolves.toBe(true);
        }
        await expect(checkRateLimit(kv, 'darkharasho')).resolves.toBe(false);
    });

    it('counts each owner separately', async () => {
        const kv = fakeKv();
        for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) await checkRateLimit(kv, 'a');
        await expect(checkRateLimit(kv, 'a')).resolves.toBe(false);
        await expect(checkRateLimit(kv, 'b')).resolves.toBe(true);
    });

    it('honours an explicit lower limit', async () => {
        const kv = fakeKv();
        await expect(checkRateLimit(kv, 'a', { limit: 1 })).resolves.toBe(true);
        await expect(checkRateLimit(kv, 'a', { limit: 1 })).resolves.toBe(false);
    });
});
