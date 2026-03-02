import { buildBoonTables } from "../../shared/boonGeneration";
import { computeBoonTimeline } from './computeBoonTimeline';
import { computeBoonUptimeTimeline } from './computeBoonUptimeTimeline';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { resolveMapName } from './utils/labelUtils';

const hasDetailedRoster = (log: any) => {
    const players = Array.isArray(log?.details?.players) ? log.details.players : [];
    return players.length > 0;
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

const resolveFightOutcomeForDisplay = (details: any, log: any): boolean | null => {
    const players = Array.isArray(details?.players) ? details.players : [];
    if (players.length > 0) return getFightOutcome(details);
    if (typeof details?.success === 'boolean') return details.success;
    const summary = log?.dashboardSummary;
    if (summary && typeof summary === 'object') {
        if (summary.isWin === true) return true;
        if (summary.isWin === false) return false;
    }
    return null;
};

const sortLogsByFightOrder = (a: { log: any; originalIndex: number }, b: { log: any; originalIndex: number }) => {
    const aTimestamp = resolveFightTimestamp(a.log?.details, a.log);
    const bTimestamp = resolveFightTimestamp(b.log?.details, b.log);
    const aHasTimestamp = aTimestamp > 0;
    const bHasTimestamp = bTimestamp > 0;
    if (aHasTimestamp && bHasTimestamp && aTimestamp !== bTimestamp) {
        return aTimestamp - bTimestamp;
    }
    if (aHasTimestamp !== bHasTimestamp) {
        return aHasTimestamp ? -1 : 1;
    }
    return a.originalIndex - b.originalIndex;
};

export function computeTimelineAndMapData(logs: any[], validLogs: any[]) {
    const sortedFightLogs = logs
        .map((log, originalIndex) => ({ log, originalIndex }))
        .sort(sortLogsByFightOrder);
    const sortedFightLogsWithDetails = sortedFightLogs.filter(({ log }) => hasDetailedRoster(log));

    const mapCounts: Record<string, number> = {};
    validLogs.forEach((log) => {
        const name = resolveMapName(log?.details, log);
        mapCounts[name] = (mapCounts[name] || 0) + 1;
    });
    const mapData = Object.entries(mapCounts)
        .map(([name, value]) => {
            const label = String(name).trim();
            const isEbg = /eternal battlegrounds|^ebg$/i.test(label);
            let color = '#64748b';
            if (isEbg) {
                color = '#ffffff';
            } else if (/red/i.test(label)) {
                color = '#ef4444';
            } else if (/blue/i.test(label)) {
                color = '#3b82f6';
            } else if (/green/i.test(label)) {
                color = '#22c55e';
            }
            return { name, value, color };
        })
        .sort((a, b) => b.value - a.value);

    const { boonTables } = buildBoonTables(validLogs);
    const boonTimeline = computeBoonTimeline(validLogs);
    const boonUptimeTimeline = computeBoonUptimeTimeline(validLogs);

    const timelineData = sortedFightLogs
        .map(({ log }) => {
            const details = log?.details;
            const players = Array.isArray(details?.players) ? details.players : [];
            const targets = Array.isArray(details?.targets) ? details.targets : [];
            const summary = log?.dashboardSummary && typeof log.dashboardSummary === 'object'
                ? log.dashboardSummary
                : null;
            const squadPlayers = players.filter((p: any) => !p.notInSquad);
            const enemyTargets = targets.filter((t: any) => !t.isFake);
            const summarySquadCount = Math.max(0, Number(summary?.squadCount || 0));
            const summaryEnemyCount = Math.max(0, Number(summary?.enemyCount || 0));
            const squadCount = squadPlayers.length > 0 ? squadPlayers.length : summarySquadCount;
            const enemies = enemyTargets.length > 0 ? enemyTargets.length : summaryEnemyCount;
            const friendlyCount = players.length > 0 ? players.length : squadCount;
            return {
                timestamp: resolveFightTimestamp(details, log),
                squadCount,
                friendlyCount,
                enemies,
                isWin: resolveFightOutcomeForDisplay(details, log)
            };
        })
        .map((entry, index) => ({
            ...entry,
            index: index + 1,
            label: `Log ${index + 1}`
        }));

    return { sortedFightLogs, sortedFightLogsWithDetails, mapData, timelineData, boonTables, boonTimeline, boonUptimeTimeline };
}
