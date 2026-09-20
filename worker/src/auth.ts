/**
 * The KV seam. Tests hand in a Map-backed fake; production hands in the real
 * binding. Nothing above this interface knows which it got.
 */
export interface KVLike {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
}

export const RATE_LIMIT_PER_HOUR = 120;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

/**
 * Resolve a GitHub token to its login. Creating a pointer writes to storage we
 * pay for, so it needs a door; reusing the token the app already holds avoids
 * standing up an identity system for it.
 *
 * SECURITY — NEVER LOG THE AUTHORIZATION HEADER OR THE TOKEN. The credential
 * arriving here is the caller's own repo-scoped GitHub token (the same one
 * AxiBridge uses to push to GitHub Pages), so a stray `console.log` of the
 * request, its headers, or `token` would put a repo-write credential belonging
 * to someone who does not own this Worker into Cloudflare's logs. That is also
 * why this function deliberately returns ONLY the login and never the token,
 * the raw GitHub response, or anything else derived from it: nothing
 * downstream of here can leak what it never receives.
 */
export const resolveOwner = async (
    token: string | null,
    fetchImpl: typeof fetch = fetch
): Promise<string | null> => {
    if (!token) return null;
    try {
        const response = await fetchImpl('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'axibridge-share'
            }
        });
        if (!response.ok) return null;
        const body = await response.json() as { login?: unknown };
        return typeof body?.login === 'string' && body.login ? body.login : null;
    } catch {
        return null;
    }
};

/**
 * The rate-limiter seam. Tests hand in a plain fake; production hands in an
 * adapter over the real `DurableObjectNamespace`. Nothing above this interface
 * knows which it got.
 *
 * `owner` is the GitHub login and nothing more — see the SECURITY note above.
 * It keys the Durable Object (`idFromName(owner)`), which is intended, but it
 * is no more loggable than the token it came from: do not log it either.
 */
export interface RateLimiterLike {
    consume(owner: string, opts: { limit: number; windowSeconds: number }): Promise<boolean>;
}

// The old `rl:${owner}` KV prefix is retired; any leftover keys expire on their
// own TTL and nothing reads or writes them any more.

export const checkRateLimit = async (
    limiter: RateLimiterLike,
    owner: string,
    opts: { limit?: number; windowSeconds?: number } = {}
): Promise<boolean> => limiter.consume(owner, {
    limit: opts.limit ?? RATE_LIMIT_PER_HOUR,
    windowSeconds: opts.windowSeconds ?? RATE_LIMIT_WINDOW_SECONDS
});
