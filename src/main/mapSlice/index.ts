import { randomUUID } from 'node:crypto';
import { buildSliceDrawList, type SliceDrawList } from '../../shared/sliceGeometry';
import { resolveTiles } from './tileCache';

/**
 * ONE overall wall-clock budget for the whole slice build.
 *
 * Tile resolution and the renderer round trip run sequentially, so two
 * independent deadlines (8s + 10s) meant a worst case of ~18s of blocking
 * latency on every report — e.g. right after app start, where `win` exists
 * and `requestPaint` returns true but `useMapSlicePainter` has not mounted,
 * so no reply ever comes and the full paint timeout is spent on top of the
 * tile deadline. A single budget makes the worst case the budget.
 */
const DEFAULT_BUDGET_MS = 8000;

export interface BuildMapSliceDeps {
    /** Send the paint request to the renderer; `false` when no window exists. */
    requestPaint: (requestId: string, drawList: SliceDrawList) => boolean;
    cacheDir: string;
    /** Explicit override for the paint wait only. Omit in production: the
     *  paint wait is then whatever is left of `budgetMs`. */
    timeoutMs?: number;
    /** Overall wall-clock budget for tiles + paint. Defaults to 8s. */
    budgetMs?: number;
    resolveTilesFn?: typeof resolveTiles;
    /** Injection seam for tests: lets the skip paths past `buildSliceDrawList`
     *  be exercised without a real position track. Production callers omit it. */
    buildDrawListFn?: typeof buildSliceDrawList;
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
    const startedAt = Date.now();
    const budgetMs = deps.budgetMs ?? DEFAULT_BUDGET_MS;
    const remainingBudget = () => Math.max(0, budgetMs - (Date.now() - startedAt));

    try {
        const buildDrawListFn = deps.buildDrawListFn ?? buildSliceDrawList;
        const drawList = buildDrawListFn(details, zone);
        if (!drawList) return null;

        const resolveTilesFn = deps.resolveTilesFn ?? resolveTiles;
        const tiles = await resolveTilesFn(drawList.tiles, {
            cacheDir: deps.cacheDir,
            deadlineMs: remainingBudget(),
        });
        if (tiles.length === 0) {
            console.warn('[MapSlice] no tiles could be fetched; skipping the image.');
            return null;
        }

        // Whatever the tiles did not spend is what the paint wait gets. Nothing
        // left means skip the image rather than paint past the budget.
        const paintTimeoutMs = deps.timeoutMs ?? remainingBudget();
        if (paintTimeoutMs <= 0) {
            console.warn('[MapSlice] budget exhausted fetching tiles; skipping the image.');
            return null;
        }

        const requestId = randomUUID();
        const png = await new Promise<Uint8Array | null>((resolve) => {
            const timer = setTimeout(() => {
                if (!pending.delete(requestId)) return;
                console.warn('[MapSlice] renderer did not answer in time; skipping the image.');
                resolve(null);
            }, paintTimeoutMs);

            pending.set(requestId, (result) => {
                clearTimeout(timer);
                resolve(result);
            });

            try {
                if (!deps.requestPaint(requestId, { ...drawList, tiles })) {
                    clearTimeout(timer);
                    pending.delete(requestId);
                    resolve(null);
                }
            } catch (err) {
                clearTimeout(timer);
                pending.delete(requestId);
                console.warn('[MapSlice] requestPaint threw; skipping the image.', err);
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
