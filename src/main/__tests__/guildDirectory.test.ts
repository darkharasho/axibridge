import { describe, expect, it, vi } from 'vitest';
import { resolveGuild } from '../guildDirectory';

const makeStore = (initial: Record<string, any> = {}) => {
    const data: Record<string, any> = { ...initial };
    return {
        get: (key: string, def?: any) => (key in data ? data[key] : def),
        set: (key: string, value: any) => {
            data[key] = value;
        },
        data,
    };
};

const okResponse = (body: any) => ({ ok: true, status: 200, json: async () => body }) as Response;

describe('resolveGuild', () => {
    it('returns cached values without fetching', async () => {
        const store = makeStore({ guildDirectory: { 'g-1': { name: 'Elite Warriors', tag: 'EWW', resolvedAt: '2026-01-01T00:00:00.000Z' } } });
        const fetchImpl = vi.fn();
        const result = await resolveGuild('g-1', store, fetchImpl as unknown as typeof fetch);
        expect(result).toEqual({ id: 'g-1', name: 'Elite Warriors', tag: 'EWW' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('fetches on miss, caches the success, and hits the exact endpoint', async () => {
        const store = makeStore();
        const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => okResponse({ id: 'g-2', name: 'Red Guild', tag: 'RED' }));
        const result = await resolveGuild('g-2', store, fetchImpl as unknown as typeof fetch);
        expect(result).toEqual({ id: 'g-2', name: 'Red Guild', tag: 'RED' });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][0]).toBe('https://api.guildwars2.com/v2/guild/g-2');
        expect(store.data.guildDirectory['g-2']).toMatchObject({ name: 'Red Guild', tag: 'RED' });
        expect(typeof store.data.guildDirectory['g-2'].resolvedAt).toBe('string');
    });

    it('returns id-only and caches nothing on non-200', async () => {
        const store = makeStore();
        const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ text: 'no such guild' }) }) as Response);
        const result = await resolveGuild('g-missing', store, fetchImpl as unknown as typeof fetch);
        expect(result).toEqual({ id: 'g-missing', name: null, tag: null });
        expect(store.data.guildDirectory).toBeUndefined();
    });

    it('returns id-only and caches nothing on malformed body or rejecting fetch', async () => {
        const store = makeStore();
        const malformed = vi.fn(async () => okResponse({ id: 'g-3' })); // no name/tag strings
        expect(await resolveGuild('g-3', store, malformed as unknown as typeof fetch)).toEqual({ id: 'g-3', name: null, tag: null });
        const rejecting = vi.fn(async () => { throw new Error('offline'); });
        expect(await resolveGuild('g-4', store, rejecting as unknown as typeof fetch)).toEqual({ id: 'g-4', name: null, tag: null });
        expect(store.data.guildDirectory).toBeUndefined();
    });

    it('preserves existing cache entries when adding a new one', async () => {
        const store = makeStore({ guildDirectory: { 'g-1': { name: 'Old', tag: 'OLD', resolvedAt: 'x' } } });
        const fetchImpl = vi.fn(async () => okResponse({ id: 'g-5', name: 'New', tag: 'NEW' }));
        await resolveGuild('g-5', store, fetchImpl as unknown as typeof fetch);
        expect(Object.keys(store.data.guildDirectory).sort()).toEqual(['g-1', 'g-5']);
    });
});
