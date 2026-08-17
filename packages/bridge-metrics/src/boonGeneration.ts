import { getBuffMeta, listBoonIds, getEntityBuffGeneration, getEntityActiveMs } from './nativeBoons';
import { squadEntities, getEntityProfession } from './nativeRoster';

export type BoonCategory = 'selfBuffs' | 'groupBuffs' | 'squadBuffs' | 'totalBuffs';
export type BoonMetric = 'total' | 'average' | 'uptime';

export interface BuffInfo {
    name?: string;
    stacking?: boolean;
    icon?: string;
    classification?: string;
}

export interface BuffGenerationEntry {
    id: number;
    buffData?: Array<{
        generation?: number;
        wasted?: number;
    }>;
}

export interface BoonRow {
    account: string;
    profession: string;
    professionList?: string[];
    activeTimeMs: number;
    numFights: number;
    groupSupported: number;
    squadSupported: number;
    categories: Record<Exclude<BoonCategory, 'totalBuffs'>, { generationMs: number; wastedMs: number }>;
}

export interface BoonTable {
    id: string;
    name: string;
    icon?: string;
    stacking: boolean;
    rows: BoonRow[];
}

const BOON_CATEGORIES: Array<Exclude<BoonCategory, 'totalBuffs'>> = ['selfBuffs', 'groupBuffs', 'squadBuffs'];

const CATEGORY_COUNT: Record<Exclude<BoonCategory, 'totalBuffs'>, (groupCount: number, squadCount: number) => number> = {
    selfBuffs: () => 1,
    groupBuffs: (groupCount) => Math.max(groupCount - 1, 0),
    squadBuffs: (_groupCount, squadCount) => Math.max(squadCount - 1, 0),
};

const safeDiv = (a: number, b: number, fallback = 0) => (b ? a / b : fallback);

const toBoonId = (id: number) => `b${id}`;

const computeGenerationMs = (
    category: Exclude<BoonCategory, 'totalBuffs'>,
    stacking: boolean,
    generation: number,
    wasted: number,
    durationMs: number,
    groupCount: number,
    squadCount: number,
) => {
    const count = CATEGORY_COUNT[category](groupCount, squadCount);

    if (!count || !durationMs) {
        return { generationMs: 0, wastedMs: 0 };
    }

    if (stacking) {
        return {
            generationMs: generation * durationMs * count,
            wastedMs: wasted * durationMs * count,
        };
    }

    return {
        generationMs: (generation / 100) * durationMs * count,
        wastedMs: (wasted / 100) * durationMs * count,
    };
};

export const computeBoonMetrics = (
    row: BoonRow,
    category: BoonCategory,
    stacking: boolean,
) => {
    const activeTimeMs = row.activeTimeMs || 1;
    const numFights = row.numFights || 1;
    const groupSupported = row.groupSupported || 1;
    const squadSupported = row.squadSupported || 1;

    const selfData = row.categories.selfBuffs;
    const squadData = row.categories.squadBuffs;

    const sourceData = category === 'totalBuffs'
        ? {
            generationMs: selfData.generationMs + squadData.generationMs,
            wastedMs: selfData.wastedMs + squadData.wastedMs,
        }
        : row.categories[category];

    const generationMs = sourceData.generationMs;
    const wastedMs = sourceData.wastedMs;

    let denom = 1;
    if (category === 'groupBuffs') {
        denom = safeDiv(groupSupported - numFights, numFights, 1);
    } else if (category === 'squadBuffs') {
        denom = safeDiv(squadSupported - numFights, numFights, 1);
    } else if (category === 'totalBuffs') {
        denom = squadSupported || 1;
    }

    let uptimeRaw = 0;
    let wastedRaw = 0;

    if (category === 'selfBuffs') {
        uptimeRaw = stacking
            ? safeDiv(generationMs, activeTimeMs)
            : safeDiv(generationMs, activeTimeMs) * 100;
        wastedRaw = stacking
            ? safeDiv(wastedMs, activeTimeMs)
            : safeDiv(wastedMs, activeTimeMs) * 100;
    } else {
        const base = safeDiv(generationMs, activeTimeMs) / (denom || 1);
        const wastedBase = safeDiv(wastedMs, activeTimeMs) / (denom || 1);
        uptimeRaw = stacking ? base : base * 100;
        wastedRaw = stacking ? wastedBase : wastedBase * 100;
    }

    return { generationMs, wastedMs, uptimeRaw, wastedRaw };
};

export const getBoonMetricValue = (
    row: BoonRow,
    category: BoonCategory,
    stacking: boolean,
    metric: BoonMetric,
) => {
    const { generationMs, uptimeRaw } = computeBoonMetrics(row, category, stacking);
    const activeTimeMs = row.activeTimeMs || 1;

    if (metric === 'total') {
        return generationMs / 1000;
    }
    if (metric === 'average') {
        return safeDiv(generationMs, activeTimeMs);
    }
    return uptimeRaw;
};

