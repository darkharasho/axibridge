import { PlayerSkillDamageEntry } from './statsTypes';

export function computeSpecialTables(
    specialBuffAgg: Map<string, Map<string, {
        account: string;
        profession: string;
        professions: Set<string>;
        professionTimeMs: Record<string, number>;
        totalMs: number;
        uptimeMs: number;
        durationMs: number;
    }>>,
    specialBuffMeta: Map<string, { name?: string; stacking?: boolean; icon?: string }>,
    playerStats: Map<string, { supportActiveMs?: number }>,
    playerSkillBreakdownMap: Map<string, {
        key: string;
        account: string;
        displayName: string;
        profession: string;
        professionList: string[];
        totalFightMs: number;
        skills: Map<string, PlayerSkillDamageEntry>;
    }>,
    shouldIncludePlayerSkillMap: boolean
) {
    const specialTables = Array.from(specialBuffAgg.entries()).map(([buffId, players]) => {
        const meta = specialBuffMeta.get(buffId) || {};
        const rows = Array.from(players.values()).map((entry) => {
            const professionList = Array.from(entry.professions || []).filter((prof) => prof && prof !== 'Unknown');
            let primaryProfession = entry.profession || 'Unknown';
            if (professionList.length > 0) {
                primaryProfession = professionList[0];
                let maxTime = entry.professionTimeMs?.[primaryProfession] || 0;
                professionList.forEach((prof) => {
                    const time = entry.professionTimeMs?.[prof] || 0;
                    if (time > maxTime) {
                        maxTime = time;
                        primaryProfession = prof;
                    }
                });
            }
            const durationMs = entry.durationMs || 0;
            const total = entry.totalMs / 1000;
            const perSecond = durationMs > 0 ? (entry.totalMs / durationMs) : 0;
            const fullPlayerDurationMs = playerStats.get(entry.account)?.supportActiveMs || durationMs;
            const uptimePerSecond = fullPlayerDurationMs > 0 ? (entry.uptimeMs / fullPlayerDurationMs) : 0;
            return {
                account: entry.account,
                profession: primaryProfession,
                professionList,
                total,
                perSecond,
                uptimePerSecond,
                duration: durationMs / 1000
            };
        }).filter((row) => row.total > 0 || row.perSecond > 0);
        return {
            id: buffId,
            name: meta.name || buffId,
            icon: meta.icon,
            rows
        };
    }).filter((table) => table.rows.length > 0);

    const playerSkillBreakdowns = Array.from(playerSkillBreakdownMap.values())
        .map((entry) => {
            const skills = Array.from(entry.skills.values())
                .sort((a, b) => b.damage - a.damage);
            const payload: any = {
                key: entry.key,
                account: entry.account,
                displayName: entry.displayName,
                profession: entry.profession,
                professionList: entry.professionList,
                totalFightMs: entry.totalFightMs,
                skills
            };
            if (shouldIncludePlayerSkillMap) {
                payload.skillMap = skills.reduce<Record<string, PlayerSkillDamageEntry>>((acc, skill) => {
                    acc[skill.id] = skill;
                    return acc;
                }, {});
            }
            return payload;
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { specialTables, playerSkillBreakdowns };
}
