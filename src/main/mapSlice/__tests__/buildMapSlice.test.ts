import { describe, it, expect, vi } from 'vitest';
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
        const d = deps();
        expect(await buildMapSlice({}, 'Not A WvW Map', d)).toBeNull();
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
