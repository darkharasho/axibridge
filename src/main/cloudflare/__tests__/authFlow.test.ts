import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, vi } from 'vitest';

import { runAuthFlow } from '../authFlow';
import { redirectUriForPort } from '../oauth';

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const TOKENS = { accessToken: 'at', refreshToken: 'rt', expiresAt: 1, grantedScopes: ['workers-r2.write'] };

/**
 * Drive a callback into whatever port the flow advertised, and read the page back.
 *
 * Deliberately `node:http` and not `fetch`: the shared test setup stubs global
 * fetch to reject so no test can quietly hit the network. This request is to a
 * loopback port this test opened itself, so it goes around the stub rather than
 * removing a guard the rest of the suite relies on.
 */
const callback = (authorizeUrl: string, params: Record<string, string>) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
        const target = new URL(new URL(authorizeUrl).searchParams.get('redirect_uri')!);
        for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
        http.get(target.toString(), (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        }).on('error', reject);
    });

/** Ask the OS for ports that are actually free right now. */
const freePorts = async (count: number): Promise<number[]> => {
    const servers = await Promise.all(Array.from({ length: count }, () => new Promise<http.Server>((resolve) => {
        const server = http.createServer(() => {});
        server.listen(0, '127.0.0.1', () => resolve(server));
    })));
    const ports = servers.map((server) => (server.address() as AddressInfo).port);
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
    return ports;
};

const squat = (port: number) => new Promise<http.Server>((resolve) => {
    const server = http.createServer(() => {});
    server.listen(port, '127.0.0.1', () => resolve(server));
});

const release = (servers: http.Server[]) =>
    Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));

/**
 * Start the flow and get hold of the authorize URL without racing it: the flow
 * only resolves once a callback arrives, so we wait on `openExternal` instead.
 *
 * If the flow bails before opening a browser — every port busy, no client id —
 * that URL would never arrive and the test would sit until the suite timeout,
 * reporting a timeout instead of the actual reason. So the wait races the flow
 * itself and surfaces its result.
 */
const startFlow = (overrides: Partial<Parameters<typeof runAuthFlow>[0]> = {}) => {
    let resolveUrl: (url: string) => void = () => {};
    const opened = new Promise<string>((resolve) => { resolveUrl = resolve; });
    const openExternal = vi.fn(async (url: string) => { resolveUrl(url); });
    const promise = runAuthFlow({
        clientId: 'client-123',
        openExternal,
        exchange: vi.fn(async () => ({ ok: true as const, tokens: TOKENS })),
        ...overrides,
    } as Parameters<typeof runAuthFlow>[0]);

    const bailed = promise.then((result) => {
        throw new Error(`the flow ended before opening a browser: ${JSON.stringify(result)}`);
    });
    bailed.catch(() => {}); // the race consumes this; this only stops an unhandled rejection.

    return { promise, authorizeUrl: Promise.race([opened, bailed]), openExternal };
};

