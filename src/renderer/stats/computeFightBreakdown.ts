import { getFightDownsDeaths, getFightOutcome, resolveProfessionLabel, resolveEnemyClassLabel } from './computePlayerAggregation';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { resolveMapName, buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
import { formatDurationMs } from './utils/dashboardUtils';
import { getWvwTeamColor, teamMapFromLog } from '../../shared/wvwTeams';
import { partitionSquadPlayers } from '../../shared/playerIdentity';
import { computeSquadBarrier } from '../../shared/combatMetrics';
import { getEncounterDurationMs } from '@axiapps/bridge-metrics';

const resolvePermalink = (details: any, log: any): string => {
    const direct = log?.permalink || details?.permalink;
    if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();
    const uploadLinks = details?.uploadLinks;
    if (!Array.isArray(uploadLinks)) return '';
    for (const entry of uploadLinks) {
        if (typeof entry === 'string' && entry.trim().length > 0) return entry.trim();
        if (entry && typeof entry === 'object') {
            const candidate = entry.permalink || entry.link || entry.url || entry.reportLink;
            if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
        }
    }
    return '';
};

const resolveFightDurationLabel = (details: any, log: any): string => {
    // Native first, compared against null rather than truthiness: a real 0-ms
    // encounter must not fall through to the EI value or to the placeholder.
    const nativeMs = getEncounterDurationMs(details);
    if (nativeMs !== null) return formatDurationMs(nativeMs);
    const durationMs = Number(details?.durationMS || 0);
    if (durationMs > 0) return formatDurationMs(durationMs);
    const fallback = typeof log?.encounterDuration === 'string' ? log.encounterDuration.trim() : '';
    return fallback || '--:--';
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

export function ingestLogFightBreakdown(log: any, fightIndex: number) {
    const details = log?.details;
    const players = Array.isArray(details?.players) ? details.players : [];
    const squadPlayers = players.filter((p: any) => !p.notInSquad);
    const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(players);
    const targets = Array.isArray(details?.targets) ? details.targets : [];
    const wvwTeamMap = teamMapFromLog(details);
    // Enemy players only. `isFake` drops EI's synthetic agents; `enemyPlayer === false`
    // drops WvW NPCs (guards, lords, sentries, dolyaks, siege) that arcdps logs as
    // targets. Without the second filter the headline enemyCount counts NPCs while
    // teamBreakdown below (which applies it) does not, so the columns stop summing to
    // the total whenever a fight happens near objectives.
    const enemyTargets = targets.filter((t: any) => !t.isFake && t.enemyPlayer !== false);
    const summary = log?.dashboardSummary && typeof log.dashboardSummary === 'object'
        ? log.dashboardSummary
        : null;
    const totalOutgoing = squadPlayers.reduce((sum: number, p: any) => sum + (p.dpsAll?.[0]?.damage || 0), 0);
    const totalIncoming = squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.damageTaken || 0), 0);
    const { enemyDeaths, enemyDownsDeaths } = getFightDownsDeaths(details);
    const isWin = resolveFightOutcomeForDisplay(details, log);
    const timestamp = resolveFightTimestamp(details, log);
    const mapName = resolveMapName(details, log);
    const getTeamValue = (entity: any) => {
        if (!entity || typeof entity !== 'object') return undefined;
        const direct = entity.teamID ?? entity.teamId ?? entity.team ?? entity.teamColor ?? entity.team_color;
        if (direct !== undefined && direct !== null) return direct;
        const key = Object.keys(entity).find((k) => /^team/i.test(k));
        return key ? entity[key] : undefined;
    };
    const countProfessions = (entries: any[], getRaw: (entry: any) => string | undefined) => {
        const counts: Record<string, number> = {};
        entries.forEach((entry: any) => {
            const rawName = getRaw(entry);
            const name = resolveProfessionLabel(rawName);
            if (!name) return;
            counts[name] = (counts[name] || 0) + 1;
        });
        return counts;
    };
    const squadClassCountsFight = countProfessions(squadPrimaries, (p) => p?.profession || p?.name);
    const allyClassCountsFight = countProfessions(pugPrimaries, (p) => p?.profession || p?.name);
    // Enemies group by PROFESSION only -- `name` is the WvW rank title
    // ("Gold Invader"), which reads as a class but is not one.
    const enemyClassCounts = countProfessions(enemyTargets, (t) => resolveEnemyClassLabel(t));
    const alliedTeamIds = new Set<string>();
    squadPlayers.forEach((player: any) => {
        const value = getTeamValue(player);
        if (value === undefined || value === null) return;
        alliedTeamIds.add(String(value));
    });
    const enemyTeamCounts = new Map<string, number>();
    enemyTargets.forEach((target: any) => {
        if (target?.enemyPlayer === false) return;
        const value = getTeamValue(target);
        if (value === undefined || value === null) return;
        const key = String(value);
        // Allied IDs should not be included in enemy team columns.
        if (alliedTeamIds.has(key)) return;
        enemyTeamCounts.set(key, (enemyTeamCounts.get(key) || 0) + 1);
    });
    const teamBreakdown = Array.from(enemyTeamCounts.entries())
        .sort((a, b) => {
            const countDelta = b[1] - a[1];
            if (countDelta !== 0) return countDelta;
            return a[0].localeCompare(b[0], undefined, { numeric: true });
        })
        .slice(0, 3)
        .map(([teamId, count]) => ({ teamId, count, color: getWvwTeamColor(Number(teamId), wvwTeamMap) }));

    const fullLabel = buildFightLabelV2({
        zone: details?.fightName || log?.fightName || log?.encounterName || `Fight ${fightIndex + 1}`,
        avgPosition: computeFightAvgPosition(details),
    });

    return {
        id: log.filePath || `fight-${fightIndex}`,
        label: log.encounterName || `Fight ${fightIndex + 1}`,
        fullLabel,
        permalink: resolvePermalink(details, log),
        timestamp,
        mapName,
        duration: resolveFightDurationLabel(details, log),
        isWin,
        squadCount: squadPrimaries.length > 0 ? squadPrimaries.length : Math.max(0, Number(summary?.squadCount || 0)),
        allyCount: pugPrimaries.length,
        enemyCount: enemyTargets.length > 0 ? enemyTargets.length : Math.max(0, Number(summary?.enemyCount || 0)),
        teamBreakdown,
        alliesDown: squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.downCount || 0), 0),
        alliesDead: squadPlayers.length > 0
            ? squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.deadCount || 0), 0)
            : Math.max(0, Number(summary?.squadDeaths || 0)),
        // Number of distinct allied players who were revived at least once (not total revive events).
        alliesRevived: squadPlayers.reduce((sum: number, p: any) => (
            Number(p.statsAll?.[0]?.saved || 0) > 0 ? sum + 1 : sum
        ), 0),
        rallies: 0,
        enemyDeaths: enemyTargets.length > 0 || squadPlayers.length > 0
            ? enemyDeaths
            : Math.max(0, Number(summary?.enemyDeaths || 0)),
        enemyDowns: Math.max(0, enemyDownsDeaths - enemyDeaths),
        totalOutgoingDamage: totalOutgoing,
        totalIncomingDamage: totalIncoming,
        totalOutgoingStrips: squadPlayers.reduce((sum: number, p: any) => sum + (p.support?.[0]?.boonStrips || 0), 0),
        totalIncomingStrips: squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.boonStrips || 0), 0),
        // Raw count of boons applied to the squad this fight (precomputed per
        // player by pruneDetailsForStats from the boonsStates timeline).
        totalBoonsApplied: squadPlayers.reduce((sum: number, p: any) => sum + (Number(p.boonsAppliedCount) || 0), 0),
        // Damage the squad's own barrier actually absorbed.
        incomingBarrierAbsorbed: squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.damageBarrier || 0), 0),
        // Barrier the squad put onto squad members. This is the operand that pairs
        // with incomingBarrierAbsorbed for the unused-barrier delta: both are
        // squad-scoped, so the difference is barrier that expired before it was eaten.
        squadBarrierGenerated: squadPlayers.reduce((sum: number, p: any) => sum + Number(computeSquadBarrier(p) || 0), 0),
        // Barrier generated onto ALL allies (squad + non-squad). Kept separate because
        // it overstates the squad-scoped waste calculation.
        outgoingBarrierAbsorbed: squadPlayers.reduce((sum: number, p: any) => {
            const outgoingBarrier = p.extBarrierStats?.outgoingBarrier;
            if (!Array.isArray(outgoingBarrier)) return sum;
            let playerTotal = 0;
            outgoingBarrier.forEach((phase: any) => {
                if (Array.isArray(phase)) {
                    phase.forEach((entry: any) => {
                        playerTotal += Number(entry?.barrier || 0);
                    });
                    return;
                }
                playerTotal += Number(phase?.barrier || 0);
            });
            return sum + playerTotal;
        }, 0),
        squadClassCountsFight,
        allyClassCountsFight,
        enemyClassCounts
    };
}

export const computeFightBreakdown = (sortedFightLogs: Array<{ log: any }>) => {
    return sortedFightLogs.map(({ log }, idx) => ingestLogFightBreakdown(log, idx));
};
