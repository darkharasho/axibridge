const CONDITION_NAME_MAP = new Map<string, string>([
    ['bleeding', 'Bleeding'],
    ['burning', 'Burning'],
    ['confusion', 'Confusion'],
    ['poison', 'Poison'],
    ['torment', 'Torment'],
    ['vulnerability', 'Vulnerability'],
    ['weakness', 'Weakness'],
    ['weakened', 'Weakness'],
    ['blind', 'Blind'],
    ['blinded', 'Blind'],
    ['blinding', 'Blind'],
    ['cripple', 'Cripple'],
    ['crippled', 'Cripple'],
    ['chill', 'Chill'],
    ['chilled', 'Chill'],
    ['immob', 'Immobilize'],
    ['immobile', 'Immobilize'],
    ['immobilized', 'Immobilize'],
    ['slow', 'Slow'],
    ['slowed', 'Slow'],
    ['fear', 'Fear'],
    ['feared', 'Fear'],
    ['taunt', 'Taunt'],
    ['taunted', 'Taunt'],
]);
const DEFAULT_CONDITION_ICONS: Record<string, string> = {
    Blind: 'https://render.guildwars2.com/file/09770136BB76FD0DBE1CC4267DEED54774CB20F6/102837.png',
    Chill: 'https://render.guildwars2.com/file/28C4EC547A3516AF0242E826772DA43A5EAC3DF3/102839.png',
    Cripple: 'https://render.guildwars2.com/file/070325E519C178D502A8160523766070D30C0C19/102838.png',
    Fear: 'https://render.guildwars2.com/file/30307A6E766D74B6EB09EDA12A4A2DE50E4D76F4/102869.png',
    Immobilize: 'https://render.guildwars2.com/file/397A613651BFCA2832B6469CE34735580A2C120E/102844.png',
    Slow: 'https://render.guildwars2.com/file/F60D1EF5271D7B9319610855676D320CD25F01C6/961397.png',
    Taunt: 'https://render.guildwars2.com/file/02EED459AD65FAF7DF32A260E479C625070841B9/1228472.png',
    Vulnerability: 'https://render.guildwars2.com/file/3A394C1A0A3257EB27A44842DDEEF0DF000E1241/102850.png',
    Weakness: 'https://render.guildwars2.com/file/6CB0E64AF9AA292E332A38C1770CE577E2CDE0E8/102853.png'
};

export const getDefaultConditionIcon = (name?: string | null) => {
    if (!name) return undefined;
    return DEFAULT_CONDITION_ICONS[name];
};

const getConditionName = (name?: string | null) => {
    if (!name) return null;
    const cleaned = name.trim().toLowerCase();
    const directMatch = CONDITION_NAME_MAP.get(cleaned);
    if (directMatch) return directMatch;
    const tokens = cleaned.split(/[^a-z]+/).filter(Boolean);
    for (const token of tokens) {
        const match = CONDITION_NAME_MAP.get(token);
        if (match) return match;
    }
    return null;
};

export const normalizeConditionLabel = (name?: string | null) => getConditionName(name);

export const buildConditionIconMap = (
    buffMap?: Record<string, { name?: string; classification?: string; icon?: string }>
) => {
    const map = new Map<string, string>();
    if (!buffMap) return map;
    Object.values(buffMap).forEach((meta) => {
        if (!meta?.icon || !meta?.name) return;
        const normalized = getConditionName(meta.name);
        if (!normalized) return;
        if (!map.has(normalized)) map.set(normalized, meta.icon);
    });
    Object.entries(DEFAULT_CONDITION_ICONS).forEach(([name, icon]) => {
        if (!map.has(name)) map.set(name, icon);
    });
    return map;
};

export const resolveConditionNameFromEntry = (
    skillName: string,
    id?: number,
    buffMap?: Record<string, { name?: string }>
) => {
    if (id && buffMap) {
        const buffName = buffMap[`b${id}`]?.name;
        const resolved = getConditionName(buffName);
        if (resolved) return resolved;
    }
    if (!skillName) return null;
    return getConditionName(skillName);
};

export type ConditionSkillEntry = { name: string; hits: number; damage: number; icon?: string };

export type PlayerConditionTotals = Record<string, {
    icon?: string;
    applications: number;
    damage: number;
    skills: Record<string, ConditionSkillEntry>;
    applicationsFromBuffs?: number;
    applicationsFromBuffsActive?: number;
}>;

