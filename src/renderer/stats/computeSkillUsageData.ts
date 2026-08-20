import { SkillUsageLogRecord, SkillUsagePlayer, SkillUsageSummary } from './statsTypes';
import { resolveFightTimestamp } from './utils/timestampUtils';

const SPECIAL_SKILL_NAMES: Record<number, string> = {
    23275: 'Dodge',
};

export interface SkillUsageAccumulator {
    skillTotals: Map<string, number>;
    playerMap: Map<string, SkillUsagePlayer>;
    logRecords: SkillUsageLogRecord[];
    skillNameMap: Map<string, string>;
    skillIconMap: Map<string, string>;
    skillAutoAttackMap: Map<string, boolean>;
    skillProcMap: Map<string, { isTraitProc?: boolean; isGearProc?: boolean; isUnconditionalProc?: boolean }>;
}

export function createSkillUsageAccumulator(): SkillUsageAccumulator {
    return {
        skillTotals: new Map(),
        playerMap: new Map(),
        logRecords: [],
        skillNameMap: new Map(),
        skillIconMap: new Map(),
        skillAutoAttackMap: new Map(),
        skillProcMap: new Map(),
    };
}

export function ingestLogSkillUsage(log: any, acc: SkillUsageAccumulator): void {
    const details = log.details;
    if (!details) return;
    const skillMap = details.skillMap || {};
    const label = details.fightName || 'Log';
    const timestamp = resolveFightTimestamp(details, log) || Date.now();

    const record: SkillUsageLogRecord = {
        id: log.filePath || log.id || label,
        label, timestamp, skillEntries: {}, playerActiveSeconds: {},
        durationSeconds: details.durationMS ? details.durationMS / 1000 : 0
    };

    const players = (details.players || []) as any[];
    players.forEach((p) => {
        if (p.notInSquad) return;
        const account = p.account || p.name || 'Unknown';
        const profession = p.profession || 'Unknown';
        const key = `${account}|${profession}`;
        let pr = acc.playerMap.get(key);
        if (!pr) {
            pr = { key, account, displayName: account, profession, professionList: [profession], logs: 0, totalActiveSeconds: 0, skillTotals: {} };
            acc.playerMap.set(key, pr);
        }
        pr.logs++;
        const activeSec = (Array.isArray(p.activeTimes) ? p.activeTimes[0] : 0) / 1000;
        pr.totalActiveSeconds = (pr.totalActiveSeconds || 0) + activeSec;
        record.playerActiveSeconds![key] = activeSec;

        (p.rotation || []).forEach((rot: any) => {
            if (!rot?.id) return;
            const count = rot.skills?.length || 0;
            if (count <= 0) return;
            const sId = `s${rot.id}`;
            const sName = skillMap[sId]?.name || SPECIAL_SKILL_NAMES[rot.id] || `Skill ${rot.id}`;
            const sIcon = skillMap[sId]?.icon;
            pr!.skillTotals[sId] = (pr!.skillTotals[sId] || 0) + count;
            acc.skillTotals.set(sId, (acc.skillTotals.get(sId) || 0) + count);
            acc.skillNameMap.set(sId, sName);
            if (sIcon && !acc.skillIconMap.has(sId)) acc.skillIconMap.set(sId, sIcon);
            if (!acc.skillAutoAttackMap.has(sId) && typeof skillMap[sId]?.autoAttack === 'boolean') {
                acc.skillAutoAttackMap.set(sId, skillMap[sId].autoAttack);
            }
            if (!acc.skillProcMap.has(sId)) {
                const entry = skillMap[sId];
                if (entry) {
                    const proc: { isTraitProc?: boolean; isGearProc?: boolean; isUnconditionalProc?: boolean } = {};
                    if (typeof entry.isTraitProc === 'boolean') proc.isTraitProc = entry.isTraitProc;
                    if (typeof entry.isGearProc === 'boolean') proc.isGearProc = entry.isGearProc;
                    if (typeof entry.isUnconditionalProc === 'boolean') proc.isUnconditionalProc = entry.isUnconditionalProc;
                    if (Object.keys(proc).length > 0) acc.skillProcMap.set(sId, proc);
                }
            }

            if (!record.skillEntries[sId]) record.skillEntries[sId] = { name: sName, icon: sIcon, players: {} };
            if (!record.skillEntries[sId].icon && sIcon) record.skillEntries[sId].icon = sIcon;
            record.skillEntries[sId].players[key] = (record.skillEntries[sId].players[key] || 0) + count;
        });
    });
    acc.logRecords.push(record);
}

export function finalizeSkillUsage(acc: SkillUsageAccumulator): SkillUsageSummary {
    const skillOptions = Array.from(acc.skillTotals.entries()).map(([id, total]) => ({
        id, name: acc.skillNameMap.get(id) || id, total, icon: acc.skillIconMap.get(id),
        autoAttack: acc.skillAutoAttackMap.get(id),
        ...acc.skillProcMap.get(id)
    })).sort((a, b) => b.total - a.total);

    return {
        logRecords: acc.logRecords,
        players: Array.from(acc.playerMap.values()),
        skillOptions,
        resUtilitySkills: []
    };
}

/**
 * Aggregates skill rotation data across all valid logs.
 * Produces per-skill totals, per-player skill histories, and per-log skill matrices.
 */
export const computeSkillUsageData = (validLogs: any[]): SkillUsageSummary => {
    const acc = createSkillUsageAccumulator();
    for (const log of validLogs) ingestLogSkillUsage(log, acc);
    return finalizeSkillUsage(acc);
};
