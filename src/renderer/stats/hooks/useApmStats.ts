import { useMemo } from 'react';
import { ApmSpecBucket, SkillUsageSummary, ApmPlayerRow, ApmSkillEntry, SkillUsagePlayer } from '../statsTypes';
import { isAutoAttackName } from '../utils/dashboardUtils';

export const useApmStats = (skillUsageData: SkillUsageSummary) => {

    const apmSpecBuckets = useMemo(() => {
        const buckets = new Map<string, ApmSpecBucket>();

        // Helper to check auto attack
        const autoAttackCache = new Map<string, boolean>();
        const isAuto = (name: string, id: string) => {
            if (autoAttackCache.has(id)) return autoAttackCache.get(id)!;
            // Check if defined in options
            const option = skillUsageData.skillOptions.find(o => o.id === id);
            let val = false;
            if (option && typeof option.autoAttack === 'boolean') {
                val = option.autoAttack;
            } else {
                val = isAutoAttackName(name);
            }
            autoAttackCache.set(id, val);
            return val;
        };

        skillUsageData.players.forEach((player) => {
            const profession = player.profession;
            let bucket = buckets.get(profession);
            if (!bucket) {
                bucket = {
                    profession,
                    players: [],
                    playerRows: [],
                    totalActiveSeconds: 0,
                    totalCasts: 0,
                    totalAutoCasts: 0,
                    skills: [],
                    skillMap: new Map<string, ApmSkillEntry>()
                };
                buckets.set(profession, bucket);
            }

            bucket.players.push(player);
            bucket.totalActiveSeconds += (player.totalActiveSeconds || 0);

            let pCasts = 0;
            let pAutoCasts = 0;

            // Iterate over all skills for this player
            Object.entries(player.skillTotals).forEach(([skillId, count]) => {
                const skillName = skillUsageData.skillOptions.find(o => o.id === skillId)?.name || skillId;
                const auto = isAuto(skillName, skillId);

                pCasts += count;
                if (auto) pAutoCasts += count;

                // Add to bucket skill map
                let skillEntry = bucket!.skillMap.get(skillId);
                if (!skillEntry) {
                    skillEntry = {
                        id: skillId,
                        name: skillName,
                        totalCasts: 0,
                        playerCounts: new Map()
                    };
                    bucket!.skillMap.set(skillId, skillEntry);
                }
                skillEntry.totalCasts += count;
                skillEntry.playerCounts.set(player.key, count);
            });

            bucket.totalCasts += pCasts;
            bucket.totalAutoCasts += pAutoCasts;

            const activeMinutes = (player.totalActiveSeconds || 0) / 60;
            const apm = activeMinutes > 0 ? pCasts / activeMinutes : 0;
            const apmNoAuto = activeMinutes > 0 ? (pCasts - pAutoCasts) / activeMinutes : 0;
            const aps = (player.totalActiveSeconds || 0) > 0 ? pCasts / (player.totalActiveSeconds || 1) : 0;
            const apsNoAuto = (player.totalActiveSeconds || 0) > 0 ? (pCasts - pAutoCasts) / (player.totalActiveSeconds || 1) : 0;

            const row: ApmPlayerRow = {
                key: player.key,
                account: player.account,
                displayName: player.displayName,
                profession: player.profession,
                professionList: player.professionList,
                logs: player.logs,
                totalActiveSeconds: player.totalActiveSeconds || 0,
                totalCasts: pCasts,
                totalAutoCasts: pAutoCasts,
                apm,
                apmNoAuto,
                aps,
                apsNoAuto
            };
            bucket.playerRows.push(row);
        });

        // Sort player rows
        buckets.forEach((bucket) => {
            bucket.playerRows.sort((a, b) => b.apm - a.apm);
            bucket.skills = Array.from(bucket.skillMap.values()).sort((a, b) => b.totalCasts - a.totalCasts);
        });

        // Convert Map to array and sort by profession
        return Array.from(buckets.values()).sort((a, b) => a.profession.localeCompare(b.profession));

    }, [skillUsageData]);

    return {
        apmSpecBuckets
    };
};
