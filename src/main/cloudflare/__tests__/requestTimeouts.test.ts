import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import https from 'node:https';

vi.mock('electron-log', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { cloudflareRequest } from '../restClient';
import { r2DeleteObject, r2EnsureBucketCors, r2PutObject, type R2Config } from '../r2SigV4';

const config: R2Config = {
    accountId: 'acct',
    accessKeyId: 'key',
    secretAccessKey: 'secret',
    bucketName: 'bucket',
    publicUrl: 'https://pub.example.com'
};

/**
 * A server that accepts the request and then says nothing at all — the socket
 * stays open, no response ever arrives. Without an armed idle timeout every
 * promise below never settles, and an unsettled await on the ingest path is
 * what leaves the app "frozen" with every card stuck on pending.
 */
function installSilentSocket() {
    vi.spyOn(https, 'request').mockImplementation(() => {
        const req = new EventEmitter() as any;
        let onTimeout: (() => void) | null = null;
        req.write = () => true;
        req.setTimeout = (_ms: number, cb: () => void) => { onTimeout = cb; return req; };
        req.destroy = (err?: Error) => { req.emit('error', err ?? new Error('destroyed')); };
        req.end = () => { queueMicrotask(() => onTimeout?.()); };
        return req;
    });
}

describe('Cloudflare request timeouts', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        installSilentSocket();
    });

    it('rejects a cloudflareRequest whose socket goes silent', async () => {
        await expect(cloudflareRequest({ method: 'GET', path: '/client/v4/accounts' }))
            .rejects.toThrow(/timed out/i);
    });

    // The Tier 1 share upload, awaited on the ingest critical path.
    it('fails r2PutObject rather than hanging forever', async () => {
        const result = await r2PutObject('shares/abc.json.gz', Buffer.from('x'), 'application/gzip', config);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/timed out/i);
    });

    it('fails r2DeleteObject rather than hanging forever', async () => {
        const result = await r2DeleteObject('shares/abc.json.gz', config);
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/timed out/i);
    });

    // The CORS GET swallows errors by design (a missing config is not a
    // failure), so the guarantee here is only that it settles at all.
    it('settles r2EnsureBucketCors rather than hanging forever', async () => {
        const result = await r2EnsureBucketCors(config, 'https://bridge.axi.link');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/timed out/i);
    });
});
