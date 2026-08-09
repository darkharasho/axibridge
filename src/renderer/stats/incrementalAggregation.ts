
import type { DisruptionMethod, IMvpWeightProfiles, IStatsViewSettings } from '../global.d';
import { DEFAULT_DISRUPTION_METHOD, DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';
import { normalizeMvpWeightProfiles, buildMvpMetrics } from './mvpWeightProfiles';
import { formatDurationMs } from './utils/dashboardUtils';
import { getProfessionColor } from '../../shared/professionUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';
import { resolveMapName } from './utils/labelUtils';
import { buildBoonTables, buildBoonLeaderboards } from '../../shared/boonGeneration';
import { partitionSquadPlayers } from '../../shared/playerIdentity';

import {
    createPlayerAggregationAccumulators,
    precomputeGlobalEnemySkillStats,
    ingestLogPlayerData,
    finalizePlayerAggregation,
    resolveProfessionLabel,
    PlayerStats,
    DamageMitigationRow,
    DamageMitigationTotals,
} from './computePlayerAggregation';
import type { PlayerAggregationAccumulators, PlayerAggregationOptions } from './computePlayerAggregation';

import { ingestLogFightBreakdown } from './computeFightBreakdown';
import { ingestLogCommanderStats } from './computeCommanderStats';
import { ingestLogFightDiffMode } from './computeFightDiffMode';
import { ingestLogTagDistanceDeaths } from './computeTagDistanceDeaths';
import { ingestLogDistanceToTag, finalizeDistanceToTag, type DistanceToTagResult } from './computeDistanceToTag';
import { ingestLogOnTagReview, finalizeOnTagReview, type OnTagReviewResult } from './computeOnTagReview';
import { ingestLogHealEffectiveness } from './computeHealEffectivenessData';

import { createSpikeDamageAccumulator, ingestLogSpikeDamage, finalizeSpikeDamage } from './computeSpikeDamageData';
import { createAllDamageAccumulator, ingestLogAllDamage, finalizeAllDamage } from './computeAllDamageData';
import { createStripSpikesAccumulator, ingestLogStripSpikes, finalizeStripSpikes } from './computeStripSpikesData';
import { createIncomingStrikeDamageAccumulator, ingestLogIncomingStrikeDamage, finalizeIncomingStrikeDamage } from './computeIncomingStrikeDamageData';
import { createSkillUsageAccumulator, ingestLogSkillUsage, finalizeSkillUsage } from './computeSkillUsageData';

import { createBoonTimelineAccumulator, ingestLogBoonTimeline, finalizeBoonTimeline } from './computeBoonTimeline';
import { createBoonUptimeTimelineAccumulator, ingestLogBoonUptimeTimeline, finalizeBoonUptimeTimeline } from './computeBoonUptimeTimeline';
import { createStabPerformanceAccumulator, ingestLogStabPerformance, finalizeStabPerformance } from './computeStabPerformance';

import { computeSpecialTables } from './computeSpecialTables';
import { classifyPlayerRoles } from './classifyPlayerRoles';

import { buildMovementData } from '../../shared/movementData';
import { resolveMapFromZone, computeFightAvgPosition, buildFightLabelV2 } from '../../shared/mapUtils';
import { findNearestLandmark } from '../../shared/wvwLandmarks';
import { TRACKED_REPLAY_BUFF_IDS } from '../../shared/replayBuffs';
import type { ReplayFightPayload, ReplayDpsSample, ReplayKillEvent, DamageSpikeEvent, RallyEvent, TargetFocusSample } from './map/replayTypes';

function memberKey(p: any): string {
    return String(p?.account || p?.name || '');
}

function computeRallyEvents(details: any): RallyEvent[] {
    const events: RallyEvent[] = [];
    for (const p of details?.players ?? []) {
        if (p?.isFake || p?.notInSquad) continue;
        const downs: [number, number][] = p?.combatReplayData?.down ?? [];
        const deaths: [number, number][] = p?.combatReplayData?.dead ?? [];
        for (const [downStart, downEnd] of downs) {
            if (downEnd <= 0) continue;
            const diedFromThisDown = deaths.some(([dStart]) => Math.abs(dStart - downStart) <= 250 || (dStart >= downStart && dStart <= downEnd));
            if (!diedFromThisDown) {
                events.push({ timeMs: downEnd, memberKey: memberKey(p) });
            }
        }
    }
    events.sort((a, b) => a.timeMs - b.timeMs);
    return events;
}

function rollingMedian(arr: number[], windowEnd: number, windowSize: number): number {
    const start = Math.max(0, windowEnd - windowSize);
    const slice = arr.slice(start, windowEnd);
    if (!slice.length) return 0;
    const sorted = [...slice].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeDamageSpikeEvents(details: any): DamageSpikeEvent[] {
    const events: DamageSpikeEvent[] = [];
    for (const p of details?.players ?? []) {
        if (p?.isFake || p?.notInSquad) continue;
        const cumulative: number[] = p?.damage1S?.[0] ?? [];
        if (cumulative.length < 2) continue;
        const perSecond: number[] = [];
        for (let i = 1; i < cumulative.length; i++) {
            perSecond.push(Math.max(0, cumulative[i] - cumulative[i - 1]));
        }
        const key = memberKey(p);
        for (let i = 0; i < perSecond.length; i++) {
            const magnitude = perSecond[i];
            if (magnitude < 20_000) continue;
            const median = rollingMedian(perSecond, i, 10);
            if (median > 0 && magnitude >= median * 2) {
                events.push({ timeMs: (i + 1) * 1000, memberKey: key, magnitude });
            }
        }
    }
    events.sort((a, b) => a.timeMs - b.timeMs);
    return events;
}

function computeTargetFocusSamples(details: any): TargetFocusSample[] {
    const samples: TargetFocusSample[] = [];
    const players = details?.players ?? [];
    const numSeconds = Math.max(
        0,
        ...players.map((p: any) => {
            const series: number[][] | undefined = p?.targetDamage1S?.[0];
            if (!series?.length) return 0;
            return Math.max(...series.map((s: number[]) => s?.length ?? 0));
        }),
    );
    if (numSeconds === 0) return samples;

    const WINDOW_S = 2;
    for (const p of players) {
        if (p?.isFake || p?.notInSquad) continue;
        const series: number[][] | undefined = p?.targetDamage1S?.[0];
        if (!series?.length) continue;
        const key = memberKey(p);
        for (let t = WINDOW_S; t < numSeconds; t++) {
            let bestTarget = -1;
            let bestDamage = 0;
            for (let ti = 0; ti < series.length; ti++) {
                const arr = series[ti];
                if (!arr || arr.length <= t) continue;
                const start = Math.max(0, t - WINDOW_S);
                const delta = Math.max(0, arr[t] - (arr[start] ?? 0));
                if (delta > bestDamage) {
                    bestDamage = delta;
                    bestTarget = ti;
                }
            }
            if (bestTarget >= 0 && bestDamage > 0) {
                samples.push({ timeMs: t * 1000, memberKey: key, targetIndex: bestTarget });
            }
        }
    }
    samples.sort((a, b) => a.timeMs - b.timeMs || a.memberKey.localeCompare(b.memberKey));
    return samples;
}

export function buildReplayFightPayload(log: any, fightIndex: number, opts?: { precisePositions?: boolean }): ReplayFightPayload | null {
    const details = log?.details;
    if (!details) return null;

    const movement = buildMovementData(details, {
        trackedBuffIds: TRACKED_REPLAY_BUFF_IDS,
        localAccount: log?.recordedAccount,
        localName: log?.recordedBy,
        precisePositions: opts?.precisePositions,
    });
    if (!movement) return null;

    const avgPosition = computeFightAvgPosition(details);
    const zone = details?.fightName || log?.encounterName || `Fight ${fightIndex + 1}`;
    const mapKey = resolveMapFromZone(String(zone));
    const landmark = (mapKey && avgPosition)
        ? findNearestLandmark(mapKey, avgPosition[0], avgPosition[1])?.name ?? null
        : null;

    const fightId = String(log?.id || log?.filePath || `fight-${fightIndex}`);
    const label = buildFightLabelV2({
        zone: String(zone),
        durationMs: Number(details?.durationMS) || 0,
        avgPosition,
    });

    const squadMembers = movement.members.filter(m => !m.isEnemy && m.inSquad);
    const kills = movement.members.filter(m => m.isEnemy && m.deadRanges.length > 0).length;
    const deaths = squadMembers.filter(m => m.deadRanges.length > 0).length;

    const dpsSamples: ReplayDpsSample[] = computeSquadDpsSamples(details);
    const killEvents: ReplayKillEvent[] = collectKillEvents(movement);
    const rallyEvents = computeRallyEvents(details);
    const damageSpikeEvents = computeDamageSpikeEvents(details);
    const targetFocusSamples = computeTargetFocusSamples(details);

    return {
        fightId,
        fightIndex,
        label,
        timestampMs: Number(log?.uploadTime ? log.uploadTime * 1000 : log?.timestampMs ?? 0),
        durationMs: Number(details?.durationMS) || 0,
        mapKey,
        mapImageUrl: details?.combatReplayMetaData?.maps?.[0]?.url ?? null,
        mapSize: details?.combatReplayMetaData?.sizes ?? null,
        sectorOwners: log?.sectorOwners ?? null,
        avgPosition,
        nearestLandmark: landmark,
        squadSize: squadMembers.length,
        kills,
        deaths,
        movementData: movement,
        dpsSamples,
        killEvents,
        damageSpikeEvents,
        rallyEvents,
        targetFocusSamples,
    };
}

function computeSquadDpsSamples(details: any): ReplayDpsSample[] {
    const squad = Array.isArray(details?.players) ? details.players.filter((p: any) => !p?.notInSquad && !p?.isFake) : [];
    if (!squad.length) return [];
    const seriesLen = Math.max(...squad.map((p: any) => p?.damage1S?.[0]?.length ?? 0));
    if (seriesLen === 0) return [];

    const samples: ReplayDpsSample[] = [];
    for (let t = 1; t < seriesLen; t++) {
        let total = 0;
        for (const p of squad) {
            const arr = p?.damage1S?.[0];
            if (!arr || arr.length <= t) continue;
            total += (arr[t] - arr[t - 1]);
        }
        samples.push({ timeMs: t * 1000, squadDps: total });
    }
    return samples;
}

function collectKillEvents(movement: any): ReplayKillEvent[] {
    const events: ReplayKillEvent[] = [];
    for (const m of movement.members) {
        for (const [deadAt] of m.deadRanges) {
            events.push({ timeMs: deadAt, victimName: m.name, isAlly: !m.isEnemy });
        }
    }
    events.sort((a, b) => a.timeMs - b.timeMs);
    return events;
}

export interface IncrementalAggregatorOptions {
    precomputedStats?: any;
    mvpWeights?: IMvpWeightProfiles | unknown; // carries profiles; legacy/undefined tolerated by the normalizer
    statsViewSettings?: IStatsViewSettings;
    disruptionMethod?: DisruptionMethod;
    includePlayerSkillMap?: boolean;
    preciseReplay?: boolean;
}

// ---- Lightweight per-log metadata stored for sorting/finalize ----

interface LogMeta {
    id: string;
    timestamp: number;
    hasDetailedRoster: boolean;
    originalIndex: number;
}

// Lightweight timeline entry computed per-log (all logs, not just valid)
interface TimelineEntry {
    timestamp: number;
    squadCount: number;
    friendlyCount: number;
    enemies: number;
    isWin: boolean | null;
    originalIndex: number;
}

// Stored per-valid-log result from ingestLogFightBreakdown
interface StoredFightBreakdown {
    timestamp: number;
    originalIndex: number;
    result: any;
}

// Stored per-valid-log result from ingestLogFightDiffMode
interface StoredFightDiffMode {
    timestamp: number;
    originalIndex: number;
    hasDetailedRoster: boolean;
    result: any; // null if no details
}

// Stored per-valid-log result from ingestLogHealEffectiveness
interface StoredHealEffectiveness {
    timestamp: number;
    result: any; // null for invalid logs
}

// Stored per-valid-log result from ingestLogTagDistanceDeaths
interface StoredTagDistanceDeaths {
    timestamp: number;
    result: any;
}

// Stored per-valid-log contributions from ingestLogDistanceToTag
interface StoredDistanceToTagContrib {
    timestamp: number;
    contributions: any; // DistanceContribution[]
}

// Stored per-valid-log contributions from ingestLogOnTagReview
interface StoredOnTagReviewContrib {
    timestamp: number;
    contributions: any; // OnTagReviewContribution[]
}

// Stored per-valid-log for incomingDamagePerSecond computation
interface StoredIncomingDamageEntry {
    fightId: string;
    timestamp: number;
    perSecond: number[];
    buckets5s: number[];
    total: number;
}

// Stored per-valid-log for squadCompByFight computation
interface StoredSquadComp {
    timestamp: number;
    result: any;
}

// Minimal boon table data stored per-valid-log for buildBoonTables
interface StoredBoonTableLog {
    details: any;
}

// ---- Helpers for incomingDamagePerSecond ----

const normalizeCumulative = (value: any): number[] => {
    if (!Array.isArray(value) || value.length === 0) return [];
    const first = value[0];
    if (typeof first === 'number') return value.map((e: any) => Number(e || 0));
    if (Array.isArray(first) && first.length > 0 && typeof first[0] === 'number') {
        return first.map((e: any) => Number(e || 0));
    }
    return [];
};

const toDeltas = (series: number[]) => {
    const out: number[] = [];
    for (let i = 0; i < series.length; i += 1) {
        out.push(Math.max(0, Number(series[i] || 0) - (i > 0 ? Number(series[i - 1] || 0) : 0)));
    }
    return out;
};

const toBuckets = (deltas: number[], size: number) => {
    const out: number[] = [];
    for (let i = 0; i < deltas.length; i += size) {
        let sum = 0;
        for (let j = i; j < Math.min(i + size, deltas.length); j += 1) sum += Number(deltas[j] || 0);
        out.push(sum);
    }
    return out;
};

const resolveFightOutcomeForDisplay = (details: any, log: any): boolean | null => {
    const players = Array.isArray(details?.players) ? details.players : [];
    if (players.length > 0) {
        // inline getFightOutcome
        const squadPlayers = players.filter((p: any) => !p.notInSquad);
        let squadDownsDeaths = 0;
        let enemyDownsDeaths = 0;
        squadPlayers.forEach((p: any) => {
            const defenses = p.defenses?.[0];
            if (!defenses) return;
            squadDownsDeaths += Number(defenses.downCount || 0) + Number(defenses.deadCount || 0);
        });
        squadPlayers.forEach((p: any) => {
            if (!p.statsTargets || p.statsTargets.length === 0) return;
            p.statsTargets.forEach((targetStats: any) => {
                if (!Array.isArray(targetStats)) return;
                targetStats.forEach((phaseStats: any) => {
                    if (!phaseStats) return;
                    enemyDownsDeaths += Number(phaseStats.downed || 0) + Number(phaseStats.killed || 0);
                });
            });
        });
        if (squadDownsDeaths > 0 || enemyDownsDeaths > 0) {
            return enemyDownsDeaths > squadDownsDeaths;
        }
        if (typeof details?.success === 'boolean') return details.success;
        return false;
    }
    if (typeof details?.success === 'boolean') return details.success;
    const summary = log?.dashboardSummary;
    if (summary && typeof summary === 'object') {
        if (summary.isWin === true) return true;
        if (summary.isWin === false) return false;
    }
    return null;
};

// ---- Sort helper matching computeTimelineAndMapData ----
const sortByFightOrder = (a: { timestamp: number; originalIndex: number }, b: { timestamp: number; originalIndex: number }) => {
    const aHas = a.timestamp > 0;
    const bHas = b.timestamp > 0;
    if (aHas && bHas && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return a.originalIndex - b.originalIndex;
};

const enrichPrecomputedStats = (input: any, logs: any[]) => {
        if (!input || typeof input !== 'object') return input;
        const fights = Array.isArray(input.fightBreakdown) ? input.fightBreakdown : null;
        if (!fights || fights.length === 0) return input;
        const hasTeamBreakdown = (value: any) =>
            Array.isArray(value) && value.some((entry) => entry && Number(entry.count) > 0);

        const byId = new Map<string, any>();
        const byPermalink = new Map<string, any>();
        logs.forEach((log: any) => {
            const id = log?.filePath || log?.id;
            if (id) byId.set(String(id), log);
            const link = log?.permalink || log?.details?.permalink;
            if (typeof link === 'string' && link.trim()) {
                byPermalink.set(link.trim(), log);
            }
        });

        const normalizedFights = fights.map((fight: any) => {
            if (!fight || typeof fight !== 'object') return fight;
            const keyId = fight.id ? String(fight.id) : '';
            const keyPermalink = typeof fight.permalink === 'string' ? fight.permalink.trim() : '';
            const matchedLog = (keyId ? byId.get(keyId) : undefined) || (keyPermalink ? byPermalink.get(keyPermalink) : undefined);
            if (!matchedLog) return fight;

            let nextFight = fight;
            if (Number(fight.timestamp) <= 0) {
                const resolved = resolveFightTimestamp(matchedLog?.details, matchedLog);
                if (resolved) nextFight = { ...nextFight, timestamp: resolved };
            }
            const detailsTeamBreakdown = matchedLog?.details?.teamBreakdown;
            if (hasTeamBreakdown(detailsTeamBreakdown)) {
                nextFight = { ...nextFight, teamBreakdown: detailsTeamBreakdown };
            }
            return nextFight;
        });

        const existingDiff = Array.isArray((input as any).fightDiffMode) ? (input as any).fightDiffMode : [];
        const hasUsableExistingDiff = existingDiff.some((fight: any) => (
            Array.isArray(fight?.targetFocus) && fight.targetFocus.some((row: any) => Number(row?.damage || 0) > 0 || Number(row?.hits || 0) > 0)
        ));
        const derivedFightDiffMode = hasUsableExistingDiff ? existingDiff : normalizedFights.map((fight: any, idx: number) => {
            const enemyClassCounts = (fight && typeof fight.enemyClassCounts === 'object' && fight.enemyClassCounts)
                ? fight.enemyClassCounts
                : {};
            const classRows = Object.entries(enemyClassCounts as Record<string, number>)
                .map(([label, count]) => ({ label: String(label || 'Unknown'), count: Number(count || 0) }))
                .filter((row) => row.count > 0)
                .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
            const totalCount = classRows.reduce((sum, row) => sum + row.count, 0);
            const targetFocus = classRows.map((row) => ({
                label: row.label,
                damage: row.count,
                hits: 0,
                share: totalCount > 0 ? row.count / totalCount : 0
            }));
            const enemyDowns = Number(fight?.enemyDowns || 0);
            const enemyDeaths = Number(fight?.enemyDeaths || 0);
            const squadDowns = Number(fight?.alliesDown || 0);
            const squadDeaths = Number(fight?.alliesDead || 0);
            const totalOutgoingDamage = Number(fight?.totalOutgoingDamage || 0);
            const totalIncomingDamage = Number(fight?.totalIncomingDamage || 0);
            const squadMetrics = [
                { metricId: 'winFlag', metricLabel: 'Win (1) / Loss (0)', higherIsBetter: true, value: fight?.isWin ? 1 : 0 },
                { metricId: 'squadCount', metricLabel: 'Squad Size', higherIsBetter: true, value: Number(fight?.squadCount || 0) },
                { metricId: 'enemyCount', metricLabel: 'Enemy Count', higherIsBetter: false, value: Number(fight?.enemyCount || 0) },
                { metricId: 'squadKdr', metricLabel: 'Squad KDR', higherIsBetter: true, value: squadDeaths > 0 ? (enemyDeaths / squadDeaths) : enemyDeaths },
                { metricId: 'enemyDeaths', metricLabel: 'Enemy Deaths', higherIsBetter: true, value: enemyDeaths },
                { metricId: 'enemyDowns', metricLabel: 'Enemy Downs', higherIsBetter: true, value: enemyDowns },
                { metricId: 'squadDeaths', metricLabel: 'Squad Deaths', higherIsBetter: false, value: squadDeaths },
                { metricId: 'squadDowns', metricLabel: 'Squad Downs', higherIsBetter: false, value: squadDowns },
                { metricId: 'damageDelta', metricLabel: 'Damage Delta', higherIsBetter: true, value: totalOutgoingDamage - totalIncomingDamage },
                { metricId: 'outgoingDamage', metricLabel: 'Outgoing Damage', higherIsBetter: true, value: totalOutgoingDamage },
                { metricId: 'incomingDamage', metricLabel: 'Incoming Damage', higherIsBetter: false, value: totalIncomingDamage },
                { metricId: 'barrierIncomingAbsorb', metricLabel: 'Barrier Absorption (Incoming)', higherIsBetter: true, value: Number(fight?.incomingBarrierAbsorbed || 0) },
                { metricId: 'enemyBarrierAbsorb', metricLabel: 'Enemy Barrier Absorption', higherIsBetter: false, value: Number(fight?.outgoingBarrierAbsorbed || 0) },
                { metricId: 'alliesRevived', metricLabel: 'Allies Revived (Players)', higherIsBetter: true, value: Number(fight?.alliesRevived || 0) }
            ];
            return {
                id: String(fight?.id || `fight-${idx + 1}`),
                shortLabel: `F${idx + 1}`,
                fullLabel: fight?.fullLabel || `${String(fight?.mapName || fight?.label || 'Unknown Map')} • ${String(fight?.duration || '--:--')}`,
                mapName: String(fight?.mapName || ''),
                timestamp: Number(fight?.timestamp || 0),
                duration: String(fight?.duration || '--:--'),
                isWin: Boolean(fight?.isWin),
                targetFocus,
                squadMetrics
            };
        });

        return { ...input, fightBreakdown: normalizedFights, fightDiffMode: derivedFightDiffMode };
};

export class IncrementalAggregator {
    private options: IncrementalAggregatorOptions;
    private logCount = 0;
    private validLogCount = 0;
    private precomputedLogs: any[] = [];

    // Settings
    private activeStatsViewSettings: IStatsViewSettings;
    private activeMvpProfiles: IMvpWeightProfiles;
    private method: DisruptionMethod;
    private splitPlayersByClass: boolean;
    private minParticipationPercent: number;
    private skillDamageSource: string;
    private topSkillsMetric: string;
    private shouldIncludePlayerSkillMap: boolean;

    // Player aggregation
    private playerAcc: PlayerAggregationAccumulators;
    private playerOptions: PlayerAggregationOptions;

    // Damage mod map
    private mergedDamageModMap: Record<string, { name: string; icon: string; description: string; incoming: boolean }> = {};
    private personalDamageModKeys = new Set<string>();

    // Per-log results stored for sorting during finalize
    private logMetas: LogMeta[] = [];
    private timelineEntries: TimelineEntry[] = [];
    private fightBreakdowns: StoredFightBreakdown[] = [];
    private fightDiffModes: StoredFightDiffMode[] = [];
    private healEffectivenessResults: StoredHealEffectiveness[] = [];
    private tagDistanceDeathsResults: StoredTagDistanceDeaths[] = [];
    private distanceToTagContribs: StoredDistanceToTagContrib[] = [];
    private onTagReviewContribs: StoredOnTagReviewContrib[] = [];
    private incomingDamageEntries: StoredIncomingDamageEntry[] = [];
    private squadCompEntries: StoredSquadComp[] = [];

    // Commander stats accumulator
    private commanderStatsAcc = new Map<string, any>();

    // Accumulative functions
    private spikeAcc;
    private allDamageAcc;
    private stripSpikesAcc;
    private incomingStrikeAcc;
    private skillUsageAcc;

    // Boon timelines
    private boonTimelineAcc;
    private boonUptimeAcc;
    private stabPerfAcc;

    // Map counts
    private mapCounts: Record<string, number> = {};

    // Enemy name counts fallback
    private enemyNameCounts: Record<string, number> = {};

    // Stored boon table logs (minimal - just details reference for buildBoonTables)
    private boonTableLogs: StoredBoonTableLog[] = [];
    private replayPayloads: ReplayFightPayload[] = [];

    constructor(options: IncrementalAggregatorOptions = {}) {
        this.options = options;

        this.activeStatsViewSettings = options.statsViewSettings || DEFAULT_STATS_VIEW_SETTINGS;
        this.activeMvpProfiles = normalizeMvpWeightProfiles(options.mvpWeights);
        this.method = options.disruptionMethod || DEFAULT_DISRUPTION_METHOD;
        this.splitPlayersByClass = Boolean(this.activeStatsViewSettings.splitPlayersByClass);
        this.minParticipationPercent = this.activeStatsViewSettings.minParticipationPercent ?? 0;
        this.skillDamageSource = this.activeStatsViewSettings.topSkillDamageSource || 'target';
        this.topSkillsMetric = this.activeStatsViewSettings.topSkillsMetric || 'damage';
        this.shouldIncludePlayerSkillMap = options.includePlayerSkillMap !== false;

        this.playerAcc = createPlayerAggregationAccumulators();
        this.playerOptions = {
            method: this.method,
            skillDamageSource: this.skillDamageSource,
            splitPlayersByClass: this.splitPlayersByClass,
        };

        this.spikeAcc = createSpikeDamageAccumulator();
        this.allDamageAcc = createAllDamageAccumulator();
        this.stripSpikesAcc = createStripSpikesAccumulator();
        this.incomingStrikeAcc = createIncomingStrikeDamageAccumulator();
        this.skillUsageAcc = createSkillUsageAccumulator();

        const boonIntervalSettings = {
            boonBucketIntervalMs: this.activeStatsViewSettings.boonBucketIntervalMs ?? 5000,
            stackingBoonBucketIntervalMs: this.activeStatsViewSettings.stackingBoonBucketIntervalMs ?? 5000,
        };
        this.boonTimelineAcc = createBoonTimelineAccumulator();
        this.boonUptimeAcc = createBoonUptimeTimelineAccumulator(boonIntervalSettings);
        this.stabPerfAcc = createStabPerformanceAccumulator();
    }

    /** Process a single log and accumulate results. The log is NOT stored. */
    ingestLog(log: any): void {
        if (this.options.precomputedStats) {
            // When precomputed stats are provided, we don't process logs incrementally.
            // Store minimal metadata for enrichment in finalize.
            this.logMetas.push({
                id: log?.filePath || log?.id || `log-${this.logCount}`,
                timestamp: resolveFightTimestamp(log?.details, log),
                hasDetailedRoster: this.hasDetailedRoster(log),
                originalIndex: this.logCount,
            });
            this.precomputedLogs.push(log);
            this.logCount++;
            return;
        }

        const idx = this.logCount;
        this.logCount++;

        const hasDetail = this.hasDetailedRoster(log);

        // Store log meta for sorting
        this.logMetas.push({
            id: log?.filePath || log?.id || `log-${idx}`,
            timestamp: resolveFightTimestamp(log?.details, log),
            hasDetailedRoster: hasDetail,
            originalIndex: idx,
        });

        // Timeline entry (all logs)
        const details = log?.details;
        const players = Array.isArray(details?.players) ? details.players : [];
        const targets = Array.isArray(details?.targets) ? details.targets : [];
        const summary = log?.dashboardSummary && typeof log.dashboardSummary === 'object'
            ? log.dashboardSummary
            : null;
        const { squadPrimaries, pugPrimaries } = partitionSquadPlayers(players);
        const enemyTargets = targets.filter((t: any) => !t.isFake);
        const summarySquadCount = Math.max(0, Number(summary?.squadCount || 0));
        const summaryEnemyCount = Math.max(0, Number(summary?.enemyCount || 0));
        const squadCount = squadPrimaries.length > 0 ? squadPrimaries.length : summarySquadCount;
        const enemies = enemyTargets.length > 0 ? enemyTargets.length : summaryEnemyCount;
        const friendlyCount = players.length > 0 ? squadPrimaries.length + pugPrimaries.length : squadCount;

        const timestamp = resolveFightTimestamp(details, log);

        this.timelineEntries.push({
            timestamp,
            squadCount,
            friendlyCount,
            enemies,
            isWin: resolveFightOutcomeForDisplay(details, log),
            originalIndex: idx,
        });

        // Fight breakdown and diff mode for ALL logs (including non-detailed placeholders)
        this.fightBreakdowns.push({
            timestamp,
            originalIndex: idx,
            result: ingestLogFightBreakdown(log, idx), // idx is temporary, will be re-assigned in finalize
        });

        this.fightDiffModes.push({
            timestamp,
            originalIndex: idx,
            hasDetailedRoster: hasDetail,
            result: ingestLogFightDiffMode(log, idx), // idx is temporary
        });

        if (!hasDetail) return;

        // From here on, log is a "valid" log (has detailed roster)
        this.validLogCount++;

        // 1. Merge damageModMap
        const modMap = details?.damageModMap;
        if (modMap && typeof modMap === 'object') {
            for (const [key, value] of Object.entries(modMap)) {
                if (!this.mergedDamageModMap[key] && value && typeof value === 'object') {
                    const v = value as any;
                    this.mergedDamageModMap[key] = {
                        name: v.name ?? '',
                        icon: v.icon ?? '',
                        description: v.description ?? '',
                        incoming: v.incoming ?? false,
                    };
                }
            }
        }
        const personalMods = details?.personalDamageMods;
        if (personalMods && typeof personalMods === 'object') {
            for (const ids of Object.values(personalMods)) {
                if (Array.isArray(ids)) {
                    for (const id of ids) this.personalDamageModKeys.add(`d${id}`);
                }
            }
        }

        // Replay payload
        const replayPayload = buildReplayFightPayload(log, idx, { precisePositions: this.options.preciseReplay });
        if (replayPayload !== null) this.replayPayloads.push(replayPayload);

        // 2. Core player aggregation
        precomputeGlobalEnemySkillStats(log, this.playerAcc);
        ingestLogPlayerData(log, this.playerAcc, this.playerOptions);

        // Heal effectiveness
        this.healEffectivenessResults.push({
            timestamp,
            result: ingestLogHealEffectiveness(log, idx), // idx is temporary
        });

        // Tag distance deaths
        this.tagDistanceDeathsResults.push({
            timestamp,
            result: ingestLogTagDistanceDeaths(log, idx), // idx/shortLabel temporary, reassigned in finalize
        });

        // Distance to tag (per-player aggregation)
        this.distanceToTagContribs.push({
            timestamp,
            contributions: ingestLogDistanceToTag(log, idx),
        });

        // On Tag Review (per-player death classification)
        this.onTagReviewContribs.push({
            timestamp,
            contributions: ingestLogOnTagReview(log, idx),
        });

        // 4. Accumulative functions
        ingestLogSpikeDamage(log, this.spikeAcc, { splitPlayersByClass: this.splitPlayersByClass });
        ingestLogAllDamage(log, this.allDamageAcc, { splitPlayersByClass: this.splitPlayersByClass });
        ingestLogStripSpikes(log, this.stripSpikesAcc, { splitPlayersByClass: this.splitPlayersByClass });
        ingestLogIncomingStrikeDamage(log, this.incomingStrikeAcc);
        ingestLogSkillUsage(log, this.skillUsageAcc);

        // 5. Boon timelines
        ingestLogBoonTimeline(log, this.boonTimelineAcc);
        ingestLogBoonUptimeTimeline(log, this.boonUptimeAcc);
        ingestLogStabPerformance(log, this.stabPerfAcc);

        // 6. incomingDamagePerSecond
        this.processIncomingDamagePerSecond(log, idx);

        // 7. squadCompByFight
        this.processSquadComp(log, idx);

        // 8. Enemy class fallback
        if (details?.targets) {
            details.targets.forEach((t: any) => {
                if (t.isFake) return;
                const rawName = (t.profession && t.profession !== 'Unknown') ? t.profession : (t.name || t.id || 'Unknown');
                const name = resolveProfessionLabel(rawName);
                this.enemyNameCounts[name] = (this.enemyNameCounts[name] || 0) + 1;
            });
        }

        // Map counts
        const mapName = resolveMapName(details, log);
        this.mapCounts[mapName] = (this.mapCounts[mapName] || 0) + 1;

        // Store only the fields buildBoonTables actually reads — the full
        // details object is far too large to keep for every log (OOM at ~89 logs).
        this.boonTableLogs.push({
            details: details ? {
                durationMS: details.durationMS,
                buffMap: details.buffMap,
                players: (details.players || []).map((p: any) => ({
                    account: p.account,
                    name: p.name,
                    character_name: p.character_name,
                    profession: p.profession,
                    group: p.group,
                    activeTimes: p.activeTimes ? [p.activeTimes[0]] : [],
                    notInSquad: p.notInSquad,
                    selfBuffs: p.selfBuffs,
                    groupBuffs: p.groupBuffs,
                    squadBuffs: p.squadBuffs,
                })),
            } : undefined,
        });

        // Commander stats - use the stored result from accumulator
        // We call ingestLogCommanderStats but need the sorted index later.
        // Store the data needed for finalize.
        // Actually, commander stats are accumulated into the Map during ingestLogCommanderStats.
        // The idx parameter is only used for fallback label generation.
        // We'll call it during finalize with proper sorted indices instead.
        // For now, store log data needed for commander stats.
        // Wait - we can't store the log. Let me think...
        // ingestLogCommanderStats processes the log and accumulates into the Map.
        // The idx affects: fight row id fallback, shortLabel, fullLabel.
        // Since these need sorted indices, we need to either:
        // a) Call it now and fix labels in finalize
        // b) Store minimal data for commander stats processing
        //
        // Let's call it now with the current idx. The commander fight rows
        // will have temporary labels. We'll fix them in finalize after sorting.
        // Actually, the commanderStats finalize function (computeCommanderStats)
        // sorts fight rows by timestamp internally. So the labels from
        // ingestLogCommanderStats are just initial values that get re-sorted.
        // The shortLabel `F${idx+1}` is used in the fight rows which are later
        // sorted by timestamp in the finalize function. So the idx only affects
        // the fallback id.
        ingestLogCommanderStats(log, idx, this.commanderStatsAcc);
    }

    /** Finalize aggregation and return the result. */
    finalize(): { stats: any; skillUsageData: any } {
        if (this.options.precomputedStats) {
            return {
                stats: enrichPrecomputedStats(this.options.precomputedStats, this.precomputedLogs),
                skillUsageData: null,
            };
        }

        const total = this.validLogCount;

        // 1. Finalize player aggregation
        finalizePlayerAggregation(this.playerAcc);

        const {
            playerStats, skillDamageMap, incomingSkillDamageMap, playerSkillBreakdownMap,
            healingBreakdownMap,
            outgoingCondiTotals, incomingCondiTotals, enemyProfessionCounts,
            specialBuffMeta, specialBuffAgg, specialBuffOutputAgg,
            damageMitigationPlayersMap, damageMitigationMinionsMap,
            wins, losses, totalSquadSizeAccum, totalEnemiesAccum,
            totalSquadDeaths, totalSquadKills, totalEnemyDeaths, totalEnemyKills,
            totalSquadDowns, totalEnemyDowns,
        } = this.playerAcc;

        // 2. Finalize accumulators
        const spikeDamage = finalizeSpikeDamage(this.spikeAcc);
        const allDamage = finalizeAllDamage(this.allDamageAcc);
        const stripSpikes = finalizeStripSpikes(this.stripSpikesAcc);
        const incomingStrikeDamage = finalizeIncomingStrikeDamage(this.incomingStrikeAcc);
        const skillUsageData = finalizeSkillUsage(this.skillUsageAcc);

        // 3. Finalize boon timelines
        const boonTimeline = finalizeBoonTimeline(this.boonTimelineAcc);
        const boonUptimeTimeline = finalizeBoonUptimeTimeline(this.boonUptimeAcc);
        const stabPerformanceDrilldown = finalizeStabPerformance(this.stabPerfAcc);

        // 4. Build boon tables from stored log data
        const { boonTables } = buildBoonTables(this.boonTableLogs, this.splitPlayersByClass);
        const boonLeaderboards = buildBoonLeaderboards(boonTables, this.activeStatsViewSettings.mvpBoonMetric || 'uptime');

        // 5. Sort and build timeline/map data
        // Sort ALL logs by fight order for timeline
        const sortedTimeline = [...this.timelineEntries].sort(sortByFightOrder);
        const timelineData = sortedTimeline.map((entry, index) => ({
            timestamp: entry.timestamp,
            squadCount: entry.squadCount,
            friendlyCount: entry.friendlyCount,
            enemies: entry.enemies,
            isWin: entry.isWin,
            index: index + 1,
            label: `Log ${index + 1}`,
        }));

        // Map data from accumulated counts
        const mapData = Object.entries(this.mapCounts)
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

        // 6. Sort fight breakdowns and reassign indices so F1 = earliest fight
        const sortedFightBreakdowns = [...this.fightBreakdowns].sort(sortByFightOrder);
        const fightBreakdown = sortedFightBreakdowns.map((stored, idx) => {
            const result = { ...stored.result };
            result.shortLabel = `F${idx + 1}`;
            // Fix fallback id if needed
            if (!result.id || result.id.startsWith('fight-')) {
                result.id = result.id || `fight-${idx}`;
            }
            return result;
        });

        // Sort fight diff modes (only valid logs with details, sorted by timestamp)
        const sortedFightDiffModes = [...this.fightDiffModes]
            .filter(stored => stored.hasDetailedRoster)
            .sort(sortByFightOrder);
        const fightDiffMode = sortedFightDiffModes
            .map((stored, idx) => {
                if (!stored.result) return null;
                const result = { ...stored.result };
                result.shortLabel = `F${idx + 1}`;
                return result;
            })
            .filter(Boolean);

        // 7. Build commander stats from accumulated Map
        // computeCommanderStats finalizes from the Map already built by ingestLogCommanderStats
        // We need to call the finalization logic
        const commanderStats = this.finalizeCommanderStats();

        // Sort heal effectiveness by timestamp
        const sortedHealEffectiveness = [...this.healEffectivenessResults]
            .sort((a, b) => a.timestamp - b.timestamp);
        const healEffectiveness = sortedHealEffectiveness
            .flatMap((stored, index) => {
                if (!stored.result) return [];
                const result = { ...stored.result };
                result.shortLabel = `F${index + 1}`;
                return [result];
            });

        // Tag distance deaths - sort by timestamp so F1 = earliest fight
        const sortedTagDistance = [...this.tagDistanceDeathsResults]
            .sort((a, b) => a.timestamp - b.timestamp);
        const tagDistanceDeaths = sortedTagDistance.map((stored, idx) => {
            const result = { ...stored.result };
            const shortLabel = `F${idx + 1}`;
            result.shortLabel = shortLabel;
            if (Array.isArray(result.events)) {
                result.events = result.events.map((event: any) => ({ ...event, shortLabel }));
            }
            return result;
        });

        // Distance to tag — finalize from all collected contributions
        const distanceToTag: DistanceToTagResult = finalizeDistanceToTag(
            this.distanceToTagContribs.flatMap(s => s.contributions || [])
        );

        // On Tag Review — sort by timestamp so Off-Tag ranges list chronologically
        const onTagReview: OnTagReviewResult = finalizeOnTagReview(
            [...this.onTagReviewContribs]
                .sort((a, b) => a.timestamp - b.timestamp)
                .flatMap(s => s.contributions || [])
        );

        // Sort incomingDamagePerSecond entries by timestamp and build map
        const sortedIncomingDamage = [...this.incomingDamageEntries]
            .sort((a, b) => a.timestamp - b.timestamp);
        const incomingDamagePerSecondByFightId: Record<string, { perSecond: number[]; buckets5s: number[]; total: number }> = {};
        sortedIncomingDamage.forEach((entry, fightIndex) => {
            const fightId = entry.fightId || `fight-${fightIndex + 1}`;
            incomingDamagePerSecondByFightId[fightId] = {
                perSecond: entry.perSecond,
                buckets5s: entry.buckets5s,
                total: entry.total,
            };
        });

        // Sort squadComp by timestamp
        const sortedSquadComp = [...this.squadCompEntries]
            .sort((a, b) => a.timestamp - b.timestamp);
        const squadCompByFight = sortedSquadComp.map((stored, idx) => {
            const result = { ...stored.result };
            result.label = `F${idx + 1}`;
            if (!result.id || result.id.startsWith('fight-')) {
                result.id = result.id || `fight-${idx + 1}`;
            }
            return result;
        });

        // ---- Post-processing (replicating computeStatsAggregation lines 194-860) ----

        const avgSquadSize = total > 0 ? Math.round(totalSquadSizeAccum / total) : 0;
        const avgEnemies = total > 0 ? Math.round(totalEnemiesAccum / total) : 0;
        const squadKDR = totalSquadDeaths > 0 ? (totalSquadKills / totalSquadDeaths).toFixed(2) : totalSquadKills > 0 ? '∞' : '0.00';
        const enemyKDR = totalEnemyDeaths > 0 ? (totalEnemyKills / totalEnemyDeaths).toFixed(2) : totalEnemyKills > 0 ? '∞' : '0.00';

        const buildLeaderboard = (items: Array<{ account: string; profession: string; professionList?: string[]; value: number; count?: number }>, higherIsBetter: boolean) => {
            const filtered = items.filter(item => Number.isFinite(item.value) && (higherIsBetter ? item.value > 0 : item.value >= 0));
            const sorted = filtered.sort((a, b) => {
                const diff = higherIsBetter ? b.value - a.value : a.value - b.value;
                return diff !== 0 ? diff : a.account.localeCompare(b.account);
            });
            let lastValue: number | null = null;
            let lastRank = 0;
            return sorted.map((item, index) => {
                if (lastValue === null || item.value !== lastValue) {
                    lastRank = index + 1;
                    lastValue = item.value;
                }
                return { rank: lastRank, ...item };
            });
        };

        /** Derive a per-second or per-minute leaderboard from an already-sorted raw leaderboard. */
        const deriveLeaderboard = (
            rawLeaderboard: Array<{ rank: number; account: string; profession: string; professionList?: string[]; value: number; count?: number }>,
            getVariantVal: (s: PlayerStats, k: string) => number,
            key: string,
        ): typeof rawLeaderboard => {
            return rawLeaderboard.map((entry) => {
                // When splitPlayersByClass is enabled, playerStats keys are "account::profession"
                // but entry.account is the plain account name. Try the split key first.
                let stat = playerStats.get(entry.account);
                if (!stat && this.splitPlayersByClass && entry.profession) {
                    stat = playerStats.get(`${entry.account}::${entry.profession}`);
                }
                const value = stat ? getVariantVal(stat, key) : 0;
                return { ...entry, value };
            });
        };

        const playerEntries = Array.from(playerStats.values()).map(stat => {
            const list = Array.from(stat.professions).filter(p => p !== 'Unknown');
            stat.professionList = list;
            if (list.length > 0) {
                let primary = list[0];
                let maxTime = stat.professionTimeMs[primary] || 0;
                list.forEach(prof => {
                    const t = stat.professionTimeMs[prof] || 0;
                    if (t > maxTime) { maxTime = t; primary = prof; }
                });
                stat.profession = primary;
            }
            return { key: stat.account, stat };
        });

        const totalLogCount = this.logCount;
        const minLogsRequired = this.minParticipationPercent > 0
            ? Math.ceil(totalLogCount * (this.minParticipationPercent / 100))
            : 0;
        const leaderboardEntries = minLogsRequired > 0
            ? playerEntries.filter(({ stat }) => stat.logsJoined >= minLogsRequired)
            : playerEntries;

        const hasMitigationTotals = (totals: DamageMitigationTotals) => Object.values(totals).some((value) => value > 0);

        const hydrateMitigationRow = <T extends DamageMitigationRow>(row: T): T => {
            // When splitPlayersByClass is enabled, playerStats keys are "account::profession"
            // but row.account is just the plain account name. Try the split key first.
            let stat = playerStats.get(row.account);
            if (!stat && this.splitPlayersByClass && row.profession) {
                stat = playerStats.get(`${row.account}::${row.profession}`);
            }
            if (!stat) {
                const fallbackList = row.professionList.length > 0 ? row.professionList : (row.profession ? [row.profession] : []);
                return { ...row, professionList: fallbackList };
            }
            const professionList = stat.professionList && stat.professionList.length > 0
                ? stat.professionList
                : Array.from(stat.professions || []).filter((prof) => prof && prof !== 'Unknown');
            const resolvedProfession = stat.profession || row.profession;
            return {
                ...row,
                profession: resolvedProfession,
                professionList: professionList.length > 0 ? professionList : (resolvedProfession ? [resolvedProfession] : []),
                activeMs: stat.defenseActiveMs || stat.totalFightMs || row.activeMs
            };
        };

        const damageMitigationPlayers = Array.from(damageMitigationPlayersMap.values())
            .map(hydrateMitigationRow)
            .filter((row) => hasMitigationTotals(row.mitigationTotals))
            .sort((a, b) => a.account.localeCompare(b.account));
        const damageMitigationMinions = Array.from(damageMitigationMinionsMap.values())
            .map(hydrateMitigationRow)
            .filter((row) => row.mitigationTotals.totalMitigation > 0)
            .sort((a, b) => {
                const accountSort = a.account.localeCompare(b.account);
                if (accountSort !== 0) return accountSort;
                return String(a.minion || '').localeCompare(String(b.minion || ''));
            });

        // Leaderboards
        const getVal = (s: PlayerStats, k: string) => {
            switch (k) {
                case 'downContrib': return s.downContrib;
                case 'barrier': return s.barrier;
                case 'healing': return s.healing;
                case 'dodges': return s.dodges;
                case 'strips': return s.strips;
                case 'cleanses': return s.cleanses;
                case 'cc': return s.cc;
                case 'interrupts': return s.interrupts;
                case 'ccAndInterrupts': return s.cc + s.interrupts;
                case 'stability': return s.stab;
                case 'revives': return s.revives;
                case 'downedHealing': return s.healingTotals['downedHealing'] || 0;
                // DPS is a rate: aggregate as total damage / total fight time across
                // all fights. (s.dps is a sum of per-fight DPS rates — meaningless to
                // surface directly; that produced the inflated "Total DPS" number.)
                case 'dps': return s.totalFightMs > 0 ? s.damage / (s.totalFightMs / 1000) : 0;
                case 'damage': return s.damage;
                case 'participation': return s.logsJoined;
                case 'closestToTag': return (!s.isCommander && s.distCount > 0) ? s.totalDist / s.distCount : Number.POSITIVE_INFINITY;
                case 'kills': return s.kills;
                case 'enemyDowns': return s.enemyDowns;
                case 'damageTaken': return s.damageTaken;
                case 'breakbar': return s.breakbar;
                case 'blocks': return s.blocks;
                case 'evades': return s.evades;
                case 'misses': return s.misses;
                case 'deaths': return s.deaths;
                case 'downsTaken': return s.downs;
                case 'condiDamage': return Object.values(s.outgoingConditions).reduce((sum: number, c: any) => sum + (Number(c?.damage) || 0), 0);
                default: return 0;
            }
        };

        const createLB = (k: string, higher: boolean) => buildLeaderboard(leaderboardEntries.map(({ stat }) => ({
            account: stat.account, profession: stat.profession, professionList: stat.professionList, value: getVal(stat, k), count: stat.logsJoined
        })), higher);

        const leaderboards = {
            downContrib: createLB('downContrib', true),
            barrier: createLB('barrier', true),
            healing: createLB('healing', true),
            dodges: createLB('dodges', true),
            strips: createLB('strips', true),
            cleanses: createLB('cleanses', true),
            cc: createLB('cc', true),
            interrupts: createLB('interrupts', true),
            ccAndInterrupts: createLB('ccAndInterrupts', true),
            stability: createLB('stability', true),
            revives: createLB('revives', true),
            downedHealing: createLB('downedHealing', true),
            participation: createLB('participation', true),
            dps: createLB('dps', true),
            damage: createLB('damage', true),
            closestToTag: createLB('closestToTag', false).filter(i => Number.isFinite(i.value)),
            kills: createLB('kills', true),
            enemyDowns: createLB('enemyDowns', true),
            breakbar: createLB('breakbar', true),
            condiDamage: createLB('condiDamage', true),
            blocks: createLB('blocks', true),
            evades: createLB('evades', true),
            misses: createLB('misses', true),
            deaths: createLB('deaths', false),
            downsTaken: createLB('downsTaken', false),
            damageTaken: createLB('damageTaken', false)
        };

        const statKeys = {
            downContrib: 'downContrib',
            barrier: 'barrier',
            healing: 'healing',
            dodges: 'dodges',
            strips: 'strips',
            cleanses: 'cleanses',
            cc: 'cc',
            interrupts: 'interrupts',
            ccAndInterrupts: 'ccAndInterrupts',
            stability: 'stability',
            // dps/damage are needed so the per-second/per-minute top-stat CARDS have
            // data (Damage /1s == DPS). Without these the cards showed 0 / "No data".
            dps: 'dps',
            damage: 'damage',
            closestToTag: 'closestToTag'
        } as const;

        const getTopFromLeaderboard = (rows: any[]) => {
            const entry = rows?.[0];
            return {
                value: entry?.value ?? 0,
                player: entry?.account ?? '-',
                count: entry?.count ?? 0,
                profession: entry?.profession ?? 'Unknown',
                professionList: entry?.professionList ?? []
            };
        };

        const topStatsPerSecond: any = {
            maxDownContrib: getTopFromLeaderboard([]),
            maxBarrier: getTopFromLeaderboard([]),
            maxHealing: getTopFromLeaderboard([]),
            maxDodges: getTopFromLeaderboard([]),
            maxStrips: getTopFromLeaderboard([]),
            maxCleanses: getTopFromLeaderboard([]),
            maxCC: getTopFromLeaderboard([]),
            maxInterrupts: getTopFromLeaderboard([]),
            maxCCAndInterrupts: getTopFromLeaderboard([]),
            maxStab: getTopFromLeaderboard([]),
            closestToTag: getTopFromLeaderboard([])
        };
        const topStatsPerMinute: any = {
            maxDownContrib: getTopFromLeaderboard([]),
            maxBarrier: getTopFromLeaderboard([]),
            maxHealing: getTopFromLeaderboard([]),
            maxDodges: getTopFromLeaderboard([]),
            maxStrips: getTopFromLeaderboard([]),
            maxCleanses: getTopFromLeaderboard([]),
            maxCC: getTopFromLeaderboard([]),
            maxInterrupts: getTopFromLeaderboard([]),
            maxCCAndInterrupts: getTopFromLeaderboard([]),
            maxStab: getTopFromLeaderboard([]),
            closestToTag: getTopFromLeaderboard([])
        };

        const perSecondLeaderboards: Record<string, any[]> = {};
        const perMinuteLeaderboards: Record<string, any[]> = {};
        // closestToTag is a distance and dps is already a rate (damage/time): both
        // read the same value regardless of the per-second/per-minute mode.
        const isAlreadyRate = (k: string) => k === 'closestToTag' || k === 'dps';
        const getPerSecondVal = (s: PlayerStats, k: string) => {
            if (isAlreadyRate(k)) return getVal(s, k);
            const seconds = Math.max(1, (s.totalFightMs || 0) / 1000);
            return getVal(s, k) / seconds;
        };
        const getPerMinuteVal = (s: PlayerStats, k: string) => {
            if (isAlreadyRate(k)) return getVal(s, k);
            return getPerSecondVal(s, k) * 60;
        };
        Object.values(statKeys).forEach((k) => {
            const rawLB = leaderboards[k as keyof typeof leaderboards];
            if (!rawLB) return;
            perSecondLeaderboards[k] = deriveLeaderboard(rawLB, getPerSecondVal, k);
            perMinuteLeaderboards[k] = deriveLeaderboard(rawLB, getPerMinuteVal, k);
        });

        topStatsPerSecond.maxDownContrib = getTopFromLeaderboard(perSecondLeaderboards.downContrib);
        topStatsPerSecond.maxBarrier = getTopFromLeaderboard(perSecondLeaderboards.barrier);
        topStatsPerSecond.maxHealing = getTopFromLeaderboard(perSecondLeaderboards.healing);
        topStatsPerSecond.maxDodges = getTopFromLeaderboard(perSecondLeaderboards.dodges);
        topStatsPerSecond.maxStrips = getTopFromLeaderboard(perSecondLeaderboards.strips);
        topStatsPerSecond.maxCleanses = getTopFromLeaderboard(perSecondLeaderboards.cleanses);
        topStatsPerSecond.maxCC = getTopFromLeaderboard(perSecondLeaderboards.cc);
        topStatsPerSecond.maxInterrupts = getTopFromLeaderboard(perSecondLeaderboards.interrupts);
        topStatsPerSecond.maxCCAndInterrupts = getTopFromLeaderboard(perSecondLeaderboards.ccAndInterrupts);
        topStatsPerSecond.maxStab = getTopFromLeaderboard(perSecondLeaderboards.stability);
        topStatsPerSecond.closestToTag = getTopFromLeaderboard(perSecondLeaderboards.closestToTag);
        topStatsPerMinute.maxDownContrib = getTopFromLeaderboard(perMinuteLeaderboards.downContrib);
        topStatsPerMinute.maxBarrier = getTopFromLeaderboard(perMinuteLeaderboards.barrier);
        topStatsPerMinute.maxHealing = getTopFromLeaderboard(perMinuteLeaderboards.healing);
        topStatsPerMinute.maxDodges = getTopFromLeaderboard(perMinuteLeaderboards.dodges);
        topStatsPerMinute.maxStrips = getTopFromLeaderboard(perMinuteLeaderboards.strips);
        topStatsPerMinute.maxCleanses = getTopFromLeaderboard(perMinuteLeaderboards.cleanses);
        topStatsPerMinute.maxCC = getTopFromLeaderboard(perMinuteLeaderboards.cc);
        topStatsPerMinute.maxInterrupts = getTopFromLeaderboard(perMinuteLeaderboards.interrupts);
        topStatsPerMinute.maxCCAndInterrupts = getTopFromLeaderboard(perMinuteLeaderboards.ccAndInterrupts);
        topStatsPerMinute.maxStab = getTopFromLeaderboard(perMinuteLeaderboards.stability);
        topStatsPerMinute.closestToTag = getTopFromLeaderboard(perMinuteLeaderboards.closestToTag);

        const topStats = {
            maxDownContrib: getTopFromLeaderboard(leaderboards.downContrib),
            maxBarrier: getTopFromLeaderboard(leaderboards.barrier),
            maxHealing: getTopFromLeaderboard(leaderboards.healing),
            maxDodges: getTopFromLeaderboard(leaderboards.dodges),
            maxStrips: getTopFromLeaderboard(leaderboards.strips),
            maxCleanses: getTopFromLeaderboard(leaderboards.cleanses),
            maxCC: getTopFromLeaderboard(leaderboards.cc),
            maxInterrupts: getTopFromLeaderboard(leaderboards.interrupts),
            maxCCAndInterrupts: getTopFromLeaderboard(leaderboards.ccAndInterrupts),
            maxStab: getTopFromLeaderboard(leaderboards.stability),
            closestToTag: getTopFromLeaderboard(leaderboards.closestToTag)
        };

        // Classify player roles
        const roleClassifications = classifyPlayerRoles(
            playerEntries.map(({ stat }) => stat),
            boonTables,
        );
        for (const [account, classification] of roleClassifications) {
            const stat = playerStats.get(account);
            if (stat) stat.roleClassification = classification;
        }

        // MVP Calculation
        const emptyMvpPlacement = { player: 'None', account: 'None', score: -1, profession: 'Unknown', professionList: [] as string[], color: '#64748b', topStats: [] as any[] };
        let offensiveMvp = { ...emptyMvpPlacement };
        let offensiveSilver: any = undefined;
        let offensiveBronze: any = undefined;
        let defensiveMvp = { ...emptyMvpPlacement };
        let defensiveSilver: any = undefined;
        let defensiveBronze: any = undefined;
        let offensiveAvgMvpScore = 0;
        let defensiveAvgMvpScore = 0;

        if (this.activeStatsViewSettings?.showMvp) {
            const rankByAccount = (lb: any[]) => {
                const rankMap = new Map<string, number>();
                (lb || []).forEach((row: any) => {
                    const account = String(row?.account || '');
                    if (!account || rankMap.has(account)) return;
                    rankMap.set(account, Number(row?.rank || 0));
                });
                return rankMap;
            };

            const offensiveMetrics = buildMvpMetrics(this.activeMvpProfiles.offensive, leaderboards as any, boonLeaderboards, getVal);
            const generalMetrics = buildMvpMetrics(this.activeMvpProfiles.general, leaderboards as any, boonLeaderboards, getVal);
            const defensiveMetrics = buildMvpMetrics(this.activeMvpProfiles.defensive, leaderboards as any, boonLeaderboards, getVal);

            const computeCategoryScores = (metrics: typeof offensiveMetrics, pool?: typeof leaderboardEntries) => {
                const scores: any[] = [];
                const metricRankMaps = metrics.map((metric) => rankByAccount(metric.leaderboard));
                const buildTopStats = (contribs: any[]) =>
                    [...(contribs || [])]
                        .sort((a, b) => (b.ratio * b.weight) - (a.ratio * a.weight) || a.rank - b.rank || a.name.localeCompare(b.name))
                        .slice(0, 3);
                const enrichPlacement = (entry: any) => {
                    if (!entry) return undefined;
                    const topStats = buildTopStats(entry.contribs);
                    return {
                        ...entry,
                        player: entry.name,
                        reason: topStats[0]?.name || 'Top Performance',
                        topStats
                    };
                };

                (pool || leaderboardEntries).forEach(({ stat }) => {
                    let score = 0;
                    const contribs: any[] = [];
                    metrics.forEach((metric, idx) => {
                        if (metric.weight <= 0) return;
                        const best = Number(metric.leaderboard?.[0]?.value || 0);
                        if (!best) return;
                        const val = Number(metric.getter(stat));
                        if (!Number.isFinite(val)) return;
                        const higherIsBetter = metric.higher !== false;
                        if (higherIsBetter ? val <= 0 : val >= Number.POSITIVE_INFINITY || val <= 0) return;
                        const ratio = higherIsBetter ? val / best : best / val;
                        const rank = metricRankMaps[idx].get(stat.account) || 0;
                        score += ratio * metric.weight;
                        contribs.push({ name: metric.name, ratio, weight: metric.weight, val: val.toLocaleString(), rank });
                    });
                    scores.push({ ...stat, score, contribs });
                });
                scores.sort((a, b) => b.score - a.score);
                return {
                    mvp: scores[0] && scores[0].score > 0 ? (enrichPlacement(scores[0]) || { ...emptyMvpPlacement }) : { ...emptyMvpPlacement },
                    silver: enrichPlacement(scores[1]),
                    bronze: enrichPlacement(scores[2]),
                    avgScore: scores.length > 0 ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : 0
                };
            };

            const offensiveCandidates = leaderboardEntries.filter(({ stat }) => stat.roleClassification.role === 'damage');
            const offensivePool = offensiveCandidates.length > 0 ? offensiveCandidates : leaderboardEntries;
            const offensiveScores = computeCategoryScores([...offensiveMetrics, ...generalMetrics], offensivePool);
            offensiveMvp = offensiveScores.mvp;
            offensiveSilver = offensiveScores.silver;
            offensiveBronze = offensiveScores.bronze;
            offensiveAvgMvpScore = offensiveScores.avgScore;

            const defensiveCandidates = leaderboardEntries.filter(({ stat }) => stat.roleClassification.role === 'support');
            const defensivePool = defensiveCandidates.length > 0 ? defensiveCandidates : leaderboardEntries;
            const defensiveScores = computeCategoryScores([...defensiveMetrics, ...generalMetrics], defensivePool);
            defensiveMvp = defensiveScores.mvp;
            defensiveSilver = defensiveScores.silver;
            defensiveBronze = defensiveScores.bronze;
            defensiveAvgMvpScore = defensiveScores.avgScore;
        }

        const topSkillsByDamage = Object.values(skillDamageMap)
            .sort((a, b) => b.damage - a.damage || b.hits - a.hits || String(a.name || '').localeCompare(String(b.name || '')))
            .slice(0, 25);
        const topSkillsByDownContribution = Object.values(skillDamageMap)
            .sort((a, b) => b.downContribution - a.downContribution || b.hits - a.hits || String(a.name || '').localeCompare(String(b.name || '')))
            .slice(0, 25);
        const topSkills = this.topSkillsMetric === 'downContribution' ? topSkillsByDownContribution : topSkillsByDamage;
        const topIncomingSkills = Object.values(incomingSkillDamageMap).sort((a, b) => b.damage - a.damage).slice(0, 25);

        // Squad class data
        const squadClassCounts: Record<string, number> = {};
        Array.from(playerStats.values()).forEach(p => {
            if (p.profession && p.profession !== 'Unknown') {
                squadClassCounts[p.profession] = (squadClassCounts[p.profession] || 0) + 1;
            }
        });
        const squadClassData = Object.entries(squadClassCounts).map(([name, value]) => ({
            name, value, color: getProfessionColor(name)
        })).sort((a, b) => b.value - a.value);

        // Enemy class data
        const enemyCounts = Object.keys(enemyProfessionCounts).length > 0 ? enemyProfessionCounts : this.enemyNameCounts;
        const enemyClassData = Object.entries(enemyCounts).map(([name, value]) => ({
            name, value, color: getProfessionColor(name) || '#f87171'
        })).sort((a, b) => b.value - a.value);

        // Attendance data
        const attendanceData = Array.from(playerStats.values())
            .map((entry) => {
                const classTimes = Object.entries(entry.professionTimeMs || {})
                    .map(([profession, timeMs]) => ({ profession, timeMs: Number(timeMs || 0) }))
                    .filter((row) => row.profession && row.profession !== 'Unknown' && row.timeMs > 0)
                    .sort((a, b) => {
                        const delta = b.timeMs - a.timeMs;
                        if (delta !== 0) return delta;
                        return a.profession.localeCompare(b.profession);
                    });
                return {
                    account: entry.account || 'Unknown',
                    characterNames: Array.from(entry.characterNames || []).filter(Boolean).sort((a, b) => a.localeCompare(b)),
                    classTimes,
                    combatTimeMs: Number(entry.squadActiveMs || entry.totalFightMs || 0),
                    squadTimeMs: (() => {
                        const firstTs = Number(entry.firstSeenFightTs || 0);
                        const lastTs = Number(entry.lastSeenFightTs || 0);
                        const lastDurationMs = Math.max(0, Number(entry.lastSeenFightDurationMs || 0));
                        if (firstTs > 0 && lastTs > 0) {
                            return Math.max(0, (lastTs + lastDurationMs) - firstTs);
                        }
                        return Number(entry.squadActiveMs || entry.totalFightMs || 0);
                    })()
                };
            })
            .filter((row) => row.account && row.account !== 'Unknown')
            .sort((a, b) => {
                const delta = b.squadTimeMs - a.squadTimeMs;
                if (delta !== 0) return delta;
                return String(a.account).localeCompare(String(b.account));
            });

        // Special tables
        const { specialTables, playerSkillBreakdowns, healingBreakdownPlayers } = computeSpecialTables(
            specialBuffAgg,
            specialBuffOutputAgg,
            specialBuffMeta,
            playerStats,
            playerSkillBreakdownMap,
            this.shouldIncludePlayerSkillMap,
            healingBreakdownMap
        );

        const stats = {
            total, wins, losses, avgSquadSize, avgEnemies, squadKDR, enemyKDR,
            totalSquadKills, totalSquadDeaths, totalEnemyKills, totalEnemyDeaths, totalSquadDowns, totalEnemyDowns,
            leaderboards,
            ...topStats,
            outgoingConditionSummary: Object.values(outgoingCondiTotals).sort((a, b) => b.damage - a.damage),
            incomingConditionSummary: Object.values(incomingCondiTotals).sort((a, b) => b.damage - a.damage),
            outgoingConditionPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                conditions: s.outgoingConditions
            })),
            incomingConditionPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                conditions: s.incomingConditions
            })),
            topSkills, topIncomingSkills,
            topSkillsByDamage,
            topSkillsByDownContribution,
            playerSkillBreakdowns,
            healingBreakdownPlayers,
            topSkillsMetric: this.topSkillsMetric,
            mapData, timelineData, boonTables, boonLeaderboards, boonTimeline, boonUptimeTimeline, stabPerformanceDrilldown, incomingDamagePerSecondByFightId,
            offensePlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                offenseTotals: s.offenseTotals, offenseRateWeights: s.offenseRateWeights, totalFightMs: s.totalFightMs
            })),
            defensePlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                defenseTotals: s.defenseTotals, activeMs: s.defenseActiveMs, minionDamageTakenByMinion: s.defenseMinionDamageTaken,
                logsJoined: s.logsJoined
            })),
            damageMitigationPlayers,
            damageMitigationMinions,
            supportPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                supportTotals: s.supportTotals, activeMs: s.supportActiveMs,
                logsJoined: s.logsJoined
            })),
            healingPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                healingTotals: s.healingTotals, activeMs: s.healingActiveMs,
                hasHealAddon: s.hasHealAddon
            })),
            generalPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                totalFightMs: s.totalFightMs, squadActiveMs: s.squadActiveMs,
                totalDist: s.totalDist, distCount: s.distCount,
                logsJoined: s.logsJoined, stackedLogCount: s.stackedLogCount
            })),
            damageModMap: this.mergedDamageModMap,
            personalDamageModKeys: Array.from(this.personalDamageModKeys),
            damageModPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                damageModTotals: s.damageModTotals, totalFightMs: s.totalFightMs,
            })),
            incomingDamageModPlayers: Array.from(playerStats.values()).map(s => ({
                account: s.account, profession: s.profession, professionList: s.professionList,
                incomingDamageModTotals: s.incomingDamageModTotals, totalFightMs: s.totalFightMs,
            })),
            offensiveMvp,
            offensiveSilver,
            offensiveBronze,
            defensiveMvp,
            defensiveSilver,
            defensiveBronze,
            mvp: offensiveMvp,
            silver: offensiveSilver,
            bronze: offensiveBronze,
            squadClassData,
            enemyClassData,
            fightBreakdown,
            commanderStats,
            fightDiffMode,
            replayFights: this.replayPayloads,
            attendanceData,
            squadCompByFight,
            spikeDamage,
            allDamage,
            stripSpikes,
            incomingStrikeDamage,
            healEffectiveness,
            tagDistanceDeaths,
            distanceToTag,
            onTagReview,
            specialTables,
            topStatsPerSecond,
            topStatsLeaderboardsPerSecond: perSecondLeaderboards,
            topStatsPerMinute,
            topStatsLeaderboardsPerMinute: perMinuteLeaderboards,
            offensiveAvgMvpScore,
            defensiveAvgMvpScore,
            avgMvpScore: offensiveAvgMvpScore,
            roleClassifications: Array.from(roleClassifications.entries()).map(([account, c]) => ({
                account,
                profession: playerStats.get(account)?.profession || 'Unknown',
                professionList: playerStats.get(account)?.professionList || [],
                role: c.role,
                supportScore: c.supportScore,
                confidenceScore: c.confidenceScore,
                threshold: c.threshold,
                factors: c.factors,
            }))
        };

        return { stats, skillUsageData };
    }

    // ---- Private helpers ----

    private hasDetailedRoster(log: any): boolean {
        const players = Array.isArray(log?.details?.players) ? log.details.players : [];
        return players.length > 0;
    }

    private processIncomingDamagePerSecond(log: any, idx: number): void {
        const details = log?.details;
        if (!details) return;
        const players = Array.isArray(details.players) ? details.players : [];
        const squadPlayers = players.filter((p: any) => !p?.notInSquad);
        const series = squadPlayers.map((p: any) => toDeltas(normalizeCumulative(p?.damageTaken1S)));
        const maxLen = series.reduce((best: number, s: number[]) => Math.max(best, s.length), 0);
        const summed = new Array<number>(maxLen).fill(0);
        series.forEach((s: number[]) => { for (let i = 0; i < s.length; i += 1) summed[i] += Number(s[i] || 0); });
        const buckets5s = toBuckets(summed, 5);
        const total = squadPlayers.reduce((sum: number, p: any) => {
            const def = Array.isArray(p?.defenses) ? p.defenses[0] : p?.defenses;
            return sum + Math.max(0, Number(def?.damageTaken || 0));
        }, 0);
        // Scale buckets to match the authoritative total
        const bucketSum = buckets5s.reduce((s, v) => s + v, 0);
        if (total > 0 && bucketSum > 0) {
            const scale = total / bucketSum;
            for (let i = 0; i < buckets5s.length; i += 1) buckets5s[i] *= scale;
        }
        const perSecondSum = summed.reduce((s, v) => s + v, 0);
        if (total > 0 && perSecondSum > 0) {
            const scale = total / perSecondSum;
            for (let i = 0; i < summed.length; i += 1) summed[i] *= scale;
        }
        const fightId = String(log?.filePath || log?.id || `fight-${idx + 1}`);
        this.incomingDamageEntries.push({
            fightId,
            timestamp: resolveFightTimestamp(details, log),
            perSecond: summed,
            buckets5s,
            total,
        });
    }

    private processSquadComp(log: any, idx: number): void {
        const details = log?.details;
        if (!details) return;
        const players = Array.isArray(details.players) ? details.players.filter((player: any) => !player?.notInSquad) : [];
        const parties = new Map<number, {
            party: number;
            players: Array<{ account: string; characterName: string; profession: string; isCommander?: boolean }>;
            classCounts: Record<string, number>;
            seenAccounts: Set<string>;
        }>();
        players.forEach((player: any) => {
            const partyRaw = Number(player?.group);
            const party = Number.isFinite(partyRaw) && partyRaw > 0 ? partyRaw : 0;
            if (!parties.has(party)) {
                parties.set(party, { party, players: [], classCounts: {}, seenAccounts: new Set() });
            }
            const profession = resolveProfessionLabel(player?.profession || player?.name || 'Unknown');
            const account = String(player?.account || 'Unknown');
            const characterName = String(player?.name || player?.character_name || '');
            const isCommander = Boolean(player?.hasCommanderTag);
            const row = parties.get(party)!;
            if (row.seenAccounts.has(account)) return;
            row.seenAccounts.add(account);
            row.players.push({ account, characterName, profession, isCommander });
            row.classCounts[profession] = (row.classCounts[profession] || 0) + 1;
        });
        const partyRows = Array.from(parties.values())
            .map(({ seenAccounts: _seen, ...row }) => ({
                ...row,
                players: row.players.sort((a, b) => {
                    const commanderDelta = Number(Boolean(b.isCommander)) - Number(Boolean(a.isCommander));
                    if (commanderDelta !== 0) return commanderDelta;
                    const profDelta = String(a.profession).localeCompare(String(b.profession));
                    if (profDelta !== 0) return profDelta;
                    return String(a.account).localeCompare(String(b.account));
                })
            }))
            .sort((a, b) => {
                if (a.party === 0 && b.party !== 0) return 1;
                if (b.party === 0 && a.party !== 0) return -1;
                return a.party - b.party;
            });
        this.squadCompEntries.push({
            timestamp: resolveFightTimestamp(details, log),
            result: {
                id: String(log?.filePath || log?.id || `fight-${idx + 1}`),
                label: `F${idx + 1}`,
                timestamp: resolveFightTimestamp(details, log),
                mapName: resolveMapName(details, log),
                duration: formatDurationMs(Number(details?.durationMS || 0)),
                parties: partyRows
            }
        });
    }

    private finalizeCommanderStats(): { rows: any[] } {
        // The commanderStatsAcc map already has all accumulated data from ingestLogCommanderStats calls.
        // We need to run the same finalization logic as computeCommanderStats.
        // computeCommanderStats takes sortedFightLogsWithDetails, iterates calling ingestLogCommanderStats,
        // then finalizes from the Map. Since we already called ingestLogCommanderStats during ingest,
        // we just need the finalization part.
        // Import and reuse the finalization from computeCommanderStats.
        // Actually, computeCommanderStats does:
        // 1. Iterate sorted fight logs calling ingestLogCommanderStats -> already done
        // 2. Build rows from the Map -> we need this part

        // The finalization logic from computeCommanderStats (lines 720-828)
        // is self-contained and works on the commanders Map.
        // We can call it directly since it's the second half of computeCommanderStats.
        // But computeCommanderStats is a single function that does both.
        // We need to extract or replicate the finalization.

        // Let's replicate the finalization inline:
        return finalizeCommanderStatsFromMap(this.commanderStatsAcc);
    }
}

