import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
    CLOUDFLARE_AUTHORIZE_URL,
    CLOUDFLARE_OAUTH_CLIENT_ID,
    CLOUDFLARE_OAUTH_SCOPES,
    CLOUDFLARE_REDIRECT_PORTS,
    buildAuthorizeUrl,
    createPkcePair,
    parseCallbackUrl,
    redirectUriForPort
} from '../oauth';

describe('createPkcePair', () => {
    it('derives the challenge as base64url(sha256(verifier))', () => {
        const { verifier, challenge, method } = createPkcePair();
        expect(method).toBe('S256');
        const expected = createHash('sha256').update(verifier).digest('base64url');
        expect(challenge).toBe(expected);
    });

    it('produces a verifier inside RFC 7636 length bounds', () => {
        const { verifier } = createPkcePair();
        expect(verifier.length).toBeGreaterThanOrEqual(43);
        expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('is base64url — no +, / or = that would need escaping in a query string', () => {
        const { verifier, challenge } = createPkcePair();
        expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
        expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it('does not repeat across calls', () => {
        expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier);
    });
});

describe('buildAuthorizeUrl', () => {
    const base = {
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:8976/oauth/callback',
        state: 'state-abc',
        challenge: 'challenge-xyz'
    };

    it('is a public-client authorization code request with PKCE S256', () => {
        const url = new URL(buildAuthorizeUrl(base));
        expect(`${url.origin}${url.pathname}`).toBe(CLOUDFLARE_AUTHORIZE_URL);
        expect(url.searchParams.get('response_type')).toBe('code');
        expect(url.searchParams.get('client_id')).toBe('client-123');
        expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        expect(url.searchParams.get('state')).toBe('state-abc');
        expect(url.searchParams.get('redirect_uri')).toBe(base.redirectUri);
    });

    it('requests write, membership enumeration and a refresh token, and nothing else', () => {
        const scopes = new URL(buildAuthorizeUrl(base)).searchParams.get('scope')?.split(' ') ?? [];
        expect(new Set(scopes)).toEqual(new Set(['workers-r2.write', 'memberships.read', 'offline_access']));
    });

    it('omits the read scope, which write already implies', () => {
        // Verified in probe 2: an object GET succeeded on a grant with no
        // workers-r2.read. Adding it only makes the consent screen scarier.
        expect(CLOUDFLARE_OAUTH_SCOPES).not.toContain('workers-r2.read');
    });

    it('never carries a client secret — this is a public client', () => {
        expect(buildAuthorizeUrl(base)).not.toMatch(/client_secret/);
    });
});

describe('redirectUriForPort', () => {
    it('is a loopback IP literal, not "localhost"', () => {
        // RFC 8252: localhost depends on name resolution and can be hijacked
        // by a hosts entry; the IP literal cannot.
        expect(redirectUriForPort(8976)).toBe('http://127.0.0.1:8976/oauth/callback');
    });

    it('offers more than one registered port so a busy port is recoverable', () => {
        expect(CLOUDFLARE_REDIRECT_PORTS.length).toBeGreaterThan(1);
    });
});

describe('parseCallbackUrl', () => {
    const state = 'expected-state';

    it('accepts a matching state and returns the code', () => {
        const result = parseCallbackUrl('/oauth/callback?code=the-code&state=expected-state', state);
        expect(result).toEqual({ ok: true, code: 'the-code' });
    });

    it('rejects a mismatched state', () => {
        const result = parseCallbackUrl('/oauth/callback?code=the-code&state=attacker', state);
        expect(result.ok).toBe(false);
    });

    it('rejects a missing state even when a code is present', () => {
        expect(parseCallbackUrl('/oauth/callback?code=the-code', state).ok).toBe(false);
    });

    it('surfaces a declined consent as its own message rather than a generic failure', () => {
        const result = parseCallbackUrl(
            '/oauth/callback?error=access_denied&error_description=User+denied&state=expected-state',
            state
        );
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/denied|declined/i);
    });

    it('rejects a callback with neither a code nor an error', () => {
        expect(parseCallbackUrl('/oauth/callback?state=expected-state', state).ok).toBe(false);
    });

    it('ignores requests to any path other than the callback', () => {
        expect(parseCallbackUrl('/favicon.ico', state).ok).toBe(false);
    });
});

describe('CLOUDFLARE_OAUTH_CLIENT_ID', () => {
    const withEnv = async (value: string | undefined) => {
        const previous = process.env.CLOUDFLARE_OAUTH_CLIENT_ID;
        vi.resetModules();
        if (value === undefined) delete process.env.CLOUDFLARE_OAUTH_CLIENT_ID;
        else process.env.CLOUDFLARE_OAUTH_CLIENT_ID = value;
        try {
            return (await import('../oauth')).CLOUDFLARE_OAUTH_CLIENT_ID;
        } finally {
            if (previous === undefined) delete process.env.CLOUDFLARE_OAUTH_CLIENT_ID;
            else process.env.CLOUDFLARE_OAUTH_CLIENT_ID = previous;
            vi.resetModules();
        }
    };

    // A packaged build has no shell to export the variable, so an empty fallback
    // would ship a client id of '' and break sign-in for every user.
    it('falls back to the registered public client when the environment is silent', async () => {
        await expect(withEnv(undefined)).resolves.toBe('676540c5844fe8c89b6b9cb8482c304d');
    });

    it('lets the environment override the baked-in default', async () => {
        await expect(withEnv('deadbeefdeadbeefdeadbeefdeadbeef')).resolves.toBe(
            'deadbeefdeadbeefdeadbeefdeadbeef'
        );
    });

    it('is never empty as loaded, whatever the ambient environment', () => {
        expect(CLOUDFLARE_OAUTH_CLIENT_ID).not.toBe('');
    });
});
