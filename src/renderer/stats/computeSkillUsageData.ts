import { SkillUsageLogRecord, SkillUsagePlayer, SkillUsageSummary } from './statsTypes';
import { resolveFightTimestamp } from './utils/timestampUtils';

/**
 * Aggregates skill rotation data across all valid logs.
 * Produces per-skill totals, per-player skill histories, and per-log skill matrices.
 */
export const computeSkillUsageData = (validLogs: any[]): SkillUsageSummary => {
    const skillTotals = new Map<string, number>();
    const playerMap = new Map<string, SkillUsagePlayer>();
    const logRecords: SkillUsageLogRecord[] = [];
    const skillNameMap = new Map<string, string>();
    const skillIconMap = new Map<string, string>();
    const skillAutoAttackMap = new Map<string, boolean>();

    validLogs.forEach((log) => {
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
            let pr = playerMap.get(key);
            if (!pr) {
                pr = { key, account, displayName: account, profession, professionList: [profession], logs: 0, totalActiveSeconds: 0, skillTotals: {} };
                playerMap.set(key, pr);
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
                const sName = skillMap[sId]?.name || `Skill ${rot.id}`;
                const sIcon = skillMap[sId]?.icon;
                pr!.skillTotals[sId] = (pr!.skillTotals[sId] || 0) + count;
                skillTotals.set(sId, (skillTotals.get(sId) || 0) + count);
                skillNameMap.set(sId, sName);
                if (sIcon && !skillIconMap.has(sId)) skillIconMap.set(sId, sIcon);
                if (!skillAutoAttackMap.has(sId) && typeof skillMap[sId]?.autoAttack === 'boolean') {
                    skillAutoAttackMap.set(sId, skillMap[sId].autoAttack);
                }

                if (!record.skillEntries[sId]) record.skillEntries[sId] = { name: sName, icon: sIcon, players: {} };
                if (!record.skillEntries[sId].icon && sIcon) record.skillEntries[sId].icon = sIcon;
                record.skillEntries[sId].players[key] = (record.skillEntries[sId].players[key] || 0) + count;
            });
        });
        logRecords.push(record);
    });

    const skillOptions = Array.from(skillTotals.entries()).map(([id, total]) => ({
        id, name: skillNameMap.get(id) || id, total, icon: skillIconMap.get(id),
        autoAttack: skillAutoAttackMap.get(id)
    })).sort((a, b) => b.total - a.total);

    return {
        logRecords,
        players: Array.from(playerMap.values()),
        skillOptions,
        resUtilitySkills: []
    };
};
