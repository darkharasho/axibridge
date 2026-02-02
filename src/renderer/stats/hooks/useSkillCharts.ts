import { useMemo } from 'react';
import { SkillUsageSummary, SkillUsagePlayer } from '../statsTypes';

interface UseSkillChartsProps {
    skillUsageData: SkillUsageSummary;
    selectedSkillId: string | null;
    selectedPlayers: Set<string>;
    skillUsageView: 'total' | 'perSecond';
}

export const useSkillCharts = ({ skillUsageData, selectedSkillId, selectedPlayers, skillUsageView }: UseSkillChartsProps) => {

    const playerMapByKey = useMemo(() => {
        const map = new Map<string, SkillUsagePlayer>();
        skillUsageData.players.forEach((player) => map.set(player.key, player));
        return map;
    }, [skillUsageData.players]);

    const playerTotalsForSkill = useMemo(() => {
        const totals = new Map<string, number>();
        if (!selectedSkillId) return totals;

        const isPerSecond = skillUsageView === 'perSecond';

        skillUsageData.players.forEach((player) => {
            const rawCount = player.skillTotals[selectedSkillId] || 0;
            if (rawCount === 0) return;

            let val = rawCount;
            if (isPerSecond) {
                const activeSeconds = player.totalActiveSeconds || 1;
                val = activeSeconds > 0 ? rawCount / activeSeconds : 0;
            }
            totals.set(player.key, val);
        });
        return totals;
    }, [skillUsageData.players, selectedSkillId, skillUsageView]);

    const skillBarData = useMemo(() => {
        if (!selectedSkillId) return [];
        return Array.from(playerTotalsForSkill.entries())
            .map(([key, value]) => {
                const player = playerMapByKey.get(key);
                return {
                    key,
                    name: player?.displayName || key,
                    profession: player?.profession || 'Unknown',
                    value
                };
            })
            .sort((a, b) => b.value - a.value);
    }, [playerTotalsForSkill, playerMapByKey, selectedSkillId]);

    const { chartData: skillChartData, maxY: skillChartMaxY } = useMemo(() => {
        if (!selectedSkillId) return { chartData: [], maxY: 0 };
        let max = 0;
        const isPerSecond = skillUsageView === 'perSecond';

        const data = skillUsageData.logRecords.map((record, recordIndex) => {
            const skillEntry = record.skillEntries[selectedSkillId];
            if (!skillEntry) return null;

            const point: any = {
                index: recordIndex,
                name: record.label,
                shortLabel: record.label,
                fullLabel: record.label,
                timestamp: record.timestamp
            };
            let hasData = false;
            let hasSelectedData = false;

            Object.entries(skillEntry.players).forEach(([pKey, count]) => {
                // If filter active, check specific players?
                // Logic usually checks if player is selected OR if no selection shows all (top?)
                // Assuming we show all or selected.
                // If selectedPlayers has entries, show only those.
                if (selectedPlayers.size > 0 && !selectedPlayers.has(pKey)) return;

                let val = count;
                if (isPerSecond) {
                    const pActive = record.playerActiveSeconds?.[pKey] || 0;
                    val = pActive > 0 ? count / pActive : 0;
                }
                point[pKey] = val;
                if (val > max) max = val;
                hasData = true;
                hasSelectedData = true;
            });

            if (selectedPlayers.size > 0) {
                if (!hasSelectedData) return null;
            } else if (!hasData) {
                return null;
            }
            selectedPlayers.forEach((key) => {
                if (point[key] === undefined) {
                    point[key] = 0;
                }
            });
            return point;
        }).filter((p): p is any => p !== null);

        // Fill gaps / ensures continuity? 
        // Returning simple array
        return { chartData: data, maxY: max };

    }, [skillUsageData.logRecords, selectedSkillId, selectedPlayers, skillUsageView]);

    const groupedSkillUsagePlayers = useMemo(() => {
        const groups: Record<string, SkillUsagePlayer[]> = {};
        skillUsageData.players.forEach((p) => {
            const prof = p.profession || 'Unknown';
            if (!groups[prof]) groups[prof] = [];
            groups[prof].push(p);
        });
        return Object.entries(groups)
            .map(([profession, players]) => ({
                profession,
                players: players.sort((a, b) => a.displayName.localeCompare(b.displayName))
            }))
            .sort((a, b) => a.profession.localeCompare(b.profession));
    }, [skillUsageData.players]);

    return {
        playerMapByKey,
        playerTotalsForSkill,
        skillBarData,
        skillChartData,
        skillChartMaxY,
        groupedSkillUsagePlayers
    };
};
