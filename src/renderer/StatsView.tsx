import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Trophy, Share2, Swords, Shield, Zap, Activity, Flame, HelpingHand, Hammer, ShieldCheck, Crosshair, Map as MapIcon, Users, Skull, Wind, Crown, Sparkles, Star, UploadCloud, Loader2, CheckCircle2, XCircle, Maximize2, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend as ChartLegend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { toPng } from 'html-to-image';
import { applyStabilityGeneration, getPlayerCleanses, getPlayerStrips, getPlayerDownContribution, getPlayerSquadHealing, getPlayerSquadBarrier, getPlayerOutgoingCrowdControl, getTargetStatTotal } from '../shared/dashboardMetrics';
import { Player, Target } from '../shared/dpsReportTypes';
import { getProfessionColor, getProfessionIconPath } from '../shared/professionUtils';
import { BoonCategory, BoonMetric, buildBoonTables, formatBoonMetricDisplay, getBoonMetricValue } from '../shared/boonGeneration';
import { DEFAULT_DISRUPTION_METHOD, DEFAULT_MVP_WEIGHTS, DisruptionMethod, IMvpWeights } from './global.d';

interface StatsViewProps {
    logs: ILogData[];
    onBack: () => void;
    mvpWeights?: IMvpWeights;
    disruptionMethod?: DisruptionMethod;
    precomputedStats?: any;
    embedded?: boolean;
}

const sidebarListClass = 'max-h-80 overflow-y-auto space-y-1 pr-1';

