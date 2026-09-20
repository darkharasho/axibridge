/**
 * Parses the `#axibridge-share` boot payload the Worker embeds in the served
 * HTML (see worker/src/og.ts `renderPointerHtml`). That function guarantees
 * one of exactly two shapes: the literal text `null` (tombstone — nothing to
 * fetch), or a JSON object `{ loc, stage }` where `stage` is `"full"` or
 * `"demoted"`. Everything else (missing element, truncated/invalid JSON,
 * an object missing the required fields) is a bug or tampering and must fail
 * loudly rather than render a blank page.
 */

export interface ShareBootPayload {
    loc: string;
    stage: 'full' | 'demoted';
}

export class ShareBootPayloadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ShareBootPayloadError';
    }
}

/**
 * @param raw The `textContent` of the `#axibridge-share` script element, or
 *   `null` if the element itself was not found in the document.
 */
export const parseShareBootPayload = (raw: string | null): ShareBootPayload | null => {
    if (raw === null) {
        throw new ShareBootPayloadError(
            'This page is missing its share data (#axibridge-share was not found). The link may be broken.'
        );
    }

    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        throw new ShareBootPayloadError('This page’s share data was empty.');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        throw new ShareBootPayloadError('This page’s share data is not valid JSON.');
    }

    if (parsed === null) {
        // Tombstone: the report is gone, nothing to fetch.
        return null;
    }

    if (
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        typeof (parsed as Record<string, unknown>).loc !== 'string' ||
        ((parsed as Record<string, unknown>).stage !== 'full' && (parsed as Record<string, unknown>).stage !== 'demoted')
    ) {
        throw new ShareBootPayloadError('This page’s share data is missing required fields.');
    }

    return parsed as ShareBootPayload;
};