export const formatBoonMetricDisplay = (
    row: BoonRow,
    category: BoonCategory,
    stacking: boolean,
    metric: BoonMetric,
    options?: { roundCountStats?: boolean },
) => {
    const value = getBoonMetricValue(row, category, stacking, metric);
    const isPercent = metric === 'uptime' && !stacking;
    const isRate = metric === 'average';
    const decimals = options?.roundCountStats && !isPercent && !isRate ? 0 : 2;
    const formatted = value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });

    if (isPercent) {
        return `${formatted}%`;
    }
    return formatted;
};

export const buildBoonTables = (logs: Array<{ details?: any }>, splitPlayersByClass = false) => {
    const boonMeta = new Map<string, BuffInfo>();
    const playerAgg = new Map<string, {
        account: string;
        profession: string;
        professions: Set<string>;
        professionTimeMs: Record<string, number>;
        activeTimeMs: number;
        numFights: number;
        groupSupported: number;
        squadSupported: number;
        boons: Record<string, BoonRow['categories']>;
    }>();

    logs.forEach((log) => {
        const details = log.details;
        if (!details) return;

        const durationMs = Number(details?.native?.encounter?.duration_ms ?? details.durationMS ?? 0);

        // Buff metadata comes from the catalog, which states `kind` outright.
        // The old path sniffed a `classification` string that EI never sets,
        // so every buff passed -- conditions simply never reached these arrays.
        listBoonIds(details).forEach((id) => {
            const meta = getBuffMeta(details, id);
            if (!meta) return;
            boonMeta.set(toBoonId(id), { name: meta.name, stacking: meta.stacking, classification: 'Boon' });
        });

        const members = squadEntities(details?.native);
        const squadCount = members.length;

        const groupCounts = new Map<number, number>();
        members.forEach((entity) => {
            const group = entity.subgroup ?? 0;
            groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
        });

        members.forEach((entity) => {
            const account = entity.account || entity.character || 'Unknown';
            const profession = getEntityProfession(entity) || 'Unknown';
            const group = entity.subgroup ?? 0;
            const groupCount = groupCounts.get(group) || 1;
            const activeTimeMs = getEntityActiveMs(details, entity.id, durationMs);
            const key = splitPlayersByClass && profession !== 'Unknown' ? `${account}::${profession}` : account;

            if (!playerAgg.has(key)) {
                playerAgg.set(key, {
                    account,
                    profession,
                    professions: new Set<string>(),
                    professionTimeMs: {},
                    activeTimeMs: 0,
                    numFights: 0,
                    groupSupported: 0,
                    squadSupported: 0,
                    boons: {},
                });
            }

            const agg = playerAgg.get(key)!;
            agg.profession = profession;
            if (profession && profession !== 'Unknown') {
                agg.professions.add(profession);
                agg.professionTimeMs[profession] = (agg.professionTimeMs[profession] || 0) + activeTimeMs;
            }
            agg.activeTimeMs += activeTimeMs;
            agg.numFights += 1;
            agg.groupSupported += groupCount;
            agg.squadSupported += squadCount;

            BOON_CATEGORIES.forEach((category) => {
                boonMeta.forEach((_meta, boonId) => {
                    const boonIdNum = Number(boonId.slice(1));
                    if (!Number.isFinite(boonIdNum)) return;
                    const { generationMs, wastedMs } = getEntityBoonGenerationMs(
                        details,
                        entity.id,
                        category,
                        boonIdNum,
                        durationMs,
                        groupCount,
                        squadCount,
                    );
                    if (!generationMs && !wastedMs) return;

                    if (!agg.boons[boonId]) {
                        agg.boons[boonId] = {
                            selfBuffs: { generationMs: 0, wastedMs: 0 },
                            groupBuffs: { generationMs: 0, wastedMs: 0 },
                            squadBuffs: { generationMs: 0, wastedMs: 0 },
                        };
                    }

                    agg.boons[boonId][category].generationMs += generationMs;
                    agg.boons[boonId][category].wastedMs += wastedMs;
                });
            });
        });
    });

    const boonIds = Array.from(boonMeta.keys());

    const boonTables: BoonTable[] = boonIds.map((boonId) => {
        const meta = boonMeta.get(boonId) || {};
        const rows: BoonRow[] = [];

        playerAgg.forEach((agg) => {
            const boonData = agg.boons[boonId];
            if (!boonData) return;
            const hasData = BOON_CATEGORIES.some((category) => boonData[category].generationMs > 0 || boonData[category].wastedMs > 0);
            if (!hasData) return;

            const professionList = Array.from(agg.professions || []).filter((prof) => prof && prof !== 'Unknown');
            let primaryProfession = agg.profession;
            if (professionList.length > 0) {
                primaryProfession = professionList[0];
                let maxTime = agg.professionTimeMs?.[primaryProfession] || 0;
                professionList.forEach((prof) => {
                    const time = agg.professionTimeMs?.[prof] || 0;
                    if (time > maxTime) {
                        maxTime = time;
                        primaryProfession = prof;
                    }
                });
            }

            rows.push({
                account: agg.account,
                profession: primaryProfession || 'Unknown',
                professionList,
                activeTimeMs: agg.activeTimeMs || 1,
                numFights: agg.numFights || 1,
                groupSupported: agg.groupSupported || 1,
                squadSupported: agg.squadSupported || 1,
                categories: {
                    selfBuffs: { ...boonData.selfBuffs },
                    groupBuffs: { ...boonData.groupBuffs },
                    squadBuffs: { ...boonData.squadBuffs },
                },
            });
        });

        return {
            id: boonId,
            name: meta.name || boonId,
            icon: meta.icon,
            stacking: meta.stacking ?? false,
            rows,
        };
    }).filter((boon) => boon.rows.length > 0);

    return { boonTables };
};

