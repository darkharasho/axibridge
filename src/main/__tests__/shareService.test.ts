import { describe, expect, it, vi } from 'vitest';
import { gzipSync, gunzipSync } from 'zlib';
import {
    compressReport,
    shareLog,
    shareObjectKey,
    SHARE_VIEWER_ORIGIN,
    type ShareTarget
} from '../shareService';

const details = {
    fightName: 'Detonator',
    zone: 'Eternal Battlegrounds',
    durationMS: 182000,
    timeStart: 1758240000000,
    players: [{ name: 'A' }],
    targets: [{ name: 'E' }]
};

const okTarget = (): ShareTarget & { putObject: ReturnType<typeof vi.fn> } => ({
    putObject: vi.fn().mockResolvedValue({ success: true, url: 'https://cdn.example.com/a.gz' })
});

const okWorker = () => vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ code: 'k3Xm9qR2', url: 'https://bridge.axi.link/r/k3Xm9qR2' }), { status: 201 })
);

const deps = (over: Partial<Parameters<typeof shareLog>[2]> = {}) => ({
    target: okTarget(),
    githubToken: 'gho_valid',
    fetchImpl: okWorker() as any,
    ...over
});

/**
 * A deterministic squad-shaped payload: repetitive enough to compress, varied
 * enough that gzip levels actually differ from one another. Seeded LCG rather
 * than Math.random so the byte counts are stable across runs.
 */
const rosterFixture = (count: number) => {
    let seed = 1;
    const next = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
    const professions = ['Firebrand', 'Scourge', 'Herald', 'Spellbreaker', 'Druid'];
    return {
        players: Array.from({ length: count }, (_, i) => ({
            name: `Player ${i}`,
            account: `acct.${1000 + i}`,
            profession: professions[i % professions.length],
            dps: Math.floor(next() * 5000),
            damage: Math.floor(next() * 1_000_000),
            boons: { might: next() * 25, quickness: next(), alacrity: next() }
        }))
    };
};

describe('compressReport', () => {
    it('round-trips through gunzipSync', () => {
        const restored = JSON.parse(gunzipSync(compressReport(details)).toString('utf8'));
        expect(restored).toEqual(details);
    });

    it('produces something smaller than the raw JSON', () => {
        const raw = Buffer.byteLength(JSON.stringify({ padding: 'a'.repeat(10000) }));
        expect(compressReport({ padding: 'a'.repeat(10000) }).length).toBeLessThan(raw);
    });

    it('compresses at least as well as gzip level 9, pinning Z_BEST_COMPRESSION', () => {
        // The previous version of this test compared against level 1, which
        // zlib's DEFAULT (level 6) already beats — so dropping the `level`
        // option entirely, the obvious regression, still passed. `<=` against
        // level 9 is the assertion that actually holds the option in place,
        // since Z_BEST_COMPRESSION *is* level 9 and the two are expected to be
        // byte-identical.
        //
        // The fixture has to be a realistic roster, not `'a'.repeat(10000)`:
        // on trivially repetitive input levels 6 and 9 emit the same bytes, so
        // the comparison would be vacuous. On this one (measured) level 6 is
        // 9331 bytes against level 9's 9234, so removing the `level` option
        // makes this test fail.
        const input = rosterFixture(200);
        const raw = Buffer.from(JSON.stringify(input), 'utf8');
        expect(compressReport(input).length).toBeLessThanOrEqual(gzipSync(raw, { level: 9 }).length);
    });
});

