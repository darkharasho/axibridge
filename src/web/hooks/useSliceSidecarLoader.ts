import { useCallback, useRef, useState } from 'react';
import { fetchSliceSidecar } from '../../renderer/stats/slice/fetchSliceSidecar';
import type { SliceSidecar } from '../../renderer/stats/slice/sliceTypes';

export type SliceLoadState = {
    status: 'idle' | 'loading' | 'ready' | 'unavailable';
    sidecar: SliceSidecar | null;
    message: string | null;
};

/**
 * Fetch the slice sidecar on demand.
 *
 * Extracted from `reportApp` so the two properties below can be pinned by a
 * test — inline, there was no seam and both regressed unnoticed:
 *
 * 1. `loading` carries a real message. The tray reads `fightRoster`, which
 *    stays empty until this resolves, so a silent load leaves the user staring
 *    at an empty tray for a multi-megabyte download.
 * 2. Concurrent callers share one request. A deep link and a tray click both
 *    call this, and guarding only on the settled `sidecar` let them each start
 *    their own download.
 *
 * The caller must only invoke this from a real user intent (tray open) or an
 * explicit `slice=` deep link: a cold report load has to issue ZERO sidecar
 * requests.
 */
export function useSliceSidecarLoader({ url, settingsHash, onSidecar }: {
    url: string | null | undefined;
    settingsHash: string | null;
    onSidecar: (sidecar: SliceSidecar) => void;
}): { sliceState: SliceLoadState; loadSliceSidecar: () => Promise<SliceSidecar | null> } {
    const [sliceState, setSliceState] = useState<SliceLoadState>({ status: 'idle', sidecar: null, message: null });
    const inFlightRef = useRef<Promise<SliceSidecar | null> | null>(null);
    const sidecarRef = useRef<SliceSidecar | null>(null);

    const loadSliceSidecar = useCallback((): Promise<SliceSidecar | null> => {
        if (sidecarRef.current) return Promise.resolve(sidecarRef.current);
        // A second caller joins the first request rather than starting its own.
        if (inFlightRef.current) return inFlightRef.current;
        if (!url) {
            setSliceState({ status: 'unavailable', sidecar: null, message: 'This report was published without slice data.' });
            return Promise.resolve(null);
        }
        setSliceState({ status: 'loading', sidecar: null, message: 'Loading slice data…' });
        const request = (async () => {
            try {
                const result = await fetchSliceSidecar(url, settingsHash || null);
                if (!result.ok) {
                    setSliceState({ status: 'unavailable', sidecar: null, message: result.message });
                    return null;
                }
                sidecarRef.current = result.sidecar;
                onSidecar(result.sidecar);
                setSliceState({ status: 'ready', sidecar: result.sidecar, message: null });
                return result.sidecar;
            } catch {
                setSliceState({
                    status: 'unavailable',
                    sidecar: null,
                    message: 'Could not load slice data — showing all fights.',
                });
                return null;
            } finally {
                inFlightRef.current = null;
            }
        })();
        inFlightRef.current = request;
        return request;
    }, [url, settingsHash, onSidecar]);

    return { sliceState, loadSliceSidecar };
}
