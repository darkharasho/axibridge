import { PROFESSION_COLORS } from '../../shared/professionUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { resolveMapName } from './utils/labelUtils';
import { formatDurationMs } from './utils/dashboardUtils';
import {
    getPlayerCleanses,
    getPlayerStrips,
    getPlayerSquadHealing,
    getPlayerSquadBarrier,
    getPlayerOutgoingCrowdControl,
    getPlayerDownContribution,
} from '../../shared/dashboardMetrics';

const knownProfessionNames = new Set(Object.keys(PROFESSION_COLORS));
const knownProfessionList = Object.keys(PROFESSION_COLORS)
    .filter((name) => name && name !== 'Unknown')
    .sort((a, b) => b.length - a.length);
const baseProfessionNames = [
    'Guardian',
    'Revenant',
    'Warrior',
    'Engineer',
    'Ranger',
    'Thief',
    'Elementalist',
    'Mesmer',
    'Necromancer'
];
const resolveProfessionLabel = (name?: string) => {
    if (!name) return 'Unknown';
    const cleaned = String(name)
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/\s*\[[^\]]*\]\s*$/, '')
        .replace(/\s\d+$/, '')
        .trim();
    if (knownProfessionNames.has(cleaned)) return cleaned;
    const lower = cleaned.toLowerCase();
    for (const prof of knownProfessionList) {
        if (lower.includes(prof.toLowerCase())) return prof;
    }
    const baseMatch = baseProfessionNames.find((prof) => lower.includes(prof.toLowerCase()));
    return baseMatch || cleaned || 'Unknown';
};

const getFightDownsDeaths = (details: any) => {
    const players = details?.players || [];
    const squadPlayers = players.filter((p: any) => !p.notInSquad);
    let squadDownsDeaths = 0;
    let enemyDownsDeaths = 0;
    let squadDeaths = 0;
    let enemyDeaths = 0;

    squadPlayers.forEach((p: any) => {
        const defenses = p.defenses?.[0];
        if (!defenses) return;
        const downCount = Number(defenses.downCount || 0);
        const deadCount = Number(defenses.deadCount || 0);
        squadDownsDeaths += downCount + deadCount;
        squadDeaths += deadCount;
    });

    squadPlayers.forEach((p: any) => {
        if (!p.statsTargets || p.statsTargets.length === 0) return;
        p.statsTargets.forEach((targetStats: any) => {
            if (!Array.isArray(targetStats)) return;
            targetStats.forEach((phaseStats: any) => {
                if (!phaseStats) return;
                const downed = Number(phaseStats.downed || 0);
                const killed = Number(phaseStats.killed || 0);
                enemyDownsDeaths += downed + killed;
                enemyDeaths += killed;
            });
        });
    });

    return { squadDownsDeaths, enemyDownsDeaths, squadDeaths, enemyDeaths };
};

const getFightOutcome = (details: any) => {
    const { squadDownsDeaths, enemyDownsDeaths } = getFightDownsDeaths(details);
    if (squadDownsDeaths > 0 || enemyDownsDeaths > 0) {
        return enemyDownsDeaths > squadDownsDeaths;
    }
    if (typeof details?.success === 'boolean') return details.success;
    return false;
};

