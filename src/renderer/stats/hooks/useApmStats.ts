import { useMemo } from 'react';
import { ApmSpecBucket, SkillUsageSummary, ApmPlayerRow, ApmSkillEntry } from '../statsTypes';
import { isAutoAttackName } from '../utils/dashboardUtils';

export const useApmStats = (skillUsageData: SkillUsageSummary) => {

    const apmSpecBuckets = useMemo(() => {
        const buckets = new Map<string, ApmSpecBucket>();
        const skillOptionsById = new Map(
            (skillUsageData.skillOptions || []).map((option) => [option.id, option])
        );

        // Helper to check auto attack
        const autoAttackCache = new Map<string, boolean>();
        const isAuto = (name: string, id: string) => {
            if (autoAttackCache.has(id)) return autoAttackCache.get(id)!;
            // Check if defined in options
            const option = skillOptionsById.get(id);
            let val = false;
            if (option && typeof option.autoAttack === 'boolean') {
                val = option.autoAttack;
            } else {
                val = isAutoAttackName(name);
            }
            autoAttackCache.set(id, val);
            return val;
        };

        (skillUsageData.players || []).forEach((player) => {
            const profession = player?.profession || 'Unknown';
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
            const totalActiveSeconds = Number(player?.totalActiveSeconds || 0);
            const safeActiveSeconds = Number.isFinite(totalActiveSeconds) && totalActiveSeconds > 0 ? totalActiveSeconds : 0;
            bucket.totalActiveSeconds += safeActiveSeconds;

            let pCasts = 0;
            let pAutoCasts = 0;
            const playerSkillTotals = player && typeof player.skillTotals === 'object' && player.skillTotals !== null
                ? player.skillTotals
                : {};

            // Iterate over all skills for this player
            Object.entries(playerSkillTotals).forEach(([skillId, rawCount]) => {
                const count = Number(rawCount);
                if (!Number.isFinite(count) || count <= 0) return;
                const option = skillOptionsById.get(skillId);
                const skillName = option?.name || skillId;
                const skillIcon = option?.icon;
                const auto = isAuto(skillName, skillId);

                pCasts += count;
                if (auto) pAutoCasts += count;

                // Add to bucket skill map
                let skillEntry = bucket!.skillMap.get(skillId);
                if (!skillEntry) {
                    skillEntry = {
                        id: skillId,
                        name: skillName,
                        icon: skillIcon,
                        totalCasts: 0,
                        playerCounts: new Map()
                    };
                    bucket!.skillMap.set(skillId, skillEntry);
                }
                if (!skillEntry.icon && skillIcon) skillEntry.icon = skillIcon;
                skillEntry.totalCasts += count;
                const playerKey = player?.key || `${player?.account || 'Unknown'}|${profession}`;
                skillEntry.playerCounts.set(playerKey, count);
            });

            bucket.totalCasts += pCasts;
            bucket.totalAutoCasts += pAutoCasts;

            const activeMinutes = safeActiveSeconds / 60;
            const apm = activeMinutes > 0 ? pCasts / activeMinutes : 0;
            const castsNoAuto = Math.max(0, pCasts - pAutoCasts);
            const apmNoAuto = activeMinutes > 0 ? castsNoAuto / activeMinutes : 0;
            const aps = safeActiveSeconds > 0 ? pCasts / safeActiveSeconds : 0;
            const apsNoAuto = safeActiveSeconds > 0 ? castsNoAuto / safeActiveSeconds : 0;

            const row: ApmPlayerRow = {
                key: player?.key || `${player?.account || 'Unknown'}|${profession}`,
                account: player?.account || 'Unknown',
                displayName: player?.displayName || player?.account || 'Unknown',
                profession,
                professionList: Array.isArray(player?.professionList) ? player.professionList : [profession],
                logs: Number(player?.logs || 0),
                totalActiveSeconds: safeActiveSeconds,
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
            const safeBucketSeconds = Number(bucket.totalActiveSeconds || 0);
            const totalMinutes = safeBucketSeconds > 0 ? safeBucketSeconds / 60 : 0;
            const nonAutoCasts = Math.max(0, Number(bucket.totalCasts || 0) - Number(bucket.totalAutoCasts || 0));
            (bucket as any).totalApm = totalMinutes > 0 ? Number(bucket.totalCasts || 0) / totalMinutes : 0;
            (bucket as any).totalApmNoAuto = totalMinutes > 0 ? nonAutoCasts / totalMinutes : 0;
            (bucket as any).totalAps = safeBucketSeconds > 0 ? Number(bucket.totalCasts || 0) / safeBucketSeconds : 0;
            (bucket as any).totalApsNoAuto = safeBucketSeconds > 0 ? nonAutoCasts / safeBucketSeconds : 0;

            bucket.skills = Array.from(bucket.skillMap.values())
                .map((skill) => {
                    const playerRows = bucket.playerRows
                        .map((row) => {
                            const count = Number(skill.playerCounts?.get(row.key) || 0);
                            if (!Number.isFinite(count) || count <= 0) return null;
                            const activeSeconds = Number(row.totalActiveSeconds || 0);
                            const apm = activeSeconds > 0 ? count / (activeSeconds / 60) : 0;
                            const aps = activeSeconds > 0 ? count / activeSeconds : 0;
                            return {
                                ...row,
                                count,
                                apm,
                                aps
                            };
                        })
                        .filter(Boolean)
                        .sort((a: any, b: any) => (b.apm - a.apm) || String(a.displayName || '').localeCompare(String(b.displayName || '')));

                    const totalCasts = Number(skill.totalCasts || 0);
                    const totalCastsPerSecond = safeBucketSeconds > 0 ? totalCasts / safeBucketSeconds : 0;
                    const totalApm = totalMinutes > 0 ? totalCasts / totalMinutes : 0;
                    return {
                        ...skill,
                        playerRows,
                        totalCasts,
                        totalCastsPerSecond,
                        totalApm
                    };
                })
                .sort((a: any, b: any) => b.totalCasts - a.totalCasts);
        });

        // Convert Map to array and sort by profession
        return Array.from(buckets.values()).sort((a, b) => a.profession.localeCompare(b.profession));

    }, [skillUsageData]);

    return {
        apmSpecBuckets
    };
};
