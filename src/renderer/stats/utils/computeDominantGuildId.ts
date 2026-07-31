/** Dominant represented guild across a session's logs: each squad account's
 *  first entry per log casts one vote for the guild it represents
 *  (player.guildID); unrepped players are skipped. Ties break alphabetically
 *  by guild id. Returns '' when nobody repped a guild. */
export const computeDominantGuildId = (detailsList: any[]): string => {
    const counts = new Map<string, number>();
    detailsList.forEach((details) => {
        const players = (details?.players || []) as any[];
        const seenThisLog = new Set<string>();
        players.forEach((player) => {
            if (player?.notInSquad) return;
            const voteKey = player?.account || player?.name;
            if (!voteKey || seenThisLog.has(voteKey)) return;
            seenThisLog.add(voteKey);
            const guildId = typeof player?.guildID === 'string' ? player.guildID : '';
            if (!guildId) return;
            counts.set(guildId, (counts.get(guildId) || 0) + 1);
        });
    });
    let best = '';
    let bestCount = 0;
    Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([guildId, count]) => {
            if (count > bestCount) {
                best = guildId;
                bestCount = count;
            }
        });
    return best;
};
