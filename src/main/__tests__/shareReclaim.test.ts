import { gzipSync } from 'zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SHARE_LEDGER_KEY, readLedger, type ShareLedgerEntry } from '../shareLedger';
import { fetchSeen, reclaimShareSpace } from '../shareReclaim';
import type { ShareTarget } from '../shareService';

const WORKER = 'https://bridge.axi.link/r';

const report = (positions: number) => ({
    native: { blocks: { replay: { poll_ms: 300, tracks: { by_entity: { 1: new Array(positions).fill(1234) } } } } },
    players: [{ name: 'A', combatReplayData: { start: 0, down: [], dead: [], positions: new Array(positions).fill([1, 2]) } }],
    targets: [],
    statsAll: [{ dps: 1 }]
});

const fakeStore = (entries: ShareLedgerEntry[]) => {
    const data: Record<string, any> = { [SHARE_LEDGER_KEY]: entries, githubToken: 'gho_x' };
    return { get: (k: string) => data[k], set: (k: string, v: any) => { data[k] = v; } };
};

const entry = (over: Partial<ShareLedgerEntry> = {}): ShareLedgerEntry => ({
    code: 'AAAAAAAA',
    key: 'shares/a.json.gz',
    loc: 'https://u.github.io/f/shares/a.json.gz',
    bytes: 1000,
    stage: 'full',
    created: 1,
    ...over
});

const fakeTarget = () => {
    const puts: Array<{ key: string; body: Buffer }> = [];
    const deletes: string[] = [];
    const target: ShareTarget & { puts: typeof puts; deletes: typeof deletes } = {
        puts,
        deletes,
        putObject: async (key, body) => { puts.push({ key, body }); return { success: true, url: `https://u.github.io/f/${key}` }; },
        deleteObject: async (key) => { deletes.push(key); return { success: true }; }
    };
    return target;
};

/**
 * A fetch fake that serves gzipped reports by URL and answers the Worker's
 * meta/PATCH routes. `bodies` is keyed by object URL.
 */
const fakeFetch = (bodies: Record<string, Buffer>, opts: {
    seen?: Record<string, number | null>;
    patchStatus?: number;
} = {}) => {
    const patches: Array<{ code: string; stage: string }> = [];
    const impl = vi.fn(async (input: any, init?: any) => {
        const url = String(input);
        if (url === `${WORKER}/meta`) {
            const codes = JSON.parse(init.body).codes as string[];
            const meta: Record<string, any> = {};
            for (const code of codes) meta[code] = { stage: 'full', bytes: null, seen: opts.seen?.[code] ?? null };
            return new Response(JSON.stringify({ meta }), { status: 200 });
        }
        if (init?.method === 'PATCH') {
            const code = url.slice(WORKER.length + 1);
            const stage = JSON.parse(init.body).stage;
            const status = opts.patchStatus ?? 200;
            if (status === 200) patches.push({ code, stage });
            return new Response(JSON.stringify(status === 200 ? { code, stage } : { error: 'nope' }), { status });
        }
        const body = bodies[url];
        if (!body) return new Response('', { status: 404 });
        return new Response(new Uint8Array(body), { status: 200 });
    });
    return Object.assign(impl, { patches });
};

const deps = (over: any) => ({
    githubToken: 'gho_x',
    workerUrl: WORKER,
    // 1000-byte budget at 80% => a 800-byte high-water mark.
    budgetBytes: 1000,
    highWaterPct: 0.8,
    ...over
});

