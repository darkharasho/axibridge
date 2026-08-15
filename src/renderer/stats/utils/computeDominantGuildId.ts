import { computePrimaryCommanderIdentity } from './computePrimaryCommander';

const ZERO_GUILD_ID = '00000000-0000-0000-0000-000000000000';

/** First guild repped by an account in a given log ('' when unrepped/absent).
 *  EI emits one players[] entry per agent instance (relog/build swap), so the
 *  first entry wins, matching how commander votes are counted. */
const guildReppedInLog = (details: any, voteKeys: string[]): string => {
    const players = (details?.players || []) as any[];
    for (const player of players) {
        if (player?.notInSquad) continue;
        const key = player?.account || player?.name;
        if (!key || !voteKeys.includes(key)) continue;
        const guildId = typeof player?.guildID === 'string' ? player.guildID : '';
        return guildId && guildId.toUpperCase() !== ZERO_GUILD_ID ? guildId : '';
    }
    return '';
};

/** The session's guild: the guild the primary commander repped in the most
 *  logs (one vote per log; ties break alphabetically by guild id). Falls back
 *  to the squad-wide vote when nobody tagged or the commander never repped.
 *  Returns '' when no guild is represented at all. */
export const computeDominantGuildId = (detailsList: any[]): string => {
    const commander = computePrimaryCommanderIdentity(detailsList);
    const commanderKeys = [commander.account, commander.name].filter(Boolean);

    if (commanderKeys.length) {
        const counts = new Map<string, number>();
        detailsList.forEach((details) => {
            const guildId = guildReppedInLog(details, commanderKeys);
            if (!guildId) return;
            counts.set(guildId, (counts.get(guildId) || 0) + 1);
        });
        const commanderGuild = pickBest(counts);
        if (commanderGuild) return commanderGuild;
    }

    // No commander, or the commander repped nothing: fall back to the squad's
    // most-repped guild so pug sessions still get a guild on the report.
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
            if (!guildId || guildId.toUpperCase() === ZERO_GUILD_ID) return;
            counts.set(guildId, (counts.get(guildId) || 0) + 1);
        });
    });
    return pickBest(counts);
};

/** Highest count wins; ties break alphabetically by guild id. */
const pickBest = (counts: Map<string, number>): string => {
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
