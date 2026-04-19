const METRIC_MAP: Record<string, (p: any) => number> = {
    dps:             p => p.dpsAll?.[0]?.dps ?? 0,
    damage:          p => p.dpsAll?.[0]?.damage ?? 0,
    deaths:          p => p.defenses?.[0]?.deadCount ?? 0,
    downs:           p => p.defenses?.[0]?.downCount ?? 0,
    damage_taken:    p => p.defenses?.[0]?.damageTaken ?? 0,
    cleanses:        p => (p.support?.[0]?.condiCleanse ?? 0) + (p.support?.[0]?.condiCleanseSelf ?? 0),
    // raw boonStrips count — does not use user's DisruptionMethod setting, intentional simplification
    strips:          p => p.support?.[0]?.boonStrips ?? 0,
    rezzes:          p => p.support?.[0]?.resurrects ?? 0,
    breakbar_damage: p => p.dpsAll?.[0]?.breakbarDamage ?? 0,
    dist_to_tag:     p => p.statsAll?.[0]?.distToCom ?? p.statsAll?.[0]?.stackDist ?? 0,
    stability_uptime:  p => Math.round((p.buffUptimes?.find((b: any) => b.id === 726 || b.id === 1122)?.buffData?.[0]?.uptime ?? 0) * 100),
    quickness_uptime:  p => Math.round((p.buffUptimes?.find((b: any) => b.id === 1187)?.buffData?.[0]?.uptime ?? 0) * 100),
    alacrity_uptime:   p => Math.round((p.buffUptimes?.find((b: any) => b.id === 30328)?.buffData?.[0]?.uptime ?? 0) * 100),
    might_uptime:      p => Math.round((p.buffUptimes?.find((b: any) => b.id === 1)?.buffData?.[0]?.uptime ?? 0) * 100),
};

const BOON_IDS: Record<string, number> = {
    stability: 726, quickness: 1187, alacrity: 30328, might: 1,
    fury: 5, swiftness: 725, protection: 743, aegis: 717,
    regeneration: 718, vigor: 719, resolution: 873, resistance: 26980,
};
const BOON_ID_TO_NAME = new Map(Object.entries(BOON_IDS).map(([k, v]) => [v, k]));
BOON_ID_TO_NAME.set(1122, 'stability'); // stability rework alt ID

type Executor = (args: Record<string, any>, logs: ILogData[], getDetails: (id: string) => any) => Record<string, any>;

function loadedFights(logs: ILogData[], fightIndex?: number): ILogData[] {
    const loaded = logs.filter(l => l.detailsStatus === 'loaded');
    if (fightIndex != null) return loaded[fightIndex] ? [loaded[fightIndex]] : [];
    return loaded;
}

const executors: Record<string, Executor> = {
    player_deep_dive(args, logs, getDetails) {
        const { character_name, fight_index } = args;
        const query = String(character_name).toLowerCase();
        const fights = loadedFights(logs, fight_index);
        const results: any[] = [];

        for (const log of fights) {
            const details = getDetails(log.id) ?? getDetails(log.filePath);
            if (!details) continue;
            const player = (details.players ?? []).find((p: any) =>
                p.character_name?.toLowerCase().includes(query) ||
                p.display_name?.toLowerCase().includes(query) ||
                p.account?.toLowerCase().includes(query)
            );
            if (player) results.push({ fight: log.fightName ?? log.id, player });
        }

        if (results.length === 0) {
            const allNames = fights.flatMap(log => {
                const d = getDetails(log.id) ?? getDetails(log.filePath);
                return (d?.players ?? []).map((p: any) => p.character_name || p.display_name || '?');
            });
            return { error: 'Player not found', available_players: [...new Set(allNames)].slice(0, 20) };
        }
        return { results };
    },

    rank_players(args, logs, getDetails) {
        const { metric, fight_index } = args;
        const extractor = METRIC_MAP[metric];
        if (!extractor) return { error: 'Unknown metric', valid_metrics: Object.keys(METRIC_MAP) };

        const fights = loadedFights(logs, fight_index);
        const playerMap = new Map<string, { name: string; account: string; profession: string; values: number[] }>();

        for (const log of fights) {
            const details = getDetails(log.id) ?? getDetails(log.filePath);
            if (!details) continue;
            for (const p of details.players ?? []) {
                const key = p.character_name || p.display_name || '?';
                if (!playerMap.has(key)) {
                    playerMap.set(key, { name: key, account: p.account ?? '', profession: p.profession ?? '', values: [] });
                }
                playerMap.get(key)!.values.push(extractor(p));
            }
        }

        const ranked = Array.from(playerMap.values())
            .map(p => ({
                name: p.name, account: p.account, profession: p.profession,
                value: Math.round(p.values.reduce((a, b) => a + b, 0) / p.values.length),
                metric,
            }))
            .sort((a, b) => b.value - a.value);

        return { metric, ranked: ranked.slice(0, 30) };
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
            const details = getDetails(log.id) ?? getDetails(log.filePath);
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
            const details = getDetails(log.id) ?? getDetails(log.filePath);
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
                totalCleanses: players.reduce((s: number, p: any) => s + (METRIC_MAP['cleanses'](p)), 0),
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

        const fights = loadedFights(logs).map((log, i) => {
            const details = getDetails(log.id) ?? getDetails(log.filePath);
            if (!details) return { fight_index: i, fight: log.fightName ?? log.id, value: null, error: 'details not cached' };
            const players: any[] = details.players ?? [];

            if (player_name) {
                const query = String(player_name).toLowerCase();
                const p = players.find(p =>
                    p.character_name?.toLowerCase().includes(query) ||
                    p.display_name?.toLowerCase().includes(query)
                );
                return { fight_index: i, fight: log.fightName ?? log.id, value: p != null ? extractor(p) : null };
            }

            const values = players.map(extractor).filter(v => v > 0);
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
    getDetails: (id: string) => any
): Record<string, any> {
    const executor = executors[name];
    if (!executor) return { error: 'Unknown tool', valid_tools: Object.keys(executors) };
    try {
        return executor(args, logs, getDetails);
    } catch (err: any) {
        return { error: err?.message ?? 'Tool execution failed' };
    }
}