export type OutgoingConditionSummaryEntry = {
    name: string;
    icon?: string;
    applications: number;
    damage: number;
    applicationsFromBuffs?: number;
    applicationsFromBuffsActive?: number;
};

export type OutgoingConditionsResult = {
    playerConditions: Record<string, PlayerConditionTotals>;
    summary: Record<string, OutgoingConditionSummaryEntry>;
    meta: {
        buffStateApplicationsTotal: number;
        targetBuffEntriesSeen: number;
        buffStateSourcesSeen: number;
    };
};

type GetPlayerKey = (player: any) => string | null;

const defaultGetPlayerKey: GetPlayerKey = (player) => {
    const account = player?.account || 'Unknown';
    if (account && account !== 'Unknown') return account;
    const name = player?.name || 'Unknown';
    return name || null;
};

const countAppliedFromStates = (states: Array<[number, number]> | undefined) => {
    if (!states || states.length === 0) return 0;
    let applied = 0;
    let prev: number | null = null;
    states.forEach((entry) => {
        const value = Number(entry[1] ?? 0);
        if (!Number.isFinite(value)) return;
        if (prev === null) {
            prev = value;
            return;
        }
        if (value > prev) {
            applied += (value - prev);
        }
        prev = value;
    });
    return applied;
};

const countActiveStateEntries = (states: Array<[number, number]> | undefined) => {
    if (!states || states.length === 0) return 0;
    let count = 0;
    states.forEach((entry) => {
        const time = Number(entry[0] ?? 0);
        const value = Number(entry[1] ?? 0);
        if (!Number.isFinite(value)) return;
        if (time === 0) return;
        if (value > 0) count += 1;
    });
    return count;
};