describe('runAuthFlow', () => {
    it('opens the system browser at an authorize URL bound to the port it listened on', async () => {
        const ports = await freePorts(2);
        const { promise, authorizeUrl } = startFlow({ ports });
        const url = new URL(await authorizeUrl);

        expect(url.origin + url.pathname).toBe('https://dash.cloudflare.com/oauth2/auth');
        expect(url.searchParams.get('client_id')).toBe('client-123');
        expect(url.searchParams.get('code_challenge_method')).toBe('S256');
        expect(url.searchParams.get('code_challenge')).toBeTruthy();
        expect(url.searchParams.get('state')).toBeTruthy();
        // RFC 8252 §7.3: the loopback IP literal, never `localhost`.
        const redirect = url.searchParams.get('redirect_uri')!;
        expect(redirect).toBe(redirectUriForPort(ports[0]));
        expect(new URL(redirect).hostname).toBe('127.0.0.1');

        await callback(url.toString(), { code: 'c', state: url.searchParams.get('state')! });
        await promise;
    });

    it('exchanges the returned code with the verifier that matches the challenge sent', async () => {
        const exchange = vi.fn(async () => ({ ok: true as const, tokens: TOKENS }));
        const { promise, authorizeUrl } = startFlow({ exchange, ports: await freePorts(1) });
        const url = new URL(await authorizeUrl);

        const page = await callback(url.toString(), { code: 'the-code', state: url.searchParams.get('state')! });
        expect(page.status).toBe(200);
        expect(page.body).toContain('Connected to Cloudflare');

        await expect(promise).resolves.toEqual({ ok: true, tokens: TOKENS });
        expect(exchange).toHaveBeenCalledWith({
            clientId: 'client-123',
            code: 'the-code',
            verifier: expect.any(String),
            redirectUri: url.searchParams.get('redirect_uri'),
        });
    });

    it('skips a port that is already bound and takes the next in the pool', async () => {
        const ports = await freePorts(2);
        const squatter = await squat(ports[0]);
        try {
            const { promise, authorizeUrl } = startFlow({ ports });
            const url = new URL(await authorizeUrl);

            expect(url.searchParams.get('redirect_uri')).toBe(redirectUriForPort(ports[1]));

            await callback(url.toString(), { code: 'c', state: url.searchParams.get('state')! });
            await promise;
        } finally {
            await release([squatter]);
        }
    });

    it('reports every port being taken as something the user can act on', async () => {
        const ports = await freePorts(2);
        const squatters = await Promise.all(ports.map(squat));
        try {
            const openExternal = vi.fn(async () => {});
            const result = await runAuthFlow({ clientId: 'client-123', openExternal, ports });
            expect(result.ok).toBe(false);
            expect(result.ok === false && result.error).toMatch(/all in use/);
            expect(result.ok === false && result.error).toContain(String(ports[0]));
            // No browser tab for a flow that never started.
            expect(openExternal).not.toHaveBeenCalled();
        } finally {
            await release(squatters);
        }
    });

    it('ignores a callback whose state does not match, leaving the real one still able to land', async () => {
        const { promise, authorizeUrl } = startFlow({ ports: await freePorts(1) });
        const url = new URL(await authorizeUrl);

        const forged = await callback(url.toString(), { code: 'attacker', state: 'wrong-state' });
        expect(forged.status).toBe(404);

        // The flow is still live: the genuine redirect completes it normally.
        await callback(url.toString(), { code: 'real', state: url.searchParams.get('state')! });
        await expect(promise).resolves.toEqual({ ok: true, tokens: TOKENS });
    });

    it('reports a declined consent screen as a decision, not a failure of the app', async () => {
        const { promise, authorizeUrl } = startFlow({ ports: await freePorts(1) });
        const url = new URL(await authorizeUrl);

        const page = await callback(url.toString(), { error: 'access_denied', state: url.searchParams.get('state')! });
        expect(page.status).toBe(400);

        const result = await promise;
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toMatch(/declined/i);
    });

    it('surfaces a token exchange rejection instead of reporting a connected session', async () => {
        const exchange = vi.fn(async () => ({ ok: false as const, error: 'Cloudflare rejected the token request: bad grant' }));
        const { promise, authorizeUrl } = startFlow({ exchange, ports: await freePorts(1) });
        const url = new URL(await authorizeUrl);

        await callback(url.toString(), { code: 'c', state: url.searchParams.get('state')! });
        await expect(promise).resolves.toEqual({ ok: false, error: 'Cloudflare rejected the token request: bad grant' });
    });

    it('gives up when the abort signal fires, so an abandoned flow does not hold the port', async () => {
        const controller = new AbortController();
        const ports = await freePorts(1);
        const { promise, authorizeUrl } = startFlow({ signal: controller.signal, ports });
        await authorizeUrl;
        const port = ports[0];

        controller.abort();
        const result = await promise;
        expect(result).toEqual({ ok: false, error: 'Sign-in cancelled.', cancelled: true });

        // Port is free again, so a retry can bind it.
        const probe = http.createServer(() => {});
        await expect(new Promise<void>((resolve, reject) => {
            probe.once('error', reject);
            probe.listen(port, '127.0.0.1', resolve);
        })).resolves.toBeUndefined();
        await new Promise<void>((resolve) => probe.close(() => resolve()));
    });

    it('stops before opening a browser when the build has no client id', async () => {
        const openExternal = vi.fn(async () => {});
        const result = await runAuthFlow({ clientId: '', openExternal });
        expect(result.ok).toBe(false);
        expect(openExternal).not.toHaveBeenCalled();
    });

    it('times out rather than leaving the listener open forever', async () => {
        const { promise } = startFlow({ timeoutMs: 20, ports: await freePorts(1) });
        const result = await promise;
        expect(result).toEqual({
            ok: false,
            error: 'Timed out waiting for the Cloudflare sign-in to finish.',
            cancelled: true,
        });
    });
});
