import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMapSlice, __resolvePendingForTest } from '../index';

const VALID_DRAW_LIST = {
    width: 10,
    height: 10,
    tiles: [{ url: 'https://tiles.example/x.jpg', x: 0, y: 0, width: 1, height: 1 }],
    path: [[0, 0]] as Array<[number, number]>,
    caption: null,
};

const deps = (over: any = {}) => ({
    requestPaint: vi.fn(() => true),
    cacheDir: '/tmp/does-not-matter',
    timeoutMs: 50,
    resolveTilesFn: vi.fn(async (tiles: any[]) => tiles.map(t => ({ ...t, url: 'data:image/jpeg;base64,AA' }))),
    ...over,
});

describe('buildMapSlice', () => {
    it('returns null when there is no draw list (no positions)', async () => {
        const d = deps();
        expect(await buildMapSlice({}, 'Eternal Battlegrounds', d)).toBeNull();
        expect(d.requestPaint).not.toHaveBeenCalled();
    });

    it('returns null for an unknown map without touching the network', async () => {
        // A real native fixture (position tracks present) with a non-WvW map id
        // AND zone: `{}` would short-circuit on the no-positions check first and
        // prove nothing about the unknown-map guard. readFileSync, not a static
        // import — a static import of a fixture this size OOMs `tsc --noEmit`.
        const details = JSON.parse(readFileSync(
            join(__dirname, '../../../../test-fixtures/native/20260117-180826.json'),
            'utf8',
        ));
        details.native.encounter.map_id = 1062;
        details.native.encounter.map = 'Vale Guardian';
        details.zone = 'Vale Guardian';

        const d = deps();
        expect(await buildMapSlice(details, 'Vale Guardian', d)).toBeNull();
        expect(d.resolveTilesFn).not.toHaveBeenCalled();
    });

    it('returns null when the renderer never answers', async () => {
        const d = deps({
            requestPaint: vi.fn(() => true),
            timeoutMs: 50,
            buildDrawListFn: vi.fn(() => VALID_DRAW_LIST as any),
        });
        const start = Date.now();
        const result = await buildMapSlice({}, 'Eternal Battlegrounds', d);
        const elapsed = Date.now() - start;
        expect(result).toBeNull();
        expect(d.requestPaint).toHaveBeenCalledTimes(1);
        expect(elapsed).toBeGreaterThanOrEqual(50);
    });

    it('returns null when there is no window to paint in', async () => {
        const d = deps({
            requestPaint: vi.fn(() => false),
            buildDrawListFn: vi.fn(() => VALID_DRAW_LIST as any),
        });
        expect(await buildMapSlice({}, 'Eternal Battlegrounds', d)).toBeNull();
        expect(d.requestPaint).toHaveBeenCalledTimes(1);
    });

    it('bounds the whole build by one budget, not tiles + paint separately', async () => {
        // Tile resolution eats most of the budget; the renderer then never
        // answers (the real "window exists but the painter has not mounted"
        // case). With two independent deadlines the wait would be
        // tile-time + the full paint timeout; with one budget it is the budget.
        const budgetMs = 300;
        const tileMs = 200;
        const seenDeadlines: Array<number | undefined> = [];
        const resolveTilesFn = vi.fn(async (tiles: any[], opts: any) => {
            seenDeadlines.push(opts.deadlineMs);
            await new Promise((r) => setTimeout(r, tileMs));
            return tiles.map((t: any) => ({ ...t, url: 'data:image/jpeg;base64,AA' }));
        });

        const d = deps({
            timeoutMs: undefined,   // no override: the paint wait comes from the budget
            budgetMs,
            resolveTilesFn,
            requestPaint: vi.fn(() => true),
            buildDrawListFn: vi.fn(() => VALID_DRAW_LIST as any),
        });

        const start = Date.now();
        const result = await buildMapSlice({}, 'Eternal Battlegrounds', d);
        const elapsed = Date.now() - start;

        expect(result).toBeNull();
        expect(d.requestPaint).toHaveBeenCalledTimes(1);
        // The total is the budget (plus scheduling slack), NOT
        // tileMs + the paint timeout.
        expect(elapsed).toBeGreaterThanOrEqual(tileMs);
        expect(elapsed).toBeLessThan(budgetMs + 400);
        // resolveTiles gets the remaining budget, not its own 8s default.
        expect(seenDeadlines[0]).toBeLessThanOrEqual(budgetMs);
    }, 20_000);

    it('skips the paint request when the tiles consumed the whole budget', async () => {
        const d = deps({
            timeoutMs: undefined,
            budgetMs: 30,
            resolveTilesFn: vi.fn(async (tiles: any[]) => {
                await new Promise((r) => setTimeout(r, 80));
                return tiles.map((t: any) => ({ ...t, url: 'data:image/jpeg;base64,AA' }));
            }),
            requestPaint: vi.fn(() => true),
            buildDrawListFn: vi.fn(() => VALID_DRAW_LIST as any),
        });

        expect(await buildMapSlice({}, 'Eternal Battlegrounds', d)).toBeNull();
        expect(d.requestPaint).not.toHaveBeenCalled();
    });

    it('resolves the PNG once the renderer replies, sending resolved data: tiles', async () => {
        const d = deps({
            requestPaint: vi.fn(() => true),
            buildDrawListFn: vi.fn(() => VALID_DRAW_LIST as any),
        });
        const promise = buildMapSlice({}, 'Eternal Battlegrounds', d);

        // Let resolveTilesFn + requestPaint run before replying.
        await Promise.resolve();
        await Promise.resolve();

        expect(d.requestPaint).toHaveBeenCalledTimes(1);
        const [requestId, sentDrawList] = d.requestPaint.mock.calls[0];
        expect(sentDrawList.tiles).toEqual([
            { url: 'data:image/jpeg;base64,AA', x: 0, y: 0, width: 1, height: 1 },
        ]);

        const png = new Uint8Array([1, 2, 3, 4]);
        __resolvePendingForTest(requestId, png);

        const result = await promise;
        expect(result).toBeInstanceOf(Buffer);
        expect(Array.from(result as Buffer)).toEqual([1, 2, 3, 4]);
    });
});
