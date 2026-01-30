const CONDITION_NAME_MAP = new Map<string, string>([
    ['bleeding', 'Bleeding'],
    ['burning', 'Burning'],
    ['confusion', 'Confusion'],
    ['poison', 'Poison'],
    ['torment', 'Torment'],
    ['vulnerability', 'Vulnerability'],
    ['weakness', 'Weakness'],
    ['blind', 'Blind'],
    ['crippled', 'Cripple'],
    ['chilled', 'Chill'],
    ['immobilized', 'Immobilize'],
    ['slow', 'Slow'],
    ['fear', 'Fear'],
    ['taunt', 'Taunt'],
]);

const getConditionName = (name?: string | null) => {
    if (!name) return null;
    const cleaned = name.trim().toLowerCase();
    return CONDITION_NAME_MAP.get(cleaned) || null;
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

export type ConditionSkillEntry = { name: string; hits: number; damage: number };

export type PlayerConditionTotals = Record<string, {
    applications: number;
    damage: number;
    skills: Record<string, ConditionSkillEntry>;
    applicationsFromBuffs?: number;
}>;

export type OutgoingConditionSummaryEntry = {
    name: string;
    applications: number;
    damage: number;
    applicationsFromBuffs?: number;
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
    let prev = 0;
    states.forEach((entry) => {
        const time = Number(entry[0] ?? 0);
        const value = Number(entry[1] ?? 0);
        if (!Number.isFinite(time) || !Number.isFinite(value)) return;
        if (time === 0) {
            prev = value;
            return;
        }
        if (prev === 0 && value > 0) {
            applied += 1;
        }
        prev = value;
    });
    return applied;
};

export const computeOutgoingConditions = (payload: {
    players: any[];
    targets: any[];
    skillMap?: Record<string, { name?: string }>;
    buffMap?: Record<string, { name?: string; classification?: string }>;
    getPlayerKey?: GetPlayerKey;
}): OutgoingConditionsResult => {
    const { players, targets, skillMap, buffMap } = payload;
    const getPlayerKey = payload.getPlayerKey || defaultGetPlayerKey;

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
                if (skillMap) {
                    if (skillMap[`s${entry.id}`]) {
                        skillName = skillMap[`s${entry.id}`].name || skillName;
                    } else if (skillMap[`${entry.id}`]) {
                        skillName = skillMap[`${entry.id}`].name || skillName;
                    }
                }
    const conditionName = resolveConditionNameFromEntry(skillName, entry.id, buffMap);
                if (!conditionName) return;
                const buffName = buffMap?.[`b${entry.id}`]?.name;
                const skillLabel = skillName.startsWith('Skill ') && buffName ? buffName : skillName;
                const connectedHits = Number(entry.connectedHits ?? 0);
                const rawHits = Number(entry.hits ?? 0);
                const hits = connectedHits > 0 ? connectedHits : rawHits;
                const damage = Number(entry.totalDamage ?? 0);
                if (!Number.isFinite(hits) && !Number.isFinite(damage)) return;

                const existing = summary[conditionName] || {
                    name: conditionName,
                    applications: 0,
                    damage: 0
                };
                existing.applications += Number.isFinite(hits) ? hits : 0;
                existing.damage += Number.isFinite(damage) ? damage : 0;
                summary[conditionName] = existing;

                const playerConditionTotals = playerConditions[key][conditionName] || {
                    applications: 0,
                    damage: 0,
                    skills: {}
                };
                playerConditionTotals.applications += Number.isFinite(hits) ? hits : 0;
                playerConditionTotals.damage += Number.isFinite(damage) ? damage : 0;
                const skillEntry = playerConditionTotals.skills[skillLabel] || { name: skillLabel, hits: 0, damage: 0 };
                skillEntry.hits += Number.isFinite(hits) ? hits : 0;
                skillEntry.damage += Number.isFinite(damage) ? damage : 0;
                playerConditionTotals.skills[skillLabel] = skillEntry;
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
            if (buffMeta?.classification !== 'Condition') return;
            const conditionName = buffMeta?.name || getConditionName(buffMeta?.name);
            if (!conditionName) return;
            const statesPerSource = buff.statesPerSource || {};
            targetBuffEntriesSeen += 1;
            Object.entries(statesPerSource).forEach(([sourceName, states]) => {
                const key = nameToKey.get(sourceName);
                if (!key) return;
                buffStateSourcesSeen += 1;
                const appliedCounts = countAppliedFromStates(states as Array<[number, number]>);
                if (!appliedCounts) return;
                buffStateApplicationsTotal += appliedCounts;

                const playerConditionTotals = playerConditions[key]?.[conditionName] || {
                    applications: 0,
                    damage: 0,
                    skills: {}
                };
                playerConditionTotals.applicationsFromBuffs = (playerConditionTotals.applicationsFromBuffs || 0) + appliedCounts;
                playerConditions[key] = playerConditions[key] || {};
                playerConditions[key][conditionName] = playerConditionTotals;

                const overallTotals = summary[conditionName] || {
                    name: conditionName,
                    applications: 0,
                    damage: 0
                };
                overallTotals.applicationsFromBuffs = (overallTotals.applicationsFromBuffs || 0) + appliedCounts;
                summary[conditionName] = overallTotals;
            });
        });
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
