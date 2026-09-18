import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paintSlice } from '../paintSlice';
import { SLICE_WIDTH, SLICE_HEIGHT } from '../../../shared/sliceGeometry';

const drawList = (tiles: any[] = []) => ({
    width: SLICE_WIDTH, height: SLICE_HEIGHT, tiles,
    path: [[100, 100], [200, 120]] as Array<[number, number]>,
    caption: 'Anzalias Pass',
});

describe('paintSlice', () => {
    beforeEach(() => {
        // jsdom has no canvas backend; assert on the 2D calls instead of pixels.
        (globalThis as any).Image = class {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
        };
    });

    it('returns null when the canvas has no 2D context', async () => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as any);
        expect(await paintSlice(drawList() as any)).toBeNull();
    });

    it('draws each tile, the trail, and the caption', async () => {
        const ctx = {
            drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
            stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillRect: vi.fn(),
            fillText: vi.fn(), save: vi.fn(), restore: vi.fn(),
            createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            set fillStyle(_v: any) {}, set strokeStyle(_v: any) {},
            set lineWidth(_v: any) {}, set lineCap(_v: any) {},
            set font(_v: any) {}, set shadowBlur(_v: any) {}, set shadowColor(_v: any) {},
            set globalAlpha(_v: any) {},
        };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(((cb: any) => {
            cb({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
        }) as any);

        const tiles = [{ url: 'data:image/jpeg;base64,AAA', x: 0, y: 0, width: 256, height: 256 }];
        const png = await paintSlice(drawList(tiles) as any);

        expect(png).toEqual(new Uint8Array([1, 2, 3]));
        expect(ctx.drawImage).toHaveBeenCalledTimes(1);
        expect(ctx.stroke).toHaveBeenCalled();          // the trail
        expect(ctx.arc).toHaveBeenCalled();             // the beacon
        expect(ctx.fillText).toHaveBeenCalledWith('Anzalias Pass', expect.any(Number), expect.any(Number));
    });

    it('rejects a tile URL that is not a data URL', async () => {
        const ctx = { drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
            stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
            save: vi.fn(), restore: vi.fn(),
            createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
            set fillStyle(_v: any) {}, set strokeStyle(_v: any) {}, set lineWidth(_v: any) {},
            set lineCap(_v: any) {}, set font(_v: any) {}, set shadowBlur(_v: any) {},
            set shadowColor(_v: any) {}, set globalAlpha(_v: any) {} };
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as any);
        vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(((cb: any) => {
            cb({ arrayBuffer: async () => new Uint8Array([9]).buffer });
        }) as any);

        const tiles = [{ url: 'https://tiles.guildwars2.com/2/3/7/1/1.jpg', x: 0, y: 0, width: 8, height: 8 }];
        await paintSlice(drawList(tiles) as any);
        // A remote URL would taint the canvas, so it is never drawn.
        expect(ctx.drawImage).not.toHaveBeenCalled();
    });
});
