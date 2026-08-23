import { SLICE_SIDECAR_VERSION, type SliceSidecar } from './sliceTypes';

export type FetchSliceResult =
    | { ok: true; sidecar: SliceSidecar }
    | { ok: false; reason: "network" | "version" | "settings" | "malformed"; message: string };

/**
 * Inflate gzipped bytes in the browser.
 *
 * R2 serves the sidecar as `application/gzip` with no `Content-Encoding`, so
 * the browser does NOT transparently inflate it — these are the compressed
 * bytes and this is where they are decompressed. Node's test environment
 * provides DecompressionStream from Node 18 on, so the same path runs in tests.
 */
const inflate = async (buffer: ArrayBuffer): Promise<string> => {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
};

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
        sidecar = JSON.parse(await inflate(buffer));
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
