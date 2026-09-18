import axios from 'axios';
import { parseBridgeKey } from './axiToolsKey';

export type LinkResult =
    | { ok: true; relayUrl: string; guildName: string; channelName: string }
    | { ok: false; error: string };

/**
 * Validate an axb1 key against its relay at paste time.
 *
 * Checking now rather than at first send means a typo'd key surfaces
 * immediately, not three hours later when a raid's reports never appear.
 */
export async function linkBridgeChannel(key: string): Promise<LinkResult> {
    const parsed = parseBridgeKey(key);
    if (!parsed) {
        return { ok: false, error: 'That does not look like an AxiTools bridge key (axb1.…).' };
    }
    try {
        const response = await axios.get(`${parsed.relayUrl}/bridge/whoami`, {
            headers: { Authorization: `Bearer ${key.trim()}` },
            timeout: 10_000
        });
        return {
            ok: true,
            relayUrl: parsed.relayUrl,
            guildName: String(response.data?.guild_name ?? 'Unknown server'),
            channelName: String(response.data?.channel_name ?? 'unknown-channel')
        };
    } catch (error: any) {
        return { ok: false, error: String(error?.response?.data?.error ?? error?.message ?? error) };
    }
}