export function computeFightDiffMode(sortedFightLogsWithDetails: Array<{ log: any; originalIndex: number }>) {
    return sortedFightLogsWithDetails
        .map(({ log }, idx) => {
            const details = log.details;
            if (!details) return null;
            const players = Array.isArray(details.players) ? details.players : [];
            const squadPlayers = players.filter((p: any) => !p.notInSquad);
            const allTargets = Array.isArray(details.targets) ? details.targets : [];
            const timestamp = resolveFightTimestamp(details, log);
            const mapName = resolveMapName(details, log);
            const durationMs = Number(details.durationMS || 0);
            const { squadDownsDeaths, enemyDownsDeaths, squadDeaths, enemyDeaths } = getFightDownsDeaths(details);
            const targetFocusMap = new Map<string, { label: string; damage: number; hits: number }>();
            const upsertTargetFocus = (label: string, damage: number, hits: number) => {
                const existing = targetFocusMap.get(label) || { label, damage: 0, hits: 0 };
                existing.damage += damage;
                existing.hits += hits;
                targetFocusMap.set(label, existing);
            };

            squadPlayers.forEach((player: any) => {
                const statsTargets = Array.isArray(player?.statsTargets) ? player.statsTargets : [];
                statsTargets.forEach((targetStats: any, targetIndex: number) => {
                    const statsEntry = Array.isArray(targetStats) ? targetStats[0] : targetStats;
                    // EI detailed WvW target slices commonly populate totalDmg/connectedDmg
                    // while leaving damage unset.
                    const damage = Number(
                        statsEntry?.damage ??
                        statsEntry?.totalDmg ??
                        statsEntry?.connectedDmg ??
                        0
                    );
                    const hits = Number(
                        statsEntry?.connectedHits ??
                        statsEntry?.connectedDamageCount ??
                        statsEntry?.hits ??
                        0
                    );
                    if (damage <= 0 && hits <= 0) return;
                    const target = allTargets[targetIndex];
                    if (target?.isFake) return;
                    const rawLabel = target?.profession || target?.name || target?.id || `Target ${targetIndex + 1}`;
                    const label = resolveProfessionLabel(rawLabel);
                    upsertTargetFocus(label || String(rawLabel), damage, hits);
                });
            });

            // Fallback 1: derive per-target totals from cumulative targetDamage1S timelines.
            if (targetFocusMap.size === 0) {
                const targetDamageTotals = new Map<number, number>();
                const extractTargetPhase0 = (series: any): number[][] => {
                    if (!Array.isArray(series) || series.length === 0) return [];
                    const first = series[0];
                    if (Array.isArray(first) && Array.isArray(first[0])) {
                        // Shape A: [phase][target][time]
                        if (typeof first[0][0] === 'number') return first as number[][];
                        // Shape B: [target][phase][time]
                        if (Array.isArray(first[0]) && typeof first[0][0] === 'number') {
                            return (series as any[]).map((targetEntry) => (Array.isArray(targetEntry) ? (targetEntry[0] || []) : []));
                        }
                    }
                    return [];
                };
                squadPlayers.forEach((player: any) => {
                    const phase0 = extractTargetPhase0(player?.targetDamage1S);
                    phase0.forEach((cumulative: any, targetIndex: number) => {
                        if (!Array.isArray(cumulative) || cumulative.length === 0) return;
                        const values = cumulative
                            .map((value: any) => Number(value))
                            .filter((value: number) => Number.isFinite(value) && value >= 0);
                        if (values.length === 0) return;
                        const totalDamage = Math.max(0, values[values.length - 1] || 0);
                        if (totalDamage <= 0) return;
                        targetDamageTotals.set(targetIndex, (targetDamageTotals.get(targetIndex) || 0) + totalDamage);
                    });
                });

                targetDamageTotals.forEach((damage, targetIndex) => {
                    if (damage <= 0) return;
                    const target = allTargets[targetIndex];
                    if (target?.isFake) return;
                    const rawLabel = target?.profession || target?.name || target?.id || `Target ${targetIndex + 1}`;
                    const label = resolveProfessionLabel(rawLabel);
                    upsertTargetFocus(label || String(rawLabel), damage, 0);
                });
            }

            // Fallback 2: use target-level total damage taken distributions when player target slices are missing.
            if (targetFocusMap.size === 0) {
                allTargets.forEach((target: any, targetIndex: number) => {
                    if (target?.isFake) return;
                    const damageRows = Array.isArray(target?.totalDamageTaken)
                        ? target.totalDamageTaken
                        : (Array.isArray(target?.totalDamageDist) ? target.totalDamageDist : []);
                    let damage = 0;
                    let hits = 0;
                    damageRows.forEach((entry: any) => {
                        damage += Number(entry?.totalDamage || entry?.damage || 0);
                        hits += Number(entry?.connectedHits || entry?.hits || 0);
                    });
                    if (damage <= 0 && Number(target?.damageTaken || 0) > 0) {
                        damage = Number(target.damageTaken || 0);
                    }
                    if (damage <= 0 && hits <= 0) return;
                    const rawLabel = target?.profession || target?.name || target?.id || `Target ${targetIndex + 1}`;
                    const label = resolveProfessionLabel(rawLabel);
                    upsertTargetFocus(label || String(rawLabel), damage, hits);
                });
            }

            // Fallback 3: if no damage-attribution is available, use enemy class counts to produce
            // count-share focus so the comparison remains informative instead of empty.
            if (targetFocusMap.size === 0) {
                const counts = new Map<string, number>();
                allTargets.forEach((target: any, targetIndex: number) => {
                    if (target?.isFake) return;
                    const rawLabel = target?.profession || target?.name || target?.id || `Target ${targetIndex + 1}`;
                    const label = resolveProfessionLabel(rawLabel) || String(rawLabel);
                    counts.set(label, (counts.get(label) || 0) + 1);
                });
                counts.forEach((count, label) => {
                    if (count > 0) upsertTargetFocus(label, count, 0);
                });
            }

            const targetFocus = Array.from(targetFocusMap.values())
                .sort((a: { label: string; damage: number; hits: number }, b: { label: string; damage: number; hits: number }) =>
                    b.damage - a.damage || b.hits - a.hits || a.label.localeCompare(b.label)
                );
            const totalTargetDamage = targetFocus.reduce((sum, row) => sum + row.damage, 0);
            const normalizedTargetFocus = targetFocus.map((row) => ({
                label: row.label,
                damage: row.damage,
                hits: row.hits,
                share: totalTargetDamage > 0 ? row.damage / totalTargetDamage : 0
            }));
            const enemyCount = allTargets.filter((target: any) => !target?.isFake).length;
            const squadCount = squadPlayers.length;
            const totalOutgoingDamage = squadPlayers.reduce((sum: number, player: any) => sum + Number(player?.dpsAll?.[0]?.damage || 0), 0);
            const totalIncomingDamage = squadPlayers.reduce((sum: number, player: any) => sum + Number(player?.defenses?.[0]?.damageTaken || 0), 0);
            const incomingBarrierAbsorbed = squadPlayers.reduce((sum: number, player: any) => sum + Number(player?.defenses?.[0]?.damageBarrier || 0), 0);
            const outgoingBarrierAbsorbed = squadPlayers.reduce((sum: number, player: any) => {
                const outgoingBarrier = player?.extBarrierStats?.outgoingBarrier;
                if (!Array.isArray(outgoingBarrier)) return sum;
                let playerTotal = 0;
                outgoingBarrier.forEach((phase: any) => {
                    if (Array.isArray(phase)) {
                        phase.forEach((entry: any) => {
                            playerTotal += Number(entry?.barrier || 0);
                        });
                    } else {
                        playerTotal += Number(phase?.barrier || 0);
                    }
                });
                return sum + playerTotal;
            }, 0);
            const squadRevivedPlayers = squadPlayers.reduce((sum: number, player: any) => (
                Number(player?.statsAll?.[0]?.saved || 0) > 0 ? sum + 1 : sum
            ), 0);
            const squadCleanses = squadPlayers.reduce((sum: number, player: any) => sum + Number(getPlayerCleanses(player) || 0), 0);
            const squadStrips = squadPlayers.reduce((sum: number, player: any) => sum + Number(getPlayerStrips(player) || 0), 0);
            const squadStability = squadPlayers.reduce((sum: number, player: any) => sum + Number(player?.stabGeneration || 0), 0);
            const squadHealing = squadPlayers.reduce((sum: number, player: any) => sum + Number(getPlayerSquadHealing(player) || 0), 0);
            const squadBarrierOutput = squadPlayers.reduce((sum: number, player: any) => sum + Number(getPlayerSquadBarrier(player) || 0), 0);
            const squadCC = squadPlayers.reduce((sum: number, player: any) => sum + Number(getPlayerOutgoingCrowdControl(player) || 0), 0);
            const squadDownContribution = squadPlayers.reduce((sum: number, player: any) => sum + Number(getPlayerDownContribution(player) || 0), 0);
            const squadKdr = squadDeaths > 0 ? enemyDeaths / squadDeaths : enemyDeaths;
            const squadMetrics = [
                { metricId: 'winFlag', metricLabel: 'Win (1) / Loss (0)', higherIsBetter: true, value: getFightOutcome(details) ? 1 : 0 },
                { metricId: 'squadCount', metricLabel: 'Squad Size', higherIsBetter: true, value: squadCount },
                { metricId: 'enemyCount', metricLabel: 'Enemy Count', higherIsBetter: false, value: enemyCount },
                { metricId: 'squadKdr', metricLabel: 'Squad KDR', higherIsBetter: true, value: squadKdr },
                { metricId: 'enemyDeaths', metricLabel: 'Enemy Deaths', higherIsBetter: true, value: enemyDeaths },
                { metricId: 'enemyDowns', metricLabel: 'Enemy Downs', higherIsBetter: true, value: Math.max(0, enemyDownsDeaths - enemyDeaths) },
                { metricId: 'squadDeaths', metricLabel: 'Squad Deaths', higherIsBetter: false, value: squadDeaths },
                { metricId: 'squadDowns', metricLabel: 'Squad Downs', higherIsBetter: false, value: Math.max(0, squadDownsDeaths - squadDeaths) },
                { metricId: 'damageDelta', metricLabel: 'Damage Delta', higherIsBetter: true, value: totalOutgoingDamage - totalIncomingDamage },
                { metricId: 'outgoingDamage', metricLabel: 'Outgoing Damage', higherIsBetter: true, value: totalOutgoingDamage },
                { metricId: 'incomingDamage', metricLabel: 'Incoming Damage', higherIsBetter: false, value: totalIncomingDamage },
                { metricId: 'cleanses', metricLabel: 'Squad Cleanses', higherIsBetter: true, value: squadCleanses },
                { metricId: 'strips', metricLabel: 'Squad Strips', higherIsBetter: true, value: squadStrips },
                { metricId: 'stability', metricLabel: 'Squad Stability', higherIsBetter: true, value: squadStability },
                { metricId: 'healing', metricLabel: 'Squad Healing', higherIsBetter: true, value: squadHealing },
                { metricId: 'barrierOut', metricLabel: 'Squad Barrier Out', higherIsBetter: true, value: squadBarrierOutput },
                { metricId: 'barrierIncomingAbsorb', metricLabel: 'Barrier Absorption (Incoming)', higherIsBetter: true, value: incomingBarrierAbsorbed },
                { metricId: 'enemyBarrierAbsorb', metricLabel: 'Enemy Barrier Absorption', higherIsBetter: false, value: outgoingBarrierAbsorbed },
                { metricId: 'cc', metricLabel: 'Squad CC', higherIsBetter: true, value: squadCC },
                { metricId: 'downContrib', metricLabel: 'Squad Down Contribution', higherIsBetter: true, value: squadDownContribution },
                { metricId: 'alliesRevived', metricLabel: 'Allies Revived (Players)', higherIsBetter: true, value: squadRevivedPlayers }
            ];

            return {
                id: log.filePath || log.id || `fight-${idx + 1}`,
                shortLabel: `F${idx + 1}`,
                fullLabel: `${mapName || (log.encounterName || 'Unknown Map')} • ${formatDurationMs(durationMs)}`,
                mapName,
                timestamp,
                duration: formatDurationMs(durationMs),
                isWin: getFightOutcome(details),
                targetFocus: normalizedTargetFocus,
                squadMetrics
            };
        })
        .filter(Boolean);
}
