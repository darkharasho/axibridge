import { randomUUID } from 'node:crypto';
import { buildSliceDrawList, type SliceDrawList } from '../../shared/sliceGeometry';
import { resolveTiles } from './tileCache';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface BuildMapSliceDeps {
    /** Send the paint request to the renderer; `false` when no window exists. */
    requestPaint: (requestId: string, drawList: SliceDrawList) => boolean;
    cacheDir: string;
    timeoutMs?: number;
    resolveTilesFn?: typeof resolveTiles;
}

type Pending = (png: Uint8Array | null) => void;
const pending = new Map<string, Pending>();

/** Wire up the renderer's reply channel. Call once during app setup. */
export function registerMapSliceResult(ipcMain: Electron.IpcMain): void {
    ipcMain.on('map-slice:result', (_event, payload: { requestId?: string; png?: Uint8Array | null }) => {
        const id = payload?.requestId;
        if (!id) return;
        const resolve = pending.get(id);
        if (!resolve) return;          // already timed out
        pending.delete(id);
        resolve(payload?.png ?? null);
    });
}

/** Test seam: resolve a pending request without a real renderer. */
export function __resolvePendingForTest(requestId: string, png: Uint8Array | null): void {
    const resolve = pending.get(requestId);
    if (!resolve) return;
    pending.delete(requestId);
    resolve(png);
}

/**
 * The map slice for a fight, or `null` when one cannot be produced.
 *
 * Never throws and never rejects. The slice is decorative: a missing image
 * must cost the report nothing.
 */
export async function buildMapSlice(
    details: any,
    zone: string,
    deps: BuildMapSliceDeps,
): Promise<Buffer | null> {
    try {
        const drawList = buildSliceDrawList(details, zone);
        if (!drawList) return null;

        const resolveTilesFn = deps.resolveTilesFn ?? resolveTiles;
        const tiles = await resolveTilesFn(drawList.tiles, { cacheDir: deps.cacheDir });
        if (tiles.length === 0) {
            console.warn('[MapSlice] no tiles could be fetched; skipping the image.');
            return null;
        }

        const requestId = randomUUID();
        const png = await new Promise<Uint8Array | null>((resolve) => {
            const timer = setTimeout(() => {
                if (!pending.delete(requestId)) return;
                console.warn('[MapSlice] renderer did not answer in time; skipping the image.');
                resolve(null);
            }, deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);

            pending.set(requestId, (result) => {
                clearTimeout(timer);
                resolve(result);
            });

            if (!deps.requestPaint(requestId, { ...drawList, tiles })) {
                clearTimeout(timer);
                pending.delete(requestId);
                resolve(null);
            }
        });

        if (!png?.length) return null;
        return Buffer.from(png);
    } catch (err) {
        console.warn('[MapSlice] slice build failed; skipping the image.', err);
        return null;
    }
}
