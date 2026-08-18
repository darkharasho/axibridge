import { normalizeAccountName } from './playerIdentity';
import { getConditionName, normalizeConditionLabel } from './conditionNames';
import { getEntityConditionDamageRows, listConditionApplications } from './nativeConditions';
import { squadEntities } from './nativeRoster';

// Re-exported so `StatsView.tsx` and `computeCommanderStats.ts` keep importing
// it from here; the definition moved to the leaf module to break a cycle.
export { normalizeConditionLabel };

export const NON_DAMAGING_CONDITIONS = new Set([
    'Vulnerability',
    'Weakness',
    'Blind',
    'Cripple',
    'Chill',
    'Immobilize',
    'Slow',
    'Fear',
    'Taunt',
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

type BuffMeta = { name?: string; icon?: string; classification?: string };

export const resolveBuffMetaById = (
    buffMap: Record<string, BuffMeta> | undefined,
    id: number | string | undefined
): BuffMeta | undefined => {
    if (!buffMap || id === undefined || id === null) return undefined;
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
        return buffMap[`b${numericId}`] || buffMap[String(numericId)];
    }
    return buffMap[String(id)];
};


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

/*
 * `resolveConditionNameFromEntry` was removed here. It decided whether a
 * damage entry was a condition by falling back to tokenizing the skill NAME
 * when the buff-id lookup came up empty, so any strike skill named after a
 * condition was counted as that condition. On the reference fixture this was
 * not marginal: it credited `Burning Speed`, an Elementalist strike skill,
 * with 74000 of the squad's 87397 reported incoming Burning "condition"
 * damage.
 *
 * All four call sites are gone. Incoming and outgoing conditions now decide
 * membership from `catalogs.buffs[id].kind === 'condition'` (see
 * `nativeConditions.ts`); the two naming call sites in
 * `computePlayerAggregation` were provably unreachable, because the only
 * string they ever tokenized was the literal `Skill <id>`; and
 * `computeCommanderStats` now does the buff-id lookup directly.
 *
 * A verbatim copy survives at `src/test/legacy/conditionsMetricsEi.ts` for
 * the equality oracle, and is deleted with it.
 */

export type ConditionSkillEntry = { name: string; hits: number; damage: number; icon?: string };

export type PlayerConditionTotals = Record<string, {
    icon?: string;
    applications: number;
    damage: number;
    skills: Record<string, ConditionSkillEntry>;
    applicationsFromBuffs?: number;
    applicationsFromBuffsActive?: number;
    uptimeMs?: number;
}>;

export type OutgoingConditionSummaryEntry = {
    name: string;
    icon?: string;
    applications: number;
    damage: number;
    applicationsFromBuffs?: number;
    applicationsFromBuffsActive?: number;
    uptimeMs?: number;
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

/**
 * The BARE account, deliberately not `getEntityAccountKey`'s `acct:`-prefixed
 * spelling: `computePlayerAggregation` keys `playerStats` on
 * `getPlayerIdentity().key`, which is the bare account (optionally
 * `::Profession`). A prefixed key here matches nothing there and drops every
 * condition on the floor without erroring.
 *
 * Native entities carry `character`; EI players carried `name`.
 */
const defaultGetPlayerKey: GetPlayerKey = (player) => {
    const account = normalizeAccountName(String(player?.account || 'Unknown'));
    if (account && account !== 'Unknown') return account;
    return player?.character || player?.name || null;
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

const computeUptimeFromStates = (states: Array<[number, number]> | undefined) => {
    if (!states || states.length === 0) return 0;
    let uptimeMs = 0;
    let buffOn = 0;
    let firstTime = 0;
    for (const [time, value] of states) {
        if (time === 0) continue;
        if (value >= 1 && buffOn === 0) {
            buffOn = value;
            firstTime = time;
        } else if (value === 0 && buffOn > 0) {
            uptimeMs += time - firstTime;
            buffOn = 0;
        }
    }
    return uptimeMs;
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
    details: any;
    getPlayerKey?: GetPlayerKey;
}): OutgoingConditionsResult => {
    const { details } = payload;
    const native = details?.native;

    const playerConditions: Record<string, PlayerConditionTotals> = {};
    const summary: Record<string, OutgoingConditionSummaryEntry> = {};
    if (!native) {
        return {
            playerConditions,
            summary,
            meta: { buffStateApplicationsTotal: 0, targetBuffEntriesSeen: 0, buffStateSourcesSeen: 0 }
        };
    }

    // Native `catalogs.buffs` carries no icon field, and neither did EI's
    // `buffMap` in practice — every icon the old path produced came out of
    // DEFAULT_CONDITION_ICONS. Read them from there directly rather than
    // through buildConditionIconMap, which returns an EMPTY map when handed
    // no buffMap and would silently drop every icon.
    const iconFor = (name: string) => getDefaultConditionIcon(name);

    const keyOf = new Map<number, string>();
    for (const entity of squadEntities(native)) {
        const key = (payload.getPlayerKey || defaultGetPlayerKey)(entity);
        if (key) keyOf.set(entity.id, key);
    }

    // --- damage half: by_skill, condition ids only ---
    for (const [entityId, key] of keyOf) {
        playerConditions[key] = playerConditions[key] || {};
        for (const row of getEntityConditionDamageRows(details, entityId)) {
            const conditionName = row.conditionName;
            const icon = iconFor(conditionName);
            // EI reported attempts, not landed hits; `attemptHits` is the
            // attempt count and is the correct fallback here.
            const hits = row.connectedHits > 0 ? row.connectedHits : row.attemptHits;

            const existing = summary[conditionName] || { name: conditionName, icon, applications: 0, damage: 0 };
            existing.applications += hits;
            existing.damage += row.damage;
            if (!existing.icon && icon) existing.icon = icon;
            summary[conditionName] = existing;

            const totals = playerConditions[key][conditionName] || { icon, applications: 0, damage: 0, skills: {} };
            totals.applications += hits;
            totals.damage += row.damage;
            const skillEntry = totals.skills[conditionName] || { name: conditionName, hits: 0, damage: 0, icon };
            skillEntry.hits += hits;
            skillEntry.damage += row.damage;
            totals.skills[conditionName] = skillEntry;
            if (!totals.icon && icon) totals.icon = icon;
            playerConditions[key][conditionName] = totals;
        }
    }

    // --- states half: blocks.conditions, source-attributed ---
    let buffStateApplicationsTotal = 0;
    let buffStateSourcesSeen = 0;
    const targetBuffPairs = new Set<string>();

    for (const app of listConditionApplications(details)) {
        const key = keyOf.get(app.sourceEntityId);
        if (!key) continue;
        targetBuffPairs.add(`${app.targetEntityId}:${app.buffId}`);
        buffStateSourcesSeen += 1;

        const appliedCounts = countAppliedFromStates(app.states);
        const activeCounts = countActiveStateEntries(app.states);
        const uptimeMs = computeUptimeFromStates(app.states);
        buffStateApplicationsTotal += appliedCounts;

        playerConditions[key] = playerConditions[key] || {};
        const totals = playerConditions[key][app.conditionName]
            || { icon: iconFor(app.conditionName), applications: 0, damage: 0, skills: {} };
        totals.applicationsFromBuffs = (totals.applicationsFromBuffs || 0) + appliedCounts;
        totals.applicationsFromBuffsActive = (totals.applicationsFromBuffsActive || 0) + activeCounts;
        totals.uptimeMs = (totals.uptimeMs || 0) + uptimeMs;
        playerConditions[key][app.conditionName] = totals;

        const overall = summary[app.conditionName]
            || { name: app.conditionName, icon: iconFor(app.conditionName), applications: 0, damage: 0 };
        overall.applicationsFromBuffs = (overall.applicationsFromBuffs || 0) + appliedCounts;
        overall.applicationsFromBuffsActive = (overall.applicationsFromBuffsActive || 0) + activeCounts;
        overall.uptimeMs = (overall.uptimeMs || 0) + uptimeMs;
        summary[app.conditionName] = overall;
    }

    return {
        playerConditions,
        summary,
        meta: {
            buffStateApplicationsTotal,
            targetBuffEntriesSeen: targetBuffPairs.size,
            buffStateSourcesSeen
        }
    };
};
