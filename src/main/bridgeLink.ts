import axios from 'axios';
import { parseBridgeKey } from './axiToolsKey';

export type LinkResult =
    | {
          ok: true;
          relayUrl: string;
          guildName: string;
          channelName: string;
          // N3: `/bridge/whoami` returns these alongside the display names.
          // They are the stable key for re-link matching (names can be
          // renamed or collide across guilds); they are not secrets.
          guildId: string;
          channelId: string;
      }
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
    // Fix round 1, item 12 (partial): a relay URL with a trailing slash
    // would otherwise produce `https://host//bridge/whoami`.
    const relayUrl = parsed.relayUrl.replace(/\/+$/, '');
    try {
        const response = await axios.get(`${relayUrl}/bridge/whoami`, {
            headers: { Authorization: `Bearer ${key.trim()}` },
            timeout: 10_000
        });
        return {
            ok: true,
            relayUrl,
            guildName: String(response.data?.guild_name ?? 'Unknown server'),
            channelName: String(response.data?.channel_name ?? 'unknown-channel'),
            guildId: String(response.data?.guild_id ?? ''),
            channelId: String(response.data?.channel_id ?? '')
        };
    } catch (error: any) {
        return { ok: false, error: String(error?.response?.data?.error ?? error?.message ?? error) };
    }
}
