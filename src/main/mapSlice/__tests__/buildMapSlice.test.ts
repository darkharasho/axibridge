import { describe, it, expect, vi } from 'vitest';
import { buildMapSlice, __resolvePendingForTest } from '../index';

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
        // Force a valid draw list by stubbing the geometry module.
        const d = deps({ requestPaint: vi.fn(() => true) });
        vi.doMock('../../../shared/sliceGeometry', async (orig) => ({
            ...(await orig() as any),
            buildSliceDrawList: () => ({ width: 10, height: 10, tiles: [{ url: 'x', x: 0, y: 0, width: 1, height: 1 }], path: [[0, 0]], caption: null }),
        }));
        const { buildMapSlice: fresh } = await import('../index');
        expect(await fresh({}, 'Eternal Battlegrounds', d)).toBeNull();
        vi.doUnmock('../../../shared/sliceGeometry');
    });

    it('returns null when there is no window to paint in', async () => {
        const d = deps({ requestPaint: vi.fn(() => false) });
        expect(await buildMapSlice({}, 'Eternal Battlegrounds', d)).toBeNull();
    });
});
