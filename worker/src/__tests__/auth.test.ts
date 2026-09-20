import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit, RATE_LIMIT_PER_HOUR, resolveOwner, type RateLimiterLike } from '../auth';
import { ShareRateLimiter, type DurableStorageLike } from '../rateLimiter';

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

/**
 * Storage that genuinely defers past the current microtask turn, so a
 * read-modify-write implementation cannot look atomic by accident.
 */
const deferredStorage = (): DurableStorageLike => {
    const map = new Map<string, unknown>();
    const tick = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    return {
        get: async <T,>(key: string) => { await tick(); return map.get(key) as T | undefined; },
        put: async <T,>(key: string, value: T) => { await tick(); map.set(key, value); }
    };
};

/** The production seam, stood up in-process: one Durable Object per owner. */
const fakeLimiter = (): RateLimiterLike => {
    const objects = new Map<string, ShareRateLimiter>();
    return {
        consume: (owner, opts) => {
            let object = objects.get(owner);
            if (!object) {
                object = new ShareRateLimiter({ storage: deferredStorage() });
                objects.set(owner, object);
            }
            return object.consume(opts.limit, opts.windowSeconds);
        }
    };
};

describe('checkRateLimit', () => {
    it('allows the first request', async () => {
        await expect(checkRateLimit(fakeLimiter(), 'darkharasho')).resolves.toBe(true);
    });

    it('allows requests up to the limit and denies the next', async () => {
        const limiter = fakeLimiter();
        for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) {
            await expect(checkRateLimit(limiter, 'darkharasho')).resolves.toBe(true);
        }
        await expect(checkRateLimit(limiter, 'darkharasho')).resolves.toBe(false);
    });

    it('counts each owner separately', async () => {
        const limiter = fakeLimiter();
        for (let i = 0; i < RATE_LIMIT_PER_HOUR; i += 1) await checkRateLimit(limiter, 'a');
        await expect(checkRateLimit(limiter, 'a')).resolves.toBe(false);
        await expect(checkRateLimit(limiter, 'b')).resolves.toBe(true);
    });

    it('honours an explicit lower limit', async () => {
        const limiter = fakeLimiter();
        await expect(checkRateLimit(limiter, 'a', { limit: 1 })).resolves.toBe(true);
        await expect(checkRateLimit(limiter, 'a', { limit: 1 })).resolves.toBe(false);
    });

    /**
     * The serial cases above pass against any implementation, including the KV
     * read-modify-write this replaced — which is why they asserted a guarantee
     * the code did not have. This is the case that actually holds the limit up.
     */
    it('allows exactly the limit when limit+20 calls are all in flight at once', async () => {
        const limiter = fakeLimiter();
        const total = RATE_LIMIT_PER_HOUR + 20;

        let entered = 0;
        let settled = 0;
        let enteredBeforeFirstSettle = 0;

        // No `await` in this loop: every call begins before any can finish.
        const inFlight = Array.from({ length: total }, () => {
            entered += 1;
            return checkRateLimit(limiter, 'darkharasho').then((ok) => {
                if (settled === 0) enteredBeforeFirstSettle = entered;
                settled += 1;
                return ok;
            });
        });

        const results = await Promise.all(inFlight);

        // Guards the test itself: a rewrite that serializes the calls proves
        // nothing, and this assertion is how you find out.
        expect(enteredBeforeFirstSettle).toBe(total);
        expect(results.filter(Boolean)).toHaveLength(RATE_LIMIT_PER_HOUR);
    });
});