export interface BoonLeaderboardRow {
  rank: number;
  account: string;
  profession: string;
  professionList?: string[];
  value: number;
  count?: number;
}

// Ranks players by SQUAD boon generation output for each boon table.
// `metric` selects the scored value: 'uptime' (stacking => avg stacks, else uptime %),
// 'average' (gen/sec), or 'total' (total generation seconds, i.e. "count").
// Keyed by table.id (e.g. 'b740'), matching BOON_IDS in topStatsCatalog.
export const buildBoonLeaderboards = (
  tables: BoonTable[],
  metric: BoonMetric = 'uptime',
): Record<string, BoonLeaderboardRow[]> => {
  const result: Record<string, BoonLeaderboardRow[]> = {};
  for (const table of tables) {
    const ranked = table.rows
      .map((row) => ({
        account: row.account,
        profession: row.profession,
        professionList: row.professionList,
        value: getBoonMetricValue(row, 'squadBuffs', table.stacking, metric),
        count: row.numFights,
      }))
      .filter((r) => Number.isFinite(r.value) && r.value > 0)
      .sort((a, b) => (b.value - a.value) || a.account.localeCompare(b.account));

    let lastValue: number | null = null;
    let lastRank = 0;
    result[table.id] = ranked.map((row, index) => {
      if (lastValue === null || row.value !== lastValue) {
        lastRank = index + 1;
        lastValue = row.value;
      }
      return { ...row, rank: lastRank };
    });
  }
  return result;
};

export const getPlayerBoonGenerationMs = (
    player: any,
    category: Exclude<BoonCategory, 'totalBuffs'>,
    boonId: number,
    durationMs: number,
    groupCount: number,
    squadCount: number,
    buffMap: Record<string, BuffInfo> = {},
) => {
    const buffs = (player?.[category] || []) as BuffGenerationEntry[];
    const target = buffs.find((buff) => buff.id === boonId);
    if (!target) {
        return { generationMs: 0, wastedMs: 0 };
    }

    const meta = buffMap[toBoonId(boonId)];
    const stacking = meta?.stacking ?? false;
    const generation = target.buffData?.[0]?.generation ?? 0;
    const wasted = target.buffData?.[0]?.wasted ?? 0;

    return computeGenerationMs(category, stacking, generation, wasted, durationMs, groupCount, squadCount);
};

const GENERATION_FIELD: Record<Exclude<BoonCategory, 'totalBuffs'>, keyof ReturnType<typeof getEntityBuffGeneration>> = {
    selfBuffs: 'self',
    groupBuffs: 'group',
    squadBuffs: 'squad',
};

const WASTED_FIELD: Record<Exclude<BoonCategory, 'totalBuffs'>, keyof ReturnType<typeof getEntityBuffGeneration>> = {
    selfBuffs: 'selfWasted',
    groupBuffs: 'groupWasted',
    squadBuffs: 'squadWasted',
};

export const getEntityBoonGenerationMs = (
    details: any,
    entityId: number,
    category: Exclude<BoonCategory, 'totalBuffs'>,
    boonId: number,
    durationMs: number,
    groupCount: number,
    squadCount: number,
) => {
    const gen = getEntityBuffGeneration(details, entityId, boonId);
    const stacking = getBuffMeta(details, boonId)?.stacking ?? false;
    return computeGenerationMs(
        category,
        stacking,
        Number(gen[GENERATION_FIELD[category]] ?? 0),
        Number(gen[WASTED_FIELD[category]] ?? 0),
        durationMs,
        groupCount,
        squadCount,
    );
};
