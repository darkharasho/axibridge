import { describe, expect, it } from 'vitest';
import {
    CONSUME_URL,
    ShareRateLimiter,
    durableRateLimiter,
    type DurableStorageLike,
    type DurableObjectNamespaceLike
} from '../rateLimiter';

/**
 * A storage fake that genuinely defers every operation past the current
 * microtask turn. `async` alone would not do: a body that mutates a Map before
 * its first `await` is indistinguishable from an atomic one, which would let a
 * read-modify-write implementation pass the concurrency test below for free.
 */
const fakeStorage = (): DurableStorageLike & { map: Map<string, unknown> } => {
    const map = new Map<string, unknown>();
    const tick = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    return {
        map,
        get: async <T,>(key: string) => { await tick(); return map.get(key) as T | undefined; },
        put: async <T,>(key: string, value: T) => { await tick(); map.set(key, value); }
    };
};

const limiterWithClock = (now: () => number) =>
    new ShareRateLimiter({ storage: fakeStorage() }, undefined, { now });

const consumeViaFetch = async (limiter: ShareRateLimiter, limit: number, windowSeconds = 3600) => {
    const response = await limiter.fetch(new Request(CONSUME_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit, windowSeconds })
    }));
    expect(response.status).toBe(200);
    return (await response.json() as { ok: boolean }).ok;
};

describe('ShareRateLimiter', () => {
    it('allows exactly `limit` calls and denies the next', async () => {
        const limiter = new ShareRateLimiter({ storage: fakeStorage() });
        for (let i = 0; i < 5; i += 1) {
            await expect(limiter.consume(5, 3600)).resolves.toBe(true);
        }
        await expect(limiter.consume(5, 3600)).resolves.toBe(false);
    });

    it('answers over fetch with a JSON { ok } body', async () => {
        const limiter = new ShareRateLimiter({ storage: fakeStorage() });
        await expect(consumeViaFetch(limiter, 1)).resolves.toBe(true);
        await expect(consumeViaFetch(limiter, 1)).resolves.toBe(false);
    });

    it('does not increment on a denied call, so pressure cannot extend the window', async () => {
        const storage = fakeStorage();
        let now = 1_000_000;
        const limiter = new ShareRateLimiter({ storage }, undefined, { now: () => now });

        await limiter.consume(2, 3600);
        await limiter.consume(2, 3600);
        const resetAt = (storage.map.get('window') as { resetAt: number }).resetAt;

        now += 60_000;
        for (let i = 0; i < 10; i += 1) {
            await expect(limiter.consume(2, 3600)).resolves.toBe(false);
        }

        const stored = storage.map.get('window') as { count: number; resetAt: number };
        expect(stored.count).toBe(2);
        expect(stored.resetAt).toBe(resetAt);
    });

    it('rolls the window over once resetAt passes, on an injected clock', async () => {
        let now = 1_000_000;
        const limiter = limiterWithClock(() => now);

        await expect(limiter.consume(2, 3600)).resolves.toBe(true);
        await expect(limiter.consume(2, 3600)).resolves.toBe(true);
        await expect(limiter.consume(2, 3600)).resolves.toBe(false);

        // One millisecond short of the boundary the window is still closed.
        now += 3600 * 1000 - 1;
        await expect(limiter.consume(2, 3600)).resolves.toBe(false);

        now += 1;
        await expect(limiter.consume(2, 3600)).resolves.toBe(true);
        await expect(limiter.consume(2, 3600)).resolves.toBe(true);
        await expect(limiter.consume(2, 3600)).resolves.toBe(false);
    });

    it('allows exactly `limit` of limit+20 calls that are all in flight at once', async () => {
        const limit = 120;
        const total = limit + 20;
        const limiter = new ShareRateLimiter({ storage: fakeStorage() });

        let entered = 0;
        let settled = 0;
        let enteredBeforeFirstSettle = 0;

        // No `await` in this loop: every call is started before any can finish.
        const inFlight = Array.from({ length: total }, () => {
            entered += 1;
            return limiter.consume(limit, 3600).then((ok) => {
                if (settled === 0) enteredBeforeFirstSettle = entered;
                settled += 1;
                return ok;
            });
        });

        const results = await Promise.all(inFlight);

        // Guards the test itself: if this is ever rewritten so the calls
        // serialize, it stops proving anything and this assertion says so.
        expect(enteredBeforeFirstSettle).toBe(total);
        expect(results.filter(Boolean)).toHaveLength(limit);
        expect(results.filter((ok) => !ok)).toHaveLength(20);
    });

    it('keeps distinct owners on distinct counters', async () => {
        const namespace: DurableObjectNamespaceLike = (() => {
            const objects = new Map<string, ShareRateLimiter>();
            return {
                idFromName: (name: string) => ({ toString: () => name }),
                get: (id) => {
                    const name = id.toString();
                    let object = objects.get(name);
                    if (!object) {
                        object = new ShareRateLimiter({ storage: fakeStorage() });
                        objects.set(name, object);
                    }
                    return object;
                }
            };
        })();
        const limiter = durableRateLimiter(namespace);

        await expect(limiter.consume('a', { limit: 1, windowSeconds: 3600 })).resolves.toBe(true);
        await expect(limiter.consume('a', { limit: 1, windowSeconds: 3600 })).resolves.toBe(false);
        await expect(limiter.consume('b', { limit: 1, windowSeconds: 3600 })).resolves.toBe(true);
    });
});
