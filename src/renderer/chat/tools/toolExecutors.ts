import { computeStatsSync } from '../../stats/incrementalAggregation';

const METRIC_MAP: Record<string, (p: any) => number> = {
    dps:             p => p.offense?.totalFightMs > 0 ? Math.round((p.offense?.offenseTotals?.damage ?? 0) / (p.offense.totalFightMs / 1000)) : 0,
    damage:          p => p.offense?.offenseTotals?.damage ?? 0,
    deaths:          p => p.defense?.defenseTotals?.deadCount ?? 0,
    downs:           p => p.defense?.defenseTotals?.downCount ?? 0,
    damage_taken:    p => p.defense?.defenseTotals?.damageTaken ?? 0,
    cleanses:        p => (p.support?.supportTotals?.condiCleanse ?? 0) + (p.support?.supportTotals?.condiCleanseSelf ?? 0),
    strips:          p => p.support?.supportTotals?.boonStrips ?? 0,
    rezzes:          p => p.support?.supportTotals?.resurrects ?? 0,
    breakbar_damage: p => p.offense?.offenseTotals?.breakbarDamage ?? 0,
    dist_to_tag:     p => p.general?.distCount > 0 ? Math.round((p.general?.totalDist ?? 0) / p.general.distCount) : 0,
    // Boon uptimes: not in computed stats rows — return 0 until a better source is available
    stability_uptime:  () => 0,
    quickness_uptime:  () => 0,
    alacrity_uptime:   () => 0,
    might_uptime:      () => 0,
};

const BOON_IDS: Record<string, number> = {
    stability: 726, quickness: 1187, alacrity: 30328, might: 1,
    fury: 5, swiftness: 725, protection: 743, aegis: 717,
    regeneration: 718, vigor: 719, resolution: 873, resistance: 26980,
};
const BOON_ID_TO_NAME = new Map(Object.entries(BOON_IDS).map(([k, v]) => [v, k]));
BOON_ID_TO_NAME.set(1122, 'stability'); // stability rework alt ID

function buildPlayerMap(stats: any): Map<string, { account: string; profession: string; professionList?: string[]; offense?: any; defense?: any; support?: any; general?: any }> {
    const map = new Map<string, any>();
    const merge = (rows: any[] = [], key: string) => {
        for (const r of rows) {
            if (!map.has(r.account)) map.set(r.account, { account: r.account, profession: r.profession, professionList: r.professionList });
            map.get(r.account)[key] = r;
        }
    };
    merge(stats?.offensePlayers, 'offense');
    merge(stats?.defensePlayers, 'defense');
    merge(stats?.supportPlayers, 'support');
    merge(stats?.generalPlayers, 'general');
    return map;
}

type Executor = (args: Record<string, any>, logs: ILogData[], getDetails: (id: string) => any, computedStats: any) => Record<string, any>;

function loadedFights(logs: ILogData[], fightIndex?: number): ILogData[] {
    const loaded = logs.filter(l => l.detailsStatus === 'loaded');
    if (fightIndex != null) return loaded[fightIndex] ? [loaded[fightIndex]] : [];
    return loaded;
}