describe('reclaimShareSpace', () => {
    it('does nothing when the footprint is already under the high-water mark', async () => {
        const store = fakeStore([entry({ bytes: 100 })]);
        const fetchImpl = fakeFetch({});
        const result = await reclaimShareSpace(deps({ store, target: fakeTarget(), fetchImpl }));

        expect(result.steps).toEqual([]);
        expect(result.before).toBe(100);
        expect(result.after).toBe(100);
        expect(result.stillOverBudget).toBe(false);
        expect(fetchImpl.patches).toEqual([]);
    });

    it('does nothing without a token — every step needs one', async () => {
        const store = fakeStore([entry({ bytes: 5000 })]);
        const result = await reclaimShareSpace(deps({ store, target: fakeTarget(), githubToken: null }));
        expect(result.steps).toEqual([]);
    });

    // The point of the whole module: bytes that are actually gone.
    it('demotes an over-budget report and frees measured bytes', async () => {
        const full = gzipSync(Buffer.from(JSON.stringify(report(400))));
        const store = fakeStore([entry({ bytes: full.length })]);
        const target = fakeTarget();
        const fetchImpl = fakeFetch({ 'https://u.github.io/f/shares/a.json.gz': full });

        // The budget is expressed RELATIVE to the report so this case stays a
        // single demote as REPLAY_SHARE_OF_REPORT moves: over the mark before,
        // under it after one demote, for any reclaim rate above 20%. A fixed
        // budget of 100 happened to stop at demote when the projection was
        // 0.66 and ran on into a tombstone at 0.25, which is a different test.
        const result = await reclaimShareSpace(deps({
            store, target, fetchImpl, budgetBytes: full.length, highWaterPct: 0.8
        }));

        expect(result.steps).toHaveLength(1);
        expect(result.steps[0]).toMatchObject({ code: 'AAAAAAAA', from: 'full', to: 'demoted' });
        expect(result.steps[0].error).toBeUndefined();
        expect(result.steps[0].reclaimed).toBeGreaterThan(0);
        expect(target.puts).toHaveLength(1);
        expect(target.puts[0].body.length).toBeLessThan(full.length);
        expect(result.after).toBeLessThan(result.before);
        expect(readLedger(store)[0]).toMatchObject({ stage: 'demoted', bytes: target.puts[0].body.length });
    });

    // Rule 1 in the module header. A stage that says `full` over replay-less
    // bytes is a broken report; the reverse merely wastes space until the next run.
    it('moves the pointer stage before it touches any bytes', async () => {
        const full = gzipSync(Buffer.from(JSON.stringify(report(400))));
        const store = fakeStore([entry({ bytes: full.length })]);
        const target = fakeTarget();
        const fetchImpl = fakeFetch({ 'https://u.github.io/f/shares/a.json.gz': full }, { patchStatus: 400 });

        const result = await reclaimShareSpace(deps({ store, target, fetchImpl, budgetBytes: 100 }));

        expect(result.steps[0].error).toBeTruthy();
        expect(target.puts).toEqual([]);
        expect(readLedger(store)[0].stage).toBe('full');
    });

    it('tombstones by deleting the object once demoting is not enough', async () => {
        const store = fakeStore([entry({ bytes: 1000, stage: 'demoted' })]);
        const target = fakeTarget();
        const fetchImpl = fakeFetch({});

        const result = await reclaimShareSpace(deps({ store, target, fetchImpl, budgetBytes: 100 }));

        expect(result.steps[0]).toMatchObject({ from: 'demoted', to: 'tombstone', reclaimed: 1000 });
        expect(target.deletes).toEqual(['shares/a.json.gz']);
        expect(readLedger(store)[0]).toMatchObject({ stage: 'tombstone', bytes: 0 });
        expect(result.after).toBe(0);
    });

    it('tombstones the pointer but reports zero reclaimed when the target cannot delete', async () => {
        const store = fakeStore([entry({ bytes: 1000, stage: 'demoted' })]);
        const target: ShareTarget = { putObject: async () => ({ success: true, url: 'https://x/y' }) };
        const result = await reclaimShareSpace(deps({ store, target, fetchImpl: fakeFetch({}), budgetBytes: 100 }));

        expect(result.steps[0].reclaimed).toBe(0);
        expect(result.steps[0].error).toMatch(/cannot remove objects/);
        expect(readLedger(store)[0]).toMatchObject({ stage: 'tombstone', bytes: 1000 });
    });

    // One unreachable report must not abort the run: the alternative leaves the
    // user over budget with no recourse.
    it('skips a report it cannot fetch and keeps going', async () => {
        const full = gzipSync(Buffer.from(JSON.stringify(report(400))));
        const store = fakeStore([
            entry({ code: 'AAAAAAAA', key: 'k1', loc: 'https://u.github.io/f/gone.json.gz', bytes: 5000 }),
            entry({ code: 'BBBBBBBB', key: 'k2', loc: 'https://u.github.io/f/ok.json.gz', bytes: full.length })
        ]);
        const target = fakeTarget();
        const fetchImpl = fakeFetch({ 'https://u.github.io/f/ok.json.gz': full });

        const result = await reclaimShareSpace(deps({ store, target, fetchImpl, budgetBytes: 100 }));

        // The unreachable report fails, the reachable one still gets rewritten.
        // (The budget here is tight enough that pass 2 then tombstones as well,
        // which is the ladder working, not a third failure.)
        expect(result.steps[0].error).toMatch(/Could not fetch/);
        expect(result.steps[0].reclaimed).toBe(0);
        expect(result.steps[1].error).toBeUndefined();
        expect(target.puts.map((p) => p.key)).toEqual(['k2']);
    });

    // A rewrite that grew the object means there was no replay to drop.
    it('does not re-upload when stripping would not shrink the report', async () => {
        const bare = gzipSync(Buffer.from(JSON.stringify({ players: [], targets: [], statsAll: [] })));
        const store = fakeStore([entry({ bytes: bare.length })]);
        const target = fakeTarget();
        const fetchImpl = fakeFetch({ 'https://u.github.io/f/shares/a.json.gz': bare });

        const result = await reclaimShareSpace(deps({ store, target, fetchImpl, budgetBytes: 10 }));

        expect(target.puts).toEqual([]);
        expect(result.steps[0]).toMatchObject({ from: 'full', to: 'demoted', reclaimed: 0 });
    });

    it('reports still-over-budget when everything left is pinned', async () => {
        const store = fakeStore([entry({ bytes: 5000, pinned: true })]);
        const result = await reclaimShareSpace(deps({
            store, target: fakeTarget(), fetchImpl: fakeFetch({}), budgetBytes: 100
        }));

        expect(result.steps).toEqual([]);
        expect(result.stillOverBudget).toBe(true);
    });

    it('evicts the least-recently-seen report first', async () => {
        const full = gzipSync(Buffer.from(JSON.stringify(report(400))));
        const store = fakeStore([
            entry({ code: 'RECENT00', key: 'k1', loc: 'https://u.github.io/f/1.json.gz', bytes: full.length }),
            entry({ code: 'STALE000', key: 'k2', loc: 'https://u.github.io/f/2.json.gz', bytes: full.length })
        ]);
        const target = fakeTarget();
        const fetchImpl = fakeFetch(
            { 'https://u.github.io/f/1.json.gz': full, 'https://u.github.io/f/2.json.gz': full },
            { seen: { RECENT00: 2000, STALE000: 1000 } }
        );

        // A budget that only forces ONE demote, so the order is observable.
        const result = await reclaimShareSpace(deps({
            store, target, fetchImpl, budgetBytes: Math.round(full.length * 1.9), highWaterPct: 1
        }));

        expect(result.steps[0].code).toBe('STALE000');
    });
});