describe('shareObjectKey', () => {
    it('leaks no directory segment from a real absolute log path', () => {
        // This is the actual shape of the `logId` the IPC handler receives: a
        // Steam Proton compatdata path carrying the OS username. It used to be
        // interpolated straight into the object key and thus into a public URL.
        const key = shareObjectKey(
            '/home/mstephens/.steam/steam/steamapps/compatdata/1284210/pfx/drive_c/users/steamuser/'
            + 'Documents/Guild Wars 2/addons/arcdps/arcdps.cbtlogs/WvW/20260919-203112.zevtc'
        );
        expect(key).not.toContain('/home/');
        expect(key).not.toContain('mstephens');
        expect(key).not.toContain('compatdata');
        expect(key).not.toContain('steamuser');
        // One leading `shares/` and nothing else path-shaped.
        expect(key.split('/')).toHaveLength(2);
        expect(key).toMatch(/^shares\/[A-Za-z0-9._-]+\.json\.gz$/);
    });

    it('produces a URL-safe key for a path containing a space and a #', () => {
        // `putObject` encodes the key for the PUT but returns the public URL
        // UN-encoded, so any character needing percent-encoding produced a
        // `loc` pointing somewhere else — permanently stored in KV.
        const key = shareObjectKey('C:\\Users\\me\\Guild Wars 2\\logs\\fight #3?take=2.zevtc');
        expect(key).toMatch(/^shares\/[A-Za-z0-9._-]+\.json\.gz$/);
        expect(encodeURI(key)).toBe(key);
    });

    it('never collides for two logs that sanitise to the same basename', () => {
        const a = shareObjectKey('/logs/a/20260919-203112.zevtc');
        const b = shareObjectKey('/logs/b/20260919-203112.zevtc');
        expect(a).not.toBe(b);
    });

    it('is stable for the same id', () => {
        expect(shareObjectKey('log-1')).toBe(shareObjectKey('log-1'));
    });

    it('still produces a valid key for an id that sanitises to nothing', () => {
        expect(shareObjectKey('///')).toMatch(/^shares\/[A-Za-z0-9._-]+\.json\.gz$/);
    });
});