const executors: Record<string, Executor> = {
    rank_players(args, logs, getDetails, computedStats) {
        const { metric, fight_index } = args;
        const extractor = METRIC_MAP[metric];
        if (!extractor) return { error: 'Unknown metric', valid_metrics: Object.keys(METRIC_MAP) };

        let statsToUse = computedStats;
        if (fight_index != null) {
            const fights = loadedFights(logs, fight_index);
            const fight = fights[0];
            if (!fight) return { error: 'Fight index out of range' };
            const details = (fight as any).details ?? getDetails(fight.id) ?? getDetails(fight.filePath);
            if (!details) return { error: 'Fight details not available' };
            const { stats } = computeStatsSync({ logs: [{ ...fight, details }] });
            statsToUse = stats;
        }

        const playerMap = buildPlayerMap(statsToUse);
        const ranked = Array.from(playerMap.values())
            .map(p => ({ name: p.account, profession: p.profession, value: extractor(p), metric }))
            .filter(p => p.value > 0 || metric === 'deaths' || metric === 'downs')
            .sort((a, b) => b.value - a.value);

        return { metric, ranked: ranked.slice(0, 30) };
    },

    player_deep_dive(args, logs, getDetails, computedStats) {
        const { character_name, fight_index } = args;
        const query = String(character_name).toLowerCase();

        let statsToUse = computedStats;
        if (fight_index != null) {
            const fights = loadedFights(logs, fight_index);
            const fight = fights[0];
            if (!fight) return { error: 'Fight index out of range' };
            const details = (fight as any).details ?? getDetails(fight.id) ?? getDetails(fight.filePath);
            if (!details) return { error: 'Fight details not available' };
            const { stats } = computeStatsSync({ logs: [{ ...fight, details }] });
            statsToUse = stats;
        }

        const playerMap = buildPlayerMap(statsToUse);
        const matches = Array.from(playerMap.entries())
            .filter(([account]) => account.toLowerCase().includes(query))
            .map(([account, p]) => ({
                account,
                profession: p.profession,
                damage: p.offense?.offenseTotals?.damage ?? 0,
                dps: p.offense?.totalFightMs > 0 ? Math.round((p.offense?.offenseTotals?.damage ?? 0) / (p.offense.totalFightMs / 1000)) : 0,
                deaths: p.defense?.defenseTotals?.deadCount ?? 0,
                downs: p.defense?.defenseTotals?.downCount ?? 0,
                damageTaken: p.defense?.defenseTotals?.damageTaken ?? 0,
                cleanses: (p.support?.supportTotals?.condiCleanse ?? 0) + (p.support?.supportTotals?.condiCleanseSelf ?? 0),
                strips: p.support?.supportTotals?.boonStrips ?? 0,
                rezzes: p.support?.supportTotals?.resurrects ?? 0,
                breakbarDamage: p.offense?.offenseTotals?.breakbarDamage ?? 0,
                avgDistToTag: p.general?.distCount > 0 ? Math.round((p.general?.totalDist ?? 0) / p.general.distCount) : null,
                logsJoined: p.defense?.logsJoined ?? p.support?.logsJoined ?? 1,
            }));

        if (matches.length === 0) {
            return {
                error: 'Player not found',
                available_players: Array.from(playerMap.keys()).slice(0, 20),
            };
        }
        return { results: matches };
    },

    boon_analysis(args, logs, getDetails) {
        const { fight_index, boon_name } = args;
        const targetIds = boon_name
            ? (() => {
                const id = BOON_IDS[String(boon_name).toLowerCase()];
                if (!id) return [];
                return id === 726 ? [726, 1122] : [id]; // stability has two IDs
            })()
            : Array.from(BOON_ID_TO_NAME.keys());

        const fights = loadedFights(logs, fight_index);
        const result = fights.map(log => {
            const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
            const players = (details?.players ?? []).map((p: any) => {
                const boons: Record<string, number> = {};
                for (const b of p.buffUptimes ?? []) {
                    if (targetIds.includes(b.id)) {
                        const name = BOON_ID_TO_NAME.get(b.id) ?? String(b.id);
                        boons[name] = Math.round((b.buffData?.[0]?.uptime ?? 0) * 100);
                    }
                }
                return { name: p.character_name || p.display_name, profession: p.profession, boons };
            }).filter((p: any) => Object.keys(p.boons).length > 0);
            return { fight: log.fightName ?? log.id, players };
        });

        return { boon_name: boon_name ?? 'all', fights: result };
    },

    group_breakdown(args, logs, getDetails) {
        const { fight_index } = args;
        const fights = loadedFights(logs, fight_index);
        const result = fights.map(log => {
            const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
            const byGroup = new Map<number, any[]>();
            for (const p of details?.players ?? []) {
                const g = p.group ?? 0;
                if (!byGroup.has(g)) byGroup.set(g, []);
                byGroup.get(g)!.push(p);
            }
            const groups = Array.from(byGroup.entries()).sort(([a], [b]) => a - b).map(([g, players]) => ({
                group: g,
                count: players.length,
                totalDamage: players.reduce((s: number, p: any) => s + (p.dpsAll?.[0]?.damage ?? 0), 0),
                totalDeaths: players.reduce((s: number, p: any) => s + (p.defenses?.[0]?.deadCount ?? 0), 0),
                totalCleanses: players.reduce((s: number, p: any) => s + (p.support?.[0]?.condiCleanse ?? 0) + (p.support?.[0]?.condiCleanseSelf ?? 0), 0),
                totalRezzes: players.reduce((s: number, p: any) => s + (p.support?.[0]?.resurrects ?? 0), 0),
                players: players.map((p: any) => p.character_name || p.display_name),
            }));
            return { fight: log.fightName ?? log.id, groups };
        });
        return { fights: result };
    },

    compare_fights(args, logs, getDetails) {
        const { metric, player_name } = args;
        const extractor = METRIC_MAP[metric];
        if (!extractor) return { error: 'Unknown metric', valid_metrics: Object.keys(METRIC_MAP) };

        const loaded = loadedFights(logs);
        const fights = loaded.map((log, i) => {
            const details = (log as any).details ?? getDetails(log.id) ?? getDetails(log.filePath);
            if (!details) return { fight_index: i, fight: log.fightName ?? log.id, value: null, error: 'details not cached' };
            const { stats } = computeStatsSync({ logs: [{ ...log, details }] });
            const playerMap = buildPlayerMap(stats);

            if (player_name) {
                const query = String(player_name).toLowerCase();
                const match = Array.from(playerMap.entries()).find(([acc]) => acc.toLowerCase().includes(query));
                return { fight_index: i, fight: log.fightName ?? log.id, value: match ? extractor(match[1]) : null };
            }

            const values = Array.from(playerMap.values()).map(extractor).filter(v => v > 0);
            const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
            const total = values.reduce((a, b) => a + b, 0);
            return { fight_index: i, fight: log.fightName ?? log.id, avg, total };
        });
        return { metric, player_name: player_name ?? null, fights };
    },
};

export function executeToolCall(
    name: string,
    args: Record<string, any>,
    logs: ILogData[],
    getDetails: (id: string) => any,
    computedStats: any,
): Record<string, any> {
    const executor = executors[name];
    if (!executor) return { error: 'Unknown tool', valid_tools: Object.keys(executors) };
    try {
        return executor(args, logs, getDetails, computedStats);
    } catch (err: any) {
        return { error: err?.message ?? 'Tool execution failed' };
    }
}
