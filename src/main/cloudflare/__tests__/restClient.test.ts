import { describe, expect, it } from 'vitest';

import { CLOUDFLARE_USER_AGENT, classifyCloudflareError } from '../restClient';

// Cloudflare hands back three very different failures behind an identical
// bare 403. Each one has a different correct remedy, and telling a user to
// "sign in again" for a WAF block loses their session for nothing.
describe('classifyCloudflareError', () => {
    it('reads a 10042 body as R2 not being enabled on the account', () => {
        const failure = classifyCloudflareError(403, JSON.stringify({
            success: false,
            errors: [{ code: 10042, message: 'Please enable R2 through the Cloudflare Dashboard.' }],
            result: null
        }));
        expect(failure.kind).toBe('r2-not-enabled');
        expect(failure.code).toBe(10042);
        // The card is the actual blocker and the message has to say so.
        expect(failure.message).toMatch(/payment method|card/i);
    });

    it('reads the plain-text 1010 body as a WAF block, not an auth failure', () => {
        const failure = classifyCloudflareError(403, 'error code: 1010');
        expect(failure.kind).toBe('waf-blocked');
        expect(failure.message).not.toMatch(/sign in/i);
    });

    it('does not mistake a 1010 block for R2-not-enabled, or vice versa', () => {
        expect(classifyCloudflareError(403, 'error code: 1010').kind).toBe('waf-blocked');
        expect(classifyCloudflareError(403, '{"errors":[{"code":10042}]}').kind).toBe('r2-not-enabled');
    });

    it('classifies an unauthorized token so the caller can prompt a re-sign-in', () => {
        const failure = classifyCloudflareError(403, JSON.stringify({
            success: false,
            errors: [{ code: 9109, message: 'Unauthorized to access requested resource' }]
        }));
        expect(failure.kind).toBe('unauthorized');
        expect(failure.code).toBe(9109);
    });

    it('treats a bare 10000 authentication error as unauthorized', () => {
        const failure = classifyCloudflareError(403, '{"code":10000,"message":"Authentication error"}');
        expect(failure.kind).toBe('unauthorized');
    });

    it('classifies 429 as rate limited rather than a permissions problem', () => {
        expect(classifyCloudflareError(429, 'slow down').kind).toBe('rate-limited');
    });

    it('falls back to a generic http failure carrying the status and body', () => {
        const failure = classifyCloudflareError(500, 'boom');
        expect(failure.kind).toBe('http');
        expect(failure.status).toBe(500);
        expect(failure.message).toContain('500');
    });

    it('survives a non-JSON body without throwing', () => {
        expect(() => classifyCloudflareError(502, '<html>bad gateway</html>')).not.toThrow();
        expect(classifyCloudflareError(502, '<html>bad gateway</html>').kind).toBe('http');
    });
});

describe('CLOUDFLARE_USER_AGENT', () => {
    // Cloudflare's WAF 403s default library user-agents. A bare Node/Electron
    // request gets `error code: 1010` at the token exchange, which reads as a
    // broken OAuth config. Every request must carry an explicit UA.
    it('is a non-empty custom agent that is not a default library agent', () => {
        expect(CLOUDFLARE_USER_AGENT).toMatch(/^AxiBridge\//);
        expect(CLOUDFLARE_USER_AGENT).not.toMatch(/node-fetch|undici|urllib|^Mozilla/i);
    });
});