describe('shareLog', () => {
    it('returns the code and url from the worker', async () => {
        await expect(shareLog(details, 'log-1', deps())).resolves.toMatchObject({
            success: true,
            code: 'k3Xm9qR2',
            url: 'https://bridge.axi.link/r/k3Xm9qR2'
        });
    });

    it('uploads gzip-compressed bytes under a sanitised .json.gz key', async () => {
        const target = okTarget();
        await shareLog(details, 'log-1', deps({ target }));
        const [key, body, contentType] = target.putObject.mock.calls[0];
        // Derived from the logId (see shareObjectKey) rather than interpolated,
        // but still derived from it — a handler that hardcoded the key or
        // dropped logId would fail this.
        expect(key).toBe(shareObjectKey('log-1'));
        expect(key).toMatch(/^shares\/log-1-[0-9a-f]{12}\.json\.gz$/);
        expect(contentType).toBe('application/gzip');
        expect(JSON.parse(gunzipSync(body).toString('utf8'))).toEqual(details);
    });

    it('never puts a local filesystem path in the object key', async () => {
        const target = okTarget();
        await shareLog(details, '/home/mstephens/.steam/logs/WvW/20260919-203112.zevtc', deps({ target }));
        const [key] = target.putObject.mock.calls[0];
        expect(key).not.toContain('mstephens');
        expect(key).toMatch(/^shares\/[A-Za-z0-9._-]+\.json\.gz$/);
    });

    it('grants the viewer origin CORS on the bucket before uploading', async () => {
        // Without this, the bucket only allows the user's own Pages origin
        // (githubHandlers.ts) and every share link dies on a CORS error in the
        // browser, because the viewer runs at bridge.axi.link.
        const order: string[] = [];
        const ensureCors = vi.fn(async () => { order.push('cors'); return { success: true }; });
        const putObject = vi.fn(async () => {
            order.push('put');
            return { success: true, url: 'https://cdn.example.com/a.gz' };
        });
        await shareLog(details, 'log-1', deps({ target: { putObject, ensureCors } }));
        expect(ensureCors).toHaveBeenCalledWith('https://bridge.axi.link');
        expect(SHARE_VIEWER_ORIGIN).toBe('https://bridge.axi.link');
        expect(order).toEqual(['cors', 'put']);
    });

    it('still shares successfully when ensureCors rejects', async () => {
        const target = {
            putObject: vi.fn().mockResolvedValue({ success: true, url: 'https://cdn.example.com/a.gz' }),
            ensureCors: vi.fn().mockRejectedValue(new Error('token lacks bucket:write'))
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const result = await shareLog(details, 'log-1', deps({ target }));
            expect(result.success).toBe(true);
            expect(target.putObject).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it('still shares successfully when ensureCors reports failure', async () => {
        const target = {
            putObject: vi.fn().mockResolvedValue({ success: true, url: 'https://cdn.example.com/a.gz' }),
            ensureCors: vi.fn().mockResolvedValue({ success: false, error: 'no permission' })
        };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const result = await shareLog(details, 'log-1', deps({ target }));
            expect(result.success).toBe(true);
            expect(warn).toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });

    it('works against a target with no ensureCors at all', async () => {
        const target = okTarget();
        expect((target as ShareTarget).ensureCors).toBeUndefined();
        await expect(shareLog(details, 'log-1', deps({ target }))).resolves.toMatchObject({ success: true });
    });

    it('posts the summary and the uploaded location to the worker', async () => {
        const fetchImpl = okWorker();
        await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        const [, init] = fetchImpl.mock.calls[0];
        const body = JSON.parse(init.body);
        expect(body.loc).toBe('https://cdn.example.com/a.gz');
        expect(body.sum.f).toBe('Detonator');
        expect(init.headers.Authorization).toBe('Bearer gho_valid');
    });

    it('fails without a GitHub token and never uploads', async () => {
        const target = okTarget();
        const result = await shareLog(details, 'log-1', deps({ target, githubToken: null }));
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/GitHub/i);
        expect(target.putObject).not.toHaveBeenCalled();
    });

    it('surfaces an upload failure without calling the worker', async () => {
        const target: ShareTarget = { putObject: vi.fn().mockResolvedValue({ success: false, error: 'bucket missing' }) };
        const fetchImpl = okWorker();
        const result = await shareLog(details, 'log-1', deps({ target, fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('bucket missing');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it.each([
        [400, 'Missing report location.'],
        [401, 'GitHub authentication required.'],
        [413, 'Payload too large.'],
        [429, 'Share rate limit reached. Try again later.'],
        [503, 'Could not allocate a share code. Try again.'],
        [500, 'internal error']
    ])('surfaces a worker rejection for status %i verbatim', async (status, workerError) => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: workerError }), { status })
        );
        const result = await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toBe(workerError);
    });

    it('surfaces the 429 rate-limit message distinctly and human-readably', async () => {
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: 'Share rate limit reached. Try again later.' }), { status: 429 })
        );
        const result = await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('rate limit');
    });

    it('resolves (does not reject) when putObject rejects, and never calls the worker', async () => {
        const target: ShareTarget = { putObject: vi.fn().mockRejectedValue(new Error('Not signed in to Cloudflare.')) };
        const fetchImpl = okWorker();
        const result = await shareLog(details, 'log-1', deps({ target, fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('Not signed in to Cloudflare.');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('resolves (does not reject) when the report has a circular reference', async () => {
        const circular: any = { fightName: 'Detonator' };
        circular.self = circular;
        const target = okTarget();
        const fetchImpl = okWorker();
        const result = await shareLog(circular, 'log-1', deps({ target, fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(target.putObject).not.toHaveBeenCalled();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('rejects a non-https upload location before calling the worker', async () => {
        const target: ShareTarget = { putObject: vi.fn().mockResolvedValue({ success: true, url: 'http://cdn.example.com/a.br' }) };
        const fetchImpl = okWorker();
        const result = await shareLog(details, 'log-1', deps({ target, fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('surfaces a network failure reaching the worker', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));
        const result = await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
        expect(result.error).toContain('offline');
    });

    it('never reports success on a non-201 status even when the body parses cleanly', async () => {
        // Guards against checking response.ok alone: a hypothetical 200 with a
        // code/url-shaped body must still not be treated as success, since the
        // Worker's contract is 201-or-error.
        const fetchImpl = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ code: 'zzzzzzzz', url: 'https://bridge.axi.link/r/zzzzzzzz' }), { status: 200 })
        );
        const result = await shareLog(details, 'log-1', deps({ fetchImpl: fetchImpl as any }));
        expect(result.success).toBe(false);
    });
});
