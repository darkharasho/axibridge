import { squadEntities, getEntityAccountKey, type NativeReportLike } from '@axiapps/bridge-metrics';
import { computePrimaryCommanderIdentity } from './computePrimaryCommander';

const ZERO_GUILD_ID = '00000000-0000-0000-0000-000000000000';

/**
 * `computePrimaryCommanderIdentity` still takes EI-shaped input and is read by
 * callers not yet converted, so we project the native entities into the three
 * fields it reads rather than migrating it here.
 *
 * This is a deliberate, scoped, one-function bridge — not the general
 * `eiToNative()` adapter the migration spec rejects.
 */
// TODO(unit 8): delete this shim when computePrimaryCommanderIdentity moves to native.
const commanderShim = (report: NativeReportLike) => ({
    players: squadEntities(report).map((e) => ({
        account: e.account,
        name: e.character,
        hasCommanderTag: Boolean((e as any).commander),
    })),
});

/** First guild repped by an account in a given log ('' when unrepped/absent).
 *  axilog emits one entity per account — it dedupes relogs and build swaps
 *  upstream, collecting agent addrs — so there is nothing to collapse here. */
const guildReppedInLog = (report: NativeReportLike, voteKeys: string[]): string => {
    for (const entity of squadEntities(report)) {
        const key = entity?.account || entity?.character;
        if (!key || !voteKeys.includes(key)) continue;
        const guildId = typeof entity?.guild_id === 'string' ? entity.guild_id : '';
        return guildId && guildId.toUpperCase() !== ZERO_GUILD_ID ? guildId : '';
    }
    return '';
};

/** The session's guild: the guild the primary commander repped in the most
 *  logs (one vote per log; ties break alphabetically by guild id). Falls back
 *  to the squad-wide vote when nobody tagged or the commander never repped.
 *  Returns '' when no guild is represented at all. */
export const computeDominantGuildId = (reports: NativeReportLike[]): string => {
    const commander = computePrimaryCommanderIdentity(reports.map(commanderShim));
    const commanderKeys = [commander.account, commander.name].filter(Boolean);

    if (commanderKeys.length) {
        const counts = new Map<string, number>();
        reports.forEach((report) => {
            const guildId = guildReppedInLog(report, commanderKeys);
            if (!guildId) return;
            counts.set(guildId, (counts.get(guildId) || 0) + 1);
        });
        const commanderGuild = pickBest(counts);
        if (commanderGuild) return commanderGuild;
    }

    // No commander, or the commander repped nothing: fall back to the squad's
    // most-repped guild so pug sessions still get a guild on the report.
    const counts = new Map<string, number>();
    reports.forEach((report) => {
        // Redundant under native's upstream dedupe, but kept so the function
        // stays correct if it is ever handed a hand-built report.
        const seenThisLog = new Set<string>();
        squadEntities(report).forEach((entity) => {
            const voteKey = getEntityAccountKey(entity);
            if (!voteKey || seenThisLog.has(voteKey)) return;
            seenThisLog.add(voteKey);
            const guildId = typeof entity?.guild_id === 'string' ? entity.guild_id : '';
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