export const computeOutgoingConditions = (payload: {
    players: any[];
    targets: any[];
    skillMap?: Record<string, { name?: string; icon?: string }>;
    buffMap?: Record<string, { name?: string; classification?: string; icon?: string }>;
    getPlayerKey?: GetPlayerKey;
}): OutgoingConditionsResult => {
    const { players, targets, skillMap, buffMap } = payload;
    const getPlayerKey = payload.getPlayerKey || defaultGetPlayerKey;
    const conditionIconMap = buildConditionIconMap(buffMap);

    const playerConditions: Record<string, PlayerConditionTotals> = {};
    const summary: Record<string, OutgoingConditionSummaryEntry> = {};

    players.forEach((player) => {
        if (player?.notInSquad) return;
        const key = getPlayerKey(player);
        if (!key) return;
        if (!playerConditions[key]) {
            playerConditions[key] = {};
        }
        if (!player?.totalDamageDist) return;
        player.totalDamageDist.forEach((distList: any) => {
            if (!distList) return;
            distList.forEach((entry: any) => {
                if (!entry.id) return;
                let skillName = `Skill ${entry.id}`;
                let skillIcon: string | undefined;
                if (skillMap) {
                    if (skillMap[`s${entry.id}`]) {
                        skillName = skillMap[`s${entry.id}`].name || skillName;
                        skillIcon = skillMap[`s${entry.id}`].icon || skillIcon;
                    } else if (skillMap[`${entry.id}`]) {
                        skillName = skillMap[`${entry.id}`].name || skillName;
                        skillIcon = skillMap[`${entry.id}`].icon || skillIcon;
                    }
                }
                const conditionName = resolveConditionNameFromEntry(skillName, entry.id, buffMap);
                if (!conditionName) return;
                const buffMeta = buffMap?.[`b${entry.id}`];
                const buffName = buffMeta?.name;
                const conditionIcon = conditionIconMap.get(conditionName) || buffMeta?.icon;
                const skillLabel = skillName.startsWith('Skill ')
                    ? (buffName || conditionName)
                    : skillName;
                const skillLabelIcon = skillIcon || buffMeta?.icon;
                const connectedHits = Number(entry.connectedHits ?? 0);
                const rawHits = Number(entry.hits ?? 0);
                const hits = connectedHits > 0 ? connectedHits : rawHits;
                const damage = Number(entry.totalDamage ?? 0);
                if (!Number.isFinite(hits) && !Number.isFinite(damage)) return;

                const existing = summary[conditionName] || {
                    name: conditionName,
                    icon: conditionIcon,
                    applications: 0,
                    damage: 0
                };
                existing.applications += Number.isFinite(hits) ? hits : 0;
                existing.damage += Number.isFinite(damage) ? damage : 0;
                if (!existing.icon && conditionIcon) existing.icon = conditionIcon;
                summary[conditionName] = existing;

                const playerConditionTotals = playerConditions[key][conditionName] || {
                    icon: conditionIcon,
                    applications: 0,
                    damage: 0,
                    skills: {}
                };
                playerConditionTotals.applications += Number.isFinite(hits) ? hits : 0;
                playerConditionTotals.damage += Number.isFinite(damage) ? damage : 0;
                const skillEntry = playerConditionTotals.skills[skillLabel] || { name: skillLabel, hits: 0, damage: 0, icon: skillLabelIcon };
                skillEntry.hits += Number.isFinite(hits) ? hits : 0;
                skillEntry.damage += Number.isFinite(damage) ? damage : 0;
                if (!skillEntry.icon && skillLabelIcon) skillEntry.icon = skillLabelIcon;
                playerConditionTotals.skills[skillLabel] = skillEntry;
                if (!playerConditionTotals.icon && conditionIcon) playerConditionTotals.icon = conditionIcon;
                playerConditions[key][conditionName] = playerConditionTotals;
            });
        });
    });

    const nameToKey = new Map<string, string>();
    players.forEach((player: any) => {
        if (player?.notInSquad) return;
        const key = getPlayerKey(player);
        if (!key) return;
        if (player?.name) {
            nameToKey.set(player.name, key);
        }
    });

    let buffStateApplicationsTotal = 0;
    let buffStateSourcesSeen = 0;
    let targetBuffEntriesSeen = 0;
    targets.forEach((target: any) => {
        if (!target?.buffs) return;
        target.buffs.forEach((buff: any) => {
            const buffId = Number(buff?.id);
            if (!Number.isFinite(buffId)) return;
            const buffMeta = buffMap?.[`b${buffId}`];
            const normalizedName = getConditionName(buffMeta?.name);
            if (!normalizedName) return;
            if (buffMeta?.classification && buffMeta.classification !== 'Condition') return;
            const conditionName = normalizedName;
            if (!conditionName) return;
            const statesPerSource = buff.statesPerSource || {};
            targetBuffEntriesSeen += 1;
            Object.entries(statesPerSource).forEach(([sourceName, states]) => {
                const key = nameToKey.get(sourceName);
                if (!key) return;
                buffStateSourcesSeen += 1;
                const appliedCounts = countAppliedFromStates(states as Array<[number, number]>);
                const activeCounts = countActiveStateEntries(states as Array<[number, number]>);
                buffStateApplicationsTotal += appliedCounts;

                const playerConditionTotals = playerConditions[key]?.[conditionName] || {
                    applications: 0,
                    damage: 0,
                    skills: {}
                };
                playerConditionTotals.applicationsFromBuffs = (playerConditionTotals.applicationsFromBuffs || 0) + appliedCounts;
                playerConditionTotals.applicationsFromBuffsActive = (playerConditionTotals.applicationsFromBuffsActive || 0) + activeCounts;
                playerConditions[key] = playerConditions[key] || {};
                playerConditions[key][conditionName] = playerConditionTotals;

                const overallTotals = summary[conditionName] || {
                    name: conditionName,
                    applications: 0,
                    damage: 0
                };
                overallTotals.applicationsFromBuffs = (overallTotals.applicationsFromBuffs || 0) + appliedCounts;
                overallTotals.applicationsFromBuffsActive = (overallTotals.applicationsFromBuffsActive || 0) + activeCounts;
                summary[conditionName] = overallTotals;
            });
        });
    });

    Object.values(playerConditions).forEach((conditionTotals) => {
        Object.values(conditionTotals).forEach((entry) => {
            if (typeof entry.applicationsFromBuffs === 'number') {
                entry.applications = entry.applicationsFromBuffs;
            }
        });
    });

    Object.values(summary).forEach((entry) => {
        if (typeof entry.applicationsFromBuffs === 'number') {
            entry.applications = entry.applicationsFromBuffs;
        }
    });

    return {
        playerConditions,
        summary,
        meta: {
            buffStateApplicationsTotal,
            targetBuffEntriesSeen,
            buffStateSourcesSeen
        }
    };
};
