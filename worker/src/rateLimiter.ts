/**
 * The Durable Object storage seam. Tests hand in a Map-backed fake; production
 * hands in the real `DurableObjectState.storage`. Nothing above this interface
 * knows which it got.
 *
 * This exists for the same reason `KVLike` does in `auth.ts`, and for one more:
 * there is no `workerd` test runner wired up here, so the only way to assert
 * anything about this class — including the concurrency property that is the
 * entire point of it — is to be able to construct it without a runtime.
 */
export interface DurableStorageLike {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
}

/** The slice of `DurableObjectState` this class actually uses. */
export interface DurableObjectStateLike {
    storage: DurableStorageLike;
}

/**
 * The slice of `DurableObjectNamespace` the adapter below actually uses.
 * Declared structurally because `worker/tsconfig.json` sets `"types": []` —
 * the Workers ambient types are deliberately not in scope.
 */
export interface DurableObjectIdLike {
    toString(): string;
}
export interface DurableObjectStubLike {
    fetch(request: Request): Promise<Response>;
}
export interface DurableObjectNamespaceLike {
    idFromName(name: string): DurableObjectIdLike;
    get(id: DurableObjectIdLike): DurableObjectStubLike;
}

/** The persisted fixed window. Absent ⇒ the owner has a fresh window. */
export interface RateLimitWindow {
    count: number;
    resetAt: number;
}

const WINDOW_KEY = 'window';

/** The single path this object answers on; see `durableRateLimiter` below. */
export const CONSUME_URL = 'https://share-rate-limiter.invalid/consume';

/**
 * A fixed-window counter, one instance per owner login (`idFromName(owner)`),
 * so every request from an owner serializes through one object no matter which
 * colo it landed in. That global serialization is the whole reason this is a
 * Durable Object and not a KV key: KV has no atomic increment and its reads are
 * edge-cached, so concurrent requests all read the same stale count.
 *
 * Deliberately NO alarm. The window is closed by comparing `Date.now()` against
 * the stored `resetAt` on the next call, which means there is nothing to
 * schedule, nothing to re-arm after an eviction, and no way for a missed or
 * late alarm to leave an owner permanently blocked or permanently free. An
 * alarm would buy only the eager deletion of a ~30-byte record.
 */
export class ShareRateLimiter {
    private readonly storage: DurableStorageLike;
    private readonly now: () => number;

    /**
     * Serializes `consume` calls against each other. The Workers runtime's
     * input gates already do this for a deployed object, but relying on them
     * would put the class's core guarantee somewhere no test here can reach.
     * Holding the invariant in the class instead makes it true under plain
     * Node too, which is what the concurrency test exercises.
     */
    private tail: Promise<unknown> = Promise.resolve();

    constructor(state: DurableObjectStateLike, _env?: unknown, opts: { now?: () => number } = {}) {
        this.storage = state.storage;
        this.now = opts.now ?? (() => Date.now());
    }

    async consume(limit: number, windowSeconds: number): Promise<boolean> {
        const run = () => this.consumeUnlocked(limit, windowSeconds);
        const next = this.tail.then(run, run);
        this.tail = next.catch(() => undefined);
        return next;
    }

    private async consumeUnlocked(limit: number, windowSeconds: number): Promise<boolean> {
        const now = this.now();
        const stored = await this.storage.get<RateLimitWindow>(WINDOW_KEY);
        const window: RateLimitWindow = stored && now < stored.resetAt
            ? stored
            : { count: 0, resetAt: now + windowSeconds * 1000 };

        // Denied calls are not counted: pressure against a closed window must
        // not push `count` higher, and must never extend the window.
        if (window.count >= limit) return false;

        await this.storage.put<RateLimitWindow>(WINDOW_KEY, {
            count: window.count + 1,
            resetAt: window.resetAt
        });
        return true;
    }

    /** The stub is reached over `fetch`, so the wire contract is explicit. */
    async fetch(request: Request): Promise<Response> {
        let limit = 0;
        let windowSeconds = 0;
        try {
            const body = await request.json() as { limit?: unknown; windowSeconds?: unknown };
            limit = typeof body?.limit === 'number' ? body.limit : 0;
            windowSeconds = typeof body?.windowSeconds === 'number' ? body.windowSeconds : 0;
        } catch {
            return new Response(JSON.stringify({ ok: false }), {
                status: 400,
                headers: { 'content-type': 'application/json' }
            });
        }
        const ok = await this.consume(limit, windowSeconds);
        return new Response(JSON.stringify({ ok }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    }
}

/**
 * Production adapter: the `RateLimiterLike` the handlers see, backed by the
 * real namespace. Keyed on the owner login — which is the only thing
 * `resolveOwner` hands back, and which is never logged here or anywhere else.
 */
export const durableRateLimiter = (ns: DurableObjectNamespaceLike) => ({
    consume: async (owner: string, opts: { limit: number; windowSeconds: number }): Promise<boolean> => {
        const stub = ns.get(ns.idFromName(owner));
        const response = await stub.fetch(new Request(CONSUME_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ limit: opts.limit, windowSeconds: opts.windowSeconds })
        }));
        const body = await response.json() as { ok?: unknown };
        return body?.ok === true;
    }
});
