import { useEffect } from 'react';
import { paintSlice } from './paintSlice';

/**
 * Answers main's slice-paint requests for the lifetime of the app.
 *
 * Main owns the geometry and the tiles; this is the only place in the
 * renderer that touches the slice at all. Mount it exactly once.
 */
export function useMapSlicePainter(): void {
    useEffect(() => {
        const api = window.electronAPI;
        if (!api?.onMapSlicePaint) return;
        return api.onMapSlicePaint(async ({ requestId, drawList }) => {
            let png: Uint8Array | null = null;
            try {
                png = await paintSlice(drawList);
            } catch {
                png = null;
            }
            // Always reply: main is holding a pending promise on this id.
            api.sendMapSliceResult({ requestId, png });
        });
    }, []);
}
