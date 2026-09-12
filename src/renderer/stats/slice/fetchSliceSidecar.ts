import { SLICE_SIDECAR_VERSION, type SliceSidecar } from './sliceTypes';
import { inflateGzipToText } from '../utils/fetchParts';

export type FetchSliceResult =
    | { ok: true; sidecar: SliceSidecar }
    | { ok: false; reason: "network" | "version" | "settings" | "malformed"; message: string };

/**
 * Fetch and validate a published report's slice sidecar.
 *
 * Never called on report load — only when the viewer opens the slice tray or
 * lands on a `slice=` URL. A version or settings mismatch disables slicing
 * rather than rendering numbers computed under different settings.
 */
export async function fetchSliceSidecar(
    url: string,
    expectedSettingsHash: string | null,
): Promise<FetchSliceResult> {
    let buffer: ArrayBuffer;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return { ok: false, reason: "network", message: `Slice data unavailable (HTTP ${response.status}).` };
        }
        buffer = await response.arrayBuffer();
    } catch (err) {
        return {
            ok: false,
            reason: "network",
            message: `Could not load slice data: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    let sidecar: SliceSidecar;
    try {
        sidecar = JSON.parse(await inflateGzipToText(buffer));
    } catch {
        return { ok: false, reason: "malformed", message: "Slice data could not be read." };
    }

    if (sidecar?.version !== SLICE_SIDECAR_VERSION) {
        return {
            ok: false,
            reason: "version",
            message: "This report's slice data was published by a different app version.",
        };
    }
    if (!Array.isArray(sidecar.fights) || !Array.isArray(sidecar.frames)
        || sidecar.fights.length === 0 || sidecar.fights.length !== sidecar.frames.length) {
        return { ok: false, reason: "malformed", message: "Slice data is incomplete." };
    }
    if (expectedSettingsHash && sidecar.settingsHash !== expectedSettingsHash) {
        return {
            ok: false,
            reason: "settings",
            message: "Slice data does not match this report's settings — slicing is unavailable.",
        };
    }
    return { ok: true, sidecar };
}
