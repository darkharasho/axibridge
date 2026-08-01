import { partitionSquadPlayers } from './playerIdentity';

const ZERO_GUILD_ID = '00000000-0000-0000-0000-000000000000';

/**
 * The squad's most common guild ids (uppercased, up to 3, by member count).
 * Used to auto-detect the WvW match via the GW2 guild→team mapping — squad
 * members' guilds identify the team far more reliably than anything else the
 * log contains (arcdps records no world/team identity beyond map colour).
 * Shared between the main process (parse-time extraction) and the renderer
 * (backfill from cached details for logs parsed before extraction existed).
 * Pure — no I/O.
 */
export const extractSquadGuilds = (details: any): string[] | undefined => {
    const players: any[] = Array.isArray(details?.players) ? details.players : [];
    const counts = new Map<string, number>();
    for (const player of partitionSquadPlayers(players).squadPrimaries) {
        const guildId = typeof player?.guildID === 'string' ? player.guildID.toUpperCase() : '';
        if (!guildId || guildId === ZERO_GUILD_ID) continue;
        counts.set(guildId, (counts.get(guildId) ?? 0) + 1);
    }
    if (!counts.size) return undefined;
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([guildId]) => guildId);
};
