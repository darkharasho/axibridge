// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { splitIntoParts } from '../../../shared/chunkedGzip';

// settingsHandlers registers against electron's ipcMain at call time; capture
// the handlers instead so they can be invoked directly.
const handlers = new Map<string, (event: unknown, ...args: any[]) => any>();
vi.mock('electron', () => ({
    ipcMain: { handle: (channel: string, fn: any) => handlers.set(channel, fn), on: vi.fn() },
    app: { isPackaged: false, getPath: () => '/tmp', getAppPath: () => '/tmp' },
    shell: { openExternal: vi.fn() },
    dialog: {},
    BrowserWindow: class {}
}));
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { registerSettingsHandlers } from '../settingsHandlers';

const PAYLOAD = { replayFights: [{ id: 'fight-1', movementData: { positions: [1, 2, 3] } }] };

let server: http.Server;
let baseUrl = '';
/** Swapped per test to serve the same payload compressed or plain. */
let body: Buffer = Buffer.alloc(0);
let contentType = 'application/gzip';
let statusCode = 200;
/** Per-path overrides, used by the manifest test where each URL serves different bytes. */
const routes = new Map<string, { body: Buffer; contentType: string; statusCode: number }>();

beforeAll(async () => {
    registerSettingsHandlers({
        store: { get: () => undefined, set: () => undefined } as any,
        getWindow: () => null as any,
        clearDpsReportCache: () => undefined,
        fetchImageBuffer: (async () => Buffer.alloc(0)) as any,
        onApplySettings: () => undefined
    } as any);
    server = http.createServer((req, res) => {
        const route = req.url ? routes.get(req.url) : undefined;
        if (route) {
            res.writeHead(route.statusCode, { 'Content-Type': route.contentType });
            res.end(route.body);
            return;
        }
        res.writeHead(statusCode, { 'Content-Type': contentType });
        res.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

const invoke = (url: string) => handlers.get('fetch-r2-json')!(null, url);

describe('fetch-r2-json', () => {
    it('inflates a gzipped replay object', async () => {
        // Compressed bytes are binary: accumulating them as a string mangles
        // them, so this fails on anything but a Buffer-based read.
        body = gzipSync(Buffer.from(JSON.stringify(PAYLOAD), 'utf8'));
        contentType = 'application/gzip';
        statusCode = 200;

        await expect(invoke(`${baseUrl}/reports/a/replay.json.gz`)).resolves.toEqual({
            success: true,
            json: PAYLOAD
        });
    });

    it('reads a plain replay object, so reports published before compression still load', async () => {
        body = Buffer.from(JSON.stringify(PAYLOAD), 'utf8');
        contentType = 'application/json';
        statusCode = 200;

        await expect(invoke(`${baseUrl}/reports/a/replay.json`)).resolves.toEqual({
            success: true,
            json: PAYLOAD
        });
    });

    it('reports a non-2xx status', async () => {
        body = Buffer.from('nope');
        statusCode = 404;

        await expect(invoke(`${baseUrl}/missing`)).resolves.toEqual({ success: false, error: 'HTTP 404' });
    });

    it('rejects a body that is neither gzip nor JSON', async () => {
        body = Buffer.from('<html>not json</html>');
        contentType = 'text/html';
        statusCode = 200;

        const result: any = await invoke(`${baseUrl}/reports/a/replay.json`);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not valid JSON/);
    });

    it('reassembles a chunked replay manifest', async () => {
        routes.clear();
        const gz = gzipSync(Buffer.from(JSON.stringify(PAYLOAD), 'utf8'));
        const sha = createHash('sha256').update(gz).digest('hex');
        const { parts, manifest } = splitIntoParts(new Uint8Array(gz), 'replay.json.gz', sha, 16);

        routes.set('/reports/a/replay.parts.json', {
            body: Buffer.from(JSON.stringify(manifest), 'utf8'),
            contentType: 'application/json',
            statusCode: 200
        });
        for (const part of parts) {
            routes.set(`/reports/a/${part.path}`, {
                body: Buffer.from(part.data),
                contentType: 'application/octet-stream',
                statusCode: 200
            });
        }

        await expect(invoke(`${baseUrl}/reports/a/replay.parts.json`)).resolves.toEqual({
            success: true,
            json: PAYLOAD
        });
    });
});
