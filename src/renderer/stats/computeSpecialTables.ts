import { PlayerSkillDamageEntry, PlayerHealingSkillEntry, PlayerHealingBreakdown } from './statsTypes';

export function computeSpecialTables(
    specialBuffAgg: Map<string, Map<string, {
        key: string;
        account: string;
        profession: string;
        professions: Set<string>;
        professionTimeMs: Record<string, number>;
        totalMs: number;
        uptimeMs: number;
        durationMs: number;
    }>>,
    specialBuffOutputAgg: Map<string, Map<string, {
        key: string;
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
    shouldIncludePlayerSkillMap: boolean,
    healingBreakdownMap: Map<string, {
        key: string;
        account: string;
        displayName: string;
        profession: string;
        professionList: string[];
        healingSkills: Map<string, PlayerHealingSkillEntry>;
        barrierSkills: Map<string, PlayerHealingSkillEntry>;
        hasHealAddon: boolean;
    }>
) {
    const buildSpecialRows = (players: Map<string, {
        key: string;
        account: string;
        profession: string;
        professions: Set<string>;
        professionTimeMs: Record<string, number>;
        totalMs: number;
        uptimeMs: number;
        durationMs: number;
    }> | undefined) => {
        if (!players) return [];
        return Array.from(players.values()).map((entry) => {
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
            const fullPlayerDurationMs = playerStats.get(entry.key)?.supportActiveMs || durationMs;
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
    };
    const specialBuffIds = new Set<string>([
        ...Array.from(specialBuffAgg.keys()),
        ...Array.from(specialBuffOutputAgg.keys()),
    ]);
    const specialTables = Array.from(specialBuffIds.values()).map((buffId) => {
        const meta = specialBuffMeta.get(buffId) || {};
        const rowsReceived = buildSpecialRows(specialBuffAgg.get(buffId));
        const rowsOutput = buildSpecialRows(specialBuffOutputAgg.get(buffId));
        const rows = rowsReceived;
        return {
            id: buffId,
            name: meta.name || buffId,
            icon: meta.icon,
            rows,
            rowsReceived,
            rowsOutput
        };
    }).filter((table) => table.rowsReceived.length > 0 || table.rowsOutput.length > 0);

    const playerSkillBreakdowns = Array.from(playerSkillBreakdownMap.values())
        .map((entry) => {
            const skills = Array.from(entry.skills.values())
                .map((s) => s.min === Infinity ? { ...s, min: 0 } : s)
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

    const healingBreakdownPlayers: PlayerHealingBreakdown[] = Array.from(healingBreakdownMap.values())
        .map((entry) => {
            const healingSkills = Array.from(entry.healingSkills.values())
                .sort((a, b) => b.total - a.total);
            const barrierSkills = Array.from(entry.barrierSkills.values())
                .sort((a, b) => b.total - a.total);
            return {
                key: entry.key,
                account: entry.account,
                displayName: entry.displayName,
                profession: entry.profession,
                professionList: entry.professionList,
                totalHealing: healingSkills.reduce((sum, s) => sum + s.total, 0),
                totalBarrier: barrierSkills.reduce((sum, s) => sum + s.total, 0),
                healingSkills,
                barrierSkills,
                hasHealAddon: entry.hasHealAddon,
            };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { specialTables, playerSkillBreakdowns, healingBreakdownPlayers };
}