describe('fetchSeen', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('returns the Worker’s timestamps keyed by code', async () => {
        const fetchImpl = vi.fn(async () => new Response(
            JSON.stringify({ meta: { AAAAAAAA: { seen: 1700 }, BBBBBBBB: { seen: null } } }), { status: 200 }
        ));
        const seen = await fetchSeen(['AAAAAAAA', 'BBBBBBBB'], {
            githubToken: 'gho_x', fetchImpl: fetchImpl as any, workerUrl: WORKER
        });
        expect(seen).toEqual({ AAAAAAAA: 1700, BBBBBBBB: null });
    });

    it('posts to /r/meta with the bearer token', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ meta: {} }), { status: 200 }));
        await fetchSeen(['AAAAAAAA'], { githubToken: 'gho_x', fetchImpl: fetchImpl as any, workerUrl: WORKER });
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://bridge.axi.link/r/meta');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gho_x');
    });

    it('chunks a batch larger than the Worker’s cap', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ meta: {} }), { status: 200 }));
        const codes = Array.from({ length: 501 }, (_, i) => `C${String(i).padStart(7, '0')}`);
        await fetchSeen(codes, { githubToken: 'gho_x', fetchImpl: fetchImpl as any, workerUrl: WORKER });
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    // A retention hint must never be load-bearing: no timestamps just means
    // every entry ranks as never-opened, which is the safe direction.
    it('swallows a network failure and a non-200', async () => {
        const thrower = vi.fn(async () => { throw new Error('offline'); });
        await expect(fetchSeen(['AAAAAAAA'], {
            githubToken: 'gho_x', fetchImpl: thrower as any, workerUrl: WORKER
        })).resolves.toEqual({});

        const rejecting = vi.fn(async () => new Response('{}', { status: 429 }));
        await expect(fetchSeen(['AAAAAAAA'], {
            githubToken: 'gho_x', fetchImpl: rejecting as any, workerUrl: WORKER
        })).resolves.toEqual({});
    });

    it('skips the round-trip entirely with no token or no codes', async () => {
        const fetchImpl = vi.fn();
        expect(await fetchSeen([], { githubToken: 'gho_x', fetchImpl: fetchImpl as any })).toEqual({});
        expect(await fetchSeen(['AAAAAAAA'], { githubToken: null, fetchImpl: fetchImpl as any })).toEqual({});
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
