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

import { ensureGithubPages } from '../githubHandlers';

type MockResponse = { status: number; body?: unknown };

interface RecordedCall {
    method: string;
    path: string;
    body: unknown;
}

const calls: RecordedCall[] = [];
let responder: (call: RecordedCall) => MockResponse;

// Emulate the https.request(options, cb) → req interface githubApiRequest uses.
function installHttpsMock() {
    vi.spyOn(https, 'request').mockImplementation((options: any, cb: any) => {
        const req = new EventEmitter() as any;
        let payload = '';
        req.write = (chunk: string) => { payload += chunk; };
        req.end = () => {
            const call: RecordedCall = {
                method: options.method,
                path: options.path,
                body: payload ? JSON.parse(payload) : null
            };
            calls.push(call);
            const { status, body } = responder(call);
            const res = new EventEmitter() as any;
            res.statusCode = status;
            res.setEncoding = () => {};
            // Deliver asynchronously, like a real socket.
            queueMicrotask(() => {
                cb(res);
                if (body !== undefined) res.emit('data', JSON.stringify(body));
                res.emit('end');
            });
        };
        return req;
    });
}

const isGet = (c: RecordedCall, suffix: string) => c.method === 'GET' && c.path.endsWith(suffix);

describe('ensureGithubPages', () => {
    beforeEach(() => {
        calls.length = 0;
        vi.restoreAllMocks();
        installHttpsMock();
    });

    it('seeds a first commit before enabling Pages on an empty repo', async () => {
        // Empty repo: Pages not set up (404) and the branch ref does not exist (404).
        responder = (call) => {
            if (isGet(call, '/pages')) return { status: 404, body: { message: 'Not Found' } };
            if (isGet(call, '/git/ref/heads/main')) return { status: 404, body: { message: 'Not Found' } };
            if (call.method === 'PUT' && call.path.endsWith('/contents/README.md')) {
                return { status: 201, body: { commit: { sha: 'seed-sha' } } };
            }
            if (call.method === 'POST' && call.path.endsWith('/pages')) {
                return { status: 201, body: { source: { branch: 'main', path: '/' } } };
            }
            throw new Error(`Unexpected call: ${call.method} ${call.path}`);
        };

        const result = await ensureGithubPages('owner', 'repo', 'main', 'token');

        const methods = calls.map((c) => `${c.method} ${c.path.replace('/repos/owner/repo', '')}`);
        expect(methods).toEqual([
            'GET /pages',
            'GET /git/ref/heads/main',
            'PUT /contents/README.md',
            'POST /pages'
        ]);
        // Seed must happen before the Pages POST (the ordering that fixes the 409).
        const seedIdx = calls.findIndex((c) => c.method === 'PUT');
        const pagesPostIdx = calls.findIndex((c) => c.method === 'POST');
        expect(seedIdx).toBeLessThan(pagesPostIdx);
        expect(result).toEqual({ source: { branch: 'main', path: '/' } });
    });

    it('treats a 409 on the branch ref (empty repo) as needing a seed', async () => {
        responder = (call) => {
            if (isGet(call, '/pages')) return { status: 404, body: { message: 'Not Found' } };
            if (isGet(call, '/git/ref/heads/main')) return { status: 409, body: { message: 'Git Repository is empty.' } };
            if (call.method === 'PUT') return { status: 201, body: {} };
            if (call.method === 'POST' && call.path.endsWith('/pages')) return { status: 201, body: { source: {} } };
            throw new Error(`Unexpected call: ${call.method} ${call.path}`);
        };

        await ensureGithubPages('owner', 'repo', 'main', 'token');
        expect(calls.some((c) => c.method === 'PUT' && c.path.endsWith('/contents/README.md'))).toBe(true);
    });

    it('does not seed when the branch already exists', async () => {
        responder = (call) => {
            if (isGet(call, '/pages')) return { status: 404, body: { message: 'Not Found' } };
            if (isGet(call, '/git/ref/heads/main')) return { status: 200, body: { object: { sha: 'abc' } } };
            if (call.method === 'POST' && call.path.endsWith('/pages')) return { status: 201, body: { source: {} } };
            throw new Error(`Unexpected call: ${call.method} ${call.path}`);
        };

        await ensureGithubPages('owner', 'repo', 'main', 'token');
        expect(calls.some((c) => c.method === 'PUT')).toBe(false);
        expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/pages'))).toBe(true);
    });

    it('returns early without seeding when Pages is already enabled', async () => {
        responder = (call) => {
            if (isGet(call, '/pages')) return { status: 200, body: { source: { branch: 'main', path: '/' } } };
            throw new Error(`Unexpected call: ${call.method} ${call.path}`);
        };

        const result = await ensureGithubPages('owner', 'repo', 'main', 'token');
        expect(calls).toHaveLength(1);
        expect(result).toEqual({ source: { branch: 'main', path: '/' } });
    });
});
