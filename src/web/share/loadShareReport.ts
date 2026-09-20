import { decodeShareBody, ShareBodyDecodeError } from './shareBodyDecode';

/**
 * Any failure fetching or making sense of the bytes at a share pointer's
 * `loc`. `loc` is cross-origin (the user's own R2 bucket or GitHub Pages
 * repo, never bridge.axi.link), so a rejected fetch here is very often a
 * CORS misconfiguration on that storage rather than a plain network outage —
 * the message says so, since that's the one thing a user/operator can
 * actually go fix.
 */
export class ShareLoadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ShareLoadError';
    }
}

export type ShareFetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

const fetchShareBytes = async (loc: string, fetchImpl: ShareFetchImpl): Promise<Uint8Array> => {
    let response: Response;
    try {
        response = await fetchImpl(loc, { cache: 'no-store' });
    } catch (err) {
        throw new ShareLoadError(
            `Could not reach the report storage location. This usually means a network problem or that the storage host has not allowed cross-origin requests from this page (CORS): ${err instanceof Error ? err.message : String(err)}`
        );
    }
    if (!response.ok) {
        throw new ShareLoadError(`The report storage location responded with HTTP ${response.status}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
};

/**
 * Fetches, decompresses, and parses the report JSON at `loc`. Kept
 * independent of any DOM/React state so it can be unit tested by mocking
 * `fetch` alone.
 */
export const loadShareReportJson = async (loc: string, fetchImpl: ShareFetchImpl = fetch): Promise<unknown> => {
    const bytes = await fetchShareBytes(loc, fetchImpl);
    const text = await decodeShareBody(bytes);
    try {
        return JSON.parse(text);
    } catch {
        throw new ShareLoadError('The report data was decoded but was not valid JSON.');
    }
};

export { ShareBodyDecodeError };
