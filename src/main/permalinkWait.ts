import type { UploadResult } from './uploader';

/**
 * How long the local-parser path waits on the parallel dps.report upload before
 * posting to Discord without a permalink.
 *
 * The upload is kicked off at the top of processLogFile, in parallel with the
 * local parse, so by the time the parse finishes it has usually already
 * resolved. This bound only covers dps.report being slow or down, where a
 * link-less embed beats a Discord post that never arrives.
 */
export const DISCORD_PERMALINK_WAIT_MS = 20_000;

/**
 * Resolve the dps.report permalink from an in-flight upload, or '' if it fails,
 * errors, or takes longer than `timeoutMs`. Never rejects.
 */
export const waitForPermalink = async (
    pending: Promise<UploadResult | null> | null | undefined,
    timeoutMs: number = DISCORD_PERMALINK_WAIT_MS
): Promise<string> => {
    if (!pending) return '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const result = await Promise.race([
            pending,
            new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), timeoutMs);
            })
        ]);
        if (!result || result.error) return '';
        return typeof result.permalink === 'string' ? result.permalink.trim() : '';
    } catch {
        return '';
    } finally {
        if (timer) clearTimeout(timer);
    }
};