const renderProfessionIcon = (
    profession: string | undefined,
    professionList?: string[],
    className = 'w-4 h-4'
) => {
    const list = (professionList || []).filter(Boolean);
    const resolvedProfession = profession === 'Multi' && list.length > 0 ? list[0] : profession;
    const iconPath = getProfessionIconPath(resolvedProfession || 'Unknown');
    if (!iconPath) return null;
    const title = list.length > 1 ? `Multi: ${list.join(', ')}` : (list[0] || resolvedProfession || 'Unknown');
    const showMultiDot = list.length > 1;
    return (
        <span className="relative inline-flex shrink-0" title={title}>
            <img src={iconPath} alt={resolvedProfession || 'Unknown'} className={`${className} shrink-0`} />
            {showMultiDot && (
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-300 ring-1 ring-[#0f172a]" />
            )}
        </span>
    );
};

const OFFENSE_METRICS: Array<{
    id: string;
    label: string;
    field?: string;
    isRate?: boolean;
    isPercent?: boolean;
    weightField?: string;
    denomField?: string;
    source?: 'statsTargets' | 'dpsTargets' | 'statsAll' | 'dpsAll';
}> = [
    { id: 'damage', label: 'Damage', field: 'damage', source: 'dpsAll' },
    { id: 'directDmg', label: 'Direct Damage', field: 'directDmg', source: 'statsTargets' },
    { id: 'connectedDamageCount', label: 'Connected Damage Count', field: 'connectedDamageCount', source: 'statsTargets' },
    { id: 'connectedDirectDamageCount', label: 'Connected Direct Damage Count', field: 'connectedDirectDamageCount', source: 'statsTargets' },
    { id: 'criticalRate', label: 'Critical Rate', field: 'criticalRate', isRate: true, isPercent: true, denomField: 'critableDirectDamageCount', source: 'statsTargets' },
    { id: 'criticalDmg', label: 'Critical Damage', field: 'criticalDmg', source: 'statsTargets' },
    { id: 'flankingRate', label: 'Flanking Rate', field: 'flankingRate', isRate: true, isPercent: true, denomField: 'connectedDirectDamageCount', source: 'statsTargets' },
    { id: 'glanceRate', label: 'Glance Rate', field: 'glanceRate', isRate: true, isPercent: true, denomField: 'connectedDirectDamageCount', source: 'statsTargets' },
    { id: 'missed', label: 'Missed', field: 'missed', source: 'statsTargets' },
    { id: 'evaded', label: 'Evaded (enemy)', field: 'evaded', source: 'statsTargets' },
    { id: 'blocked', label: 'Blocked (enemy)', field: 'blocked', source: 'statsTargets' },
    { id: 'interrupts', label: 'Interrupts', field: 'interrupts', source: 'statsTargets' },
    { id: 'invulned', label: 'Invulned', field: 'invulned', source: 'statsTargets' },
    { id: 'killed', label: 'Killed', field: 'killed', source: 'statsTargets' },
    { id: 'downed', label: 'Downed', field: 'downed', source: 'statsTargets' },
    { id: 'downContribution', label: 'Down Contribution', field: 'downContribution', source: 'statsTargets' },
    { id: 'downContributionPercent', label: 'Down Contribution %', isRate: true, isPercent: true },
    { id: 'againstDownedDamage', label: 'Against Downed Damage', field: 'againstDownedDamage', source: 'statsTargets' },
    { id: 'appliedCrowdControl', label: 'Applied CC', field: 'appliedCrowdControl', source: 'statsTargets' },
    { id: 'appliedCrowdControlDuration', label: 'Applied CC Duration', field: 'appliedCrowdControlDuration', source: 'statsTargets' },
    { id: 'appliedCrowdControlDownContribution', label: 'Applied CC Down Contribution', field: 'appliedCrowdControlDownContribution', source: 'statsTargets' },
    { id: 'appliedCrowdControlDurationDownContribution', label: 'Applied CC Duration Down Contribution', field: 'appliedCrowdControlDurationDownContribution', source: 'statsTargets' }
];

const DEFENSE_METRICS: Array<{
    id: string;
    label: string;
    field: string;
    isTimeMs?: boolean;
}> = [
    { id: 'damageTaken', label: 'Damage Taken', field: 'damageTaken' },
    { id: 'damageTakenCount', label: 'Damage Taken Count', field: 'damageTakenCount' },
    { id: 'conditionDamageTaken', label: 'Condition Damage Taken', field: 'conditionDamageTaken' },
    { id: 'conditionDamageTakenCount', label: 'Condition Damage Taken Count', field: 'conditionDamageTakenCount' },
    { id: 'powerDamageTaken', label: 'Power Damage Taken', field: 'powerDamageTaken' },
    { id: 'powerDamageTakenCount', label: 'Power Damage Taken Count', field: 'powerDamageTakenCount' },
    { id: 'downedDamageTaken', label: 'Downed Damage Taken', field: 'downedDamageTaken' },
    { id: 'downedDamageTakenCount', label: 'Downed Damage Taken Count', field: 'downedDamageTakenCount' },
    { id: 'damageBarrier', label: 'Damage Barrier', field: 'damageBarrier' },
    { id: 'damageBarrierCount', label: 'Damage Barrier Count', field: 'damageBarrierCount' },
    { id: 'blockedCount', label: 'Blocked Count', field: 'blockedCount' },
    { id: 'evadedCount', label: 'Evaded Count', field: 'evadedCount' },
    { id: 'missedCount', label: 'Missed Count', field: 'missedCount' },
    { id: 'dodgeCount', label: 'Dodge Count', field: 'dodgeCount' },
    { id: 'invulnedCount', label: 'Invulnerable Count', field: 'invulnedCount' },
    { id: 'interruptedCount', label: 'Interrupted Count', field: 'interruptedCount' },
    { id: 'downCount', label: 'Down Count', field: 'downCount' },
    { id: 'deadCount', label: 'Death Count', field: 'deadCount' },
    { id: 'boonStrips', label: 'Boon Strips (Incoming)', field: 'boonStrips' },
    { id: 'conditionCleanses', label: 'Cleanses (Incoming)', field: 'conditionCleanses' },
    { id: 'receivedCrowdControl', label: 'Crowd Control (Incoming)', field: 'receivedCrowdControl' }
];

const SUPPORT_METRICS: Array<{
    id: string;
    label: string;
    field: string;
    isTime?: boolean;
}> = [
    { id: 'condiCleanse', label: 'Condition Cleanses', field: 'condiCleanse' },
    { id: 'condiCleanseTime', label: 'Condition Cleanse Time', field: 'condiCleanseTime', isTime: true },
    { id: 'condiCleanseSelf', label: 'Condition Cleanse Self', field: 'condiCleanseSelf' },
    { id: 'condiCleanseTimeSelf', label: 'Condition Cleanse Time Self', field: 'condiCleanseTimeSelf', isTime: true },
    { id: 'boonStrips', label: 'Boon Strips', field: 'boonStrips' },
    { id: 'boonStripsTime', label: 'Boon Strips Time', field: 'boonStripsTime', isTime: true },
    { id: 'boonStripDownContribution', label: 'Boon Strip Down Contribution', field: 'boonStripDownContribution' },
    { id: 'boonStripDownContributionTime', label: 'Boon Strip Down Contribution Time', field: 'boonStripDownContributionTime', isTime: true },
    { id: 'stunBreak', label: 'Stun Breaks', field: 'stunBreak' },
    { id: 'removedStunDuration', label: 'Removed Stun Duration', field: 'removedStunDuration', isTime: true },
    { id: 'resurrects', label: 'Resurrects', field: 'resurrects' },
    { id: 'resurrectTime', label: 'Resurrect Time', field: 'resurrectTime', isTime: true }
];

const HEALING_METRICS: Array<{
    id: string;
    label: string;
    baseField: 'healing' | 'barrier' | 'downedHealing' | 'resUtility';
    perSecond: boolean;
    decimals: number;
}> = [
    { id: 'healing', label: 'Healing', baseField: 'healing', perSecond: false, decimals: 0 },
    { id: 'healingPerSecond', label: 'Healing Per Second', baseField: 'healing', perSecond: true, decimals: 2 },
    { id: 'barrier', label: 'Barrier', baseField: 'barrier', perSecond: false, decimals: 0 },
    { id: 'barrierPerSecond', label: 'Barrier Per Second', baseField: 'barrier', perSecond: true, decimals: 2 },
    { id: 'downedHealing', label: 'Downed Healing', baseField: 'downedHealing', perSecond: false, decimals: 0 },
    { id: 'downedHealingPerSecond', label: 'Downed Healing Per Second', baseField: 'downedHealing', perSecond: true, decimals: 1 },
    { id: 'resUtility', label: 'Resurrect Utility', baseField: 'resUtility', perSecond: false, decimals: 0 }
];

const RES_UTILITY_NAME_MATCHES = [
    'battle standard',
    'glyph of renewal',
    'glyph of the stars',
    'illusion of life',
    'spirit of nature',
    'nature spirit',
    'search and rescue',
    'signet of mercy'
];

const RES_UTILITY_IDS = new Set<number>([10244]);

const isResUtilitySkill = (id: number, skillMap: Record<string, { name?: string }> | undefined) => {
    if (RES_UTILITY_IDS.has(id)) {
        return true;
    }
    const entry = skillMap?.[`s${id}`] || skillMap?.[`${id}`];
    const name = entry?.name?.toLowerCase() || '';
    return RES_UTILITY_NAME_MATCHES.some((match) => name.includes(match));
};

interface SkillUsagePlayer {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    skillTotals: Record<string, number>;
}

interface SkillOption {
    id: string;
    name: string;
    total: number;
}

interface SkillUsageLogRecord {
    id: string;
    label: string;
    timestamp: number;
    skillEntries: Record<string, { name: string; players: Record<string, number> }>;
}

interface SkillUsageSummary {
    logRecords: SkillUsageLogRecord[];
    players: SkillUsagePlayer[];
    skillOptions: SkillOption[];
    resUtilitySkills?: Array<{ id: string; name: string }>;
}

export function StatsView({ logs, onBack, mvpWeights, disruptionMethod, precomputedStats, embedded = false }: StatsViewProps) {
    const method = disruptionMethod || DEFAULT_DISRUPTION_METHOD;
    const [sharing, setSharing] = useState(false);
    const [expandedLeader, setExpandedLeader] = useState<string | null>(null);
    const [activeBoonTab, setActiveBoonTab] = useState<string | null>(null);
    const [activeBoonCategory, setActiveBoonCategory] = useState<BoonCategory>('totalBuffs');
    const [activeBoonMetric, setActiveBoonMetric] = useState<BoonMetric>('total');
    const [boonSearch, setBoonSearch] = useState('');
    const [activeSpecialTab, setActiveSpecialTab] = useState<string | null>(null);
    const [specialSearch, setSpecialSearch] = useState('');
    const [offenseSearch, setOffenseSearch] = useState('');
    const [defenseSearch, setDefenseSearch] = useState('');
    const [supportSearch, setSupportSearch] = useState('');
    const [activeOffenseStat, setActiveOffenseStat] = useState<string>('damage');
    const [activeDefenseStat, setActiveDefenseStat] = useState<string>('damageTaken');
    const [activeSupportStat, setActiveSupportStat] = useState<string>('condiCleanse');
    const [activeHealingMetric, setActiveHealingMetric] = useState<string>('healing');
    const [healingCategory, setHealingCategory] = useState<'total' | 'squad' | 'group' | 'self' | 'offSquad'>('total');
    const [activeResUtilitySkill, setActiveResUtilitySkill] = useState<string>('all');
    const [offenseViewMode, setOffenseViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    const [defenseViewMode, setDefenseViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    const [supportViewMode, setSupportViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    const [cleanseScope, setCleanseScope] = useState<'squad' | 'all'>('all');
    const [uploadingWeb, setUploadingWeb] = useState(false);
    const [webUploadMessage, setWebUploadMessage] = useState<string | null>(null);
    const [webUploadStage, setWebUploadStage] = useState<string | null>(null);
    const [webUploadProgress, setWebUploadProgress] = useState<number | null>(null);
    const [webUploadDetail, setWebUploadDetail] = useState<string | null>(null);
    const [webUploadUrl, setWebUploadUrl] = useState<string | null>(null);
    const [webUploadBuildStatus, setWebUploadBuildStatus] = useState<'idle' | 'checking' | 'building' | 'built' | 'errored' | 'unknown'>('idle');
    const [webCopyStatus, setWebCopyStatus] = useState<'idle' | 'copied'>('idle');
    const [skillUsagePlayerFilter, setSkillUsagePlayerFilter] = useState('');
    const [skillUsageSkillFilter, setSkillUsageSkillFilter] = useState('');
    const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [hoveredSkillPlayer, setHoveredSkillPlayer] = useState<string[]>([]);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);
    const [expandedSectionClosing, setExpandedSectionClosing] = useState(false);
    const expandedCloseTimerRef = useRef<number | null>(null);

    const formatWithCommas = (value: number, decimals = 2) =>
        value.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });

    const formatDurationMs = (durationMs?: number) => {
        if (!durationMs || !Number.isFinite(durationMs)) return '--:--';
        const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    };

    const getFightDurationLabel = (details: any, log: any) => {
        const candidates = [details?.encounterDuration, details?.duration, log?.encounterDuration];
        for (const candidate of candidates) {
            if (candidate === undefined || candidate === null) continue;
            if (typeof candidate === 'number' && Number.isFinite(candidate)) {
                return formatDurationMs(candidate);
            }
            if (typeof candidate === 'string') {
                const trimmed = candidate.trim();
                if (!trimmed) continue;
                if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
                    return trimmed;
                }
                const hmsMatch = trimmed.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*ms)?$/i);
                if (hmsMatch) {
                    const hours = Number(hmsMatch[1] || 0);
                    const minutes = Number(hmsMatch[2] || 0);
                    const seconds = Number(hmsMatch[3] || 0);
                    const ms = Number(hmsMatch[4] || 0);
                    const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;
                    if (totalMs > 0) {
                        return formatDurationMs(totalMs);
                    }
                }
                const msMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*ms$/i);
                if (msMatch) {
                    return formatDurationMs(Number(msMatch[1]));
                }
                const msWordMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(milliseconds?|msec|msecs)$/i);
                if (msWordMatch) {
                    return formatDurationMs(Number(msWordMatch[1]));
                }
                const secMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?)$/i);
                if (secMatch) {
                    return formatDurationMs(Number(secMatch[1]) * 1000);
                }
                if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
                    return formatDurationMs(Number(trimmed));
                }
                return trimmed;
            }
        }
        return formatDurationMs(details?.durationMS);
    };

    const shortenFightLabel = (label: string) => {
        const normalized = label.trim();
        const lowered = normalized.toLowerCase();
        if (lowered.includes('eternal battleground')) return 'EBG';
        if (lowered.includes('green borderlands') || lowered.includes('green alpine borderlands')) return 'Green BL';
        if (lowered.includes('blue borderlands') || lowered.includes('blue alpine borderlands')) return 'Blue BL';
        if (lowered.includes('red borderlands') || lowered.includes('red desert borderlands')) return 'Red BL';
        return normalized;
    };

    const validLogs = useMemo(() => logs.filter(l => (l.status === 'success' || l.status === 'discord') && l.details), [logs]);

    const stats = useMemo(() => {
        if (precomputedStats) {
            return precomputedStats;
        }
        const total = validLogs.length;

        // Wins/Losses (Combat Stat Based)
        let wins = 0;
        let losses = 0;

        // --- Player Aggregation ---
        interface PlayerStats {
            name: string;
            account: string;
            downContrib: number;
            cleanses: number;
            strips: number;
            stab: number;
            healing: number;
            barrier: number;
            cc: number;
            logsJoined: number;
            totalDist: number;
            distCount: number;
            dodges: number;
            downs: number;
            deaths: number;
            totalFightMs: number;
            offenseTotals: Record<string, number>;
            offenseRateWeights: Record<string, number>;
            defenseActiveMs: number;
            defenseTotals: Record<string, number>;
            supportActiveMs: number;
            supportTotals: Record<string, number>;
            healingActiveMs: number;
            healingTotals: Record<string, number>;
            profession: string;
            professions: Set<string>;
            professionList?: string[];
            professionTimeMs: Record<string, number>;
            isCommander: boolean;
            damage: number;
            dps: number;
            revives: number;
        }

        const playerStats = new Map<string, PlayerStats>();
        const supportTimeSanityFields = new Set(['boonStripsTime', 'condiCleanseTime', 'condiCleanseTimeSelf']);

        // --- Skill Aggregation ---
        // skillId -> { name, damage, hits }
        const skillDamageMap: Record<number, { name: string, damage: number, hits: number }> = {};
        const incomingSkillDamageMap: Record<number, { name: string, damage: number, hits: number }> = {};

        let totalSquadSizeAccum = 0;
        let totalEnemiesAccum = 0;

        // KDR Tracking
        let totalSquadDeaths = 0;
        let totalSquadKills = 0; // Enemies we killed
        let totalEnemyDeaths = 0; // Same as squad kills, but from enemy perspective
        let totalEnemyKills = 0; // How many of us they killed

        validLogs.forEach(log => {
            const details = log.details;
            if (!details) return;
            const players = details.players as unknown as Player[];
            const targets = details.targets || [];
            const replayMeta = (details as any).combatReplayMetaData || {};
            const inchesToPixel = typeof replayMeta?.inchToPixel === 'number' && replayMeta.inchToPixel > 0
                ? replayMeta.inchToPixel
                : 1;
            const pollingRate = typeof replayMeta?.pollingRate === 'number' && replayMeta.pollingRate > 0
                ? replayMeta.pollingRate
                : 1;
            const RUN_BACK_RANGE = 5000;

            const toPairs = (value: any): Array<[number, number]> => {
                if (!Array.isArray(value)) return [];
                return value
                    .map((entry) => (Array.isArray(entry) ? [Number(entry[0]), Number(entry[1])] as [number, number] : null))
                    .filter((entry): entry is [number, number] => {
                        if (!entry) return false;
                        return Number.isFinite(entry[0]) && Number.isFinite(entry[1]);
                    });
            };

            let commanderTagPositions: Array<[number, number]> = [];
            let deadTagMark = details.durationMS || 0;
            let deadTag = false;
            const commanderPlayer = players.find((player: any) => player?.hasCommanderTag && !player?.notInSquad);
            if (commanderPlayer?.combatReplayData?.positions) {
                commanderTagPositions = commanderPlayer.combatReplayData.positions as Array<[number, number]>;
                const commanderDeaths = toPairs(commanderPlayer.combatReplayData.dead);
                commanderDeaths.forEach(([deathTime]) => {
                    if (deathTime > 0) {
                        deadTag = true;
                        deadTagMark = Math.min(deadTagMark, deathTime);
                    }
                });
            }

            const avgDistance = (
                positions: Array<[number, number]>,
                tagPositions: Array<[number, number]>,
                poll: number,
            ) => {
                const limit = Math.max(0, Math.min(poll, positions.length, tagPositions.length));
                if (limit <= 0) return 0;
                let sum = 0;
                for (let i = 0; i < limit; i += 1) {
                    const [px, py] = positions[i];
                    const [tx, ty] = tagPositions[i];
                    sum += Math.hypot(px - tx, py - ty);
                }
                return Math.round((sum / limit) / inchesToPixel);
            };

            const getDistanceToTag = (p: any) => {
                const stats = p.statsAll?.[0];
                const distToCom = stats?.distToCom;
                const stackDist = stats?.stackDist;
                let playerDistToTag = 0;
                if (distToCom !== undefined && distToCom !== null) {
                    playerDistToTag = distToCom === 'Infinity' ? 0 : Math.round(Number(distToCom));
                } else if (stackDist !== undefined && stackDist !== null) {
                    playerDistToTag = Math.round(Number(stackDist)) || 0;
                }
                if (p.hasCommanderTag) {
                    return 0;
                }

                const combatData = p.combatReplayData;
                if (!combatData?.positions || !commanderTagPositions.length) {
                    return playerDistToTag;
                }

                const playerPositions = combatData.positions as Array<[number, number]>;
                const playerDeaths = toPairs(combatData.dead);
                const playerDowns = toPairs(combatData.down);
                const playerOffset = Math.floor((combatData.start || 0) / pollingRate);

                if (playerDeaths.length && playerDowns.length) {
                    for (const [deathKey] of playerDeaths) {
                        if (deathKey < 0) continue;
                        const positionMark = Math.max(0, Math.floor(deathKey / pollingRate)) - playerOffset;
                        for (const [downKey, downValue] of playerDowns) {
                            if (deathKey !== downValue) continue;
                            const playerDeadPoll = deadTag && downKey > deadTagMark
                                ? Math.max(1, Math.floor(deadTagMark / pollingRate))
                                : positionMark;
                            playerDistToTag = avgDistance(playerPositions, commanderTagPositions, playerDeadPoll);
                        }
                    }
                }

                return playerDistToTag;
            };

            // Squad/Enemy Counts
            const squadPlayers = players.filter(p => !p.notInSquad);
            const squadCount = squadPlayers.length;
            const enemyCount = targets.filter((t: any) => !t.isFake).length;
            totalSquadSizeAccum += squadCount;
            totalEnemiesAccum += enemyCount;

            applyStabilityGeneration(players, { durationMS: details.durationMS, buffMap: details.buffMap });

            // 1. Calculate Win/Loss based on Downs/Deaths
            let squadDownsDeaths = 0;
            let enemyDownsDeaths = 0;

            // Squad Downs/Deaths - from our players' defenses
            let logSquadDeaths = 0;
            players.forEach(p => {
                if (!p.notInSquad && p.defenses && p.defenses.length > 0) {
                    squadDownsDeaths += (p.defenses[0].downCount || 0) + (p.defenses[0].deadCount || 0);
                    logSquadDeaths += p.defenses[0].deadCount || 0;
                }
            });
            totalSquadDeaths += logSquadDeaths;
            totalEnemyKills += logSquadDeaths; // Enemy killed us

            // Enemy Downs/Deaths - from statsTargets (what WE did to them)
            let logEnemyKills = 0;
            players.forEach((p: any) => {
                if (p.notInSquad) return;
                if (p.statsTargets && p.statsTargets.length > 0) {
                    p.statsTargets.forEach((targetStats: any) => {
                        if (targetStats && targetStats.length > 0) {
                            const st = targetStats[0];
                            enemyDownsDeaths += (st.downed || 0) + (st.killed || 0);
                            logEnemyKills += st.killed || 0;
                        }
                    });
                }
            });
            totalSquadKills += logEnemyKills;
            totalEnemyDeaths += logEnemyKills;

            if (squadDownsDeaths < enemyDownsDeaths) {
                wins++;
            } else {
                losses++;
            }

            players.forEach(p => {
                // Only process squad members, not allies
                if (p.notInSquad) return;

                // Determine Identity
                const account = p.account || 'Unknown';
                // We key by account to aggregate totals across characters
                const key = account !== 'Unknown' ? account : (p.name || 'Unknown');
                const name = p.name || 'Unknown'; // Helper name (last seen character name usually)

                if (!playerStats.has(key)) {
                    playerStats.set(key, {
                        name: name,
                        account: account !== 'Unknown' ? account : name,
                        downContrib: 0,
                        cleanses: 0,
                        strips: 0,
                        stab: 0,
                        healing: 0,
                        barrier: 0,
                        cc: 0,
                        logsJoined: 0,
                        totalDist: 0,
                        distCount: 0,
                        dodges: 0,
                        downs: 0,
                        deaths: 0,
                        totalFightMs: 0,
                        offenseTotals: {},
                        offenseRateWeights: {},
                        defenseActiveMs: 0,
                        defenseTotals: {},
                        supportActiveMs: 0,
                        supportTotals: {},
                        healingActiveMs: 0,
                        healingTotals: {},
                        professions: new Set<string>(),
                        professionTimeMs: {} as Record<string, number>,
                        profession: p.profession || 'Unknown',
                        isCommander: false,
                        damage: 0,
                        dps: 0,
                        revives: 0
                    });
                }

                const s = playerStats.get(key)!;
                if (p.hasCommanderTag) {
                    s.isCommander = true;
                }
                if (p.profession) {
                    s.profession = p.profession;
                    if (p.profession && p.profession !== 'Unknown') {
                        s.professions.add(p.profession);
                        const activeMs = Array.isArray(p.activeTimes) && typeof p.activeTimes[0] === 'number'
                            ? p.activeTimes[0]
                            : details.durationMS || 0;
                        s.professionTimeMs[p.profession] = (s.professionTimeMs[p.profession] || 0) + activeMs;
                    }
                }
                s.logsJoined++;

                // Aggregate Metrics
                // Down Contribution
                s.downContrib += getPlayerDownContribution(p);

                // Support: Cleanses and Strips (EI support stats)
                s.cleanses += getPlayerCleanses(p);
                s.strips += getPlayerStrips(p, method);

                s.healing += getPlayerSquadHealing(p);
                s.barrier += getPlayerSquadBarrier(p);
                s.cc += getPlayerOutgoingCrowdControl(p, method);
                s.stab += p.stabGeneration || 0;

                // Stack Distance (Distance to Tag)
                // statsAll[0] contains the stackDist field in Elite Insights JSON
                const dist = getDistanceToTag(p);
                if (dist <= RUN_BACK_RANGE) {
                    s.totalDist += dist;
                    s.distCount++;
                }

                // Dodges
                if (p.defenses && p.defenses.length > 0) {
                    s.dodges += p.defenses[0].dodgeCount || 0;
                    s.downs += p.defenses[0].downCount || 0;
                    s.deaths += p.defenses[0].deadCount || 0;
                }

                if (details.durationMS) {
                    s.totalFightMs += details.durationMS;
                }
                const activeMs = Array.isArray(p.activeTimes) && typeof p.activeTimes[0] === 'number'
                    ? p.activeTimes[0]
                    : details.durationMS || 0;
                s.defenseActiveMs += activeMs;
                s.supportActiveMs += activeMs;
                s.healingActiveMs += activeMs;

                if (p.defenses && p.defenses.length > 0) {
                    const defenses = p.defenses[0] as any;
                    DEFENSE_METRICS.forEach((metric) => {
                        const value = Number(defenses[metric.field] ?? 0);
                        if (!Number.isFinite(value)) return;
                        s.defenseTotals[metric.id] = (s.defenseTotals[metric.id] || 0) + value;
                    });
                }

                if (p.support && p.support.length > 0) {
                    const support = p.support[0] as any;
                    SUPPORT_METRICS.forEach((metric) => {
                        let value = Number(support[metric.field] ?? 0);
                        if (!Number.isFinite(value)) return;
                        if (supportTimeSanityFields.has(metric.field) && value > 999999) {
                            value = 0;
                        }
                        s.supportTotals[metric.id] = (s.supportTotals[metric.id] || 0) + value;
                    });
                }

                const addHealingTotal = (key: string, value: number) => {
                    if (!Number.isFinite(value)) return;
                    s.healingTotals[key] = (s.healingTotals[key] || 0) + value;
                };

                if (Array.isArray(p.rotation)) {
                    let resUtilityCasts = 0;
                    p.rotation.forEach((rotationSkill: any) => {
                        if (!rotationSkill || typeof rotationSkill.id !== 'number') {
                            return;
                        }
                        if (!isResUtilitySkill(rotationSkill.id, details.skillMap)) {
                            return;
                        }
                        const castCount = Array.isArray(rotationSkill.skills) ? rotationSkill.skills.length : 0;
                        if (!Number.isFinite(castCount) || castCount <= 0) {
                            return;
                        }
                        resUtilityCasts += castCount;
                        addHealingTotal(`resUtility_s${rotationSkill.id}`, castCount);
                    });
                    if (resUtilityCasts > 0) {
                        addHealingTotal('resUtility', resUtilityCasts);
                    }
                }

                if (p.extHealingStats?.outgoingHealingAllies && Array.isArray(p.extHealingStats.outgoingHealingAllies)) {
                    const healerName = p.name || '';
                    const healerGroup = p.group;
                    p.extHealingStats.outgoingHealingAllies.forEach((healTarget, index) => {
                        const targetPlayer = players[index];
                        if (!targetPlayer) return;
                        const phase = Array.isArray(healTarget) ? healTarget[0] : null;
                        if (!phase) return;
                        const totalHealing = Number(phase.healing ?? 0);
                        const downedHealing = Number(phase.downedHealing ?? 0);
                        if (!Number.isFinite(totalHealing) || !Number.isFinite(downedHealing)) return;
                        const outgoingHealing = totalHealing - downedHealing;
                        if (!(outgoingHealing || downedHealing)) return;

                        addHealingTotal('healing', outgoingHealing);
                        addHealingTotal('downedHealing', downedHealing);

                        if (targetPlayer.notInSquad) {
                            addHealingTotal('offSquadHealing', outgoingHealing);
                            addHealingTotal('offSquadDownedHealing', downedHealing);
                        } else {
                            addHealingTotal('squadHealing', outgoingHealing);
                            addHealingTotal('squadDownedHealing', downedHealing);
                        }

                        if (targetPlayer.group === healerGroup) {
                            addHealingTotal('groupHealing', outgoingHealing);
                            addHealingTotal('groupDownedHealing', downedHealing);
                        }

                        if (targetPlayer.name === healerName) {
                            addHealingTotal('selfHealing', outgoingHealing);
                            addHealingTotal('selfDownedHealing', downedHealing);
                        }
                    });
                }

                if (p.extBarrierStats?.outgoingBarrierAllies && Array.isArray(p.extBarrierStats.outgoingBarrierAllies)) {
                    const healerName = p.name || '';
                    const healerGroup = p.group;
                    p.extBarrierStats.outgoingBarrierAllies.forEach((barrierTarget, index) => {
                        const targetPlayer = players[index];
                        if (!targetPlayer) return;
                        const phase = Array.isArray(barrierTarget) ? barrierTarget[0] : null;
                        if (!phase) return;
                        const outgoingBarrier = Number(phase.barrier ?? 0);
                        if (!Number.isFinite(outgoingBarrier) || outgoingBarrier === 0) return;

                        addHealingTotal('barrier', outgoingBarrier);

                        if (targetPlayer.notInSquad) {
                            addHealingTotal('offSquadBarrier', outgoingBarrier);
                        } else {
                            addHealingTotal('squadBarrier', outgoingBarrier);
                        }

                        if (targetPlayer.group === healerGroup) {
                            addHealingTotal('groupBarrier', outgoingBarrier);
                        }

                        if (targetPlayer.name === healerName) {
                            addHealingTotal('selfBarrier', outgoingBarrier);
                        }
                    });
                }

                const statsTargetsList = Array.isArray(p.statsTargets) ? p.statsTargets : [];
                const dpsTargetsList = Array.isArray(p.dpsTargets) ? p.dpsTargets : [];
                const statsAll = (p.statsAll && p.statsAll.length > 0) ? (p.statsAll[0] as any) : null;
                const dpsAll = (p.dpsAll && p.dpsAll.length > 0) ? (p.dpsAll[0] as any) : null;

                OFFENSE_METRICS.forEach((metric) => {
                    if (metric.id === 'downContributionPercent') {
                        return;
                    }
                    const field = metric.field;
                    if (!field) return;
                    const source = metric.source || 'statsTargets';
                    if (source === 'statsAll') {
                        if (!statsAll) return;
                        let value = Number(statsAll[field] ?? 0);
                        if (!Number.isFinite(value)) return;
                        if (metric.isRate) {
                            const denomField = metric.denomField || metric.weightField;
                            const denom = Number(statsAll[denomField || 'connectedDamageCount'] ?? 0);
                            if (denom > 0) {
                                s.offenseTotals[metric.id] = (s.offenseTotals[metric.id] || 0) + value;
                                s.offenseRateWeights[metric.id] = (s.offenseRateWeights[metric.id] || 0) + denom;
                            }
                            return;
                        }
                        s.offenseTotals[metric.id] = (s.offenseTotals[metric.id] || 0) + value;
                        return;
                    }
                    if (source === 'dpsAll') {
                        if (!dpsAll) return;
                        const value = Number(dpsAll[field] ?? 0);
                        if (!Number.isFinite(value)) return;
                        s.offenseTotals[metric.id] = (s.offenseTotals[metric.id] || 0) + value;
                        return;
                    }
                    if (source === 'dpsTargets') {
                        if (dpsTargetsList.length === 0 && statsAll) {
                            const fallbackValue = Number(statsAll[field] ?? 0);
                            if (Number.isFinite(fallbackValue)) {
                                s.offenseTotals[metric.id] = (s.offenseTotals[metric.id] || 0) + fallbackValue;
                            }
                            return;
                        }
                        dpsTargetsList.forEach((targetEntry: any) => {
                            const target = targetEntry?.[0];
                            if (!target) return;
                            const value = Number(target[field] ?? 0);
                            if (!Number.isFinite(value)) return;
                            s.offenseTotals[metric.id] = (s.offenseTotals[metric.id] || 0) + value;
                        });
                        return;
                    }

                    if (statsTargetsList.length === 0 && statsAll) {
                        let value = Number(statsAll[field] ?? 0);
                        if (!Number.isFinite(value)) return;
                        if (metric.isRate) {
                            const denomField = metric.denomField || metric.weightField;
                            const denom = Number(statsAll[denomField || 'connectedDamageCount'] ?? 0);
                            if (denom > 0) {
                                s.offenseTotals[metric.id] = (s.offenseTotals[metric.id] || 0) + value;
                                s.offenseRateWeights[metric.id] = (s.offenseRateWeights[metric.id] || 0) + denom;
                            }
                            return;
                        }
                        s.offenseTotals[metric.id] = (s.offenseTotals[metric.id] || 0) + value;
                        return;
                    }

                    statsTargetsList.forEach((targetEntry: any) => {
                        const target = targetEntry?.[0];
                        if (!target) return;
                        let value = Number(target[field] ?? 0);
                        if (!Number.isFinite(value)) return;
                        if (metric.isRate) {
                            const denomField = metric.denomField || metric.weightField;
                            const denom = Number(target[denomField || 'connectedDamageCount'] ?? 0);
                            if (denom > 0) {
                                s.offenseTotals[metric.id] = (s.offenseTotals[metric.id] || 0) + value;
                                s.offenseRateWeights[metric.id] = (s.offenseRateWeights[metric.id] || 0) + denom;
                            }
                            return;
                        }
                        s.offenseTotals[metric.id] = (s.offenseTotals[metric.id] || 0) + value;
                    });
                });

                s.revives += p.support?.[0]?.resurrects || 0;

                if (p.dpsAll && p.dpsAll.length > 0) {
                    s.damage += p.dpsAll[0].damage || 0;
                    s.dps += p.dpsAll[0].dps || 0;
                }

                // Outgoing Skill Aggregation
                if (p.totalDamageDist) {
                    p.totalDamageDist.forEach(distList => {
                        if (!distList) return;
                        distList.forEach(entry => {
                            if (!entry.id) return;

                            let skillName = `Skill ${entry.id}`;
                            // Attempt to resolve name from skillMap
                            if (details.skillMap) {
                                if (details.skillMap[`s${entry.id}`]) {
                                    skillName = details.skillMap[`s${entry.id}`].name;
                                } else if (details.skillMap[`${entry.id}`]) {
                                    skillName = details.skillMap[`${entry.id}`].name;
                                }
                            }

                            if (!skillDamageMap[entry.id]) {
                                skillDamageMap[entry.id] = { name: skillName, damage: 0, hits: 0 };
                            }
                            // Update name if we found a better one
                            if (skillDamageMap[entry.id].name.startsWith('Skill ') && !skillName.startsWith('Skill ')) {
                                skillDamageMap[entry.id].name = skillName;
                            }

                            skillDamageMap[entry.id].damage += entry.totalDamage;
                            skillDamageMap[entry.id].hits += entry.connectedHits;
                        });
                    });
                }

                // Incoming Skill Aggregation (Damage Taken)
                if (p.totalDamageTaken) {
                    p.totalDamageTaken.forEach(takenList => {
                        if (!takenList) return;
                        takenList.forEach(entry => {
                            if (!entry.id) return;

                            let skillName = `Skill ${entry.id}`;
                            // Resolve name
                            if (details.skillMap) {
                                if (details.skillMap[`s${entry.id}`]) {
                                    skillName = details.skillMap[`s${entry.id}`].name;
                                } else if (details.skillMap[`${entry.id}`]) {
                                    skillName = details.skillMap[`${entry.id}`].name;
                                }
                            }

                            if (!incomingSkillDamageMap[entry.id]) {
                                incomingSkillDamageMap[entry.id] = { name: skillName, damage: 0, hits: 0 };
                            }
                            if (incomingSkillDamageMap[entry.id].name.startsWith('Skill ') && !skillName.startsWith('Skill ')) {
                                incomingSkillDamageMap[entry.id].name = skillName;
                            }

                            incomingSkillDamageMap[entry.id].damage += entry.totalDamage;
                            incomingSkillDamageMap[entry.id].hits += entry.hits; // For taken, hits is usually raw hits
                        });
                    });
                }
            });
        });

        const avgSquadSize = total > 0 ? Math.round(totalSquadSizeAccum / total) : 0;
        const avgEnemies = total > 0 ? Math.round(totalEnemiesAccum / total) : 0;

        // Find Leaders
        const emptyLeader = { value: 0, player: '-', count: 0, profession: 'Unknown', professionList: [] as string[] };

        let maxDownContrib = { ...emptyLeader };
        let maxCleanses = { ...emptyLeader };
        let maxStrips = { ...emptyLeader };
        let maxStab = { ...emptyLeader };
        let maxHealing = { ...emptyLeader };
        let maxBarrier = { ...emptyLeader };
        let maxCC = { ...emptyLeader };
        let maxDodges = { ...emptyLeader };
        let maxLogsJoined = 0;
        let closestToTag = { value: 999999, player: '-', count: 0, profession: 'Unknown', professionList: [] as string[] }; // Min is better
        let maxDamage = { ...emptyLeader };
        let maxDps = { ...emptyLeader };
        let maxRevives = { ...emptyLeader };

        playerStats.forEach((stat) => {
            const list = Array.from(stat.professions || []).filter((prof) => prof && prof !== 'Unknown');
            stat.professionList = list;
            if (list.length > 0) {
                let primary = list[0];
                let maxTime = stat.professionTimeMs?.[primary] || 0;
                list.forEach((prof) => {
                    const time = stat.professionTimeMs?.[prof] || 0;
                    if (time > maxTime) {
                        maxTime = time;
                        primary = prof;
                    }
                });
                stat.profession = primary;
            }
        });

        const playerEntries = Array.from(playerStats.entries()).map(([key, stat]) => ({ key, stat }));
        const offensePlayers = playerEntries.map(({ stat }) => ({
            account: stat.account,
            profession: stat.profession || 'Unknown',
            professionList: stat.professionList,
            totalFightMs: stat.totalFightMs || 0,
            offenseTotals: stat.offenseTotals,
            offenseRateWeights: stat.offenseRateWeights,
            downs: stat.downs,
            downContribution: stat.offenseTotals?.downContribution || 0
        }));
        const defensePlayers = playerEntries.map(({ stat }) => ({
            account: stat.account,
            profession: stat.profession || 'Unknown',
            professionList: stat.professionList,
            activeMs: stat.defenseActiveMs || 0,
            defenseTotals: stat.defenseTotals
        }));
        const supportPlayers = playerEntries.map(({ stat }) => ({
            account: stat.account,
            profession: stat.profession || 'Unknown',
            professionList: stat.professionList,
            activeMs: stat.supportActiveMs || 0,
            supportTotals: stat.supportTotals
        }));
        const healingPlayers = playerEntries.map(({ stat }) => ({
            account: stat.account,
            profession: stat.profession || 'Unknown',
            professionList: stat.professionList,
            activeMs: stat.healingActiveMs || 0,
            healingTotals: stat.healingTotals
        }));

        playerEntries.forEach(({ stat }) => {
            const pInfo = { player: stat.account, count: stat.logsJoined, profession: stat.profession || 'Unknown', professionList: stat.professionList || [] };

            if (stat.downContrib > maxDownContrib.value) maxDownContrib = { value: stat.downContrib, ...pInfo };
            if (stat.cleanses > maxCleanses.value) maxCleanses = { value: stat.cleanses, ...pInfo };
            if (stat.strips > maxStrips.value) maxStrips = { value: stat.strips, ...pInfo };
            if (stat.stab > maxStab.value) maxStab = { value: stat.stab, ...pInfo };
            if (stat.healing > maxHealing.value) maxHealing = { value: stat.healing, ...pInfo };
            if (stat.barrier > maxBarrier.value) maxBarrier = { value: stat.barrier, ...pInfo };
            if (stat.cc > maxCC.value) maxCC = { value: stat.cc, ...pInfo };
            if (stat.dodges > maxDodges.value) maxDodges = { value: stat.dodges, ...pInfo };
            if (stat.damage > maxDamage.value) maxDamage = { value: stat.damage, ...pInfo };
            if (stat.dps > maxDps.value) maxDps = { value: stat.dps, ...pInfo };
            if (stat.revives > maxRevives.value) maxRevives = { value: stat.revives, ...pInfo };
            if (stat.logsJoined > maxLogsJoined) maxLogsJoined = stat.logsJoined;

            if (!stat.isCommander && stat.distCount > 0) {
                const avgDist = stat.totalDist / stat.distCount;
                if (avgDist > 0 && avgDist < closestToTag.value) {
                    closestToTag = { value: avgDist, ...pInfo };
                }
            }
        });

        if (closestToTag.value === 999999) closestToTag.value = 0;

        const buildLeaderboard = (items: Array<{ key: string; account: string; profession: string; professionList?: string[]; value: number }>, higherIsBetter: boolean) => {
            const filtered = items.filter(item => Number.isFinite(item.value) && item.value > 0);
            const sorted = filtered.sort((a, b) => {
                const diff = higherIsBetter ? b.value - a.value : a.value - b.value;
                if (diff !== 0) return diff;
                return a.account.localeCompare(b.account);
            });
            let lastValue: number | null = null;
            let lastRank = 0;
            return sorted.map((item, index) => {
                if (lastValue === null || item.value !== lastValue) {
                    lastRank = index + 1;
                    lastValue = item.value;
                }
                return {
                    rank: lastRank,
                    account: item.account,
                    profession: item.profession,
                    professionList: item.professionList,
                    value: item.value
                };
            });
        };

        const leaderboards = {
            downContrib: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.downContrib
            })), true),
            barrier: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.barrier
            })), true),
            healing: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.healing
            })), true),
            dodges: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.dodges
            })), true),
            strips: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.strips
            })), true),
            cleanses: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.cleanses
            })), true),
            cc: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.cc
            })), true),
            stability: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.stab
            })), true),
            closestToTag: buildLeaderboard(
                playerEntries
                    .filter(({ stat }) => !stat.isCommander)
                    .map(({ key, stat }) => ({
                        key,
                        account: stat.account,
                        profession: stat.profession,
                        professionList: stat.professionList,
                        value: stat.distCount > 0 ? stat.totalDist / stat.distCount : Number.POSITIVE_INFINITY
                    }))
                    .filter(item => Number.isFinite(item.value)),
                false
            ),
            revives: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.revives
            })), true),
            participation: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.logsJoined
            })), true),
            dps: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.dps
            })), true),
            damage: buildLeaderboard(playerEntries.map(({ key, stat }) => ({
                key,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                value: stat.damage
            })), true)
        };

        // rankMaps removed: MVP now references leaderboards for rank consistency.

        // --- Calculate MVP ---
        // --- Calculate MVP ---
        let mvp = {
            player: 'None',
            account: 'None',
            reason: 'No sufficient data',
            score: -1,
            profession: 'Unknown',
            professionList: [] as string[],
            color: '#64748b',
            topStats: [] as { name: string, val: string, ratio: number }[]
        };

        let totalScoreSum = 0;
        const scoreBreakdown: Array<{
            player: string;
            account: string;
            profession: string;
            professionList?: string[];
            score: number;
            reason: string;
            topStats: { name: string, val: string, ratio: number }[];
        }> = [];

        const getRankFromLeaderboard = (
            leaderboard: Array<{ rank: number; account: string }> | undefined,
            account: string
        ) => {
            if (!leaderboard?.length) return 0;
            const entry = leaderboard.find((row) => row.account === account);
            return entry?.rank || 0;
        };

        playerEntries.forEach(({ stat }) => {
            let score = 0;
            const contributions: { name: string, ratio: number, value: number, fmt: string, rank: number }[] = [];

            const formatCompactNumber = (value: number) => {
                const abs = Math.abs(value);
                if (abs >= 1_000_000) {
                    return `${(value / 1_000_000).toFixed(2)}m`;
                }
                if (abs >= 1_000) {
                    return `${(value / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
                }
                return Math.round(value).toLocaleString();
            };

            const weights = mvpWeights || DEFAULT_MVP_WEIGHTS;

            const check = (val: number, maxVal: number, name: string, weight = 1, leaderboard?: Array<{ rank: number; account: string }>) => {
                if (weight <= 0) return;
                if (maxVal > 0) {
                    const ratio = val / maxVal;
                    score += ratio * weight;
                    const rank = getRankFromLeaderboard(leaderboard, stat.account);
                    contributions.push({ name, ratio, value: val, fmt: formatCompactNumber(val), rank });
                }
            };
            const checkLowerIsBetter = (val: number, bestVal: number, name: string, weight = 1, leaderboard?: Array<{ rank: number; account: string }>) => {
                if (weight <= 0) return;
                if (bestVal > 0 && val > 0) {
                    const ratio = bestVal / val;
                    score += ratio * weight;
                    const rank = getRankFromLeaderboard(leaderboard, stat.account);
                    contributions.push({ name, ratio, value: val, fmt: formatCompactNumber(val), rank });
                }
            };

            check(stat.downContrib, maxDownContrib.value, 'Down Contribution', weights.downContribution, leaderboards.downContrib);
            check(stat.healing, maxHealing.value, 'Healing', weights.healing, leaderboards.healing);
            check(stat.cleanses, maxCleanses.value, 'Cleanses', weights.cleanses, leaderboards.cleanses);
            check(stat.strips, maxStrips.value, 'Strips', weights.strips, leaderboards.strips);
            check(stat.stab, maxStab.value, 'Stability', weights.stability, leaderboards.stability);
            check(stat.cc, maxCC.value, 'CC', weights.cc, leaderboards.cc);
            check(stat.revives, maxRevives.value, 'Revives', weights.revives, leaderboards.revives);
            check(stat.logsJoined, maxLogsJoined, 'Participation', weights.participation, leaderboards.participation);
            check(stat.dodges, maxDodges.value, 'Dodging', weights.dodging, leaderboards.dodges);
            check(stat.dps, maxDps.value, 'DPS', weights.dps, leaderboards.dps);
            check(stat.damage, maxDamage.value, 'Damage', weights.damage, leaderboards.damage);
            if (!stat.isCommander && stat.distCount > 0) {
                const avgDist = stat.totalDist / stat.distCount;
                checkLowerIsBetter(avgDist, closestToTag.value, 'Distance to Tag', weights.distanceToTag, leaderboards.closestToTag);
            }

            totalScoreSum += score;

            contributions.sort((a, b) => b.ratio - a.ratio);
            const top3 = contributions.slice(0, 3);

            let reason = 'Consistent all-round performance';
            if (top3.length > 0) {
                const best = top3[0];
                if (best.ratio >= 1) {
                    reason = `Top Rank in ${best.name}`;
                    if (top3.length > 1 && top3[1].ratio > 0.8) {
                        reason += ` & High ${top3[1].name}`;
                    }
                } else if (best.ratio > 0.8) {
                    reason = `High ${best.name} & ${top3[1]?.name || 'Performance'}`;
                } else {
                    reason = `Versatile: ${best.name}, ${top3[1]?.name}`;
                }
            }

            const summary = {
                player: stat.name,
                account: stat.account,
                profession: stat.profession,
                professionList: stat.professionList,
                score,
                reason,
                topStats: top3.map(c => ({ name: c.name, val: c.fmt, ratio: c.rank }))
            };

            scoreBreakdown.push(summary);
        });

        scoreBreakdown.sort((a, b) => b.score - a.score);
        const silver = scoreBreakdown[1];
        const bronze = scoreBreakdown[2];
        if (scoreBreakdown[0]) {
            const top = scoreBreakdown[0];
            mvp = {
                player: top.player,
                account: top.account,
                reason: top.reason,
                score: top.score,
                profession: top.profession,
                professionList: top.professionList || [],
                color: getProfessionColor(top.profession),
                topStats: top.topStats
            };
        }

        const avgMvpScore = playerStats.size > 0 ? totalScoreSum / playerStats.size : 0;

        // Sort Skills
        const topSkills = Object.values(skillDamageMap)
            .sort((a, b) => b.damage - a.damage)
            .slice(0, 25);

        const topIncomingSkills = Object.values(incomingSkillDamageMap)
            .sort((a, b) => b.damage - a.damage)
            .slice(0, 25);

        // KDR Calculations
        const squadKDR = totalSquadDeaths > 0 ? (totalSquadKills / totalSquadDeaths).toFixed(2) : totalSquadKills > 0 ? '∞' : '0.00';
        const enemyKDR = totalEnemyDeaths > 0 ? (totalEnemyKills / totalEnemyDeaths).toFixed(2) : totalEnemyKills > 0 ? '∞' : '0.00';

        // Class Distribution (Squad)
        const squadClassCounts: Record<string, number> = {};
        // Class Distribution (Enemies)
        const enemyClassCounts: Record<string, number> = {};

        // Unique Composition Set: Tracks "AccountName-Profession"
        // If a player plays Guardian in 5 logs, they count ONCE as Guardian.
        // If they play Guardian in 3 and Necro in 2, they count ONCE as Guardian and ONCE as Necro.
        const uniqueSquadComposition = new Set<string>();

        const seenEnemyIdsAcrossLogs = new Set<string>();
        validLogs.forEach(log => {
            const details = log.details;
            if (!details) return;
            const players = details.players as unknown as Player[];
            const targets = details.targets as unknown as Target[];

            // Squad Classes
            players.forEach(p => {
                if (!p.notInSquad) {
                    const prof = p.profession || 'Unknown';
                    const account = p.account || p.name; // Fallback if account missing
                    const key = `${account}-${prof}`;
                    uniqueSquadComposition.add(key);
                }
            });

            // Enemy Classes (unique by player/instance id per log)
            if (targets) {
                targets.forEach(t => {
                    if (t.isFake) return;
                    const rawName = t.name || 'Unknown';
                    const rawId = (t as any).instanceID ?? (t as any).instid ?? (t as any).id ?? rawName;
                    const idKey = rawId !== undefined && rawId !== null ? String(rawId) : rawName;
                    if (seenEnemyIdsAcrossLogs.has(idKey)) return;
                    seenEnemyIdsAcrossLogs.add(idKey);

                    // Clean up name: remove " pl-1234", " (Account)", ids, etc.
                    let cleanName = rawName
                        .replace(/\s+pl-\d+$/i, '')
                        .replace(/\s*\([^)]*\)/, '')
                        .trim();

                    enemyClassCounts[cleanName] = (enemyClassCounts[cleanName] || 0) + 1;
                });
            }
        });

        // Calculate Squad Counts from Unique Set
        uniqueSquadComposition.forEach(entry => {
            const [, prof] = entry.split('-');
            squadClassCounts[prof] = (squadClassCounts[prof] || 0) + 1;
        });

        // Format for Charts
        // Format for Charts - Explicit Sort
        const squadClassData = Object.entries(squadClassCounts)
            .map(([name, count]) => ({
                name,
                value: Number(count),
                color: getProfessionColor(name)
            }))
            .sort((a, b) => {
                const diff = b.value - a.value;
                if (diff !== 0) return diff;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 10);

        const enemyClassData = Object.entries(enemyClassCounts)
            .map(([name, count]) => ({
                name,
                value: Number(count),
                color: getProfessionColor(name)
            }))
            .sort((a, b) => {
                const diff = b.value - a.value;
                if (diff !== 0) return diff;
                return a.name.localeCompare(b.name);
            })
            .slice(0, 10);

        // Map/Borderland Distribution
        const mapCounts: Record<string, number> = {};
        validLogs.forEach(log => {
            let mapName = 'Unknown';
            const details = log.details;
            if (details) {
                // Check explicit zone field if available (in some EI versions)
                if (details.zone) {
                    mapName = details.zone;
                } else if (details.fightName) {
                    const fn = details.fightName.toLowerCase();
                    if (fn.includes('eternal') || fn.includes(' eb')) mapName = 'Eternal Battlegrounds';
                    else if (fn.includes('blue') && (fn.includes('alpine') || fn.includes('borderlands'))) mapName = 'Blue Borderlands';
                    else if (fn.includes('green') && (fn.includes('alpine') || fn.includes('borderlands'))) mapName = 'Green Borderlands';
                    else if (fn.includes('red') || fn.includes('desert')) mapName = 'Red Borderlands';
                    else if (fn.includes('alpine')) mapName = 'Green Borderlands'; // Fallback for generic "Alpine" often implies home/green
                    else if (fn.includes('edge') || fn.includes('mists')) mapName = 'Edge of the Mists';
                    else if (fn.includes('armistice')) mapName = 'Armistice Bastion';
                    else if (fn.includes('obsidian')) mapName = 'Obsidian Sanctum';
                    else if (fn.includes('world vs world')) mapName = 'World vs World (Generic)';
                }
            }
            mapCounts[mapName] = (mapCounts[mapName] || 0) + 1;
        });

        // Map Colors
        const mapColors: Record<string, string> = {
            'Eternal Battlegrounds': '#ffffff', // White
            'Blue Borderlands': '#3b82f6', // Blue
            'Green Borderlands': '#10b981', // Emerald
            'Red Borderlands': '#ef4444', // Red
            'Edge of the Mists': '#a855f7', // Purple
            'Armistice Bastion': '#ec4899', // Pink
            'Obsidian Sanctum': '#f59e0b', // Amber
            'World vs World (Generic)': '#64748b', // Slate
            'Unknown': '#475569' // Slate-600
        };

        const mapData = Object.entries(mapCounts)
            .map(([name, value]) => ({ name, value, color: mapColors[name] || '#64748b' }))
            .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

        const getBuffInfo = (details: any, id: number) => {
            const buff = details?.buffMap?.[`b${id}`];
            if (buff?.name) {
                return { name: buff.name as string, classification: buff.classification as string | undefined };
            }
            const skill = details?.skillMap?.[`b${id}`]
                || details?.skillMap?.[`${id}`]
                || details?.skillMap?.[`s${id}`];
            if (skill?.name) {
                return { name: skill.name as string, classification: undefined };
            }
            return { name: `Buff ${id}`, classification: undefined };
        };

        const shouldIncludeSpecial = (classification?: string, name?: string) => {
            const allowList = ['Distortion'];
            if (name && allowList.includes(name)) return true;
            if (!classification) return true;
            const lowered = classification.toLowerCase();
            const excluded = ['condition', 'defensive', 'offensive', 'support', 'nourishment', 'consumable'];
            return !excluded.includes(lowered);
        };

        const { boonTables } = buildBoonTables(validLogs);
        const specialTotals: Record<string, { id: number; name: string; total: number; rows: Record<string, { account: string; profession: string; total: number; duration: number }> }> = {};
        validLogs.forEach(log => {
            const details = log.details;
            if (!details) return;
            const durationSec = details.durationMS ? details.durationMS / 1000 : 0;
            const players = details.players as unknown as Player[];

            const sourceLookup = new Map<string, { account: string; profession: string }>();
            players.forEach(player => {
                if (player.name) {
                    sourceLookup.set(player.name, { account: player.account || player.name, profession: player.profession || 'Unknown' });
                }
                if (player.character_name) {
                    sourceLookup.set(player.character_name, { account: player.account || player.character_name, profession: player.profession || 'Unknown' });
                }
            });

            const computeGeneration = (states: number[][]) => {
                let lastState = 0;
                let gen = 0;
                for (const state of states) {
                    if (state[1] > lastState) {
                        gen += (state[1] - lastState);
                    }
                    lastState = state[1];
                }
                return gen;
            };

            // Special buffs: use buffUptimes statesPerSource when available (captures shared applications)
            players.forEach(player => {
                if (player.notInSquad) return;
                (player.buffUptimes || []).forEach((buff) => {
                    const info = getBuffInfo(details, buff.id);
                    if (info.classification === 'Boon') return;
                    if (!shouldIncludeSpecial(info.classification, info.name)) return;
                    for (const [sourceName, states] of Object.entries(buff.statesPerSource || {})) {
                        if (!sourceLookup.has(sourceName)) continue;
                        const outgoing = computeGeneration(states as number[][]);
                        if (!outgoing) continue;
                        const key = String(buff.id);
                        if (!specialTotals[key]) {
                            specialTotals[key] = {
                                id: buff.id,
                                name: info.name,
                                total: 0,
                                rows: {}
                            };
                        }
                        const sourceInfo = sourceLookup.get(sourceName) || { account: sourceName, profession: 'Unknown' };
                        if (!specialTotals[key].rows[sourceInfo.account]) {
                            specialTotals[key].rows[sourceInfo.account] = {
                                account: sourceInfo.account,
                                profession: sourceInfo.profession,
                                total: 0,
                                duration: 0
                            };
                        }
                        specialTotals[key].total += outgoing;
                        specialTotals[key].rows[sourceInfo.account].total += outgoing;
                        specialTotals[key].rows[sourceInfo.account].duration += durationSec;
                    }
                });
            });
        });

        const specialTables = Object.values(specialTotals)
            .map((buff) => ({
                id: String(buff.id),
                name: buff.name,
                total: buff.total,
                rows: Object.values(buff.rows)
                    .map((row) => ({
                        ...row,
                        perSecond: row.duration > 0 ? row.total / row.duration : 0
                    }))
                    .sort((a, b) => b.total - a.total || a.account.localeCompare(b.account))
            }))
            .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

        const timelineData = validLogs
            .filter(log => log.details)
            .map((log, index) => {
                const details = log.details;
                const players = (details?.players as unknown as Player[]) || [];
                const targets = details?.targets || [];
                const allies = players.filter(p => !p.notInSquad).length;
                const enemies = targets.filter((t: any) => !t.isFake).length;
                const timestamp = details?.uploadTime || log.uploadTime || 0;
                const label = timestamp
                    ? new Date(timestamp * 1000).toLocaleDateString()
                    : `Log ${index + 1}`;
                return {
                    label,
                    allies,
                    enemies,
                    timestamp
                };
            })
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
            .map((entry, index) => ({
                ...entry,
                index: index + 1
            }));

        const fightBreakdown = validLogs.map((log, index) => {
            const details = log.details || {};
            const players = (details.players || []) as any[];
            const targets = (details.targets || []) as any[];
            const squadPlayers = players.filter((p) => !p.notInSquad);
            const allyPlayers = players.filter((p) => p.notInSquad);
            const allFriendly = players;
            const nonFakeTargets = targets.filter((t) => !t.isFake);
            const teamIds = Array.from(new Set(nonFakeTargets.map((t) => t?.teamID).filter((id) => id !== undefined && id !== null)));
            const colorOrder = ['red', 'green', 'blue'] as const;

            const teamColorMap = new Map<number, typeof colorOrder[number]>();
            const rawTeamMap = details?.teamIdMap || details?.teamIDMap || details?.wvwTeams || details?.teams;
            if (rawTeamMap && typeof rawTeamMap === 'object') {
                if (Array.isArray(rawTeamMap)) {
                    rawTeamMap.forEach((entry: any) => {
                        const id = Number(entry?.teamID ?? entry?.teamId ?? entry?.id);
                        const colorRaw = String(entry?.color || entry?.name || '').toLowerCase();
                        const color = colorOrder.find((c) => colorRaw.includes(c));
                        if (Number.isFinite(id) && color) {
                            teamColorMap.set(id, color);
                        }
                    });
                } else {
                    colorOrder.forEach((color) => {
                        const id = rawTeamMap[color] ?? rawTeamMap[color.toUpperCase()];
                        if (typeof id === 'number') {
                            teamColorMap.set(id, color);
                        }
                    });
                }
            }

            const usedColors = new Set(teamColorMap.values());
            const remainingColors = colorOrder.filter((c) => !usedColors.has(c));
            const unmappedIds = teamIds.filter((id) => !teamColorMap.has(id)).sort((a, b) => a - b);
            unmappedIds.forEach((id, idx) => {
                const color = remainingColors[idx] || remainingColors[remainingColors.length - 1] || 'red';
                teamColorMap.set(id, color);
            });

            const teamCounts = { red: 0, green: 0, blue: 0 };
            nonFakeTargets.forEach((t) => {
                const teamId = t?.teamID;
                if (!Number.isFinite(teamId)) return;
                const color = teamColorMap.get(teamId);
                if (!color) return;
                teamCounts[color] += 1;
            });

            let alliesDown = 0;
            let alliesDead = 0;
            let alliesRevived = 0;
            let rallies = 0;
            let totalOutgoingDamage = 0;
            let totalIncomingDamage = 0;
            let incomingBarrierAbsorbed = 0;

            allFriendly.forEach((p) => {
                alliesDown += Number(p.defenses?.[0]?.downCount ?? 0);
                alliesDead += Number(p.defenses?.[0]?.deadCount ?? 0);
                alliesRevived += Number(p.support?.[0]?.resurrects ?? 0);
                rallies += Number(p.defenses?.[0]?.rallyCount ?? p.defenses?.[0]?.rallies ?? 0);
                totalOutgoingDamage += Number(p.dpsAll?.[0]?.damage ?? 0);
                totalIncomingDamage += Number(p.defenses?.[0]?.damageTaken ?? 0);
                incomingBarrierAbsorbed += Number(p.defenses?.[0]?.damageBarrier ?? 0);
            });

            let enemyDeaths = 0;
            squadPlayers.forEach((p: any) => {
                enemyDeaths += getTargetStatTotal(p, 'killed');
            });

            let outgoingBarrierAbsorbed = 0;
            nonFakeTargets.forEach((t) => {
                outgoingBarrierAbsorbed += Number(t?.defenses?.[0]?.damageBarrier ?? 0);
            });

            return {
                id: log.id || log.filePath || `${details.fightName || 'fight'}-${index}`,
                label: shortenFightLabel(details.fightName || details.name || log.filePath || log.id || 'Fight'),
                permalink: log.permalink,
                duration: getFightDurationLabel(details, log),
                squadCount: squadPlayers.length,
                allyCount: allyPlayers.length,
                enemyCount: nonFakeTargets.length,
                teamCounts,
                alliesDown,
                alliesDead,
                alliesRevived,
                rallies,
                enemyDeaths,
                totalOutgoingDamage,
                totalIncomingDamage,
                incomingBarrierAbsorbed,
                outgoingBarrierAbsorbed
            };
        });

        return {
            total,
            wins,
            losses,
            avgSquadSize,
            avgEnemies,
            squadKDR,
            enemyKDR,
            totalSquadKills,
            totalSquadDeaths,
            totalEnemyKills,
            totalEnemyDeaths,
            maxDownContrib,
            maxCleanses,
            maxStrips,
            maxStab,
            maxHealing,
            maxBarrier,
            maxCC,
            closestToTag,
            topSkills,
            topIncomingSkills,

            mapData,
            squadClassData,
            enemyClassData,
            timelineData,
            fightBreakdown,
            boonTables,
            specialTables,
            offensePlayers,
            defensePlayers,
            supportPlayers,
            healingPlayers,

            maxDodges,
            mvp,
            silver,
            bronze,
            avgMvpScore,
            leaderboards
        };
    }, [validLogs, precomputedStats]);

    const skillUsageData = useMemo<SkillUsageSummary>(() => {
        const precomputedSkillUsage = precomputedStats?.skillUsageData as SkillUsageSummary | undefined;
        if (precomputedSkillUsage) {
            return precomputedSkillUsage;
        }
        const skillNameMap = new Map<string, string>();
        const skillTotals = new Map<string, number>();
        const playerMap = new Map<string, SkillUsagePlayer>();
        const logRecords: SkillUsageLogRecord[] = [];
        const resUtilitySkillNameMap = new Map<string, string>();

        const resolveSkillName = (map: Record<string, { name?: string }>, id: number) => {
            const keyed = map?.[`s${id}`] || map?.[`${id}`];
            return keyed?.name || `Skill ${id}`;
        };

        validLogs.forEach((log) => {
            const details = log.details;
            if (!details) return;
            const skillMap = details.skillMap || {};
            const label = details.fightName || details.name || log.filePath || log.id || 'Log';
            let timestamp = 0;
            const parsedTime = Date.parse(details.timeStartStd || details.timeStart || '');
            if (!Number.isNaN(parsedTime)) {
                timestamp = parsedTime;
            } else {
                timestamp = details.uploadTime ?? log.uploadTime ?? Date.now();
            }

            const record: SkillUsageLogRecord = {
                id: log.filePath || log.id || label,
                label,
                timestamp,
                skillEntries: {}
            };

            const players = (details.players || []) as any[];
            players.forEach((player) => {
                if (player?.notInSquad) {
                    return;
                }
                const account = player.account || player.name || player.character_name || 'Unknown';
                const profession = player.profession || 'Unknown';
                const key = `${account}|${profession}`;
                let playerRecord = playerMap.get(key);
                if (!playerRecord) {
                    playerRecord = {
                        key,
                        account,
                        displayName: player.display_name || player.character_name || player.name || account,
                        profession,
                        professionList: player.profession ? [player.profession] : [],
                        logs: 0,
                        skillTotals: {}
                    };
                    playerMap.set(key, playerRecord);
                }
                playerRecord.logs += 1;

                (player.rotation || []).forEach((rotationSkill: any) => {
                    if (!rotationSkill || typeof rotationSkill.id !== 'number') return;
                    const castCount = Array.isArray(rotationSkill.skills) ? rotationSkill.skills.length : 0;
                    if (castCount === 0) return;
                    const skillId = `s${rotationSkill.id}`;
                    const skillName = resolveSkillName(skillMap, rotationSkill.id);
                    const existingEntry = record.skillEntries[skillId] ?? { name: skillName, players: {} };
                    if (existingEntry.name.startsWith('Skill ') && !skillName.startsWith('Skill ')) {
                        existingEntry.name = skillName;
                    }
                    existingEntry.players[playerRecord.key] = (existingEntry.players[playerRecord.key] || 0) + castCount;
                    record.skillEntries[skillId] = existingEntry;

                    playerRecord.skillTotals[skillId] = (playerRecord.skillTotals[skillId] || 0) + castCount;
                    skillNameMap.set(skillId, skillName);
                    skillTotals.set(skillId, (skillTotals.get(skillId) || 0) + castCount);

                    if (isResUtilitySkill(rotationSkill.id, skillMap)) {
                        resUtilitySkillNameMap.set(skillId, skillName);
                    }
                });
            });

            logRecords.push(record);
        });

        logRecords.sort((a, b) => a.timestamp - b.timestamp);

        const players = Array.from(playerMap.values())
            .map((player) => ({
                ...player,
                professionList: Array.from(new Set(player.professionList || []))
            }))
            .sort((a, b) => b.logs - a.logs || a.displayName.localeCompare(b.displayName));

        const skillOptions = Array.from(skillNameMap.entries())
            .map(([id, name]) => ({
                id,
                name,
                total: skillTotals.get(id) || 0
            }))
            .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

        return {
            logRecords,
            players,
            skillOptions,
            resUtilitySkills: Array.from(resUtilitySkillNameMap.entries())
                .map(([id, name]) => ({ id, name }))
                .sort((a, b) => a.name.localeCompare(b.name))
        };
    }, [precomputedStats, validLogs]);

    const playerMapByKey = useMemo(() => {
        const map = new Map<string, SkillUsagePlayer>();
        skillUsageData.players.forEach((player) => map.set(player.key, player));
        return map;
    }, [skillUsageData.players]);

    const adjustHexColor = (hex: string, factor: number) => {
        const cleaned = hex.replace('#', '');
        if (cleaned.length !== 6) return hex;
        const clamp = (value: number) => Math.max(0, Math.min(255, value));
        const parse = (start: number) => Number.parseInt(cleaned.slice(start, start + 2), 16);
        const toHex = (value: number) => clamp(Math.round(value)).toString(16).padStart(2, '0');
        const r = parse(0);
        const g = parse(2);
        const b = parse(4);
        return `#${toHex(r * factor)}${toHex(g * factor)}${toHex(b * factor)}`;
    };

    const skillNameLookup = useMemo(() => new Map(skillUsageData.skillOptions.map((option) => [option.id, option.name])), [skillUsageData.skillOptions]);

    const skillBarData = useMemo(() => {
        if (selectedPlayers.length === 0) return [];
        const totals = new Map<
            string,
            { total: number; name: string; dominantProfession: string; maxPlayerCount: number }
        >();
        selectedPlayers.forEach((playerKey) => {
            const player = playerMapByKey.get(playerKey);
            if (!player) return;
            Object.entries(player.skillTotals).forEach(([skillId, count]) => {
                if (!count) return;
                const existing = totals.get(skillId) || {
                    total: 0,
                    name: skillNameLookup.get(skillId) || `Skill ${skillId}`,
                    dominantProfession: player.profession,
                    maxPlayerCount: 0
                };
                existing.total += count;
                if (count > existing.maxPlayerCount) {
                    existing.maxPlayerCount = count;
                    existing.dominantProfession = player.profession;
                }
                totals.set(skillId, existing);
            });
        });

        const filterTerm = skillUsageSkillFilter.trim().toLowerCase();
        const filtered = Array.from(totals.entries())
            .map(([skillId, data]) => ({
                skillId,
                name: data.name,
                total: data.total,
                color: getProfessionColor(data.dominantProfession) || '#38bdf8'
            }))
            .filter((entry) => {
                if (!filterTerm) return true;
                return entry.name.toLowerCase().includes(filterTerm);
            })
            .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
            .slice(0, 8);
        return filtered;
    }, [selectedPlayers, playerMapByKey, skillNameLookup, skillUsageSkillFilter]);

    const skillUsageAvailable = skillUsageData.logRecords.length > 0 && skillUsageData.skillOptions.length > 0 && skillUsageData.players.length > 0;

    useEffect(() => {
        if (!selectedSkillId && skillUsageData.skillOptions.length > 0) {
            setSelectedSkillId(skillUsageData.skillOptions[0].id);
        }
    }, [skillUsageData.skillOptions, selectedSkillId]);

    const filteredPlayerOptions = useMemo(() => {
        const filterTerm = skillUsagePlayerFilter.trim().toLowerCase();
        if (!filterTerm) return skillUsageData.players;
        return skillUsageData.players.filter((player) => {
            return (
                player.displayName.toLowerCase().includes(filterTerm) ||
                player.account.toLowerCase().includes(filterTerm) ||
                player.profession.toLowerCase().includes(filterTerm)
            );
        });
    }, [skillUsageData.players, skillUsagePlayerFilter]);

    const playerTotalsForSkill = useMemo(() => {
        if (!selectedSkillId) return {};
        return selectedPlayers.reduce((acc, playerKey) => {
            const player = playerMapByKey.get(playerKey);
            acc[playerKey] = player?.skillTotals[selectedSkillId] || 0;
            return acc;
        }, {} as Record<string, number>);
    }, [selectedSkillId, selectedPlayers, playerMapByKey]);

    const classMaxTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        selectedPlayers.forEach((playerKey) => {
            const player = playerMapByKey.get(playerKey);
            if (!player) return;
            const total = playerTotalsForSkill[playerKey] ?? 0;
            totals[player.profession] = Math.max(totals[player.profession] || 0, total);
        });
        return totals;
    }, [selectedPlayers, playerMapByKey, playerTotalsForSkill]);

    const classRankByPlayer = useMemo(() => {
        const ranks = new Map<string, number>();
        const grouped = new Map<string, Array<{ key: string; total: number }>>();
        selectedPlayers.forEach((playerKey) => {
            const player = playerMapByKey.get(playerKey);
            if (!player) return;
            const total = playerTotalsForSkill[playerKey] ?? 0;
            const list = grouped.get(player.profession) || [];
            list.push({ key: playerKey, total });
            grouped.set(player.profession, list);
        });
        grouped.forEach((list) => {
            list.sort((a, b) => b.total - a.total);
            list.forEach((entry, index) => {
                ranks.set(entry.key, index);
            });
        });
        return ranks;
    }, [selectedPlayers, playerMapByKey, playerTotalsForSkill]);

    const lineDashPatterns = ['0', '12 3', '8 3', '6 3', '4 3', '2 3'];

    const getLineColorForPlayer = (playerKey: string) => {
        const player = playerMapByKey.get(playerKey);
        const baseColor = getProfessionColor(player?.profession || '') || '#38bdf8';
        const total = playerTotalsForSkill[playerKey] ?? 0;
        const maxTotal = player?.profession ? classMaxTotals[player.profession] || 1 : 1;
        const ratio = maxTotal > 0 ? total / maxTotal : 1;
        const factor = 0.35 + ratio * 0.65;
        return adjustHexColor(baseColor, factor);
    };

    const getLineDashForPlayer = (playerKey: string) => {
        const rank = classRankByPlayer.get(playerKey) ?? 0;
        return lineDashPatterns[rank % lineDashPatterns.length];
    };

    const getLineStrokeColor = (playerKey: string, isSelected: boolean, hasSelection: boolean) => {
        if (!hasSelection) {
            return getLineColorForPlayer(playerKey);
        }
        const player = playerMapByKey.get(playerKey);
        const baseColor = getProfessionColor(player?.profession || '') || '#38bdf8';
        return isSelected ? adjustHexColor(baseColor, 1.2) : adjustHexColor(baseColor, 0.5);
    };

    const skillChartData = useMemo(() => {
        if (!selectedSkillId || selectedPlayers.length === 0) return [];
        return skillUsageData.logRecords.map((record, index) => {
            const timeLabel = new Date(record.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const point: Record<string, number | string> = {
                label: record.label,
                timestamp: record.timestamp,
                shortLabel: timeLabel,
                fullLabel: timeLabel,
                index
            };
            const entry = record.skillEntries[selectedSkillId];
            selectedPlayers.forEach((playerKey) => {
                point[playerKey] = entry?.players?.[playerKey] ?? 0;
            });
            return point;
        });
    }, [skillUsageData.logRecords, selectedPlayers, selectedSkillId]);

    const skillChartMaxY = useMemo(() => {
        let max = 0;
        skillChartData.forEach((point) => {
            selectedPlayers.forEach((playerKey) => {
                const value = Number(point[playerKey] ?? 0);
                if (value > max) max = value;
            });
        });
        return max;
    }, [skillChartData, selectedPlayers]);

    const selectedSkillName = skillUsageData.skillOptions.find((option) => option.id === selectedSkillId)?.name || '';
    const skillUsageReady = skillUsageAvailable && Boolean(selectedSkillId) && selectedPlayers.length > 0;

    const togglePlayerSelection = (playerKey: string) => {
        setSelectedPlayers((prev) => {
            if (prev.includes(playerKey)) {
                return prev.filter((key) => key !== playerKey);
            }
            return [...prev, playerKey];
        });
    };

    const removeSelectedPlayer = (playerKey: string) => {
        setSelectedPlayers((prev) => prev.filter((key) => key !== playerKey));
    };

    const filteredBoonTables = useMemo(() => {
        const term = boonSearch.trim().toLowerCase();
        if (!term) return stats.boonTables;
        return stats.boonTables.filter((boon: any) => boon.name.toLowerCase().includes(term));
    }, [stats.boonTables, boonSearch]);
    const activeBoonTable = useMemo(() => {
        if (!activeBoonTab) return null;
        return stats.boonTables.find((boon: any) => boon.id === activeBoonTab) ?? null;
    }, [stats.boonTables, activeBoonTab]);
    const filteredSpecialTables = useMemo(() => {
        const term = specialSearch.trim().toLowerCase();
        const sorted = [...stats.specialTables].sort((a: any, b: any) => a.name.localeCompare(b.name));
        if (!term) return sorted;
        return sorted.filter((buff: any) => buff.name.toLowerCase().includes(term));
    }, [stats.specialTables, specialSearch]);
    const activeSpecialTable = useMemo(() => {
        if (!activeSpecialTab) return null;
        return stats.specialTables.find((buff: any) => buff.id === activeSpecialTab) ?? null;
    }, [stats.specialTables, activeSpecialTab]);

    useEffect(() => {
        if (!stats.boonTables || stats.boonTables.length === 0) return;
        if (!activeBoonTab || !stats.boonTables.some((tab: any) => tab.id === activeBoonTab)) {
            setActiveBoonTab(stats.boonTables[0].id);
        }
    }, [stats.boonTables, activeBoonTab]);

    useEffect(() => {
        if (!stats.specialTables || stats.specialTables.length === 0) return;
        if (!activeSpecialTab || !stats.specialTables.some((tab: any) => tab.id === activeSpecialTab)) {
            setActiveSpecialTab(stats.specialTables[0].id);
        }
    }, [stats.specialTables, activeSpecialTab]);

    const buildReportMeta = () => {
        const commanderSet = new Set<string>();
        let firstStart: Date | null = null;
        let lastEnd: Date | null = null;

        logs.forEach((log) => {
            const details = log.details;
            if (!details) return;
            const timeStart = details.timeStartStd || details.timeStart || details.uploadTime || log.uploadTime;
            const timeEnd = details.timeEndStd || details.timeEnd || details.uploadTime || log.uploadTime;
            const startDate = timeStart ? new Date(timeStart) : null;
            const endDate = timeEnd ? new Date(timeEnd) : null;
            if (startDate && !Number.isNaN(startDate.getTime())) {
                if (!firstStart || startDate < firstStart) firstStart = startDate;
            }
            if (endDate && !Number.isNaN(endDate.getTime())) {
                if (!lastEnd || endDate > lastEnd) lastEnd = endDate;
            }
            const players = (details.players || []) as any[];
            players.forEach((player) => {
                if (player?.notInSquad) return;
                if (player?.hasCommanderTag) {
                    const name = player?.name || player?.account || 'Unknown';
                    commanderSet.add(name);
                }
            });
        });

        const commanders = Array.from(commanderSet).sort((a, b) => a.localeCompare(b));
        const safeStart = firstStart || new Date();
        const safeEnd = lastEnd || safeStart;
        const dateStart = safeStart.toISOString();
        const dateEnd = safeEnd.toISOString();
        const dateLabel = `${safeStart.toLocaleString()} - ${safeEnd.toLocaleString()}`;

        const pad = (value: number) => String(value).padStart(2, '0');
        const reportId = `${safeStart.getFullYear()}${pad(safeStart.getMonth() + 1)}${pad(safeStart.getDate())}-${pad(safeStart.getHours())}${pad(safeStart.getMinutes())}${pad(safeStart.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;

        return {
            id: reportId,
            title: commanders.length ? commanders.join(', ') : 'Unknown Commander',
            commanders,
            dateStart,
            dateEnd,
            dateLabel,
            generatedAt: new Date().toISOString()
        };
    };

    const handleWebUpload = async () => {
        if (embedded) return;
        if (!window.electronAPI?.uploadWebReport) {
            setWebUploadMessage('Web upload is not available in this build.');
            return;
        }
        setUploadingWeb(true);
        setWebUploadMessage('Preparing report...');
        setWebUploadStage('Preparing report');
        setWebUploadProgress(0);
        setWebUploadUrl(null);
        setWebUploadBuildStatus('idle');
        try {
            const meta = buildReportMeta();
            const result = await window.electronAPI.uploadWebReport({
                meta,
                stats: {
                    ...stats,
                    skillUsageData
                }
            });
            if (result?.success) {
                const url = result.url || '';
                setWebUploadUrl(url);
                setWebUploadMessage(`Uploaded: ${url || 'GitHub Pages'}`);
                setWebUploadStage('Upload complete');
                setWebUploadProgress(100);
                setWebUploadBuildStatus('checking');
            } else {
                setWebUploadMessage(result?.error || 'Upload failed.');
                setWebUploadStage('Upload failed');
                setWebUploadBuildStatus('idle');
            }
        } catch (err: any) {
            setWebUploadMessage(err?.message || 'Upload failed.');
            setWebUploadStage('Upload failed');
            setWebUploadBuildStatus('idle');
        } finally {
            setUploadingWeb(false);
            setTimeout(() => {
                setWebUploadStage(null);
                setWebUploadProgress(null);
                setWebUploadDetail(null);
            }, 2500);
        }
    };

    const handleShare = async () => {
        if (embedded || !window.electronAPI?.sendStatsScreenshot) return;
        setSharing(true);
        const node = document.getElementById('stats-dashboard-container');
        if (node) {
            try {
                // Wait a moment for UI to settle if anything changed
                await new Promise(r => setTimeout(r, 100));

                const excluded = Array.from(node.querySelectorAll('.stats-share-exclude')) as HTMLElement[];
                excluded.forEach((el) => {
                    el.dataset.prevDisplay = el.style.display;
                    el.style.display = 'none';
                });
                const scrollWidth = node.scrollWidth;
                const scrollHeight = node.scrollHeight;
                const dataUrl = await toPng(node, {
                    backgroundColor: '#0f172a',
                    quality: 0.95,
                    pixelRatio: 2,
                    cacheBust: true,
                    width: scrollWidth,
                    height: scrollHeight,
                    style: {
                        overflow: 'visible',
                        maxHeight: 'none',
                        height: 'auto'
                    }
                });
                excluded.forEach((el) => {
                    el.style.display = el.dataset.prevDisplay || '';
                    delete el.dataset.prevDisplay;
                });

                const resp = await fetch(dataUrl);
                const blob = await resp.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const buffer = new Uint8Array(arrayBuffer);

                window.electronAPI.sendStatsScreenshot(buffer);
            } catch (err) {
                console.error("Failed to capture stats:", err);
            }
        }
        setTimeout(() => setSharing(false), 2000);
    };

    useEffect(() => {
        if (!window.electronAPI?.onWebUploadStatus) return;
        const unsubscribe = window.electronAPI.onWebUploadStatus((data) => {
            if (!data) return;
            setWebUploadStage(data.stage || 'Uploading');
            if (typeof data.progress === 'number') {
                setWebUploadProgress(data.progress);
            }
            if (data.message) {
                setWebUploadDetail(data.message);
            }
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (webUploadBuildStatus !== 'checking' && webUploadBuildStatus !== 'building') return;
        if (!window.electronAPI?.getGithubPagesBuildStatus) {
            setWebUploadBuildStatus('unknown');
            return;
        }
        let attempts = 0;
        const interval = setInterval(async () => {
            attempts += 1;
            try {
                const resp = await window.electronAPI.getGithubPagesBuildStatus();
                if (resp?.success) {
                    const status = String(resp.status || '').toLowerCase();
                    if (status === 'built' || status === 'success') {
                        setWebUploadBuildStatus('built');
                        clearInterval(interval);
                        return;
                    }
                    if (status === 'errored' || status === 'error' || status === 'failed') {
                        setWebUploadBuildStatus('errored');
                        clearInterval(interval);
                        return;
                    }
                    setWebUploadBuildStatus('building');
                } else if (resp?.error) {
                    setWebUploadBuildStatus('unknown');
                    clearInterval(interval);
                    return;
                }
            } catch {
                setWebUploadBuildStatus('unknown');
                clearInterval(interval);
                return;
            }
            if (attempts >= 18) {
                setWebUploadBuildStatus('unknown');
                clearInterval(interval);
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [webUploadBuildStatus]);

    const openExpandedSection = (sectionId: string) => {
        if (expandedCloseTimerRef.current) {
            window.clearTimeout(expandedCloseTimerRef.current);
            expandedCloseTimerRef.current = null;
        }
        setExpandedSectionClosing(false);
        setExpandedSection(sectionId);
    };

    const closeExpandedSection = () => {
        if (!expandedSection) return;
        if (expandedCloseTimerRef.current) {
            window.clearTimeout(expandedCloseTimerRef.current);
        }
        setExpandedSectionClosing(true);
        expandedCloseTimerRef.current = window.setTimeout(() => {
            setExpandedSection(null);
            setExpandedSectionClosing(false);
            expandedCloseTimerRef.current = null;
        }, 160);
    };

    useEffect(() => {
        if (!expandedSection) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeExpandedSection();
            }
        };
        const prevBodyOverflow = document.body.style.overflow;
        const prevHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = prevBodyOverflow;
            document.documentElement.style.overflow = prevHtmlOverflow;
        };
    }, [expandedSection]);

    const colorClasses: Record<string, { bg: string; text: string }> = {
        red: { bg: 'bg-red-500/20', text: 'text-red-400' },
        yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
        green: { bg: 'bg-green-500/20', text: 'text-green-400' },
        purple: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
        blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
        pink: { bg: 'bg-pink-500/20', text: 'text-pink-400' },
        cyan: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
        indigo: { bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
    };

    const LeaderCard = ({ icon: Icon, title, data, color, unit = '', onClick, active, rows, formatValue }: any) => {
        const classes = colorClasses[color] || colorClasses.blue;
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={onClick}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onClick?.();
                    }
                }}
                className={`bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 group hover:bg-white/10 transition-colors cursor-pointer ${active ? 'ring-1 ring-white/20' : ''}`}
            >
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${classes.bg} ${classes.text} shrink-0`}>
                        <Icon className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-gray-400 text-xs font-bold uppercase tracking-wider truncate">{title}</div>
                        <div className="text-2xl font-bold text-white mt-0.5 break-words">
                            {Math.round(data.value).toLocaleString()} <span className="text-sm font-normal text-gray-500">{unit}</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col border-t border-white/5 pt-2">
                    <div className="flex items-center gap-2 min-w-0">
                        {renderProfessionIcon(data.profession || 'Unknown', data.professionList, 'w-4 h-4')}
                        <div className="text-sm font-medium text-blue-300 truncate">{data.player || '-'}</div>
                    </div>
                    <div className="text-xs text-gray-500 truncate">{data.count ? `${data.count} logs` : '-'}</div>
                </div>
                {active && (
                    <div className="mt-3 stats-share-exclude">
                        <div className="text-xs font-semibold text-gray-200 mb-2">{title}</div>
                        {rows?.length ? (
                            <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
                                {rows.map((row: any) => (
                                    <div key={`${title}-${row.rank}-${row.account}`} className="flex items-center gap-2 text-xs text-gray-300">
                                        <div className="w-6 text-right text-gray-500">{row.rank}</div>
                                        {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                        <div className="flex-1 truncate">{row.account}</div>
                                        <div className="text-gray-400 font-mono">{formatValue ? formatValue(row.value) : row.value}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-gray-500 italic">No data available</div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const sortByCountDesc = (a: any, b: any) => {
        const diff = (b?.value || 0) - (a?.value || 0);
        if (diff !== 0) return diff;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
    };
    const sortedSquadClassData = [...stats.squadClassData].sort(sortByCountDesc);
    const sortedEnemyClassData = [...stats.enemyClassData].sort(sortByCountDesc);

    const containerClass = embedded
        ? 'min-h-screen flex flex-col p-1 w-full max-w-6xl mx-auto'
        : 'h-full flex flex-col p-1 w-full max-w-6xl mx-auto overflow-hidden';
    const scrollContainerClass = embedded
        ? 'space-y-6 min-h-0 p-4 rounded-xl'
        : 'flex-1 overflow-y-auto pr-2 space-y-6 min-h-0 bg-[#0f172a] p-4 rounded-xl';
    const scrollContainerStyle: CSSProperties | undefined = embedded
        ? {
            backgroundColor: 'rgba(3, 7, 18, 0.75)',
            backgroundImage: 'linear-gradient(160deg, rgba(var(--accent-rgb), 0.12), rgba(var(--accent-rgb), 0.04) 70%)'
        }
        : undefined;

    return (
        <div className={containerClass}>
            {expandedSection && (
                <div
                    className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-md modal-backdrop ${
                        expandedSectionClosing ? 'modal-backdrop-exit' : 'modal-backdrop-enter'
                    }`}
                    onClick={closeExpandedSection}
                />
            )}
            {/* Header */}
            <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-4">
                    {!embedded && (
                        <button
                            onClick={onBack}
                            className="p-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                    )}
                    <div className="space-y-0">
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Trophy className="w-6 h-6 text-yellow-500" />
                            Statistics Dashboard
                        </h1>
                        <p className="text-gray-400 text-xs">
                            Performance across {stats.total} uploaded logs
                        </p>
                    </div>
                </div>
                {!embedded && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleWebUpload}
                            disabled={uploadingWeb}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            <UploadCloud className="w-4 h-4" />
                            {uploadingWeb ? 'Uploading...' : 'Upload to Web'}
                        </button>
                        <button
                            onClick={handleShare}
                            disabled={sharing}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            <Share2 className="w-4 h-4" />
                            {sharing ? 'Sharing...' : 'Share to Discord'}
                        </button>
                    </div>
                )}
            </div>

            {!embedded && webUploadMessage && (
                <div className="mb-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-300 flex items-center gap-2">
                        <span className="uppercase tracking-widest text-[10px] text-cyan-300/70">Uploaded</span>
                        <button
                            onClick={() => {
                                const url = webUploadUrl || webUploadMessage.replace(/^Uploaded:\s*/i, '').trim();
                                if (url && window.electronAPI?.openExternal) {
                                    window.electronAPI.openExternal(url);
                                }
                            }}
                            className="text-cyan-200 hover:text-cyan-100 underline underline-offset-2"
                        >
                            {webUploadUrl || webUploadMessage.replace(/^Uploaded:\s*/i, '')}
                        </button>
                        {webUploadBuildStatus !== 'idle' && (
                            <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${webUploadBuildStatus === 'built'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : webUploadBuildStatus === 'errored'
                                    ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                    : webUploadBuildStatus === 'unknown'
                                        ? 'bg-white/5 text-gray-400 border-white/10'
                                        : 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                                }`}>
                                {(webUploadBuildStatus === 'checking' || webUploadBuildStatus === 'building') && (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                )}
                                {webUploadBuildStatus === 'built' && <CheckCircle2 className="w-3 h-3" />}
                                {webUploadBuildStatus === 'errored' && <XCircle className="w-3 h-3" />}
                                {webUploadBuildStatus === 'built'
                                    ? 'Build ready'
                                    : webUploadBuildStatus === 'errored'
                                        ? 'Build failed'
                                        : webUploadBuildStatus === 'unknown'
                                            ? 'Build status unknown'
                                            : 'Building…'}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            const url = webUploadUrl || webUploadMessage.replace(/^Uploaded:\s*/i, '').trim();
                            if (url) {
                                navigator.clipboard.writeText(url);
                                setWebCopyStatus('copied');
                                setTimeout(() => setWebCopyStatus('idle'), 1200);
                            }
                        }}
                        className="px-3 py-1 rounded-full text-[10px] border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                    >
                        {webCopyStatus === 'copied' ? 'Copied' : 'Copy URL'}
                    </button>
                </div>
            )}

            {!embedded && (uploadingWeb || webUploadStage) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg">
                    <div className="w-full max-w-md bg-white/10 border border-white/15 rounded-2xl p-6 shadow-2xl backdrop-blur-2xl">
                        <div className="text-sm uppercase tracking-widest text-cyan-300/70">Web Upload</div>
                        <div className="text-2xl font-bold text-white mt-2">{webUploadStage || 'Uploading'}</div>
                        <div className="text-sm text-gray-400 mt-2">
                            {webUploadDetail || webUploadMessage || 'Working...'}
                        </div>
                        <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                                style={{ width: `${webUploadProgress ?? (uploadingWeb ? 35 : 100)}%` }}
                            />
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                            {typeof webUploadProgress === 'number' ? `${Math.round(webUploadProgress)}%` : 'Preparing...'}
                        </div>
                    </div>
                </div>
            )}

            <div id="stats-dashboard-container" className={scrollContainerClass} style={scrollContainerStyle}>

                {/* Wins/Losses Big Cards with embedded Averages and KDR */}
                <div id="overview" className="grid grid-cols-2 gap-4 scroll-mt-24">
                    <div
                        className="bg-gradient-to-br from-green-500/20 to-emerald-900/20 border border-green-500/30 rounded-2xl p-6 flex flex-col items-center justify-center relative"
                    >
                        <div className="text-5xl font-black text-green-400">{stats.wins}</div>
                        <div className="text-green-200/50 font-bold uppercase tracking-widest text-sm mt-2 mb-4">Victories</div>

                        <div className={`grid grid-cols-2 gap-4 pt-3 w-full ${embedded ? 'border-t border-white/10' : 'border-t border-green-500/20'}`}>
                            <div className="flex flex-col items-center">
                                <div className="text-green-200 text-lg font-bold">{stats.avgSquadSize}</div>
                                <div className="text-green-200/40 text-[10px] uppercase font-bold tracking-wider">Avg Squad</div>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="text-green-200 text-lg font-bold">{stats.squadKDR}</div>
                                <div className="text-green-200/40 text-[10px] uppercase font-bold tracking-wider">Squad KDR</div>
                            </div>
                        </div>
                    </div>
                    <div
                        className="bg-gradient-to-br from-red-500/20 to-rose-900/20 border border-red-500/30 rounded-2xl p-6 flex flex-col items-center justify-center relative"
                    >
                        <div className="text-5xl font-black text-red-400">{stats.losses}</div>
                        <div className="text-red-200/50 font-bold uppercase tracking-widest text-sm mt-2 mb-4">Defeats</div>

                        <div className={`grid grid-cols-2 gap-4 pt-3 w-full ${embedded ? 'border-t border-white/10' : 'border-t border-red-500/20'}`}>
                            <div className="flex flex-col items-center">
                                <div className="text-red-200 text-lg font-bold">{stats.avgEnemies}</div>
                                <div className="text-red-200/40 text-[10px] uppercase font-bold tracking-wider">Avg Enemies</div>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="text-red-200 text-lg font-bold">{stats.enemyKDR}</div>
                                <div className="text-red-200/40 text-[10px] uppercase font-bold tracking-wider">Enemy KDR</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Fight Breakdown (excluded from share screenshots) */}
                <div id="fight-breakdown" className="mt-6 stats-share-exclude">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-200">Fight Breakdown</h3>
                            <span className="text-[10px] uppercase tracking-widest text-gray-500">
                                {stats.fightBreakdown?.length || 0} Fights
                            </span>
                        </div>
                        {(stats.fightBreakdown || []).length === 0 ? (
                            <div className="text-center text-gray-500 italic py-6">No fight data available</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-[1500px] w-full text-xs">
                                    <thead>
                                        <tr className="text-gray-400 uppercase tracking-widest text-[10px] border-b border-white/10">
                                            <th className="text-right py-2 px-3">#</th>
                                            <th className="text-left py-2 px-3">Report</th>
                                            <th className="text-left py-2 px-3">Duration</th>
                                            <th className="text-right py-2 px-3">Squad</th>
                                            <th className="text-right py-2 px-3">Allies</th>
                                            <th className="text-right py-2 px-3">Enemies</th>
                                            <th className="text-right py-2 px-3">Red</th>
                                            <th className="text-right py-2 px-3">Green</th>
                                            <th className="text-right py-2 px-3">Blue</th>
                                            <th className="text-right py-2 px-3">Allies Down</th>
                                            <th className="text-right py-2 px-3">Allies Dead</th>
                                            <th className="text-right py-2 px-3">Allies Revived</th>
                                            <th className="text-right py-2 px-3">Rallies</th>
                                            <th className="text-right py-2 px-3">Enemy Deaths</th>
                                            <th className="text-right py-2 px-3">Outgoing Dmg</th>
                                            <th className="text-right py-2 px-3">Incoming Dmg</th>
                                            <th className="text-right py-2 px-3">Barrier In</th>
                                            <th className="text-right py-2 px-3">Barrier Out</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(stats.fightBreakdown || []).map((fight: any, idx: number) => (
                                            <tr key={fight.id || `${fight.label}-${idx}`} className="border-b border-white/5 hover:bg-white/5">
                                                <td className="py-2 px-3 text-right font-mono text-gray-500">{idx + 1}</td>
                                                <td className="py-2 px-3">
                                                    {fight.permalink ? (
                                                        <button
                                                            onClick={() => {
                                                                if (fight.permalink && window.electronAPI?.openExternal) {
                                                                    window.electronAPI.openExternal(fight.permalink);
                                                                } else if (fight.permalink) {
                                                                    window.open(fight.permalink, '_blank');
                                                                }
                                                            }}
                                                            className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                                                        >
                                                            {fight.label || 'dps.report'}
                                                        </button>
                                                    ) : (
                                                        <span className="text-gray-500">Pending</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-gray-200">{fight.duration || '--:--'}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.squadCount ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.allyCount ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.enemyCount ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono text-red-300">{fight.teamCounts?.red ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono text-green-300">{fight.teamCounts?.green ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono text-blue-300">{fight.teamCounts?.blue ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.alliesDown ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.alliesDead ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.alliesRevived ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.rallies ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{fight.enemyDeaths ?? 0}</td>
                                                <td className="py-2 px-3 text-right font-mono">{Number(fight.totalOutgoingDamage || 0).toLocaleString()}</td>
                                                <td className="py-2 px-3 text-right font-mono">{Number(fight.totalIncomingDamage || 0).toLocaleString()}</td>
                                                <td className="py-2 px-3 text-right font-mono">{Number(fight.incomingBarrierAbsorbed || 0).toLocaleString()}</td>
                                                <td className="py-2 px-3 text-right font-mono">{Number(fight.outgoingBarrierAbsorbed || 0).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Records Grid */}
                <div id="top-players" className="scroll-mt-24">
                    <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-400" />
                        Top Players (Total Accumulated Stats)
                    </h3>
                    <div className="mb-6">
                        <div className="bg-gradient-to-r from-yellow-500/20 via-orange-500/10 to-transparent border border-yellow-500/30 rounded-2xl p-6 relative overflow-hidden group">
                            {/* Glow Effect */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/10 blur-[80px] rounded-full pointer-events-none group-hover:bg-yellow-500/20 transition-all" />

                            <div className="flex items-center gap-6 relative z-10">
                                <div className="hidden sm:flex items-center justify-center w-20 h-20 rounded-full bg-yellow-500/20 border border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                                    <Crown className="w-10 h-10 text-yellow-400" />
                                </div>

                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
                                        <span className="text-yellow-500 font-bold uppercase tracking-widest text-xs">Squad MVP</span>
                                    </div>
                                    <div className="text-3xl font-black text-white mb-2 flex items-center gap-3">
                                        {stats.mvp.account}
                                        {renderProfessionIcon(stats.mvp.profession, stats.mvp.professionList, 'w-6 h-6')}
                                        <span className="text-lg font-medium text-gray-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                                            {stats.mvp.profession}
                                        </span>
                                    </div>
                                    <p className="text-gray-300 italic flex items-center gap-2 mb-3">
                                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500/50" />
                                        "{stats.mvp.reason}"
                                    </p>

                                    {/* Top Stats Breakdown */}
                                    <div className="flex flex-wrap gap-2">
                                        {stats.mvp.topStats && stats.mvp.topStats.map((stat: any, i: number) => {
                                            const rank = Math.max(1, Math.round(stat.ratio));
                                            const mod100 = rank % 100;
                                            const mod10 = rank % 10;
                                            const suffix = mod100 >= 11 && mod100 <= 13
                                                ? 'th'
                                                : mod10 === 1
                                                    ? 'st'
                                                    : mod10 === 2
                                                        ? 'nd'
                                                        : mod10 === 3
                                                            ? 'rd'
                                                            : 'th';
                                            return (
                                                <div key={i} className="flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-xs">
                                                    <span className="text-yellow-200 font-bold">{stat.name}</span>
                                                    <span className="text-white font-mono">{stat.val}</span>
                                                    <span className="text-yellow-500/50 text-[10px]">({rank}{suffix})</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="hidden lg:block text-right">
                                    <div className="text-yellow-500/40 font-mono text-sm uppercase tracking-wider font-bold">Contribution Score</div>
                                    <div className="text-4xl font-black text-yellow-500/80">{stats.mvp.score > 0 ? stats.mvp.score.toFixed(1) : '-'}</div>
                                    <div className="text-xs text-yellow-500/30 font-mono mt-1">Avg: {stats.avgMvpScore.toFixed(1)}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        {[
                            { label: 'Silver', data: stats.silver, color: 'from-slate-400/20 to-slate-700/10', accent: 'text-slate-200' },
                            { label: 'Bronze', data: stats.bronze, color: 'from-orange-500/25 to-amber-900/15', accent: 'text-orange-200' }
                        ].map((entry) => (
                            <div
                                key={entry.label}
                                className={`bg-gradient-to-r ${entry.color} border border-white/10 rounded-2xl p-4`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className={`text-xs uppercase tracking-widest font-semibold ${entry.accent}`}>
                                        {entry.label} MVP
                                    </div>
                                    <div className="text-xs text-gray-500 font-mono">
                                        {entry.data?.score ? entry.data.score.toFixed(1) : '-'}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {entry.data && renderProfessionIcon(entry.data.profession, entry.data.professionList, 'w-6 h-6')}
                                    <div className="min-w-0 flex-1">
                                        <div className="text-lg font-semibold text-white truncate">
                                            {entry.data?.account || '—'}
                                        </div>
                                        <div className="text-xs text-gray-400 truncate">
                                            {entry.data?.profession || 'Unknown'}
                                        </div>
                                    </div>
                                    {entry.data?.topStats?.length ? (
                                        <div className="flex flex-col items-end gap-1 text-[10px] text-gray-300">
                                            {entry.data.topStats.map((stat: any, idx: number) => {
                                                const rank = Math.max(1, Math.round(stat.ratio));
                                                const mod100 = rank % 100;
                                                const mod10 = rank % 10;
                                                const suffix = mod100 >= 11 && mod100 <= 13
                                                    ? 'th'
                                                    : mod10 === 1
                                                        ? 'st'
                                                        : mod10 === 2
                                                            ? 'nd'
                                                            : mod10 === 3
                                                                ? 'rd'
                                                                : 'th';
                                                return (
                                                    <span key={idx} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                                                        {stat.name} {rank}{suffix}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>

                    {(() => {
                        const leaderCards = [
                            { icon: HelpingHand, title: 'Down Contribution', data: stats.maxDownContrib, color: 'red', statKey: 'downContrib' },
                            { icon: Shield, title: 'Total Barrier', data: stats.maxBarrier, color: 'yellow', statKey: 'barrier' },
                            { icon: Activity, title: 'Total Healing', data: stats.maxHealing, color: 'green', statKey: 'healing' },
                            { icon: Wind, title: 'Total Dodges', data: stats.maxDodges, color: 'cyan', statKey: 'dodges' },
                            { icon: Zap, title: 'Total Strips', data: stats.maxStrips, color: 'purple', statKey: 'strips' },
                            { icon: Flame, title: 'Total Cleanses', data: stats.maxCleanses, color: 'blue', statKey: 'cleanses' },
                            { icon: Hammer, title: 'Total CC', data: stats.maxCC, color: 'pink', statKey: 'cc' },
                            { icon: ShieldCheck, title: 'Total Stab Gen', data: stats.maxStab, color: 'cyan', statKey: 'stability' },
                            { icon: Crosshair, title: 'Closest to Tag', data: stats.closestToTag, color: 'indigo', unit: 'dist', statKey: 'closestToTag' }
                        ];
                        const formatValue = (value: number) => Math.round(value).toLocaleString();
                        return (
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {leaderCards.map((card) => {
                                        const isActive = expandedLeader === card.statKey;
                                        const rows = stats.leaderboards?.[card.statKey] || [];
                                        return (
                                        <LeaderCard
                                            key={card.statKey}
                                            {...card}
                                            active={isActive}
                                            onClick={() => setExpandedLeader((prev) => (prev === card.statKey ? null : card.statKey))}
                                            rows={rows}
                                            formatValue={formatValue}
                                        />
                                        );
                                    })}
                                </div>
                            </>
                        );
                    })()}
                </div>

                {/* Top Skills Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Outgoing Skills */}
                    <div
                        id="top-skills-outgoing"
                        className={`bg-white/5 border border-white/10 rounded-2xl p-6 scroll-mt-24 ${
                            expandedSection === 'top-skills-outgoing'
                                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                                }`
                                : ''
                        }`}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                                <Swords className="w-5 h-5 text-orange-400" />
                                Top Outgoing Damage Skills
                            </h3>
                            <button
                                type="button"
                                onClick={() => (expandedSection === 'top-skills-outgoing' ? closeExpandedSection() : openExpandedSection('top-skills-outgoing'))}
                                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                                aria-label={expandedSection === 'top-skills-outgoing' ? 'Close Top Outgoing Damage Skills' : 'Expand Top Outgoing Damage Skills'}
                                title={expandedSection === 'top-skills-outgoing' ? 'Close' : 'Expand'}
                            >
                                {expandedSection === 'top-skills-outgoing' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className={`${expandedSection === 'top-skills-outgoing' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-80 overflow-y-auto'} space-y-4`}>
                            {stats.topSkills.map((skill: { name: string; damage: number; hits: number }, i: number) => (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-8 text-center text-xl font-bold text-gray-600">#{i + 1}</div>
                                    <div className="flex-1">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-white font-bold">{skill.name}</span>
                                            <div className="text-right">
                                                <span className="text-orange-400 font-mono font-bold">{Math.round(skill.damage).toLocaleString()}</span>
                                                <span className="text-gray-500 text-xs ml-2">({skill.hits.toLocaleString()} hits)</span>
                                            </div>
                                        </div>
                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-orange-500 rounded-full"
                                                style={{ width: `${(skill.damage / (stats.topSkills[0]?.damage || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {stats.topSkills.length === 0 && (
                                <div className="text-center text-gray-500 italic py-4">No damage data available</div>
                            )}
                        </div>
                    </div>

                    {/* Incoming Skills */}
                    <div
                        id="top-skills-incoming"
                        className={`bg-white/5 border border-white/10 rounded-2xl p-6 scroll-mt-24 ${
                            expandedSection === 'top-skills-incoming'
                                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                                }`
                                : ''
                        }`}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                                <Shield className="w-5 h-5 text-red-500" />
                                Top Incoming Damage Skills
                            </h3>
                            <button
                                type="button"
                                onClick={() => (expandedSection === 'top-skills-incoming' ? closeExpandedSection() : openExpandedSection('top-skills-incoming'))}
                                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                                aria-label={expandedSection === 'top-skills-incoming' ? 'Close Top Incoming Damage Skills' : 'Expand Top Incoming Damage Skills'}
                                title={expandedSection === 'top-skills-incoming' ? 'Close' : 'Expand'}
                            >
                                {expandedSection === 'top-skills-incoming' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className={`${expandedSection === 'top-skills-incoming' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-80 overflow-y-auto'} space-y-4`}>
                            {stats.topIncomingSkills.map((skill: { name: string; damage: number; hits: number }, i: number) => (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-8 text-center text-xl font-bold text-gray-600">#{i + 1}</div>
                                    <div className="flex-1">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-white font-bold">{skill.name}</span>
                                            <div className="text-right">
                                                <span className="text-red-400 font-mono font-bold">{Math.round(skill.damage).toLocaleString()}</span>
                                                <span className="text-gray-500 text-xs ml-2">({skill.hits.toLocaleString()} hits)</span>
                                            </div>
                                        </div>
                                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-red-500 rounded-full"
                                                style={{ width: `${(skill.damage / (stats.topIncomingSkills[0]?.damage || 1)) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {stats.topIncomingSkills.length === 0 && (
                                <div className="text-center text-gray-500 italic py-4">No incoming damage data available</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Class Distribution Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 page-break-avoid">
                    {/* Squad Composition */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                            <Users className="w-5 h-5 text-green-400" />
                            Squad Composition
                        </h3>
                        <div className="grid grid-cols-[1fr_150px] h-[300px] gap-4">
                            <div className="h-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={sortedSquadClassData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            dataKey="value"
                                        >
                                            {sortedSquadClassData.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                {selectedPlayers.length > 0 && (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {selectedPlayers.map((playerKey) => {
                                            const player = playerMapByKey.get(playerKey);
                                            const total = playerTotalsForSkill[playerKey] ?? 0;
                                            return (
                                                <div
                                                    key={playerKey}
                                                    className="rounded-2xl border border-white/10 bg-white/5 p-3 flex items-center justify-between"
                                                    onMouseEnter={() => setHoveredSkillPlayer([playerKey])}
                                                    onMouseLeave={() => setHoveredSkillPlayer([])}
                                                >
                                                    <div>
                                                        <div className="text-[10px] uppercase tracking-[0.4em] text-gray-400">Player</div>
                                                        <div className="font-semibold text-white">{player?.displayName || playerKey}</div>
                                                    </div>
                                                    <div className="text-3xl font-black text-white font-mono">{total.toLocaleString()}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="w-full h-full overflow-y-auto pr-1 flex items-center">
                                <div className="space-y-1.5 text-[11px] mx-auto">
                                    {sortedSquadClassData.map((entry: any) => (
                                        <div key={entry.name} className="flex items-center gap-2 text-gray-300">
                                            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                                            {getProfessionIconPath(entry.name) ? (
                                                <img
                                                    src={getProfessionIconPath(entry.name) as string}
                                                    alt={entry.name}
                                                    className="w-4 h-4 shrink-0"
                                                />
                                            ) : (
                                                <span className="inline-block w-4 h-4 rounded-sm border border-white/10" />
                                            )}
                                            <span className="truncate">{entry.name}</span>
                                            <span className="text-gray-500">({entry.value})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Enemy Composition */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                            <Skull className="w-5 h-5 text-red-400" />
                            Enemy Composition (Top 10)
                        </h3>
                        <div className="grid grid-cols-[1fr_150px] h-[300px] gap-4">
                            <div className="h-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={sortedEnemyClassData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            dataKey="value"
                                        >
                                            {sortedEnemyClassData.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="w-full h-full overflow-y-auto pr-1 flex items-center">
                                <div className="space-y-1.5 text-[11px] mx-auto">
                                    {sortedEnemyClassData.map((entry: any) => (
                                        <div key={entry.name} className="flex items-center gap-2 text-gray-300">
                                            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                                            {getProfessionIconPath(entry.name) ? (
                                                <img
                                                    src={getProfessionIconPath(entry.name) as string}
                                                    alt={entry.name}
                                                    className="w-4 h-4 shrink-0"
                                                />
                                            ) : (
                                                <span className="inline-block w-4 h-4 rounded-sm border border-white/10" />
                                            )}
                                            <span className="truncate">{entry.name}</span>
                                            <span className="text-gray-500">({entry.value})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Squad vs Enemy Size Timeline */}
                <div id="timeline" className="bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid scroll-mt-24">
                    <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                        <Users className="w-5 h-5 text-green-400" />
                        Squad vs Enemy Size
                    </h3>
                    {stats.timelineData.length === 0 ? (
                        <div className="text-center text-gray-500 italic py-10">No timeline data available</div>
                    ) : (
                        <div className="h-[260px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stats.timelineData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="index"
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                    />
                                    <YAxis
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                        width={36}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                                        labelFormatter={(_value, payload) => {
                                            const point = payload?.[0]?.payload;
                                            return point?.label ? `Log ${point.index} • ${point.label}` : `Log ${_value}`;
                                        }}
                                        formatter={(value: any, name?: string) => [
                                            value,
                                            name === 'allies' ? 'Allies' : 'Enemies'
                                        ]}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="allies"
                                        stroke="#22c55e"
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: '#22c55e' }}
                                        activeDot={{ r: 5 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="enemies"
                                        stroke="#ef4444"
                                        strokeWidth={2}
                                        dot={{ r: 3, fill: '#ef4444' }}
                                        activeDot={{ r: 5 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* Map Distribution Pie Chart */}
                <div id="map-distribution" className="bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid scroll-mt-24">
                    <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                        <MapIcon className="w-5 h-5 text-blue-400" />
                        Map Distribution
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.mapData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {stats.mapData.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <ChartLegend
                                    verticalAlign="bottom"
                                    height={36}
                                    // @ts-ignore
                                    payload={stats.mapData.map(item => ({
                                        id: item.name,
                                        type: 'square',
                                        value: item.name,
                                        color: item.color,
                                        payload: item
                                    }))}
                                    formatter={(value: any, entry: any) => (
                                        <span className="text-gray-300 font-medium ml-1">
                                            {value} <span className="text-gray-500">({entry.payload.value})</span>
                                        </span>
                                    )}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Boon Output Tables */}
                <div
                    id="boon-output"
                    className={`bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                        expandedSection === 'boon-output'
                            ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                                expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                            }`
                            : ''
                    }`}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-cyan-400" />
                            Boon Output
                        </h3>
                        <button
                            type="button"
                            onClick={() => (expandedSection === 'boon-output' ? closeExpandedSection() : openExpandedSection('boon-output'))}
                            className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                            aria-label={expandedSection === 'boon-output' ? 'Close Boon Output' : 'Expand Boon Output'}
                            title={expandedSection === 'boon-output' ? 'Close' : 'Expand'}
                        >
                            {expandedSection === 'boon-output' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    </div>
                    {stats.boonTables.length === 0 ? (
                        <div className="text-center text-gray-500 italic py-8">No boon data available</div>
                    ) : (
                        <>
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        {([
                                            { value: 'selfBuffs', label: 'Self' },
                                            { value: 'groupBuffs', label: 'Group' },
                                            { value: 'squadBuffs', label: 'Squad' },
                                            { value: 'totalBuffs', label: 'Total' }
                                        ] as const).map((option) => (
                                            <button
                                                key={option.value}
                                                onClick={() => setActiveBoonCategory(option.value)}
                                                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${activeBoonCategory === option.value
                                                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                    : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                    }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expandedSection === 'boon-output' ? 'flex-1 min-h-0 h-full' : ''}`}>
                                    <div className={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'boon-output' ? 'h-full flex-1' : 'self-start'}`}>
                                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Boons</div>
                                        <input
                                            value={boonSearch}
                                            onChange={(e) => setBoonSearch(e.target.value)}
                                            placeholder="Search..."
                                            className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                                        />
                                        <div className={`${sidebarListClass} ${expandedSection === 'boon-output' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                                            {filteredBoonTables.length === 0 ? (
                                                <div className="text-center text-gray-500 italic py-6 text-xs">No boons match this filter</div>
                                            ) : (
                                                filteredBoonTables.map((boon: any) => (
                                                    <button
                                                        key={boon.id}
                                                        onClick={() => setActiveBoonTab(boon.id)}
                                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeBoonTab === boon.id
                                                            ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                                                            : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                            }`}
                                                    >
                                                        {boon.name}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                    <div className={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'boon-output' ? 'flex flex-col min-h-0' : ''}`}>
                                        {!activeBoonTable ? (
                                            <div className="px-4 py-10 text-center text-gray-500 italic text-sm">Select a boon to view details</div>
                                        ) : (
                                            <div>
                                                <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                                    <div className="text-sm font-semibold text-gray-200">{activeBoonTable.name}</div>
                                                    <div className="text-xs uppercase tracking-widest text-gray-500">
                                                        {`${activeBoonCategory.replace('Buffs', '')} • ${activeBoonMetric === 'total' ? 'Total Gen' : activeBoonMetric === 'average' ? 'Gen/Sec' : 'Uptime'}`}
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-end gap-2 px-4 py-2 bg-white/5">
                                                    {([
                                                        { value: 'total', label: 'Total Gen' },
                                                        { value: 'average', label: 'Gen/Sec' },
                                                        { value: 'uptime', label: 'Uptime' }
                                                    ] as const).map((option) => (
                                                        <button
                                                            key={option.value}
                                                            onClick={() => setActiveBoonMetric(option.value)}
                                                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${activeBoonMetric === option.value
                                                                ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                                                                : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                                }`}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                    <div className="text-center">#</div>
                                                    <div>Player</div>
                                                    <div className="text-right">
                                                        {activeBoonMetric === 'total'
                                                            ? 'Total'
                                                            : activeBoonMetric === 'average'
                                                                ? 'Gen/Sec'
                                                                : 'Uptime'}
                                                    </div>
                                                    <div className="text-right">Fight Time</div>
                                                </div>
                                                <div className={`${expandedSection === 'boon-output' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-64 overflow-y-auto'}`}>
                                                    {[...activeBoonTable.rows]
                                                        .sort((a: any, b: any) => (
                                                            getBoonMetricValue(b, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric)
                                                            - getBoonMetricValue(a, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric)
                                                        ))
                                                        .map((row: any, idx: number) => (
                                                            <div key={`${activeBoonTable.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                                <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                                    <span className="truncate">{row.account}</span>
                                                                </div>
                                                                <div className="text-right font-mono text-gray-300">
                                                                    {formatBoonMetricDisplay(row, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric)}
                                                                </div>
                                                                <div className="text-right font-mono text-gray-400">
                                                                    {row.activeTimeMs ? `${(row.activeTimeMs / 1000).toFixed(1)}s` : '-'}
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Offensive - Detailed Table */}
                <div
                    id="offense-detailed"
                    className={`bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                        expandedSection === 'offense-detailed'
                            ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                                expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                            }`
                            : ''
                    }`}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                            <Swords className="w-5 h-5 text-rose-300" />
                            Offenses - Detailed
                        </h3>
                        <button
                            type="button"
                            onClick={() => (expandedSection === 'offense-detailed' ? closeExpandedSection() : openExpandedSection('offense-detailed'))}
                            className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                            aria-label={expandedSection === 'offense-detailed' ? 'Close Offense Detailed' : 'Expand Offense Detailed'}
                            title={expandedSection === 'offense-detailed' ? 'Close' : 'Expand'}
                        >
                            {expandedSection === 'offense-detailed' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    </div>
                    {stats.offensePlayers.length === 0 ? (
                        <div className="text-center text-gray-500 italic py-8">No offensive stats available</div>
                    ) : (
                        <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expandedSection === 'offense-detailed' ? 'flex-1 min-h-0 h-full' : ''}`}>
                            <div className={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'offense-detailed' ? 'h-full flex-1' : 'self-start'}`}>
                                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Offensive Tabs</div>
                                <input
                                    value={offenseSearch}
                                    onChange={(e) => setOffenseSearch(e.target.value)}
                                    placeholder="Search..."
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                                />
                                <div className={`${sidebarListClass} ${expandedSection === 'offense-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                                    {(() => {
                                        const filtered = OFFENSE_METRICS.filter((metric) =>
                                            metric.label.toLowerCase().includes(offenseSearch.trim().toLowerCase())
                                        );
                                        if (filtered.length === 0) {
                                            return <div className="text-center text-gray-500 italic py-6 text-xs">No offensive stats match this filter</div>;
                                        }
                                        return filtered.map((metric) => (
                                            <button
                                                key={metric.id}
                                                onClick={() => setActiveOffenseStat(metric.id)}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeOffenseStat === metric.id
                                                    ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                    }`}
                                            >
                                                {metric.label}
                                            </button>
                                        ));
                                    })()}
                                </div>
                            </div>
                            <div className={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'offense-detailed' ? 'flex flex-col min-h-0' : ''}`}>
                                {(() => {
                                    const metric = OFFENSE_METRICS.find((entry) => entry.id === activeOffenseStat) || OFFENSE_METRICS[0];
                                    const totalSeconds = (row: any) => Math.max(1, (row.totalFightMs || 0) / 1000);
                                    const totalValue = (row: any) => {
                                        if (metric.id === 'downContributionPercent') {
                                            const downContribution = row.offenseTotals?.downContribution || 0;
                                            const totalDamage = row.offenseTotals?.damage || 0;
                                            return totalDamage > 0 ? (downContribution / totalDamage) * 100 : 0;
                                        }
                                        if (metric.isRate) {
                                            const denom = row.offenseRateWeights?.[metric.id] || 0;
                                            const numer = row.offenseTotals?.[metric.id] || 0;
                                            return denom > 0 ? (numer / denom) * 100 : 0;
                                        }
                                        return row.offenseTotals?.[metric.id] || 0;
                                    };
                                    const formatValue = (val: number) => {
                                        const formatted = formatWithCommas(val, 2);
                                        return metric.isPercent ? `${formatted}%` : formatted;
                                    };
                                    const rows = [...stats.offensePlayers]
                                        .map((row: any) => ({
                                            ...row,
                                            total: totalValue(row),
                                            per1s: metric.isPercent || metric.isRate ? totalValue(row) : totalValue(row) / totalSeconds(row),
                                            per60s: metric.isPercent || metric.isRate ? totalValue(row) : (totalValue(row) * 60) / totalSeconds(row)
                                        }))
                                        .sort((a, b) => {
                                            const aValue = offenseViewMode === 'total' ? a.total : offenseViewMode === 'per1s' ? a.per1s : a.per60s;
                                            const bValue = offenseViewMode === 'total' ? b.total : offenseViewMode === 'per1s' ? b.per1s : b.per60s;
                                            return bValue - aValue || a.account.localeCompare(b.account);
                                        });

                                    return (
                                        <>
                                            <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                                <div className="text-sm font-semibold text-gray-200">{metric.label}</div>
                                                <div className="text-xs uppercase tracking-widest text-gray-500">Offensive</div>
                                            </div>
                                            <div className="flex items-center justify-end gap-2 px-4 py-2 bg-white/5">
                                                {([
                                                    { value: 'total', label: 'Total' },
                                                    { value: 'per1s', label: 'Stat/1s' },
                                                    { value: 'per60s', label: 'Stat/60s' }
                                                ] as const).map((option) => (
                                                    <button
                                                        key={option.value}
                                                        onClick={() => setOffenseViewMode(option.value)}
                                                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${offenseViewMode === option.value
                                                            ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                                                            : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                            }`}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <div className="text-right">
                                                    {offenseViewMode === 'total' ? 'Total' : offenseViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
                                                </div>
                                                <div className="text-right">Fight Time</div>
                                            </div>
                                            <div className={`${expandedSection === 'offense-detailed' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-80 overflow-y-auto'}`}>
                                                {rows.map((row: any, idx: number) => (
                                                    <div key={`${metric.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                        <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                            <span className="truncate">{row.account}</span>
                                                        </div>
                                                        <div className="text-right font-mono text-gray-300">
                                                            {(() => {
                                                                const value = offenseViewMode === 'total'
                                                                    ? row.total
                                                                    : offenseViewMode === 'per1s'
                                                                        ? row.per1s
                                                                        : row.per60s;
                                                                return formatValue(value);
                                                            })()}
                                                        </div>
                                                        <div className="text-right font-mono text-gray-400">
                                                            {row.totalFightMs ? `${(row.totalFightMs / 1000).toFixed(1)}s` : '-'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Defenses - Detailed Table */}
                <div
                    id="defense-detailed"
                    className={`bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                        expandedSection === 'defense-detailed'
                            ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                                expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                            }`
                            : ''
                    }`}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                            <Shield className="w-5 h-5 text-sky-300" />
                            Defenses - Detailed
                        </h3>
                        <button
                            type="button"
                            onClick={() => (expandedSection === 'defense-detailed' ? closeExpandedSection() : openExpandedSection('defense-detailed'))}
                            className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                            aria-label={expandedSection === 'defense-detailed' ? 'Close Defense Detailed' : 'Expand Defense Detailed'}
                            title={expandedSection === 'defense-detailed' ? 'Close' : 'Expand'}
                        >
                            {expandedSection === 'defense-detailed' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    </div>
                    {stats.defensePlayers.length === 0 ? (
                        <div className="text-center text-gray-500 italic py-8">No defensive stats available</div>
                    ) : (
                        <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expandedSection === 'defense-detailed' ? 'flex-1 min-h-0 h-full' : ''}`}>
                            <div className={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'defense-detailed' ? 'h-full flex-1' : 'self-start'}`}>
                                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Defensive Tabs</div>
                                <input
                                    value={defenseSearch}
                                    onChange={(e) => setDefenseSearch(e.target.value)}
                                    placeholder="Search..."
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                                />
                                <div className={`${sidebarListClass} ${expandedSection === 'defense-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                                    {(() => {
                                        const filtered = DEFENSE_METRICS.filter((metric) =>
                                            metric.label.toLowerCase().includes(defenseSearch.trim().toLowerCase())
                                        );
                                        if (filtered.length === 0) {
                                            return <div className="text-center text-gray-500 italic py-6 text-xs">No defensive stats match this filter</div>;
                                        }
                                        return filtered.map((metric) => (
                                            <button
                                                key={metric.id}
                                                onClick={() => setActiveDefenseStat(metric.id)}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeDefenseStat === metric.id
                                                    ? 'bg-sky-500/20 text-sky-200 border-sky-500/40'
                                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                    }`}
                                            >
                                                {metric.label}
                                            </button>
                                        ));
                                    })()}
                                </div>
                            </div>
                            <div className={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'defense-detailed' ? 'flex flex-col min-h-0' : ''}`}>
                                {(() => {
                                    const metric = DEFENSE_METRICS.find((entry) => entry.id === activeDefenseStat) || DEFENSE_METRICS[0];
                                    const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                                    const rows = [...stats.defensePlayers]
                                        .map((row: any) => ({
                                            ...row,
                                            total: row.defenseTotals?.[metric.id] || 0,
                                            per1s: (row.defenseTotals?.[metric.id] || 0) / totalSeconds(row),
                                            per60s: ((row.defenseTotals?.[metric.id] || 0) * 60) / totalSeconds(row)
                                        }))
                                        .sort((a, b) => {
                                            const aValue = defenseViewMode === 'total' ? a.total : defenseViewMode === 'per1s' ? a.per1s : a.per60s;
                                            const bValue = defenseViewMode === 'total' ? b.total : defenseViewMode === 'per1s' ? b.per1s : b.per60s;
                                            return bValue - aValue || a.account.localeCompare(b.account);
                                        });

                                    return (
                                        <>
                                            <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                                <div className="text-sm font-semibold text-gray-200">{metric.label}</div>
                                                <div className="text-xs uppercase tracking-widest text-gray-500">Defensive</div>
                                            </div>
                                            <div className="flex items-center justify-end gap-2 px-4 py-2 bg-white/5">
                                                {([
                                                    { value: 'total', label: 'Total' },
                                                    { value: 'per1s', label: 'Stat/1s' },
                                                    { value: 'per60s', label: 'Stat/60s' }
                                                ] as const).map((option) => (
                                                    <button
                                                        key={option.value}
                                                        onClick={() => setDefenseViewMode(option.value)}
                                                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${defenseViewMode === option.value
                                                            ? 'bg-sky-500/20 text-sky-200 border-sky-500/40'
                                                            : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                            }`}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <div className="text-right">
                                                    {defenseViewMode === 'total' ? 'Total' : defenseViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
                                                </div>
                                                <div className="text-right">Fight Time</div>
                                            </div>
                                            <div className={`${expandedSection === 'defense-detailed' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-80 overflow-y-auto'}`}>
                                                {rows.map((row: any, idx: number) => (
                                                    <div key={`${metric.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                        <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                            <span className="truncate">{row.account}</span>
                                                        </div>
                                                        <div className="text-right font-mono text-gray-300">
                                                            {(() => {
                                                                const value = defenseViewMode === 'total'
                                                                    ? row.total
                                                                    : defenseViewMode === 'per1s'
                                                                        ? row.per1s
                                                                        : row.per60s;
                                                                return formatWithCommas(value, 2);
                                                            })()}
                                                        </div>
                                                        <div className="text-right font-mono text-gray-400">
                                                            {row.activeMs ? `${(row.activeMs / 1000).toFixed(1)}s` : '-'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Support - Detailed Table */}
                <div
                    id="support-detailed"
                    className={`bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                        expandedSection === 'support-detailed'
                            ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                                expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                            }`
                            : ''
                    }`}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                            <HelpingHand className="w-5 h-5 text-emerald-300" />
                            Support - Detailed
                        </h3>
                        <button
                            type="button"
                            onClick={() => (expandedSection === 'support-detailed' ? closeExpandedSection() : openExpandedSection('support-detailed'))}
                            className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                            aria-label={expandedSection === 'support-detailed' ? 'Close Support Detailed' : 'Expand Support Detailed'}
                            title={expandedSection === 'support-detailed' ? 'Close' : 'Expand'}
                        >
                            {expandedSection === 'support-detailed' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    </div>
                    {stats.supportPlayers.length === 0 ? (
                        <div className="text-center text-gray-500 italic py-8">No support stats available</div>
                    ) : (
                        <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expandedSection === 'support-detailed' ? 'flex-1 min-h-0 h-full' : ''}`}>
                            <div className={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'support-detailed' ? 'h-full flex-1' : 'self-start'}`}>
                                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Support Tabs</div>
                                <input
                                    value={supportSearch}
                                    onChange={(e) => setSupportSearch(e.target.value)}
                                    placeholder="Search..."
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                                />
                                <div className={`${sidebarListClass} ${expandedSection === 'support-detailed' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                                    {(() => {
                                        const filtered = SUPPORT_METRICS.filter((metric) =>
                                            metric.label.toLowerCase().includes(supportSearch.trim().toLowerCase())
                                        );
                                        if (filtered.length === 0) {
                                            return <div className="text-center text-gray-500 italic py-6 text-xs">No support stats match this filter</div>;
                                        }
                                        return filtered.map((metric) => (
                                            <button
                                                key={metric.id}
                                                onClick={() => setActiveSupportStat(metric.id)}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeSupportStat === metric.id
                                                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                    }`}
                                            >
                                                {metric.label}
                                            </button>
                                        ));
                                    })()}
                                </div>
                            </div>
                            <div className={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'support-detailed' ? 'flex flex-col min-h-0' : ''}`}>
                                {(() => {
                                    const metric = SUPPORT_METRICS.find((entry) => entry.id === activeSupportStat) || SUPPORT_METRICS[0];
                                    const resolveSupportTotal = (row: any) => {
                                        if (metric.id === 'condiCleanse') {
                                            const squad = row.supportTotals?.condiCleanse || 0;
                                            const self = row.supportTotals?.condiCleanseSelf || 0;
                                            return cleanseScope === 'all' ? squad + self : squad;
                                        }
                                        return row.supportTotals?.[metric.id] || 0;
                                    };
                                    const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                                    const rows = [...stats.supportPlayers]
                                        .map((row: any) => ({
                                            ...row,
                                            total: resolveSupportTotal(row),
                                            per1s: resolveSupportTotal(row) / totalSeconds(row),
                                            per60s: (resolveSupportTotal(row) * 60) / totalSeconds(row)
                                        }))
                                        .sort((a, b) => {
                                            const aValue = supportViewMode === 'total' ? a.total : supportViewMode === 'per1s' ? a.per1s : a.per60s;
                                            const bValue = supportViewMode === 'total' ? b.total : supportViewMode === 'per1s' ? b.per1s : b.per60s;
                                            return bValue - aValue || a.account.localeCompare(b.account);
                                        });

                                    return (
                                        <>
                                            <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                                <div className="text-sm font-semibold text-gray-200">{metric.label}</div>
                                                <div className="text-xs uppercase tracking-widest text-gray-500">Support</div>
                                            </div>
                                            {metric.id === 'condiCleanse' ? (
                                                <div className="flex items-center justify-between gap-2 px-4 py-2 bg-white/5">
                                                    <div className="flex items-center gap-2">
                                                        {([
                                                            { value: 'all', label: 'All' },
                                                            { value: 'squad', label: 'Squad' }
                                                        ] as const).map((option) => (
                                                            <button
                                                                key={option.value}
                                                                onClick={() => setCleanseScope(option.value)}
                                                                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${cleanseScope === option.value
                                                                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                                    : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                                    }`}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {([
                                                            { value: 'total', label: 'Total' },
                                                            { value: 'per1s', label: 'Stat/1s' },
                                                            { value: 'per60s', label: 'Stat/60s' }
                                                        ] as const).map((option) => (
                                                            <button
                                                                key={option.value}
                                                                onClick={() => setSupportViewMode(option.value)}
                                                                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${supportViewMode === option.value
                                                                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                                    : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                                    }`}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-2 px-4 py-2 bg-white/5">
                                                    {([
                                                        { value: 'total', label: 'Total' },
                                                        { value: 'per1s', label: 'Stat/1s' },
                                                        { value: 'per60s', label: 'Stat/60s' }
                                                    ] as const).map((option) => (
                                                        <button
                                                            key={option.value}
                                                            onClick={() => setSupportViewMode(option.value)}
                                                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${supportViewMode === option.value
                                                                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                                : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                                }`}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <div className="text-right">
                                                    {supportViewMode === 'total' ? 'Total' : supportViewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
                                                </div>
                                                <div className="text-right">Fight Time</div>
                                            </div>
                                            <div className={`${expandedSection === 'support-detailed' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-80 overflow-y-auto'}`}>
                                                {rows.map((row: any, idx: number) => (
                                                    <div key={`${metric.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                        <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                            <span className="truncate">{row.account}</span>
                                                        </div>
                                                        <div className="text-right font-mono text-gray-300">
                                                            {(() => {
                                                                const value = supportViewMode === 'total'
                                                                    ? row.total
                                                                    : supportViewMode === 'per1s'
                                                                        ? row.per1s
                                                                        : row.per60s;
                                                                const decimals = metric.isTime ? 1 : 2;
                                                                return formatWithCommas(value, decimals);
                                                            })()}
                                                        </div>
                                                        <div className="text-right font-mono text-gray-400">
                                                            {row.activeMs ? `${(row.activeMs / 1000).toFixed(1)}s` : '-'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Healing Stats Table */}
                <div
                    id="healing-stats"
                    className={`bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                        expandedSection === 'healing-stats'
                            ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                                expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                            }`
                            : ''
                    }`}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-lime-300" />
                            Healing Stats
                        </h3>
                        <button
                            type="button"
                            onClick={() => (expandedSection === 'healing-stats' ? closeExpandedSection() : openExpandedSection('healing-stats'))}
                            className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                            aria-label={expandedSection === 'healing-stats' ? 'Close Healing Stats' : 'Expand Healing Stats'}
                            title={expandedSection === 'healing-stats' ? 'Close' : 'Expand'}
                        >
                            {expandedSection === 'healing-stats' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    </div>
                    {stats.healingPlayers.length === 0 ? (
                        <div className="text-center text-gray-500 italic py-8">No healing stats available</div>
                    ) : (
                        <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expandedSection === 'healing-stats' ? 'flex-1 min-h-0 h-full' : ''}`}>
                            <div className={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'healing-stats' ? 'h-full flex-1' : 'self-start'}`}>
                                <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Healing Tabs</div>
                                <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                                    {HEALING_METRICS.map((metric) => (
                                        <button
                                            key={metric.id}
                                            onClick={() => setActiveHealingMetric(metric.id)}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeHealingMetric === metric.id
                                                ? 'bg-lime-500/20 text-lime-200 border-lime-500/40'
                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                }`}
                                        >
                                            {metric.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'healing-stats' ? 'flex flex-col min-h-0' : ''}`}>
                                {(() => {
                                    const metric = HEALING_METRICS.find((entry) => entry.id === activeHealingMetric) || HEALING_METRICS[0];
                                    const isResUtilityMetric = metric.baseField === 'resUtility';
                                    const totalSeconds = (row: any) => Math.max(1, (row.activeMs || 0) / 1000);
                                    const prefix = isResUtilityMetric
                                        ? ''
                                        : healingCategory === 'total'
                                            ? ''
                                            : healingCategory === 'offSquad'
                                                ? 'offSquad'
                                                : healingCategory;
                                    const fieldName = isResUtilityMetric
                                        ? (activeResUtilitySkill === 'all' ? 'resUtility' : `resUtility_${activeResUtilitySkill}`)
                                        : prefix
                                            ? `${prefix}${metric.baseField[0].toUpperCase()}${metric.baseField.slice(1)}`
                                            : metric.baseField;
                                    const rows = [...stats.healingPlayers]
                                        .filter((row: any) => Object.values(row.healingTotals || {}).some((val: any) => Number(val) > 0))
                                        .map((row: any) => {
                                            const baseValue = Number(row.healingTotals?.[fieldName] ?? 0);
                                            const value = metric.perSecond ? baseValue / totalSeconds(row) : baseValue;
                                            return {
                                                ...row,
                                                value
                                            };
                                        })
                                        .sort((a, b) => b.value - a.value || a.account.localeCompare(b.account));

                                    return (
                                        <>
                                            <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                                <div className="text-sm font-semibold text-gray-200">{metric.label}</div>
                                                <div className="text-xs uppercase tracking-widest text-gray-500">Healing</div>
                                            </div>
                                            {isResUtilityMetric && (
                                                <div className="flex items-center justify-end gap-2 px-4 py-2 bg-white/5 flex-wrap">
                                                    <button
                                                        onClick={() => setActiveResUtilitySkill('all')}
                                                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${activeResUtilitySkill === 'all'
                                                            ? 'bg-lime-500/20 text-lime-200 border-lime-500/40'
                                                            : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                            }`}
                                                    >
                                                        All
                                                    </button>
                                                    {(skillUsageData.resUtilitySkills || []).map((skill) => (
                                                        <button
                                                            key={skill.id}
                                                            onClick={() => setActiveResUtilitySkill(skill.id)}
                                                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${activeResUtilitySkill === skill.id
                                                                ? 'bg-lime-500/20 text-lime-200 border-lime-500/40'
                                                                : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                                }`}
                                                        >
                                                            {skill.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {!isResUtilityMetric && (
                                                <div className="flex items-center justify-end gap-2 px-4 py-2 bg-white/5">
                                                    {([
                                                        { value: 'total', label: 'Total' },
                                                        { value: 'squad', label: 'Squad' },
                                                        { value: 'group', label: 'Group' },
                                                        { value: 'self', label: 'Self' },
                                                        { value: 'offSquad', label: 'OffSquad' }
                                                    ] as const).map((option) => (
                                                        <button
                                                            key={option.value}
                                                            onClick={() => setHealingCategory(option.value)}
                                                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${healingCategory === option.value
                                                                ? 'bg-lime-500/20 text-lime-200 border-lime-500/40'
                                                                : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                                }`}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <div className="text-right">{metric.label}</div>
                                                <div className="text-right">Fight Time</div>
                                            </div>
                                            <div className={`${expandedSection === 'healing-stats' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-80 overflow-y-auto'}`}>
                                                {rows.length === 0 ? (
                                                    <div className="px-4 py-6 text-sm text-gray-500 italic">No healing data for this view</div>
                                                ) : (
                                                    rows.map((row: any, idx: number) => (
                                                        <div key={`${metric.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                            <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                                <span className="truncate">{row.account}</span>
                                                            </div>
                                                            <div className="text-right font-mono text-gray-300">
                                                                {formatWithCommas(row.value, metric.decimals)}
                                                            </div>
                                                            <div className="text-right font-mono text-gray-400">
                                                                {row.activeMs ? `${(row.activeMs / 1000).toFixed(1)}s` : '-'}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {/* Special Buff Output Tables */}
                <div
                    id="special-buffs"
                    className={`bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                        expandedSection === 'special-buffs'
                            ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                                expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                            }`
                            : ''
                    }`}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-purple-300" />
                            Special Buffs
                        </h3>
                        <button
                            type="button"
                            onClick={() => (expandedSection === 'special-buffs' ? closeExpandedSection() : openExpandedSection('special-buffs'))}
                            className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                            aria-label={expandedSection === 'special-buffs' ? 'Close Special Buffs' : 'Expand Special Buffs'}
                            title={expandedSection === 'special-buffs' ? 'Close' : 'Expand'}
                        >
                            {expandedSection === 'special-buffs' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    </div>
                    {stats.specialTables.length === 0 ? (
                        <div className="text-center text-gray-500 italic py-8">No special buff data available</div>
                    ) : (
                        <>
                            <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expandedSection === 'special-buffs' ? 'flex-1 min-h-0 h-full' : ''}`}>
                                <div className={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'special-buffs' ? 'h-full flex-1' : 'self-start'}`}>
                                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Special Buffs</div>
                                    <input
                                        value={specialSearch}
                                        onChange={(e) => setSpecialSearch(e.target.value)}
                                        placeholder="Search..."
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                                    />
                                    <div className={`${sidebarListClass} ${expandedSection === 'special-buffs' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                                        {filteredSpecialTables.length === 0 ? (
                                            <div className="text-center text-gray-500 italic py-6 text-xs">No special buffs match this filter</div>
                                        ) : (
                                            filteredSpecialTables.map((buff: any) => (
                                                <button
                                                    key={buff.id}
                                                    onClick={() => setActiveSpecialTab(buff.id)}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeSpecialTab === buff.id
                                                        ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                        }`}
                                                >
                                                    {buff.name}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            <div className={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'special-buffs' ? 'flex flex-col min-h-0' : ''}`}>
                                    {!activeSpecialTable ? (
                                        <div className="px-4 py-10 text-center text-gray-500 italic text-sm">Select a special buff to view details</div>
                                    ) : (
                                        <div>
                                            <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                                <div className="text-sm font-semibold text-gray-200">{activeSpecialTable.name}</div>
                                                <div className="text-xs uppercase tracking-widest text-gray-500">Totals</div>
                                            </div>
                                            <div className="grid grid-cols-[0.4fr_1.5fr_0.8fr_0.8fr_0.8fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                <div className="text-center">#</div>
                                                <div>Player</div>
                                                <div className="text-right">Total</div>
                                                <div className="text-right">Per Sec</div>
                                                <div className="text-right">Fight Time</div>
                                            </div>
                                            <div className={`${expandedSection === 'special-buffs' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-64 overflow-y-auto'}`}>
                                                {activeSpecialTable.rows.map((row: any, idx: number) => (
                                                    <div key={`${activeSpecialTable.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_0.8fr_0.8fr_0.8fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                        <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                            <span className="truncate">{row.account}</span>
                                                        </div>
                                                        <div className="text-right font-mono text-gray-300">
                                                            {Math.round(row.total).toLocaleString()}
                                                        </div>
                                                        <div className="text-right font-mono text-gray-300">
                                                            {formatWithCommas(row.perSecond, 1)}
                                                        </div>
                                                        <div className="text-right font-mono text-gray-400">
                                                            {row.duration ? `${row.duration.toFixed(1)}s` : '-'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Skill Usage Tracker */}
                <div
                    id="skill-usage"
                    className={`bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                        expandedSection === 'skill-usage'
                            ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane pb-10 ${
                                expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                            }`
                            : ''
                    }`}
                >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
                        <div>
                            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                                <Zap className="w-5 h-5 text-cyan-400" />
                                Skill Usage Tracker
                            </h3>
                            <p className="text-xs text-gray-400">
                                Compare how often squad members cast a skill and drill into the timeline breakdown.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
                                {skillUsageData.logRecords.length} {skillUsageData.logRecords.length === 1 ? 'log' : 'logs'}
                            </div>
                            <button
                                type="button"
                                onClick={() => (expandedSection === 'skill-usage' ? closeExpandedSection() : openExpandedSection('skill-usage'))}
                                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                                aria-label={expandedSection === 'skill-usage' ? 'Close Skill Usage' : 'Expand Skill Usage'}
                                title={expandedSection === 'skill-usage' ? 'Close' : 'Expand'}
                            >
                                {expandedSection === 'skill-usage' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    {selectedPlayers.length > 0 && (
                        <div className="flex flex-wrap gap-2 pb-2">
                            {selectedPlayers.map((playerKey) => {
                                const player = playerMapByKey.get(playerKey);
                                if (!player) return null;
                                return (
                                    <span key={player.key} className="flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
                                        <span className="truncate max-w-[140px]">{player.displayName}</span>
                                        <button type="button" onClick={() => removeSelectedPlayer(player.key)} className="rounded-full p-1 text-cyan-200 hover:bg-white/20">
                                            <XCircle className="w-3 h-3" />
                                        </button>
                                    </span>
                                );
                            })}
                        </div>
                    )}
                    <div className="grid gap-4 lg:grid-cols-2 items-stretch">
                        <div className="space-y-2 flex flex-col h-[320px]">
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                                Squad Players
                            </div>
                            <input
                                type="search"
                                value={skillUsagePlayerFilter}
                                onChange={(event) => setSkillUsagePlayerFilter(event.target.value)}
                                placeholder="Search player or account"
                                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 focus:border-cyan-400 focus:outline-none"
                            />
                            <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/20">
                                {filteredPlayerOptions.length === 0 ? (
                                    <div className="px-3 py-4 text-xs text-gray-500 italic">
                                        No squad players match the filter
                                    </div>
                                ) : (
                                    filteredPlayerOptions.map((player) => {
                                        const isSelected = selectedPlayers.includes(player.key);
                                        return (
                                            <button
                                                type="button"
                                                key={player.key}
                                                onClick={() => togglePlayerSelection(player.key)}
                                                className={`w-full border-b border-white/5 px-3 py-2 text-left transition-colors last:border-b-0 ${isSelected ? 'border-cyan-400 bg-cyan-500/10 text-white' : 'border-transparent hover:border-white/10 hover:bg-white/5'}`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="text-sm font-semibold truncate text-white">{player.displayName}</div>
                                                        <div className="text-[11px] text-gray-400">
                                                            {player.account} · {player.profession} · {player.logs} {player.logs === 1 ? 'log' : 'logs'}
                                                        </div>
                                                    </div>
                                                    {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-300" />}
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        <div className="space-y-2 flex flex-col h-[320px]">
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                                    Skill Totals
                                </div>
                                <div className="text-[11px] text-gray-500">
                                    {selectedPlayers.length > 0 ? `${selectedPlayers.length} player${selectedPlayers.length === 1 ? '' : 's'}` : 'Select players'}
                                </div>
                            </div>
                            <input
                                type="search"
                                value={skillUsageSkillFilter}
                                onChange={(event) => setSkillUsageSkillFilter(event.target.value)}
                                placeholder="Filter skill names"
                                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 focus:border-cyan-400 focus:outline-none"
                            />
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-0.5 flex-1 min-h-0">
                                {selectedPlayers.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-xs text-gray-500">
                                        Select squad players to see the skills they cast.
                                    </div>
                                ) : skillBarData.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-xs text-gray-500">
                                        No skill casts found for the selected players.
                                    </div>
                                ) : (
                                    (() => {
                                        const maxSkillTotal = skillBarData.reduce((max, entry) => Math.max(max, entry.total), 0) || 1;
                                        return (
                                            <div className="space-y-0.5 h-full overflow-y-auto pr-0.5">
                                                {skillBarData.map((entry, index) => {
                                                    const widthPct = Math.min(100, (entry.total / maxSkillTotal) * 100);
                                                    const isSelected = selectedSkillId === entry.skillId;
                                                    return (
                                                        <button
                                                            key={entry.skillId}
                                                            type="button"
                                                            onClick={() => setSelectedSkillId(entry.skillId)}
                                                            className={`w-full space-y-1 rounded-lg border px-2 py-1.5 text-left transition-colors ${isSelected ? 'border-white/60 bg-white/10' : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'}`}
                                                        >
                                                            <div className="flex items-center justify-between text-sm text-white">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{`#${index + 1}`}</span>
                                                                    <span className="font-semibold truncate">{entry.name}</span>
                                                                </div>
                                                                <span className="text-cyan-200 font-mono text-xs">{entry.total.toLocaleString()}</span>
                                                            </div>
                                                            <div className="h-1 w-full rounded-full bg-white/10">
                                                                <div
                                                                    className="h-full rounded-full transition-all"
                                                                    style={{ width: `${widthPct}%`, backgroundColor: entry.color }}
                                                                />
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {skillUsageReady ? (
                            <div className="space-y-4 rounded-2xl bg-black/50 p-4 mt-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold text-gray-200">
                                        {selectedSkillName || 'Selected Skill Usage'}
                                    </div>
                                    <div className="text-[11px] text-gray-400">(casts per log)</div>
                                </div>
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={skillChartData}>
                                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="index"
                                            type="number"
                                            tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                            interval={0}
                                            tickFormatter={(value: number) => {
                                                const entry = skillChartData[value];
                                                const label = String(entry?.shortLabel ?? value);
                                                return label.length > 20 ? `${label.slice(0, 20)}…` : label;
                                            }}
                                        />
                                        <YAxis
                                            tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                            domain={[0, Math.max(1, skillChartMaxY)]}
                                            allowDecimals={false}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload || payload.length === 0) return null;
                                                const sorted = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
                                                const first = sorted[0];
                                                const header = (first?.payload as any)?.fullLabel || label;
                                                return (
                                                    <div className="rounded-lg bg-slate-900/95 border border-white/10 px-3 py-2 shadow-xl">
                                                        <div className="text-sm text-white mb-1">{header}</div>
                                                        <div className="space-y-1">
                                                            {sorted.map((item) => {
                                                                const name = String(item.name || '');
                                                                const player = playerMapByKey.get(name);
                                                                const labelText = player?.displayName || name || 'Player';
                                                                const value = Number(item.value || 0).toLocaleString();
                                                                const color = item.color || '#38bdf8';
                                                                return (
                                                                    <div key={`${labelText}-${value}`} className="flex items-center justify-between text-sm">
                                                                        <span className="truncate" style={{ color }}>{labelText}</span>
                                                                        <span className="text-gray-200 font-mono">{value}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            }}
                                        />
                                        {selectedPlayers.map((playerKey) => {
                                            const isSelected = hoveredSkillPlayer.includes(playerKey);
                                            const hasSelection = hoveredSkillPlayer.length > 0;
                                            const color = getLineStrokeColor(playerKey, isSelected, hasSelection);
                                            const dash = getLineDashForPlayer(playerKey);
                                            const isDimmed = hoveredSkillPlayer.length > 0 && !isSelected;
                                            return (
                                            <Line
                                                key={playerKey}
                                                dataKey={playerKey}
                                                stroke={color}
                                                strokeWidth={isSelected ? 4 : 3}
                                                strokeDasharray={dash}
                                                opacity={isDimmed ? 0.6 : 1}
                                                dot={false}
                                                isAnimationActive={false}
                                            />
                                            );
                                        })}
                                    </LineChart>
                                </ResponsiveContainer>
                                {selectedPlayers.length > 0 && (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {[...selectedPlayers]
                                            .sort((a, b) => (playerTotalsForSkill[b] || 0) - (playerTotalsForSkill[a] || 0))
                                            .map((playerKey) => {
                                                const player = playerMapByKey.get(playerKey);
                                                const total = playerTotalsForSkill[playerKey] ?? 0;
                                            const isActive = hoveredSkillPlayer.includes(playerKey);
                                            const hasSelection = hoveredSkillPlayer.length > 0;
                                            const swatchColor = getLineStrokeColor(playerKey, isActive, hasSelection);
                                                return (
                                                    <button
                                                        key={playerKey}
                                                        type="button"
                                                        onClick={() => {
                                                            setHoveredSkillPlayer((prev) => {
                                                                if (prev.includes(playerKey)) {
                                                                    return prev.filter((key) => key !== playerKey);
                                                                }
                                                                return [...prev, playerKey];
                                                            });
                                                        }}
                                                        className={`rounded-2xl border bg-white/5 p-3 flex items-center justify-between text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${
                                                            isActive ? 'border-white/40 bg-white/10' : 'border-white/10 hover:border-white/30 hover:bg-white/10'
                                                        }`}
                                                        aria-pressed={isActive}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <svg className="h-2 w-6" viewBox="0 0 24 4" aria-hidden="true">
                                                                <line
                                                                    x1="0"
                                                                    y1="2"
                                                                    x2="24"
                                                                    y2="2"
                                                                    stroke={swatchColor}
                                                                    strokeWidth="2"
                                                                    strokeDasharray={getLineDashForPlayer(playerKey)}
                                                                    strokeLinecap="round"
                                                                />
                                                            </svg>
                                                            {renderProfessionIcon(player?.profession, player?.professionList, 'w-4 h-4')}
                                                            <div className="min-w-0">
                                                                <div className="text-[10px] uppercase tracking-[0.4em] text-gray-400">Player</div>
                                                                <div className="font-semibold text-white truncate">{player?.displayName || playerKey}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-3xl font-black text-white font-mono">{total.toLocaleString()}</div>
                                                    </button>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-white/20 px-4 py-6 mt-2 text-center text-xs text-gray-400">
                                {skillUsageAvailable
                                    ? 'Pick one skill and up to two players to visualize their usage over time.'
                                    : 'Upload or highlight logs with rotation data to enable the skill usage tracker.'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