// ---- Commander stats finalization extracted from computeCommanderStats ----

const averageDefined = (values: Array<number | null | undefined>) => {
    const filtered = values.filter((value): value is number => (
        typeof value === 'number' && Number.isFinite(value)
    ));
    if (filtered.length === 0) return null;
    return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
};

const percentFromFlags = (values: Array<boolean | null | undefined>) => {
    const filtered = values.filter((value): value is boolean => typeof value === 'boolean');
    if (filtered.length === 0) return null;
    const positive = filtered.reduce((sum, value) => sum + (value ? 1 : 0), 0);
    return (positive / filtered.length) * 100;
};

function finalizeCommanderStatsFromMap(commanders: Map<string, any>): { rows: any[] } {
    const rows = Array.from(commanders.values())
        .map((entry) => {
            const professions = Object.keys(entry.professionTimeMs)
                .filter((name: string) => name && name !== 'Unknown')
                .sort((a: string, b: string) => (entry.professionTimeMs[b] || 0) - (entry.professionTimeMs[a] || 0));
            const primaryProfession = professions[0] || entry.primaryProfession || 'Unknown';
            const weightedBoonUptimePct = entry.boonDurationMs > 0
                ? entry.boonWeightedPctMs / entry.boonDurationMs
                : 0;
            const kdr = entry.totalAlliesDead > 0
                ? entry.totalKills / entry.totalAlliesDead
                : entry.totalKills;
            const totalMinutes = Math.max(1 / 60, entry.totalDurationMs / 60000);
            const fights = [...entry.fightRows].sort((a: any, b: any) => {
                if (a.timestamp > 0 && b.timestamp > 0 && a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
                return a.shortLabel.localeCompare(b.shortLabel, undefined, { numeric: true });
            });
            const avgTimeToFirstEnemyDownMs = averageDefined(fights.map((fight: any) => fight.timeToFirstEnemyDownMs));
            const avgTimeToFirstEnemyDeathMs = averageDefined(fights.map((fight: any) => fight.timeToFirstEnemyDeathMs));
            const avgDownToKillConversionMs = averageDefined(fights.map((fight: any) => fight.downToKillConversionMs));
            const pushesWithEarlyDownPct = percentFromFlags(fights.map((fight: any) => fight.hadEarlyDown));
            const stalledPushPct = percentFromFlags(fights.map((fight: any) => fight.wasStalledPush));
            const downToKillConversionPct = entry.totalDowns > 0
                ? (entry.totalKills / entry.totalDowns) * 100
                : null;
            const avgKillsPerFight = entry.fights > 0 ? entry.totalKills / entry.fights : null;
            const avgDownsPerFight = entry.fights > 0 ? entry.totalDowns / entry.fights : null;
            const failedDownEstimate = Math.max(0, entry.totalDowns - entry.totalKills);
            const avgCommanderDistanceTraveled = averageDefined(fights.map((fight: any) => fight.distanceTraveled));
            const avgCommanderMovementPerMinute = averageDefined(fights.map((fight: any) => fight.movementPerMinute));
            const avgTagStationaryPct = averageDefined(fights.map((fight: any) => fight.stationaryPct));
            const avgTagMovementBurstCount = averageDefined(fights.map((fight: any) => fight.movementBurstCount));
            const fightsWithCommanderDeath = fights.filter((fight: any) => fight.commanderDiedAtMs !== null).length;
            const deathFights = fights.filter((fight: any) => fight.commanderDiedAtMs !== null);
            const avgSquadDeathsAfterTagDeath = averageDefined(deathFights.map((fight: any) => fight.squadDeathsAfterTagDeath));
            const avgEnemyKillsAfterTagDeath = averageDefined(deathFights.map((fight: any) => fight.enemyKillsAfterTagDeath));
            const squadCollapseAfterTagDeathPct = percentFromFlags(deathFights.map((fight: any) => fight.collapsedAfterTagDeath));
            const recoveryAfterTagDeathPct = percentFromFlags(deathFights.map((fight: any) => fight.recoveredAfterTagDeath));
            return {
                key: entry.key,
                account: entry.account,
                characterNames: Array.from(entry.characterNames.values() as Iterable<string>).sort((a, b) => a.localeCompare(b)),
                profession: primaryProfession,
                professionList: professions,
                fights: entry.fights,
                wins: entry.wins,
                losses: entry.losses,
                winRatePct: entry.fights > 0 ? (entry.wins / entry.fights) * 100 : 0,
                totalDurationMs: entry.totalDurationMs,
                avgSquadSize: entry.fights > 0 ? entry.totalSquadCount / entry.fights : 0,
                avgEnemySize: entry.fights > 0 ? entry.totalEnemyCount / entry.fights : 0,
                kills: entry.totalKills,
                downs: entry.totalDowns,
                commanderDowns: entry.totalCommanderDowns,
                commanderDeaths: entry.totalCommanderDeaths,
                alliesDown: entry.totalAlliesDown,
                alliesDead: entry.totalAlliesDead,
                kdr,
                damageTaken: entry.totalDamageTaken,
                damageTakenPerMinute: entry.totalDamageTaken / totalMinutes,
                incomingBarrierAbsorbed: entry.totalIncomingBarrierAbsorbed,
                incomingBarrierAbsorbedPerMinute: entry.totalIncomingBarrierAbsorbed / totalMinutes,
                incomingStrips: entry.totalIncomingStrips,
                incomingStripsPerMinute: entry.totalIncomingStrips / totalMinutes,
                incomingCC: entry.totalIncomingCC,
                incomingCCPerMinute: entry.totalIncomingCC / totalMinutes,
                avgTimeToFirstEnemyDownMs,
                avgTimeToFirstEnemyDeathMs,
                avgDownToKillConversionMs,
                pushesWithEarlyDownPct,
                stalledPushPct,
                downToKillConversionPct,
                avgKillsPerFight,
                avgDownsPerFight,
                failedDownEstimate,
                avgCommanderDistanceTraveled,
                avgCommanderMovementPerMinute,
                avgTagStationaryPct,
                avgTagMovementBurstCount,
                fightsWithCommanderDeath,
                avgSquadDeathsAfterTagDeath,
                avgEnemyKillsAfterTagDeath,
                squadCollapseAfterTagDeathPct,
                recoveryAfterTagDeathPct,
                boonUptimePct: weightedBoonUptimePct,
                boonEntries: entry.boonEntriesSeen,
                incomingSkillBreakdown: Array.from(entry.incomingSkillMap.values())
                    .sort((a: any, b: any) => b.damage - a.damage || b.hits - a.hits || a.name.localeCompare(b.name)),
                incomingBoonBreakdown: Array.from(entry.incomingBoonMap.values())
                    .map((boon: any) => ({
                        id: boon.id,
                        name: boon.name,
                        icon: boon.icon,
                        stacking: boon.stacking,
                        uptimePct: boon.durationMs > 0 ? boon.uptimePctWeightedMs / boon.durationMs : 0
                    }))
                    .sort((a: any, b: any) => b.uptimePct - a.uptimePct || a.name.localeCompare(b.name)),
                fightsData: fights
            };
        })
        .sort((a, b) => {
            const durationDelta = Number(b.totalDurationMs || 0) - Number(a.totalDurationMs || 0);
            if (durationDelta !== 0) return durationDelta;
            const winsDelta = Number(b.wins || 0) - Number(a.wins || 0);
            if (winsDelta !== 0) return winsDelta;
            return String(a.account || '').localeCompare(String(b.account || ''));
        });

    return { rows };
}

/**
 * Synchronous convenience wrapper — drop-in replacement for the old
 * batch `computeStatsAggregation()`.  Creates an IncrementalAggregator,
 * ingests every log, and finalizes in one call.
 */
export const computeStatsSync = ({
    logs,
    precomputedStats,
    mvpWeights,
    statsViewSettings,
    disruptionMethod,
    includePlayerSkillMap,
}: {
    logs: any[];
    precomputedStats?: any;
    mvpWeights?: IMvpWeightProfiles | unknown;
    statsViewSettings?: IStatsViewSettings;
    disruptionMethod?: DisruptionMethod;
    includePlayerSkillMap?: boolean;
}): { stats: any; skillUsageData: any } => {
    const aggregator = new IncrementalAggregator({
        precomputedStats,
        mvpWeights,
        statsViewSettings,
        disruptionMethod,
        includePlayerSkillMap,
    });
    for (const log of logs) {
        aggregator.ingestLog(log);
    }
    return aggregator.finalize();
};
