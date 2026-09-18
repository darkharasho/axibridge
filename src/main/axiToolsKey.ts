/**
 * Parsing for AxiTools bridge keys: `axb1.<base64url(relayUrl)>.<secret>`.
 *
 * The relay URL travels inside the credential so a user never types it and the
 * relay can move hostnames by reissuing keys.
 */

const PREFIX = 'axb1';
const MIN_SECRET_LENGTH = 32;

export function parseBridgeKey(key: string): { relayUrl: string } | null {
    const parts = (key || '').trim().split('.');
    if (parts.length !== 3) return null;

    const [prefix, encodedUrl, secret] = parts;
    if (prefix !== PREFIX) return null;
    if (!secret || secret.length < MIN_SECRET_LENGTH) return null;

    let relayUrl: string;
    try {
        relayUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8');
    } catch {
        return null;
    }
    if (!/^https?:\/\/\S+$/.test(relayUrl)) return null;

    return { relayUrl };
}
