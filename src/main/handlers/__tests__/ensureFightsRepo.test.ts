import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import https from 'node:https';

// githubHandlers imports electron at module load; stub the surface it touches.
vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn() },
    app: { isPackaged: false, getPath: () => '/tmp', getAppPath: () => '/tmp' },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() }
}));
vi.mock('electron-log', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { ensureFightsRepo, resetFightsRepoCache } from '../githubHandlers';

type MockResponse = { status: number; body?: unknown };

interface RecordedCall {
    method: string;
    path: string;
    body: unknown;
}

const calls: RecordedCall[] = [];
let responder: (call: RecordedCall) => MockResponse;
// Set to hold the response until the test releases it, so two callers can be
// in flight at the same moment.
let gate: Promise<void> | null = null;

function installHttpsMock() {
    vi.spyOn(https, 'request').mockImplementation((options: any, cb: any) => {
        const req = new EventEmitter() as any;
        let payload = '';
        req.write = (chunk: string) => { payload += chunk; };
        req.setTimeout = () => req;
        req.destroy = () => undefined;
        req.end = () => {
            const call: RecordedCall = {
                method: options.method,
                path: options.path,
                body: payload ? JSON.parse(payload) : null
            };
            calls.push(call);
            const deliver = () => {
                const { status, body } = responder(call);
                const res = new EventEmitter() as any;
                res.statusCode = status;
                res.setEncoding = () => {};
                cb(res);
                if (body !== undefined) res.emit('data', JSON.stringify(body));
                res.emit('end');
            };
            // Deliver asynchronously, like a real socket.
            if (gate) void gate.then(deliver);
            else queueMicrotask(deliver);
        };
        return req;
    });
}

const makeStore = (values: Record<string, unknown>) => {
    const data = { ...values };
    return {
        get: (key: string) => data[key],
        set: vi.fn((key: string, value: unknown) => { data[key] = value; }),
        data
    };
};

const relative = () => calls.map((c) => `${c.method} ${c.path}`);

describe('ensureFightsRepo', () => {
    beforeEach(() => {
        calls.length = 0;
        gate = null;
        vi.restoreAllMocks();
        installHttpsMock();
        resetFightsRepoCache();
    });

    it('reads share blobs from raw.githubusercontent, not GitHub Pages', async () => {
        // The fights repo stores only gzipped JSON that OUR viewer fetches
        // client-side — it is never a site. Pages would add a build to wait on
        // before the first share link resolves; raw serves the blob the instant
        // the Contents-API commit lands.
        responder = (call) => {
            if (call.path === '/repos/gw2eww/fight-reports-fights') return { status: 200, body: { name: 'fight-reports-fights' } };
            throw new Error(`Unexpected call: ${call.method} ${call.path}`);
        };
        const store = makeStore({ githubRepoName: 'fight-reports', githubRepoOwner: 'gw2eww' });

        const result = await ensureFightsRepo(store, 'token');

        expect(result).toEqual({
            owner: 'gw2eww',
            repo: 'fight-reports-fights',
            branch: 'main',
            baseUrl: 'https://raw.githubusercontent.com/gw2eww/fight-reports-fights/main'
        });
        // No /pages call of any kind.
        expect(calls.some((c) => c.path.includes('/pages'))).toBe(false);
    });

    it('creates the fights repo when it does not exist yet', async () => {
        responder = (call) => {
            if (call.path === '/repos/gw2eww/fight-reports-fights') return { status: 404, body: { message: 'Not Found' } };
            if (call.path === '/user') return { status: 200, body: { login: 'gw2eww' } };
            if (call.method === 'POST' && call.path === '/user/repos') return { status: 201, body: { name: 'fight-reports-fights' } };
            throw new Error(`Unexpected call: ${call.method} ${call.path}`);
        };
        const store = makeStore({ githubRepoName: 'fight-reports', githubRepoOwner: 'gw2eww' });

        const result = await ensureFightsRepo(store, 'token');

        const create = calls.find((c) => c.method === 'POST');
        expect(create?.path).toBe('/user/repos');
        // Public, so raw.githubusercontent can serve it anonymously, and
        // auto_init so the branch the base URL names actually exists.
        expect(create?.body).toMatchObject({ name: 'fight-reports-fights', private: false, auto_init: true });
        expect(result.baseUrl).toBe('https://raw.githubusercontent.com/gw2eww/fight-reports-fights/main');
        expect(store.set).toHaveBeenCalledWith('githubFightsRepoName', 'fight-reports-fights');
    });

    it('tolerates losing the create race', async () => {
        // A parallel share (or the user) may have created the repo between our
        // 404 and our POST. GitHub answers 422 "name already exists"; that is
        // the state we wanted, not a failure.
        responder = (call) => {
            if (call.path === '/repos/gw2eww/fight-reports-fights') return { status: 404, body: { message: 'Not Found' } };
            if (call.path === '/user') return { status: 200, body: { login: 'gw2eww' } };
            if (call.method === 'POST') return { status: 422, body: { message: 'name already exists on this account' } };
            throw new Error(`Unexpected call: ${call.method} ${call.path}`);
        };
        const store = makeStore({ githubRepoName: 'fight-reports', githubRepoOwner: 'gw2eww' });

        await expect(ensureFightsRepo(store, 'token')).resolves.toMatchObject({ repo: 'fight-reports-fights' });
    });

    it('makes no GitHub calls at all on a repeat resolve', async () => {
        // This runs once per shared log on the ingest critical path. Re-asking
        // "does the repo exist" for every fight of a raid spends the rate limit
        // to learn something that cannot have changed.
        responder = () => ({ status: 200, body: { name: 'fight-reports-fights' } });
        const store = makeStore({ githubRepoName: 'fight-reports', githubRepoOwner: 'gw2eww' });

        const first = await ensureFightsRepo(store, 'token');
        calls.length = 0;
        const second = await ensureFightsRepo(store, 'token');

        expect(calls).toEqual([]);
        expect(second).toEqual(first);
    });

    it('provisions once when several logs are shared at the same moment', async () => {
        let release!: () => void;
        gate = new Promise<void>((resolve) => { release = resolve; });
        responder = (call) => {
            if (call.path === '/repos/gw2eww/fight-reports-fights') return { status: 404, body: { message: 'Not Found' } };
            if (call.path === '/user') return { status: 200, body: { login: 'gw2eww' } };
            if (call.method === 'POST') return { status: 201, body: {} };
            throw new Error(`Unexpected call: ${call.method} ${call.path}`);
        };
        const store = makeStore({ githubRepoName: 'fight-reports', githubRepoOwner: 'gw2eww' });

        const both = Promise.all([ensureFightsRepo(store, 'token'), ensureFightsRepo(store, 'token')]);
        release();
        const [a, b] = await both;

        expect(a).toEqual(b);
        expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
        expect(relative().filter((c) => c === 'GET /repos/gw2eww/fight-reports-fights')).toHaveLength(1);
    });

    it('retries after a failed attempt instead of caching the failure', async () => {
        // A transient 500 or a dropped socket must not poison sharing for the
        // rest of the session — only success is worth remembering.
        let attempt = 0;
        responder = (call) => {
            if (call.path === '/repos/gw2eww/fight-reports-fights') {
                attempt += 1;
                return attempt === 1 ? { status: 500, body: { message: 'Server Error' } } : { status: 200, body: {} };
            }
            throw new Error(`Unexpected call: ${call.method} ${call.path}`);
        };
        const store = makeStore({ githubRepoName: 'fight-reports', githubRepoOwner: 'gw2eww' });

        await expect(ensureFightsRepo(store, 'token')).rejects.toThrow(/500/);
        await expect(ensureFightsRepo(store, 'token')).resolves.toMatchObject({
            baseUrl: 'https://raw.githubusercontent.com/gw2eww/fight-reports-fights/main'
        });
    });

    it('falls back to the authenticated user when no owner is configured', async () => {
        responder = (call) => {
            if (call.path === '/user') return { status: 200, body: { login: 'darkharasho' } };
            if (call.path === '/repos/darkharasho/fight-reports-fights') return { status: 200, body: {} };
            throw new Error(`Unexpected call: ${call.method} ${call.path}`);
        };
        const store = makeStore({ githubRepoName: 'fight-reports' });

        const result = await ensureFightsRepo(store, 'token');
        expect(result.owner).toBe('darkharasho');
        expect(result.baseUrl).toBe('https://raw.githubusercontent.com/darkharasho/fight-reports-fights/main');
    });

    it('gives up on a GitHub call whose socket goes silent', async () => {
        // Share resolution sits on the ingest critical path and is awaited, so
        // an `https.request` with no timeout does not merely lose one log: the
        // app stops processing anything and every card stays "pending" forever.
        // That is the shape users reported as "frozen / stuck on upload".
        vi.spyOn(https, 'request').mockImplementation(() => {
            const req = new EventEmitter() as any;
            let onTimeout: (() => void) | null = null;
            req.write = () => undefined;
            req.setTimeout = (_ms: number, cb: () => void) => { onTimeout = cb; return req; };
            req.destroy = (err?: Error) => { req.emit('error', err ?? new Error('destroyed')); };
            // A server that accepted the request and then said nothing at all.
            req.end = () => { queueMicrotask(() => onTimeout?.()); };
            return req;
        });
        const store = makeStore({ githubRepoName: 'fight-reports', githubRepoOwner: 'gw2eww' });

        await expect(ensureFightsRepo(store, 'token')).rejects.toThrow(/timed out/i);
    });

    it('refuses to guess a repo name when no reports repo is connected', async () => {
        responder = (call) => { throw new Error(`Unexpected call: ${call.method} ${call.path}`); };
        await expect(ensureFightsRepo(makeStore({}), 'token')).rejects.toThrow(/Settings/);
        expect(calls).toEqual([]);
    });
});
