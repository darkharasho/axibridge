import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';



import { formatTopStatValue, formatWithCommas } from './stats/utils/dashboardUtils';
import { OFFENSE_METRICS, DEFENSE_METRICS, DAMAGE_MITIGATION_METRICS, SUPPORT_METRICS, HEALING_METRICS } from './stats/statsMetrics';
import { useStatsNavigation } from './stats/hooks/useStatsNavigation';
import { useStatsUploads } from './stats/hooks/useStatsUploads';
import { useStatsScreenshot } from './stats/hooks/useStatsScreenshot';
import { useStatsAggregationWorker } from './stats/hooks/useStatsAggregationWorker';
import { useApmStats } from './stats/hooks/useApmStats';
import { useSkillCharts } from './stats/hooks/useSkillCharts';
import { getProfessionColor, getProfessionIconPath } from '../shared/professionUtils';
import { BoonCategory, BoonMetric, formatBoonMetricDisplay, getBoonMetricValue } from '../shared/boonGeneration';
import { DEFAULT_MVP_WEIGHTS, DEFAULT_STATS_VIEW_SETTINGS, DEFAULT_WEB_UPLOAD_STATE, DisruptionMethod, IMvpWeights, IStatsViewSettings, IWebUploadState } from './global.d';
import type { PlayerSkillBreakdown, PlayerSkillDamageEntry, SkillUsageSummary } from './stats/statsTypes';
import { getDefaultConditionIcon, normalizeConditionLabel } from '../shared/conditionsMetrics';


import { SkillUsageSection } from './stats/sections/SkillUsageSection';
import { ApmSection } from './stats/sections/ApmSection';
import { PlayerBreakdownSection } from './stats/sections/PlayerBreakdownSection';
import { OffenseSection } from './stats/sections/OffenseSection';
import { ConditionsSection } from './stats/sections/ConditionsSection';
import { BoonOutputSection } from './stats/sections/BoonOutputSection';
import { DefenseSection } from './stats/sections/DefenseSection';
import { DamageMitigationSection } from './stats/sections/DamageMitigationSection';
import { SupportSection } from './stats/sections/SupportSection';
import { HealingSection } from './stats/sections/HealingSection';
import { SpecialBuffsSection } from './stats/sections/SpecialBuffsSection';
import { SigilRelicUptimeSection } from './stats/sections/SigilRelicUptimeSection';
import { FightDiffModeSection } from './stats/sections/FightDiffModeSection';
import { OverviewSection } from './stats/sections/OverviewSection';
import { FightBreakdownSection } from './stats/sections/FightBreakdownSection';
import { TopPlayersSection } from './stats/sections/TopPlayersSection';
import { TopSkillsSection } from './stats/sections/TopSkillsSection';
import { SquadCompositionSection } from './stats/sections/SquadCompositionSection';
import { TimelineSection } from './stats/sections/TimelineSection';
import { MapDistributionSection } from './stats/sections/MapDistributionSection';
import { SpikeDamageSection } from './stats/sections/SpikeDamageSection';
import { AttendanceSection } from './stats/sections/AttendanceSection';
import { SquadCompByFightSection } from './stats/sections/SquadCompByFightSection';
import { FightCompSection } from './stats/sections/FightCompSection';
import { StatsHeader } from './stats/ui/StatsHeader';
import { WebUploadBanner } from './stats/ui/WebUploadBanner';
import { DevMockBanner } from './stats/ui/DevMockBanner';
import { prefetchIconUrls, renderProfessionIcon as renderProfessionIconShared } from './stats/ui/StatsViewShared';

interface StatsViewProps {
    logs: ILogData[];
    onBack: () => void;
    mvpWeights?: IMvpWeights;
    statsViewSettings?: IStatsViewSettings;
    onStatsViewSettingsChange?: (settings: IStatsViewSettings) => void;
    webUploadState?: IWebUploadState;
    onWebUpload?: (payload: { meta: any; stats: any }) => Promise<void> | void;
    disruptionMethod?: DisruptionMethod;
    precomputedStats?: any;
    embedded?: boolean;
    sectionVisibility?: (id: string) => boolean;
    dashboardTitle?: string;
    uiTheme?: 'classic' | 'modern' | 'crt' | 'matte' | 'kinetic';
    canShareDiscord?: boolean;
    aggregationResult?: {
        stats: any;
        skillUsageData: SkillUsageSummary;
    };
}

const sidebarListClass = 'space-y-1 pr-1 max-h-72 overflow-y-auto';
const NON_DAMAGING_CONDITIONS = new Set(['Vulnerability', 'Weakness', 'Blind', 'Chill', 'Cripple', 'Slow', 'Taunt', 'Fear', 'Immobilize']);
const ORDERED_SECTION_IDS = [
    'overview',
    'fight-breakdown',
    'top-players',
    'top-skills-outgoing',
    'squad-composition',
    'attendance-ledger',
    'squad-comp-fight',
    'fight-comp',
    'timeline',
    'map-distribution',
    'boon-output',
    'offense-detailed',
    'spike-damage',
    'conditions-outgoing',
    'defense-detailed',
    'incoming-strike-damage',
    'support-detailed',
    'healing-stats',
    'fight-diff-mode',
    'special-buffs',
    'sigil-relic-uptime',
    'skill-usage',
    'apm-stats'
] as const;

export function StatsView({ logs, onBack, mvpWeights, statsViewSettings, onStatsViewSettingsChange, webUploadState, onWebUpload, disruptionMethod, precomputedStats, embedded = false, sectionVisibility, dashboardTitle, uiTheme, canShareDiscord = true, aggregationResult: externalAggregationResult }: StatsViewProps) {
    const activeMvpWeights = mvpWeights || DEFAULT_MVP_WEIGHTS;
    const activeStatsViewSettings = statsViewSettings || DEFAULT_STATS_VIEW_SETTINGS;
    const activeWebUploadState = webUploadState || DEFAULT_WEB_UPLOAD_STATE;
    const showTopStats = activeStatsViewSettings.showTopStats;
    const showMvp = activeStatsViewSettings.showMvp;
    const roundCountStats = activeStatsViewSettings.roundCountStats;
    const topStatsMode = activeStatsViewSettings.topStatsMode || 'total';
    const [localTopSkillsMetric, setLocalTopSkillsMetric] = useState<IStatsViewSettings['topSkillsMetric']>(
        activeStatsViewSettings.topSkillsMetric || 'damage'
    );
    const topSkillsMetric = (onStatsViewSettingsChange ? activeStatsViewSettings.topSkillsMetric : localTopSkillsMetric) || 'damage';
    const uploadingWeb = activeWebUploadState.uploading;
    const webUploadMessage = activeWebUploadState.message;
    const webUploadUrl = activeWebUploadState.url;
    const webUploadBuildStatus = activeWebUploadState.buildStatus;
    const devMockAvailable = !embedded && import.meta.env.DEV && !!window.electronAPI?.mockWebReport;

    // --- Hook Integration ---
    const useExternalAggregation = !!externalAggregationResult;
    const { result: internalAggregationResult } = useStatsAggregationWorker({
        logs: useExternalAggregation ? [] : logs,
        precomputedStats: useExternalAggregation ? undefined : precomputedStats,
        mvpWeights,
        statsViewSettings,
        disruptionMethod
    });
    const aggregationResult = externalAggregationResult || internalAggregationResult;
    const { stats, skillUsageData: computedSkillUsageData } = aggregationResult;

    const safeStats = useMemo(() => {
        const source = stats && typeof stats === 'object' ? stats : {};
        const asArray = (value: any) => (Array.isArray(value) ? value : []);
        const asObject = (value: any) => (value && typeof value === 'object' ? value : {});
        const withFallbackObject = (value: any, fallback: any) => (value && typeof value === 'object' ? value : fallback);
        const emptyTopStat = { value: 0, player: '-', profession: 'Unknown', professionList: [], count: 0 };
        const emptyMvp = { account: '-', profession: 'Unknown', professionList: [], reason: '', topStats: [], score: 0 };
        const normalized = {
            ...source,
            total: Number((source as any).total || 0),
            timelineData: asArray((source as any).timelineData),
            mapData: asArray((source as any).mapData),
            fightBreakdown: asArray((source as any).fightBreakdown),
            topSkills: asArray((source as any).topSkills),
            topIncomingSkills: asArray((source as any).topIncomingSkills),
            leaderboards: asObject((source as any).leaderboards),
            topStatsPerSecond: asObject((source as any).topStatsPerSecond),
            topStatsLeaderboardsPerSecond: asObject((source as any).topStatsLeaderboardsPerSecond),
            maxDownContrib: withFallbackObject((source as any).maxDownContrib, emptyTopStat),
            maxBarrier: withFallbackObject((source as any).maxBarrier, emptyTopStat),
            maxHealing: withFallbackObject((source as any).maxHealing, emptyTopStat),
            maxDodges: withFallbackObject((source as any).maxDodges, emptyTopStat),
            maxStrips: withFallbackObject((source as any).maxStrips, emptyTopStat),
            maxCleanses: withFallbackObject((source as any).maxCleanses, emptyTopStat),
            maxCC: withFallbackObject((source as any).maxCC, emptyTopStat),
            maxStab: withFallbackObject((source as any).maxStab, emptyTopStat),
            closestToTag: withFallbackObject((source as any).closestToTag, emptyTopStat),
            mvp: { ...emptyMvp, ...asObject((source as any).mvp), topStats: asArray((source as any)?.mvp?.topStats) },
            silver: withFallbackObject((source as any).silver, emptyMvp),
            bronze: withFallbackObject((source as any).bronze, emptyMvp),
            avgMvpScore: Number((source as any).avgMvpScore || 0),
            offensePlayers: asArray((source as any).offensePlayers),
            defensePlayers: asArray((source as any).defensePlayers),
            damageMitigationPlayers: asArray((source as any).damageMitigationPlayers),
            damageMitigationMinions: asArray((source as any).damageMitigationMinions),
            supportPlayers: asArray((source as any).supportPlayers),
            healingPlayers: asArray((source as any).healingPlayers),
            boonTables: asArray((source as any).boonTables),
            specialTables: asArray((source as any).specialTables),
            outgoingConditionSummary: asArray((source as any).outgoingConditionSummary),
            outgoingConditionPlayers: asArray((source as any).outgoingConditionPlayers),
            incomingConditionSummary: asArray((source as any).incomingConditionSummary),
            incomingConditionPlayers: asArray((source as any).incomingConditionPlayers),
            squadClassData: asArray((source as any).squadClassData),
            enemyClassData: asArray((source as any).enemyClassData),
            attendanceData: asArray((source as any).attendanceData),
            squadCompByFight: asArray((source as any).squadCompByFight),
            fightDiffMode: asArray((source as any).fightDiffMode),
            playerSkillBreakdowns: asArray((source as any).playerSkillBreakdowns)
        };

        const downContribRows = asArray((normalized as any).leaderboards?.downContrib)
            .map((row: any) => ({
                ...row,
                value: Number(row?.value ?? 0)
            }))
            .filter((row: any) => Number.isFinite(row.value))
            .sort((a: any, b: any) => (b.value - a.value) || String(a?.account || '').localeCompare(String(b?.account || '')));
        const topDownContrib = downContribRows[0];
        if (topDownContrib) {
            (normalized as any).maxDownContrib = {
                ...((normalized as any).maxDownContrib || {}),
                value: Number(topDownContrib.value || 0),
                player: String(topDownContrib.account || (normalized as any).maxDownContrib?.player || '-'),
                count: Number(topDownContrib.count || (normalized as any).maxDownContrib?.count || 0),
                profession: String(topDownContrib.profession || (normalized as any).maxDownContrib?.profession || 'Unknown'),
                professionList: Array.isArray(topDownContrib.professionList)
                    ? topDownContrib.professionList
                    : ((normalized as any).maxDownContrib?.professionList || [])
            };
        }

        return normalized;
    }, [stats]);

    useEffect(() => {
        if (!window?.electronAPI?.fetchImageAsDataUrl) return;
        const urls = new Set<string>();
        const collect = (value: any) => {
            if (!value) return;
            if (typeof value === 'string') {
                if (/^https?:\/\//i.test(value)) urls.add(value);
                return;
            }
            if (Array.isArray(value)) {
                value.forEach(collect);
                return;
            }
            if (typeof value === 'object') {
                Object.entries(value).forEach(([key, val]) => {
                    if ((key === 'icon' || key === 'iconUrl') && typeof val === 'string') {
                        if (/^https?:\/\//i.test(val)) urls.add(val);
                        return;
                    }
                    collect(val);
                });
            }
        };
        collect(safeStats);
        if (urls.size > 0) {
            prefetchIconUrls(Array.from(urls));
        }
    }, [safeStats]);

    const skillUsageData = useMemo(() => {
        const source = (precomputedStats?.skillUsageData ?? computedSkillUsageData) as Partial<SkillUsageSummary> | undefined;
        return {
            logRecords: Array.isArray(source?.logRecords) ? source.logRecords : [],
            players: Array.isArray(source?.players) ? source.players : [],
            skillOptions: Array.isArray(source?.skillOptions) ? source.skillOptions : [],
            resUtilitySkills: Array.isArray(source?.resUtilitySkills) ? source.resUtilitySkills : []
        } as SkillUsageSummary;
    }, [computedSkillUsageData, precomputedStats?.skillUsageData]);

    // console logging removed to avoid blocking view transitions

    const skillUsageAvailable = skillUsageData.players.length > 0;

    useEffect(() => {
        if (onStatsViewSettingsChange) return;
        setLocalTopSkillsMetric(activeStatsViewSettings.topSkillsMetric || 'damage');
    }, [activeStatsViewSettings.topSkillsMetric, onStatsViewSettingsChange]);

    const updateTopSkillsMetric = (metric: IStatsViewSettings['topSkillsMetric']) => {
        if (onStatsViewSettingsChange) {
            onStatsViewSettingsChange({ ...activeStatsViewSettings, topSkillsMetric: metric });
            return;
        }
        setLocalTopSkillsMetric(metric);
    };

    const {
        scrollContainerRef,
    } = useStatsNavigation(embedded);

    const {
        devMockUploadState,
        webCopyStatus,
        setWebCopyStatus,
        handleWebUpload,
        handleDevMockUpload
    } = useStatsUploads({
        logs,
        stats: safeStats,
        skillUsageData,
        activeStatsViewSettings: statsViewSettings || DEFAULT_STATS_VIEW_SETTINGS,
        uiTheme: uiTheme || 'classic',
        embedded,
        onWebUpload
    });

    const {
        sharing,
        handleShare
    } = useStatsScreenshot(embedded);
    const mvpStatWeightKeys: Record<string, keyof IMvpWeights> = {
        'Down Contribution': 'downContribution',
        'Healing': 'healing',
        'Cleanses': 'cleanses',
        'Strips': 'strips',
        'Stability': 'stability',
        'CC': 'cc',
        'Revives': 'revives',
        'Distance to Tag': 'distanceToTag',
        'Participation': 'participation',
        'Dodging': 'dodging',
        'DPS': 'dps',
        'Damage': 'damage'
    };
    const isMvpStatEnabled = (name: string) => {
        const key = mvpStatWeightKeys[name];
        if (!key) return true;
        return activeMvpWeights[key] > 0;
    };

    const [expandedLeader, setExpandedLeader] = useState<string | null>(null);
    const [activeBoonTab, setActiveBoonTab] = useState<string | null>(null);
    const [activeBoonCategory, setActiveBoonCategory] = useState<BoonCategory>('totalBuffs');
    const [activeBoonMetric, setActiveBoonMetric] = useState<BoonMetric>('total');
    const [boonSearch, setBoonSearch] = useState('');
    const [activeSpecialTab, setActiveSpecialTab] = useState<string | null>(null);
    const [specialSearch, setSpecialSearch] = useState('');
    const [activeSigilRelicTab, setActiveSigilRelicTab] = useState<string | null>(null);
    const [sigilRelicSearch, setSigilRelicSearch] = useState('');
    const [offenseSearch, setOffenseSearch] = useState('');
    const [defenseSearch, setDefenseSearch] = useState('');
    const [damageMitigationSearch, setDamageMitigationSearch] = useState('');
    const [conditionSearch, setConditionSearch] = useState('');
    const [spikePlayerFilter, setSpikePlayerFilter] = useState('');
    const [incomingStrikePlayerFilter, setIncomingStrikePlayerFilter] = useState('');
    const [conditionDirection, setConditionDirection] = useState<'outgoing' | 'incoming'>('outgoing');
    const [supportSearch, setSupportSearch] = useState('');
    const [activeOffenseStat, setActiveOffenseStat] = useState<string>('damage');
    const [activeDefenseStat, setActiveDefenseStat] = useState<string>('damageTaken');
    const [activeDamageMitigationStat, setActiveDamageMitigationStat] = useState<string>('totalMitigation');
    const [activeConditionName, setActiveConditionName] = useState<string>('all');
    const [conditionSort, setConditionSort] = useState<{ key: 'applications' | 'damage'; dir: 'asc' | 'desc' }>({
        key: 'damage',
        dir: 'desc'
    });
    const isNonDamagingCondition = activeConditionName !== 'all' && NON_DAMAGING_CONDITIONS.has(activeConditionName);
    const showConditionDamage = !isNonDamagingCondition;
    const conditionGridClass = showConditionDamage
        ? 'grid-cols-[0.4fr_1.6fr_1fr_1fr]'
        : 'grid-cols-[0.4fr_1.6fr_1fr]';
    const effectiveConditionSort = showConditionDamage
        ? conditionSort
        : { key: 'applications', dir: conditionSort.key === 'applications' ? conditionSort.dir : 'desc' };
    const [activeSupportStat, setActiveSupportStat] = useState<string>('condiCleanse');
    const [activeHealingMetric, setActiveHealingMetric] = useState<string>('healing');
    const [healingCategory, setHealingCategory] = useState<'total' | 'squad' | 'group' | 'self' | 'offSquad'>('total');
    const [activeResUtilitySkill, setActiveResUtilitySkill] = useState<string>('all');
    const [offenseViewMode, setOffenseViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    const [defenseViewMode, setDefenseViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    const [damageMitigationViewMode, setDamageMitigationViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    const [supportViewMode, setSupportViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    const [cleanseScope, setCleanseScope] = useState<'squad' | 'all'>('all');
    const [timelineFriendlyScope, setTimelineFriendlyScope] = useState<'squad' | 'squadAllies'>('squad');
    const [damageMitigationScope, setDamageMitigationScope] = useState<'player' | 'minions'>('player');



    const [skillUsagePlayerFilter, setSkillUsagePlayerFilter] = useState('');
    const [skillUsageSkillFilter, setSkillUsageSkillFilter] = useState('');
    const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [selectedSpikePlayerKey, setSelectedSpikePlayerKey] = useState<string | null>(null);
    const [selectedSpikeFightIndex, setSelectedSpikeFightIndex] = useState<number | null>(null);
    const [spikeMode, setSpikeMode] = useState<'hit' | '1s' | '5s' | '30s'>('hit');
    const [selectedIncomingStrikePlayerKey, setSelectedIncomingStrikePlayerKey] = useState<string | null>(null);
    const [selectedIncomingStrikeFightIndex, setSelectedIncomingStrikeFightIndex] = useState<number | null>(null);
    const [incomingStrikeMode, setIncomingStrikeMode] = useState<'hit' | '1s' | '5s' | '30s'>('hit');
    const [hoveredSkillPlayer, setHoveredSkillPlayer] = useState<string[]>([]);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);
    const [expandedSectionClosing, setExpandedSectionClosing] = useState(false);
    const expandedCloseTimerRef = useRef<number | null>(null);
    const [fightBreakdownTab, setFightBreakdownTab] = useState<'sizes' | 'outcomes' | 'damage' | 'barrier'>('sizes');
    const [skillUsageView, setSkillUsageView] = useState<'total' | 'perSecond'>('total');
    const isSkillUsagePerSecond = skillUsageView === 'perSecond';
    const [expandedSkillUsageClass, setExpandedSkillUsageClass] = useState<string | null>(null);
    const [apmView, setApmView] = useState<'total' | 'perSecond'>('total');
    const [activeApmSpec, setActiveApmSpec] = useState<string | null>(null);
    const [expandedApmSpec, setExpandedApmSpec] = useState<string | null>(null);
    const [activeApmSkillId, setActiveApmSkillId] = useState<string | null>(null);
    const [apmSkillSearch, setApmSkillSearch] = useState('');
    const [activePlayerBreakdownKey, setActivePlayerBreakdownKey] = useState<string | null>(null);
    const [expandedPlayerBreakdownKey, setExpandedPlayerBreakdownKey] = useState<string | null>(null);
    const [activePlayerBreakdownSkillId, setActivePlayerBreakdownSkillId] = useState<string | null>(null);
    const [playerBreakdownSkillSearch, setPlayerBreakdownSkillSearch] = useState('');
    const [playerBreakdownViewMode, setPlayerBreakdownViewMode] = useState<'player' | 'class'>('player');
    const [activeClassBreakdownKey, setActiveClassBreakdownKey] = useState<string | null>(null);
    const [expandedClassBreakdownKey, setExpandedClassBreakdownKey] = useState<string | null>(null);
    const [activeClassBreakdownSkillId, setActiveClassBreakdownSkillId] = useState<string | null>(null);

    const { apmSpecBuckets: apmSpecTables } = useApmStats(skillUsageData);
    const playerSkillBreakdowns = (safeStats.playerSkillBreakdowns || []) as PlayerSkillBreakdown[];
    const playerSkillBreakdownMap = useMemo(() => {
        const map = new Map<string, PlayerSkillBreakdown>();
        playerSkillBreakdowns.forEach((entry) => map.set(entry.key, entry));
        return map;
    }, [playerSkillBreakdowns]);
    const classSkillBreakdowns = useMemo(() => {
        const buckets = new Map<string, { profession: string; players: PlayerSkillBreakdown[]; skills: Map<string, PlayerSkillDamageEntry> }>();
        playerSkillBreakdowns.forEach((player) => {
            const profession = player.profession || 'Unknown';
            if (!buckets.has(profession)) {
                buckets.set(profession, { profession, players: [], skills: new Map() });
            }
            const bucket = buckets.get(profession)!;
            bucket.players.push(player);
            player.skills.forEach((skill) => {
                const existing = bucket.skills.get(skill.id) || { ...skill, damage: 0, downContribution: 0 };
                existing.damage += Number(skill.damage || 0);
                existing.downContribution += Number(skill.downContribution || 0);
                if (!existing.icon && skill.icon) existing.icon = skill.icon;
                if (existing.name?.startsWith('Skill ') && !skill.name.startsWith('Skill ')) {
                    existing.name = skill.name;
                }
                bucket.skills.set(skill.id, existing);
            });
        });
        return Array.from(buckets.values())
            .map((bucket) => {
                const skills = Array.from(bucket.skills.values()).sort((a, b) => b.damage - a.damage);
                const skillMap = skills.reduce<Record<string, PlayerSkillDamageEntry>>((acc, skill) => {
                    acc[skill.id] = skill;
                    return acc;
                }, {});
                return {
                    profession: bucket.profession,
                    players: bucket.players,
                    skills,
                    skillMap
                };
            })
            .sort((a, b) => a.profession.localeCompare(b.profession));
    }, [playerSkillBreakdowns]);
    const activePlayerBreakdown = activePlayerBreakdownKey
        ? playerSkillBreakdownMap.get(activePlayerBreakdownKey) || null
        : null;
    const activePlayerSkill = activePlayerBreakdown && activePlayerBreakdownSkillId
        ? activePlayerBreakdown.skillMap?.[activePlayerBreakdownSkillId] || null
        : null;
    const classBreakdownMap = useMemo(() => {
        const map = new Map<string, (typeof classSkillBreakdowns)[number]>();
        classSkillBreakdowns.forEach((entry) => map.set(entry.profession, entry));
        return map;
    }, [classSkillBreakdowns]);
    const activeClassBreakdown = activeClassBreakdownKey
        ? classBreakdownMap.get(activeClassBreakdownKey) || null
        : null;
    const activeClassSkill = activeClassBreakdown && activeClassBreakdownSkillId
        ? activeClassBreakdown.skillMap?.[activeClassBreakdownSkillId] || null
        : null;

type SpikeFight = {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    values: Record<string, {
        hit: number;
        burst1s: number;
        burst5s: number;
        burst30s: number;
        skillName: string;
        buckets5s?: number[];
        downIndices5s?: number[];
        deathIndices5s?: number[];
        skillRows?: Array<{ skillName: string; damage: number; hits: number; icon?: string }>;
    }>;
    maxHit: number;
    max1s: number;
    max5s: number;
    max30s: number;
};
    type SpikePlayer = {
        key: string;
        account: string;
        displayName: string;
        characterName: string;
        profession: string;
        professionList: string[];
        logs: number;
        peakHit: number;
        peak1s: number;
        peak5s: number;
        peak30s: number;
        peakFightLabel: string;
        peakSkillName: string;
    };

    const spikeDamageData = useMemo<{ fights: SpikeFight[]; players: SpikePlayer[] }>(() => {
        const sanitizeWvwLabel = (value: any) => String(value || '')
            .replace(/^Detailed\s*WvW\s*-\s*/i, '')
            .replace(/^World\s*vs\s*World\s*-\s*/i, '')
            .replace(/^WvW\s*-\s*/i, '')
            .trim();
        const tokenizeLabel = (value: string) => sanitizeWvwLabel(value)
            .toLowerCase()
            .split(/[^a-z0-9]+/i)
            .map((token) => token.trim())
            .filter(Boolean)
            .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token));
        const buildFightLabel = (fightNameRaw: string, mapNameRaw: string) => {
            const fightName = sanitizeWvwLabel(fightNameRaw);
            const mapName = sanitizeWvwLabel(mapNameRaw);
            if (!mapName) return fightName;
            if (!fightName) return mapName;
            const fightTokens = tokenizeLabel(fightName);
            const mapTokens = tokenizeLabel(mapName);
            const fightSet = new Set(fightTokens);
            const mapSet = new Set(mapTokens);
            const mapCovered = mapTokens.length > 0 && mapTokens.every((token) => fightSet.has(token));
            const fightCovered = fightTokens.length > 0 && fightTokens.every((token) => mapSet.has(token));
            if (mapCovered || fightCovered) return fightName;
            return `${fightName} - ${mapName}`;
        };
        const parseTimestampMs = (value: any): number => {
            if (value === undefined || value === null || value === '') return 0;
            if (typeof value === 'number') {
                if (!Number.isFinite(value) || value <= 0) return 0;
                return value > 1e12 ? value : value * 1000;
            }
            if (value instanceof Date) {
                const ms = value.getTime();
                return Number.isFinite(ms) && ms > 0 ? ms : 0;
            }
            const raw = String(value).trim();
            if (!raw) return 0;
            const numeric = Number(raw);
            if (Number.isFinite(numeric) && numeric > 0) {
                return numeric > 1e12 ? numeric : numeric * 1000;
            }
            const parsed = Date.parse(raw);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
            const normalized = raw.replace(/([+-]\d{2})$/, '$1:00');
            const reparsed = Date.parse(normalized);
            return Number.isFinite(reparsed) && reparsed > 0 ? reparsed : 0;
        };
        const resolveFightTimestampMs = (details: any, fallback?: any) => parseTimestampMs(
            details?.uploadTime
            ?? fallback?.uploadTime
            ?? details?.timeStartStd
            ?? details?.timeStart
            ?? details?.timeEndStd
            ?? details?.timeEnd
        );
        const precomputedSpike = (safeStats as any)?.spikeDamage;
        const precomputedFights = Array.isArray(precomputedSpike?.fights) ? precomputedSpike.fights : [];
        const precomputedPlayers = Array.isArray(precomputedSpike?.players) ? precomputedSpike.players : [];
        const precomputedHasBurstValues = precomputedFights.some((fight: any) => {
            const rawValues = fight?.values && typeof fight.values === 'object' ? Object.values(fight.values) : [];
            return rawValues.some((value: any) => value && typeof value === 'object' && (
                Number((value as any).burst1s || 0) > 0
                || Number((value as any).burst5s || 0) > 0
                || Number((value as any).burst30s || 0) > 0
            ));
        }) || precomputedPlayers.some((player: any) =>
            Number(player?.peak1s || 0) > 0
            || Number(player?.peak5s || 0) > 0
            || Number(player?.peak30s || 0) > 0
        );
        const shouldUsePrecomputedSpike = (precomputedFights.length > 0 || precomputedPlayers.length > 0)
            && (precomputedHasBurstValues || logs.length === 0);
        if (shouldUsePrecomputedSpike) {
            const fights: SpikeFight[] = precomputedFights.map((fight: any, index: number) => {
                const rawValues = fight?.values && typeof fight.values === 'object' ? fight.values : {};
                const values: Record<string, {
                    hit: number;
                    burst1s: number;
                    burst5s: number;
                    burst30s: number;
                    skillName: string;
                    buckets5s?: number[];
                    downIndices5s?: number[];
                    deathIndices5s?: number[];
                    skillRows?: Array<{ skillName: string; damage: number; hits: number; icon?: string }>;
                }> = {};
                Object.entries(rawValues).forEach(([key, value]: any) => {
                    if (value && typeof value === 'object') {
                        const legacyDamage = Number((value as any).damage || 0);
                        values[key] = {
                            hit: Number((value as any).hit ?? legacyDamage),
                            burst1s: Number((value as any).burst1s || 0),
                            burst5s: Number((value as any).burst5s || 0),
                            burst30s: Number((value as any).burst30s || 0),
                            skillName: String((value as any).skillName || ''),
                            buckets5s: Array.isArray((value as any).buckets5s)
                                ? (value as any).buckets5s.map((entry: any) => Number(entry || 0))
                                : undefined,
                            downIndices5s: Array.isArray((value as any).downIndices5s)
                                ? (value as any).downIndices5s.map((entry: any) => Number(entry)).filter((entry: number) => Number.isFinite(entry) && entry >= 0)
                                : undefined,
                            deathIndices5s: Array.isArray((value as any).deathIndices5s)
                                ? (value as any).deathIndices5s.map((entry: any) => Number(entry)).filter((entry: number) => Number.isFinite(entry) && entry >= 0)
                                : undefined,
                            skillRows: Array.isArray((value as any).skillRows)
                                ? (value as any).skillRows
                                    .map((entry: any) => ({
                                        skillName: String(entry?.skillName || entry?.name || 'Unknown Skill'),
                                        damage: Number(entry?.damage || 0),
                                        hits: Number(entry?.hits || 0),
                                        icon: typeof entry?.icon === 'string' ? entry.icon : undefined
                                    }))
                                    .filter((entry: any) => Number.isFinite(entry.damage) && entry.damage > 0)
                                : undefined
                        };
                        return;
                    }
                    values[key] = {
                        hit: Number(value || 0),
                        burst1s: 0,
                        burst5s: 0,
                        burst30s: 0,
                        skillName: ''
                    };
                });
                return {
                    id: String(fight?.id || `fight-${index + 1}`),
                    shortLabel: String(fight?.shortLabel || `F${index + 1}`),
                    fullLabel: sanitizeWvwLabel(fight?.fullLabel || `Fight ${index + 1}`),
                    timestamp: Number(fight?.timestamp || 0),
                    values,
                    maxHit: Number(fight?.maxHit ?? fight?.maxDamage ?? 0),
                    max1s: Number(fight?.max1s || 0),
                    max5s: Number(fight?.max5s || 0),
                    max30s: Number(fight?.max30s || 0)
                };
            });
            const players: SpikePlayer[] = precomputedPlayers.map((player: any) => ({
                key: String(player?.key || ''),
                account: String(player?.account || 'Unknown'),
                displayName: String(player?.displayName || player?.account || 'Unknown'),
                characterName: String(player?.characterName || player?.name || player?.character_name || player?.display_name || ''),
                profession: String(player?.profession || 'Unknown'),
                professionList: Array.isArray(player?.professionList) ? player.professionList.map((value: any) => String(value)) : [],
                logs: Number(player?.logs || 0),
                peakHit: Number(player?.peakHit || 0),
                peak1s: Number(player?.peak1s || 0),
                peak5s: Number(player?.peak5s || 0),
                peak30s: Number(player?.peak30s || 0),
                peakFightLabel: sanitizeWvwLabel(player?.peakFightLabel || ''),
                peakSkillName: String(player?.peakSkillName || '')
            }));
            return { fights, players };
        }

        const getHighestSingleHit = (player: any, details: any) => {
            const skillMap = details?.skillMap || {};
            const buffMap = details?.buffMap || {};
            let bestValue = 0;
            let bestName = '';

            const resolveSkillName = (rawId: any) => {
                const idNum = Number(rawId);
                if (!Number.isFinite(idNum)) return String(rawId || 'Unknown Skill');
                const mapped = skillMap?.[`s${idNum}`] || skillMap?.[`${idNum}`];
                if (mapped?.name) return String(mapped.name);
                const buffMapped = buffMap?.[`b${idNum}`] || buffMap?.[`${idNum}`];
                if (buffMapped?.name) return String(buffMapped.name);
                return `Skill ${idNum}`;
            };

            const readEntryPeak = (entry: any) => {
                if (!entry || typeof entry !== 'object') return;
                const candidates = [
                    Number(entry.max),
                    Number(entry.maxDamage),
                    Number(entry.maxHit)
                ].filter((n) => Number.isFinite(n));
                const peak = candidates.length > 0 ? Math.max(...candidates) : 0;
                if (peak > bestValue) {
                    bestValue = peak;
                    bestName = resolveSkillName(entry.id);
                }
            };

            let sawTargetEntry = false;
            if (Array.isArray(player?.targetDamageDist)) {
                player.targetDamageDist.forEach((targetGroup: any) => {
                    if (!Array.isArray(targetGroup)) return;
                    targetGroup.forEach((list: any) => {
                        if (!Array.isArray(list)) return;
                        list.forEach((entry: any) => {
                            sawTargetEntry = true;
                            readEntryPeak(entry);
                        });
                    });
                });
            }
            if ((!sawTargetEntry || bestValue <= 0) && Array.isArray(player?.totalDamageDist)) {
                player.totalDamageDist.forEach((list: any) => {
                    if (!Array.isArray(list)) return;
                    list.forEach((entry: any) => readEntryPeak(entry));
                });
            }
            return { peak: bestValue, skillName: bestName || 'Unknown Skill' };
        };

        const getBurstFromTimeline = (player: any, seconds: number) => {
            const toPerSecond = (series: number[]) => {
                if (!Array.isArray(series) || series.length === 0) return [] as number[];
                const deltas: number[] = [];
                for (let i = 0; i < series.length; i += 1) {
                    const current = Number(series[i] || 0);
                    const prev = i > 0 ? Number(series[i - 1] || 0) : 0;
                    deltas.push(Math.max(0, current - prev));
                }
                return deltas;
            };
            const maxRolling = (values: number[], window: number) => {
                if (!Array.isArray(values) || values.length === 0 || window <= 0) return 0;
                let sum = 0;
                let best = 0;
                for (let i = 0; i < values.length; i += 1) {
                    sum += Number(values[i] || 0);
                    if (i >= window) {
                        sum -= Number(values[i - window] || 0);
                    }
                    if (i >= window - 1 && sum > best) best = sum;
                }
                return Math.max(0, best);
            };
            const sumCumulativeTargets = (targetSeries: any[]) => {
                if (!Array.isArray(targetSeries)) return [] as number[];
                const maxLen = targetSeries.reduce((len, series) => Math.max(len, Array.isArray(series) ? series.length : 0), 0);
                if (maxLen <= 0) return [] as number[];
                const summed = new Array<number>(maxLen).fill(0);
                targetSeries.forEach((series) => {
                    if (!Array.isArray(series)) return;
                    for (let i = 0; i < maxLen; i += 1) {
                        summed[i] += Number(series[i] || 0);
                    }
                });
                return summed;
            };
            const normalizeNumberSeries = (series: any) =>
                Array.isArray(series) ? series.map((value: any) => Number(value || 0)) : null;
            const extractTargetPhase0 = (targetDamage1S: any) => {
                if (!Array.isArray(targetDamage1S) || targetDamage1S.length === 0) return null;
                const first = targetDamage1S[0];
                if (!Array.isArray(first)) return null;

                // Shape A: [phase][target][time]
                if (Array.isArray(first[0]) && Array.isArray(first[0][0])) {
                    return sumCumulativeTargets(first);
                }

                // Shape B: [target][phase][time]
                if (Array.isArray(first[0]) && !Array.isArray(first[0][0])) {
                    const phaseSeries = targetDamage1S
                        .map((target: any) => normalizeNumberSeries(Array.isArray(target) ? target[0] : null))
                        .filter((series: number[] | null): series is number[] => Array.isArray(series) && series.length > 0);
                    if (phaseSeries.length > 0) return sumCumulativeTargets(phaseSeries);
                }

                return null;
            };

            const targetPhase0 = extractTargetPhase0(player?.targetDamage1S);
            const totalPhase0 = Array.isArray(player?.damage1S) && Array.isArray(player.damage1S[0])
                ? player.damage1S[0]
                : null;
            const cumulative = targetPhase0
                ? targetPhase0
                : (Array.isArray(totalPhase0) ? totalPhase0.map((v: any) => Number(v || 0)) : []);
            const perSecond = toPerSecond(cumulative);
            return maxRolling(perSecond, seconds);
        };

        const fights: SpikeFight[] = [];
        const playerMap = new Map<string, SpikePlayer>();

        logs.forEach((log) => {
            const details = log?.details;
            if (!details) return;
            const fightIndex = fights.length + 1;
            const fightName = sanitizeWvwLabel(details.fightName || log.fightName || `Fight ${fightIndex}`);
            const rawMap = details.zone || details.mapName || details.map || details.location || '';
            const fullLabel = buildFightLabel(fightName, String(rawMap || ''));
            const values: Record<string, { hit: number; burst1s: number; burst5s: number; burst30s: number; skillName: string; buckets5s?: number[] }> = {};

            const fightPlayers = Array.isArray(details.players) ? details.players : [];
            fightPlayers.forEach((player: any) => {
                if (player?.notInSquad) return;
                const account = String(player?.account || player?.name || 'Unknown');
                const characterName = String(player?.character_name || player?.display_name || player?.name || '');
                const profession = String(player?.profession || 'Unknown');
                const key = `${account}|${profession}`;
                const spike = getHighestSingleHit(player, details);
                const hit = Number(spike.peak || 0);
                const burst1s = Number(getBurstFromTimeline(player, 1) || 0);
                const burst5s = Number(getBurstFromTimeline(player, 5) || 0);
                const burst30s = Number(getBurstFromTimeline(player, 30) || 0);
                values[key] = { hit, burst1s, burst5s, burst30s, skillName: spike.skillName || 'Unknown Skill' };

                const existing = playerMap.get(key) || {
                    key,
                    account,
                    displayName: account,
                    characterName,
                    profession,
                    professionList: [profession],
                    logs: 0,
                    peakHit: 0,
                    peak1s: 0,
                    peak5s: 0,
                    peak30s: 0,
                    peakFightLabel: '',
                    peakSkillName: ''
                };
                existing.logs += 1;
                if (!existing.professionList.includes(profession)) {
                    existing.professionList.push(profession);
                }
                if (!existing.characterName && characterName) {
                    existing.characterName = characterName;
                }
                if (hit > existing.peakHit) {
                    existing.peakHit = hit;
                    existing.peakFightLabel = fullLabel;
                    existing.peakSkillName = spike.skillName || 'Unknown Skill';
                }
                if (burst1s > existing.peak1s) existing.peak1s = burst1s;
                if (burst5s > existing.peak5s) existing.peak5s = burst5s;
                if (burst30s > existing.peak30s) existing.peak30s = burst30s;
                playerMap.set(key, existing);
            });

            const maxHit = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hit || 0)), 0);
            const max1s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1s || 0)), 0);
            const max5s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5s || 0)), 0);
            const max30s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30s || 0)), 0);
            fights.push({
                id: log.filePath || log.id || `fight-${fightIndex}`,
                shortLabel: `F${fightIndex}`,
                fullLabel,
                timestamp: resolveFightTimestampMs(details, log),
                values,
                maxHit,
                max1s,
                max5s,
                max30s
            });
        });

        const players = Array.from(playerMap.values()).sort((a, b) => {
            if (b.peakHit !== a.peakHit) return b.peakHit - a.peakHit;
            return a.displayName.localeCompare(b.displayName);
        });

        return { fights, players };
    }, [logs, safeStats]);

    const incomingStrikeDamageData = useMemo<{ fights: SpikeFight[]; players: SpikePlayer[] }>(() => {
        const sanitizeWvwLabel = (value: any) => String(value || '')
            .replace(/^Detailed\s*WvW\s*-\s*/i, '')
            .replace(/^World\s*vs\s*World\s*-\s*/i, '')
            .replace(/^WvW\s*-\s*/i, '')
            .trim();
        const precomputedIncoming = (safeStats as any)?.incomingStrikeDamage;
        const precomputedFights = Array.isArray(precomputedIncoming?.fights) ? precomputedIncoming.fights : [];
        const precomputedPlayers = Array.isArray(precomputedIncoming?.players) ? precomputedIncoming.players : [];
        if (precomputedFights.length === 0 && precomputedPlayers.length === 0) {
            return { fights: [], players: [] };
        }

        const fights: SpikeFight[] = precomputedFights.map((fight: any, index: number) => {
            const rawValues = fight?.values && typeof fight.values === 'object' ? fight.values : {};
            const values: Record<string, {
                hit: number;
                burst1s: number;
                burst5s: number;
                burst30s: number;
                skillName: string;
                buckets5s?: number[];
                downIndices5s?: number[];
                deathIndices5s?: number[];
                skillRows?: Array<{ skillName: string; damage: number; hits: number; icon?: string }>;
            }> = {};
            Object.entries(rawValues).forEach(([key, value]: any) => {
                if (value && typeof value === 'object') {
                    const legacyDamage = Number((value as any).damage || 0);
                    values[key] = {
                        hit: Number((value as any).hit ?? legacyDamage),
                        burst1s: Number((value as any).burst1s || 0),
                        burst5s: Number((value as any).burst5s || 0),
                        burst30s: Number((value as any).burst30s || 0),
                        skillName: String((value as any).skillName || ''),
                        buckets5s: Array.isArray((value as any).buckets5s)
                            ? (value as any).buckets5s.map((entry: any) => Number(entry || 0))
                            : undefined,
                        downIndices5s: Array.isArray((value as any).downIndices5s)
                            ? (value as any).downIndices5s.map((entry: any) => Number(entry)).filter((entry: number) => Number.isFinite(entry) && entry >= 0)
                            : undefined,
                        deathIndices5s: Array.isArray((value as any).deathIndices5s)
                            ? (value as any).deathIndices5s.map((entry: any) => Number(entry)).filter((entry: number) => Number.isFinite(entry) && entry >= 0)
                            : undefined,
                        skillRows: Array.isArray((value as any).skillRows)
                            ? (value as any).skillRows
                                .map((entry: any) => ({
                                    skillName: String(entry?.skillName || entry?.name || 'Unknown Skill'),
                                    damage: Number(entry?.damage || 0),
                                    hits: Number(entry?.hits || 0),
                                    icon: typeof entry?.icon === 'string' ? entry.icon : undefined
                                }))
                                .filter((entry: any) => Number.isFinite(entry.damage) && entry.damage > 0)
                            : undefined
                    };
                    return;
                }
                values[key] = {
                    hit: Number(value || 0),
                    burst1s: 0,
                    burst5s: 0,
                    burst30s: 0,
                    skillName: ''
                };
            });
            return {
                id: String(fight?.id || `fight-${index + 1}`),
                shortLabel: String(fight?.shortLabel || `F${index + 1}`),
                fullLabel: sanitizeWvwLabel(fight?.fullLabel || `Fight ${index + 1}`),
                timestamp: Number(fight?.timestamp || 0),
                values,
                maxHit: Number(fight?.maxHit ?? fight?.maxDamage ?? 0),
                max1s: Number(fight?.max1s || 0),
                max5s: Number(fight?.max5s || 0),
                max30s: Number(fight?.max30s || 0)
            };
        });

        const players: SpikePlayer[] = precomputedPlayers.map((player: any) => ({
            key: String(player?.key || ''),
            account: String(player?.account || 'Unknown'),
            displayName: String(player?.displayName || player?.account || 'Unknown'),
            characterName: String(player?.characterName || player?.name || player?.character_name || player?.display_name || ''),
            profession: String(player?.profession || 'Unknown'),
            professionList: Array.isArray(player?.professionList) ? player.professionList.map((value: any) => String(value)) : [],
            logs: Number(player?.logs || 0),
            peakHit: Number(player?.peakHit || 0),
            peak1s: Number(player?.peak1s || 0),
            peak5s: Number(player?.peak5s || 0),
            peak30s: Number(player?.peak30s || 0),
            peakFightLabel: sanitizeWvwLabel(player?.peakFightLabel || ''),
            peakSkillName: String(player?.peakSkillName || '')
        }));

        return { fights, players };
    }, [safeStats]);

    const spikePlayerMap = useMemo(() => {
        const map = new Map<string, (typeof spikeDamageData.players)[number]>();
        spikeDamageData.players.forEach((player) => map.set(player.key, player));
        return map;
    }, [spikeDamageData.players]);

    const groupedSpikePlayers = useMemo(() => {
        const modeValue = (player: SpikePlayer) => (
            spikeMode === 'hit' ? player.peakHit : spikeMode === '1s' ? player.peak1s : spikeMode === '5s' ? player.peak5s : player.peak30s
        );
        const term = spikePlayerFilter.trim().toLowerCase();
        const filtered = !term
            ? spikeDamageData.players
            : spikeDamageData.players.filter((player) =>
                player.displayName.toLowerCase().includes(term)
                || player.account.toLowerCase().includes(term)
                || player.profession.toLowerCase().includes(term)
            );
        const groups = new Map<string, (typeof filtered)>();
        filtered.forEach((player) => {
            const profession = player.profession || 'Unknown';
            const list = groups.get(profession) || [];
            list.push(player);
            groups.set(profession, list);
        });
        return Array.from(groups.entries())
            .map(([profession, players]) => ({
                profession,
                players: [...players].sort((a, b) => modeValue(b) - modeValue(a) || a.displayName.localeCompare(b.displayName))
            }))
            .sort((a, b) => a.profession.localeCompare(b.profession));
    }, [spikeDamageData.players, spikePlayerFilter, spikeMode]);

    const selectedSpikePlayer = selectedSpikePlayerKey
        ? spikePlayerMap.get(selectedSpikePlayerKey) || null
        : null;

    const spikeChartData = useMemo(() => {
        if (!selectedSpikePlayerKey) return [];
        const getValue = (entry: { hit: number; burst1s: number; burst5s: number; burst30s: number } | undefined) => {
            if (!entry) return 0;
            if (spikeMode === 'hit') return Number(entry.hit || 0);
            if (spikeMode === '1s') return Number(entry.burst1s || 0);
            if (spikeMode === '5s') return Number(entry.burst5s || 0);
            return Number(entry.burst30s || 0);
        };
        const getReference = (fight: SpikeFight) => {
            if (spikeMode === 'hit') return Number(fight.maxHit || 0);
            if (spikeMode === '1s') return Number(fight.max1s || 0);
            if (spikeMode === '5s') return Number(fight.max5s || 0);
            return Number(fight.max30s || 0);
        };
        return spikeDamageData.fights.map((fight, index) => ({
            index,
            fightId: fight.id,
            shortLabel: fight.shortLabel,
            fullLabel: fight.fullLabel,
            timestamp: Number(fight.timestamp || 0),
            damage: getValue(fight.values[selectedSpikePlayerKey]),
            maxDamage: getReference(fight),
            skillName: String(fight.values[selectedSpikePlayerKey]?.skillName || '')
        }));
    }, [spikeDamageData.fights, selectedSpikePlayerKey, spikeMode]);

    const spikeChartMaxY = useMemo(() => {
        const selectedPeak = spikeChartData.reduce((best, entry) => Math.max(best, Number(entry.damage || 0)), 0);
        const fightPeak = spikeChartData.reduce((best, entry) => Math.max(best, Number(entry.maxDamage || 0)), 0);
        return Math.max(1, selectedPeak, fightPeak);
    }, [spikeChartData]);

    const spikeDrilldown = useMemo(() => {
        const selectedPoint = selectedSpikeFightIndex === null
            ? null
            : spikeChartData.find((point) => point.index === selectedSpikeFightIndex) || null;
        if (!selectedPoint || !selectedSpikePlayerKey) {
            return {
                title: 'Fight Breakdown',
                data: [] as Array<{ label: string; value: number }>,
                downLabels: [] as string[],
                deathLabels: [] as string[],
                downIndices: [] as number[],
                deathIndices: [] as number[]
            };
        }
        const selectedFight = spikeDamageData.fights.find((fight, index) => (
            String(fight.id || '') === String(selectedPoint.fightId || '')
            || index === selectedPoint.index
        )) || null;
        const [account, profession] = selectedSpikePlayerKey.split('|');
        const selectedLog = logs.find((log) => {
            const id = String(log?.filePath || log?.id || '');
            return id === String(selectedPoint.fightId || '');
        });
        const details = selectedLog?.details;
        const toPairs = (value: any): Array<[number, number]> => {
            if (!Array.isArray(value)) return [];
            return value
                .map((entry: any) => {
                    if (Array.isArray(entry)) return [Number(entry[0]), Number(entry[1])] as [number, number];
                    if (entry && typeof entry === 'object') return [Number((entry as any).time), Number((entry as any).value)] as [number, number];
                    return null;
                })
                .filter((entry: any): entry is [number, number] => !!entry && Number.isFinite(entry[0]) && entry[0] >= 0);
        };
        const normalizeText = (value: any) => String(value || '').trim().toLowerCase();
        const accountNorm = normalizeText(account);
        const professionNorm = normalizeText(profession);
        const selectedSpikePlayerMeta = spikePlayerMap.get(selectedSpikePlayerKey);
        const candidateNames = new Set<string>([
            normalizeText(selectedSpikePlayerMeta?.displayName),
            normalizeText(selectedSpikePlayerMeta?.characterName),
            normalizeText(selectedSpikePlayerMeta?.account)
        ].filter(Boolean));
        const selectedReplayPlayer = Array.isArray(details?.players)
            ? details.players
                .map((player: any) => {
                    const playerAccount = normalizeText(player?.account);
                    const playerName = normalizeText(player?.name);
                    const playerProfession = normalizeText(player?.profession);
                    const accountMatch = !!playerAccount && playerAccount === accountNorm;
                    const nameMatch = !!playerName && (playerName === accountNorm || candidateNames.has(playerName));
                    const candidateAccountMatch = !!playerAccount && candidateNames.has(playerAccount);
                    const professionMatch = !professionNorm || playerProfession === professionNorm;
                    let score = 0;
                    if (accountMatch) score += 100;
                    if (nameMatch) score += 90;
                    if (candidateAccountMatch) score += 80;
                    if (professionMatch) score += 20;
                    return { player, score };
                })
                .filter((entry: any) => entry.score > 0)
                .sort((a: any, b: any) => b.score - a.score)[0]?.player || null
            : null;
        const replayEntries = (() => {
            const replay = (selectedReplayPlayer as any)?.combatReplayData;
            if (Array.isArray(replay)) return replay.filter((entry: any) => entry && typeof entry === 'object');
            return replay && typeof replay === 'object' ? [replay] : [];
        })();
        const downMsRaw = replayEntries.flatMap((entry: any) => toPairs(entry?.down).map(([time]) => time));
        const deathMsRaw = replayEntries.flatMap((entry: any) => toPairs(entry?.dead).map(([time]) => time));
        const replayStartHints = replayEntries
            .map((entry: any) => Number(entry?.start))
            .filter((value: number) => Number.isFinite(value) && value >= 0);
        const minGlobalReplayStart = Array.isArray(details?.players)
            ? details.players
                .flatMap((player: any) => {
                    const replay = player?.combatReplayData;
                    if (Array.isArray(replay)) return replay.map((entry: any) => Number(entry?.start));
                    return [Number(replay?.start)];
                })
                .filter((value: number) => Number.isFinite(value) && value >= 0)
                .reduce((min: number, value: number) => Math.min(min, value), Number.POSITIVE_INFINITY)
            : Number.POSITIVE_INFINITY;
        const replayOffsetHints = [
            0,
            Number(details?.logStartOffset || 0),
            ...replayStartHints,
            Number.isFinite(minGlobalReplayStart) ? minGlobalReplayStart : 0
        ].filter((value) => Number.isFinite(value) && value >= 0);
        const markerLabelForMs = (timeMs: number) => {
            const second = Math.max(0, Math.floor(Number(timeMs || 0) / 1000));
            const start = Math.floor(second / 5) * 5;
            return `${start}s-${start + 5}s`;
        };
        const normalizeReplayTimes = (timesMs: number[], labels: string[]) => {
            if (timesMs.length === 0 || labels.length === 0) return [] as number[];
            const maxMs = labels.length * 5000;
            const validRangeScore = (values: number[]) => values.reduce((count, value) => (
                value >= 0 && value <= (maxMs + 2000) ? count + 1 : count
            ), 0);
            const timeVariants: number[][] = [];
            const raw = timesMs.map((value) => Number(value || 0)).filter((value) => Number.isFinite(value) && value >= 0);
            if (raw.length === 0) return [] as number[];
            timeVariants.push(raw);
            const maxRaw = raw.reduce((max, value) => Math.max(max, value), 0);
            const minRaw = raw.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
            // Some replay payloads can be encoded in seconds or microseconds.
            if (maxRaw > (maxMs * 20)) {
                timeVariants.push(raw.map((value) => value / 1000));
            }
            if (maxRaw <= (maxMs * 2) && minRaw >= 0 && maxRaw > 0 && maxRaw < Math.max(120, labels.length * 5 + 10)) {
                timeVariants.push(raw.map((value) => value * 1000));
            }
            let bestValues = raw;
            let bestOffset = 0;
            let bestScore = -1;
            timeVariants.forEach((variant) => {
                const offsets = new Set<number>(replayOffsetHints);
                const minTime = variant.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
                if (Number.isFinite(minTime) && maxMs > 0 && minTime > maxMs) {
                    const approx = Math.floor(minTime / maxMs) * maxMs;
                    offsets.add(approx);
                    offsets.add(Math.max(0, approx - maxMs));
                }
                offsets.forEach((offset) => {
                    const shifted = variant.map((value) => value - offset);
                    const score = validRangeScore(shifted);
                    if (score > bestScore) {
                        bestScore = score;
                        bestOffset = offset;
                        bestValues = variant;
                    }
                });
            });
            return bestValues.map((value) => value - bestOffset).filter((value) => Number.isFinite(value) && value >= 0);
        };
        const buildMarkerLabels = (labels: string[], timesMs: number[]) => {
            if (labels.length === 0 || timesMs.length === 0) return [] as string[];
            const normalizedTimes = normalizeReplayTimes(timesMs, labels);
            const labelByBucketStart = new Map<number, string>();
            labels.forEach((label) => {
                const match = /^(\d+)s-/.exec(String(label));
                if (!match) return;
                const start = Number(match[1]);
                if (Number.isFinite(start)) labelByBucketStart.set(start, label);
            });
            const resolved: string[] = [];
            normalizedTimes.forEach((timeMs) => {
                const second = Math.max(0, Math.floor(Number(timeMs || 0) / 1000));
                const start = Math.floor(second / 5) * 5;
                const label = labelByBucketStart.get(start) || markerLabelForMs(timeMs);
                if (labels.includes(label)) resolved.push(label);
            });
            return Array.from(new Set(resolved));
        };
        const buildMarkerIndices = (bucketCount: number, timesMs: number[]) => {
            if (bucketCount <= 0 || timesMs.length === 0) return [] as number[];
            const fakeLabels = Array.from({ length: bucketCount }, (_, idx) => `${idx * 5}s-${(idx + 1) * 5}s`);
            const normalizedTimes = normalizeReplayTimes(timesMs, fakeLabels);
            const indices = normalizedTimes
                .map((timeMs) => Math.floor(Math.max(0, Number(timeMs || 0)) / 5000))
                .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < bucketCount);
            return Array.from(new Set(indices));
        };
        const precomputedBuckets = Array.isArray(selectedFight?.values?.[selectedSpikePlayerKey]?.buckets5s)
            ? selectedFight?.values?.[selectedSpikePlayerKey]?.buckets5s || []
            : [];
        const precomputedDownIndices = Array.isArray((selectedFight as any)?.values?.[selectedSpikePlayerKey]?.downIndices5s)
            ? ((selectedFight as any).values[selectedSpikePlayerKey].downIndices5s as any[])
                .map((value: any) => Number(value))
                .filter((value: number) => Number.isFinite(value) && value >= 0)
            : [];
        const precomputedDeathIndices = Array.isArray((selectedFight as any)?.values?.[selectedSpikePlayerKey]?.deathIndices5s)
            ? ((selectedFight as any).values[selectedSpikePlayerKey].deathIndices5s as any[])
                .map((value: any) => Number(value))
                .filter((value: number) => Number.isFinite(value) && value >= 0)
            : [];
        if (precomputedBuckets.length > 0) {
            const durationBuckets = Math.max(0, Math.ceil(Number(details?.durationMS || 0) / 5000));
            const bucketCount = Math.max(precomputedBuckets.length, durationBuckets);
            const data = Array.from({ length: bucketCount }, (_, idx) => ({
                label: `${idx * 5}s-${(idx + 1) * 5}s`,
                value: Number(precomputedBuckets[idx] || 0)
            }));
            const labels = data.map((entry) => entry.label);
            return {
                title: `Fight Breakdown - ${selectedPoint.shortLabel || 'Fight'} (5s Damage Buckets)`,
                data,
                downLabels: buildMarkerLabels(labels, downMsRaw),
                deathLabels: buildMarkerLabels(labels, deathMsRaw),
                downIndices: precomputedDownIndices.length > 0
                    ? precomputedDownIndices.filter((idx) => idx < data.length)
                    : buildMarkerIndices(data.length, downMsRaw),
                deathIndices: precomputedDeathIndices.length > 0
                    ? precomputedDeathIndices.filter((idx) => idx < data.length)
                    : buildMarkerIndices(data.length, deathMsRaw)
            };
        }
        const fightLabel = selectedPoint.shortLabel || 'Fight';
        if (!details || !Array.isArray(details.players)) {
            return {
                title: `Fight Breakdown - ${fightLabel}`,
                data: [] as Array<{ label: string; value: number }>,
                downLabels: [] as string[],
                deathLabels: [] as string[],
                downIndices: [] as number[],
                deathIndices: [] as number[]
            };
        }
        const selectedPlayer = details.players.find((player: any) =>
            String(player?.account || player?.name || 'Unknown') === account
            && String(player?.profession || 'Unknown') === profession
        );
        if (!selectedPlayer) {
            return {
                title: `Fight Breakdown - ${fightLabel}`,
                data: [] as Array<{ label: string; value: number }>,
                downLabels: [] as string[],
                deathLabels: [] as string[],
                downIndices: [] as number[],
                deathIndices: [] as number[]
            };
        }
        const selectedPlayerAny = selectedPlayer as any;

        const toPerSecond = (series: number[]) => {
            if (!Array.isArray(series) || series.length === 0) return [] as number[];
            const deltas: number[] = [];
            for (let i = 0; i < series.length; i += 1) {
                const current = Number(series[i] || 0);
                const prev = i > 0 ? Number(series[i - 1] || 0) : 0;
                deltas.push(Math.max(0, current - prev));
            }
            return deltas;
        };
        const sumCumulativeTargets = (targetSeries: any[]) => {
            if (!Array.isArray(targetSeries)) return [] as number[];
            const maxLen = targetSeries.reduce((len, series) => Math.max(len, Array.isArray(series) ? series.length : 0), 0);
            if (maxLen <= 0) return [] as number[];
            const summed = new Array<number>(maxLen).fill(0);
            targetSeries.forEach((series) => {
                if (!Array.isArray(series)) return;
                for (let i = 0; i < maxLen; i += 1) {
                    summed[i] += Number(series[i] || 0);
                }
            });
            return summed;
        };
        const normalizeNumberSeries = (series: any) =>
            Array.isArray(series) ? series.map((value: any) => Number(value || 0)) : null;
        const extractTargetPhase0 = (targetDamage1S: any) => {
            if (!Array.isArray(targetDamage1S) || targetDamage1S.length === 0) return null;
            const first = targetDamage1S[0];
            if (!Array.isArray(first)) return null;
            if (Array.isArray(first[0]) && Array.isArray(first[0][0])) {
                return sumCumulativeTargets(first);
            }
            if (Array.isArray(first[0]) && !Array.isArray(first[0][0])) {
                const phaseSeries = targetDamage1S
                    .map((target: any) => normalizeNumberSeries(Array.isArray(target) ? target[0] : null))
                    .filter((series: number[] | null): series is number[] => Array.isArray(series) && series.length > 0);
                if (phaseSeries.length > 0) return sumCumulativeTargets(phaseSeries);
            }
            return null;
        };
        const targetPhase0 = extractTargetPhase0(selectedPlayerAny?.targetDamage1S);
        const totalPhase0 = Array.isArray(selectedPlayerAny?.damage1S) && Array.isArray(selectedPlayerAny.damage1S[0])
            ? selectedPlayerAny.damage1S[0]
            : null;
        const cumulative = targetPhase0
            ? targetPhase0
            : (Array.isArray(totalPhase0) ? totalPhase0.map((v: any) => Number(v || 0)) : []);
        const perSecond = toPerSecond(cumulative);
        const bucketSizeSeconds = 5;
        const durationBuckets = Math.max(0, Math.ceil(Number(details?.durationMS || 0) / (bucketSizeSeconds * 1000)));
        const damageBuckets = Math.max(0, Math.ceil(perSecond.length / bucketSizeSeconds));
        const bucketCount = Math.max(durationBuckets, damageBuckets);
        const data: Array<{ label: string; value: number }> = [];
        for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
            const start = bucketIndex * bucketSizeSeconds;
            const end = Math.min(start + bucketSizeSeconds, perSecond.length);
            const value = perSecond.slice(start, end).reduce((sum, entry) => sum + Number(entry || 0), 0);
            data.push({
                label: `${start}s-${start + bucketSizeSeconds}s`,
                value
            });
        }
        const labels = data.map((entry) => entry.label);
        return {
            title: `Fight Breakdown - ${fightLabel} (5s Damage Buckets)`,
            data,
            downLabels: buildMarkerLabels(labels, downMsRaw),
            deathLabels: buildMarkerLabels(labels, deathMsRaw),
            downIndices: buildMarkerIndices(data.length, downMsRaw),
            deathIndices: buildMarkerIndices(data.length, deathMsRaw)
        };
    }, [selectedSpikeFightIndex, spikeChartData, selectedSpikePlayerKey, logs, spikeDamageData.fights, spikePlayerMap]);

    const incomingStrikePlayerMap = useMemo(() => {
        const map = new Map<string, (typeof incomingStrikeDamageData.players)[number]>();
        incomingStrikeDamageData.players.forEach((player) => map.set(player.key, player));
        return map;
    }, [incomingStrikeDamageData.players]);

    const groupedIncomingStrikePlayers = useMemo(() => {
        const modeValue = (player: SpikePlayer) => (
            incomingStrikeMode === 'hit' ? player.peakHit : incomingStrikeMode === '1s' ? player.peak1s : incomingStrikeMode === '5s' ? player.peak5s : player.peak30s
        );
        const term = incomingStrikePlayerFilter.trim().toLowerCase();
        const filtered = !term
            ? incomingStrikeDamageData.players
            : incomingStrikeDamageData.players.filter((player) =>
                player.displayName.toLowerCase().includes(term)
                || player.account.toLowerCase().includes(term)
                || player.profession.toLowerCase().includes(term)
            );
        const groups = new Map<string, (typeof filtered)>();
        filtered.forEach((player) => {
            const profession = player.profession || 'Unknown';
            const list = groups.get(profession) || [];
            list.push(player);
            groups.set(profession, list);
        });
        return Array.from(groups.entries())
            .map(([profession, players]) => ({
                profession,
                players: [...players].sort((a, b) => modeValue(b) - modeValue(a) || a.displayName.localeCompare(b.displayName))
            }))
            .sort((a, b) => a.profession.localeCompare(b.profession));
    }, [incomingStrikeDamageData.players, incomingStrikePlayerFilter, incomingStrikeMode]);

    const selectedIncomingStrikePlayer = selectedIncomingStrikePlayerKey
        ? incomingStrikePlayerMap.get(selectedIncomingStrikePlayerKey) || null
        : null;

    const incomingStrikeChartData = useMemo(() => {
        if (!selectedIncomingStrikePlayerKey) return [];
        const getValue = (entry: { hit: number; burst1s: number; burst5s: number; burst30s: number } | undefined) => {
            if (!entry) return 0;
            if (incomingStrikeMode === 'hit') return Number(entry.hit || 0);
            if (incomingStrikeMode === '1s') return Number(entry.burst1s || 0);
            if (incomingStrikeMode === '5s') return Number(entry.burst5s || 0);
            return Number(entry.burst30s || 0);
        };
        const getReference = (fight: SpikeFight) => {
            if (incomingStrikeMode === 'hit') return Number(fight.maxHit || 0);
            if (incomingStrikeMode === '1s') return Number(fight.max1s || 0);
            if (incomingStrikeMode === '5s') return Number(fight.max5s || 0);
            return Number(fight.max30s || 0);
        };
        return incomingStrikeDamageData.fights.map((fight, index) => ({
            index,
            fightId: fight.id,
            shortLabel: fight.shortLabel,
            fullLabel: fight.fullLabel,
            timestamp: Number(fight.timestamp || 0),
            damage: getValue(fight.values[selectedIncomingStrikePlayerKey]),
            maxDamage: getReference(fight),
            skillName: String(fight.values[selectedIncomingStrikePlayerKey]?.skillName || '')
        }));
    }, [incomingStrikeDamageData.fights, selectedIncomingStrikePlayerKey, incomingStrikeMode]);

    const incomingStrikeChartMaxY = useMemo(() => {
        const selectedPeak = incomingStrikeChartData.reduce((best, entry) => Math.max(best, Number(entry.damage || 0)), 0);
        const fightPeak = incomingStrikeChartData.reduce((best, entry) => Math.max(best, Number(entry.maxDamage || 0)), 0);
        return Math.max(1, selectedPeak, fightPeak);
    }, [incomingStrikeChartData]);

    const incomingStrikeDrilldown = useMemo(() => {
        const selectedPoint = selectedIncomingStrikeFightIndex === null
            ? null
            : incomingStrikeChartData.find((point) => point.index === selectedIncomingStrikeFightIndex) || null;
        if (!selectedPoint || !selectedIncomingStrikePlayerKey) {
            return {
                title: 'Fight Breakdown',
                data: [] as Array<{ label: string; value: number }>,
                downLabels: [] as string[],
                deathLabels: [] as string[],
                downIndices: [] as number[],
                deathIndices: [] as number[]
            };
        }
        const selectedFight = incomingStrikeDamageData.fights.find((fight, index) => (
            String(fight.id || '') === String(selectedPoint.fightId || '')
            || index === selectedPoint.index
        )) || null;
        const precomputedBuckets = Array.isArray(selectedFight?.values?.[selectedIncomingStrikePlayerKey]?.buckets5s)
            ? selectedFight?.values?.[selectedIncomingStrikePlayerKey]?.buckets5s || []
            : [];
        const precomputedDownIndices = Array.isArray((selectedFight as any)?.values?.[selectedIncomingStrikePlayerKey]?.downIndices5s)
            ? ((selectedFight as any).values[selectedIncomingStrikePlayerKey].downIndices5s as any[])
                .map((value: any) => Number(value))
                .filter((value: number) => Number.isFinite(value) && value >= 0)
            : [];
        const precomputedDeathIndices = Array.isArray((selectedFight as any)?.values?.[selectedIncomingStrikePlayerKey]?.deathIndices5s)
            ? ((selectedFight as any).values[selectedIncomingStrikePlayerKey].deathIndices5s as any[])
                .map((value: any) => Number(value))
                .filter((value: number) => Number.isFinite(value) && value >= 0)
            : [];
        if (precomputedBuckets.length > 0) {
            const data = precomputedBuckets.map((value: number, idx: number) => ({
                label: `${idx * 5}s-${(idx + 1) * 5}s`,
                value: Number(value || 0)
            }));
            return {
                title: `Fight Breakdown - ${selectedPoint.shortLabel || 'Fight'} (5s Damage Buckets)`,
                data,
                downLabels: [] as string[],
                deathLabels: [] as string[],
                downIndices: precomputedDownIndices.filter((idx) => idx < data.length),
                deathIndices: precomputedDeathIndices.filter((idx) => idx < data.length)
            };
        }
        return {
            title: `Fight Breakdown - ${selectedPoint.shortLabel || 'Fight'}`,
            data: [] as Array<{ label: string; value: number }>,
            downLabels: [] as string[],
            deathLabels: [] as string[],
            downIndices: [] as number[],
            deathIndices: [] as number[]
        };
    }, [selectedIncomingStrikeFightIndex, incomingStrikeChartData, selectedIncomingStrikePlayerKey, incomingStrikeDamageData.fights]);

    const incomingStrikeFightSkillRows = useMemo(() => {
        if (selectedIncomingStrikeFightIndex === null || !selectedIncomingStrikePlayerKey) return [];
        const selectedPoint = incomingStrikeChartData.find((point) => point.index === selectedIncomingStrikeFightIndex);
        if (!selectedPoint) return [];
        const selectedFight = incomingStrikeDamageData.fights.find((fight, index) => (
            String(fight.id || '') === String(selectedPoint.fightId || '')
            || index === selectedPoint.index
        ));
        const rows = selectedFight?.values?.[selectedIncomingStrikePlayerKey]?.skillRows || [];
        return [...rows]
            .filter((row) => Number(row?.damage || 0) > 0)
            .sort((a, b) => Number(b.damage || 0) - Number(a.damage || 0))
            .slice(0, 30);
    }, [selectedIncomingStrikeFightIndex, selectedIncomingStrikePlayerKey, incomingStrikeChartData, incomingStrikeDamageData.fights]);
    const spikeFightSkillRows = useMemo(() => {
        if (selectedSpikeFightIndex === null || !selectedSpikePlayerKey) return [];
        const selectedPoint = spikeChartData.find((point) => point.index === selectedSpikeFightIndex);
        if (!selectedPoint) return [];
        const selectedFight = spikeDamageData.fights.find((fight, index) => (
            String(fight.id || '') === String(selectedPoint.fightId || '')
            || index === selectedPoint.index
        ));
        const rows = selectedFight?.values?.[selectedSpikePlayerKey]?.skillRows || [];
        return [...rows]
            .filter((row) => Number(row?.damage || 0) > 0)
            .sort((a, b) => Number(b.damage || 0) - Number(a.damage || 0))
            .slice(0, 30);
    }, [selectedSpikeFightIndex, selectedSpikePlayerKey, spikeChartData, spikeDamageData.fights]);

    useEffect(() => {
        if (playerSkillBreakdowns.length === 0) {
            if (activePlayerBreakdownKey !== null) setActivePlayerBreakdownKey(null);
            if (activePlayerBreakdownSkillId !== null) setActivePlayerBreakdownSkillId(null);
            return;
        }
        if (!activePlayerBreakdownKey || !playerSkillBreakdownMap.has(activePlayerBreakdownKey)) {
            const nextPlayerKey = playerSkillBreakdowns[0].key;
            setActivePlayerBreakdownKey(nextPlayerKey);
            setExpandedPlayerBreakdownKey(null);
        }
    }, [
        playerSkillBreakdowns,
        playerSkillBreakdownMap,
        activePlayerBreakdownKey,
        activePlayerBreakdownSkillId
    ]);

    useEffect(() => {
        if (!activePlayerBreakdown || activePlayerBreakdown.skills.length === 0) {
            if (activePlayerBreakdownSkillId !== null) setActivePlayerBreakdownSkillId(null);
            return;
        }
        const hasSkill = activePlayerBreakdown.skills.some((skill) => skill.id === activePlayerBreakdownSkillId);
        if (!activePlayerBreakdownSkillId || !hasSkill) {
            setActivePlayerBreakdownSkillId(activePlayerBreakdown.skills[0].id);
        }
    }, [activePlayerBreakdown, activePlayerBreakdownSkillId]);

    useEffect(() => {
        if (classSkillBreakdowns.length === 0) {
            if (activeClassBreakdownKey !== null) setActiveClassBreakdownKey(null);
            if (activeClassBreakdownSkillId !== null) setActiveClassBreakdownSkillId(null);
            return;
        }
        if (!activeClassBreakdownKey || !classBreakdownMap.has(activeClassBreakdownKey)) {
            const nextClassKey = classSkillBreakdowns[0].profession;
            setActiveClassBreakdownKey(nextClassKey);
            setExpandedClassBreakdownKey(null);
        }
    }, [
        classSkillBreakdowns,
        classBreakdownMap,
        activeClassBreakdownKey,
        activeClassBreakdownSkillId
    ]);

    useEffect(() => {
        if (!activeClassBreakdown || activeClassBreakdown.skills.length === 0) {
            if (activeClassBreakdownSkillId !== null) setActiveClassBreakdownSkillId(null);
            return;
        }
        const hasSkill = activeClassBreakdown.skills.some((skill) => skill.id === activeClassBreakdownSkillId);
        if (!activeClassBreakdownSkillId || !hasSkill) {
            setActiveClassBreakdownSkillId(activeClassBreakdown.skills[0].id);
        }
    }, [activeClassBreakdown, activeClassBreakdownSkillId]);

    useEffect(() => {
        if (spikeDamageData.players.length === 0) {
            if (selectedSpikePlayerKey !== null) setSelectedSpikePlayerKey(null);
            return;
        }
        if (!selectedSpikePlayerKey || !spikePlayerMap.has(selectedSpikePlayerKey)) {
            if (selectedSpikePlayerKey !== null) setSelectedSpikePlayerKey(null);
        }
    }, [spikeDamageData.players, spikePlayerMap, selectedSpikePlayerKey]);

    useEffect(() => {
        setSelectedSpikeFightIndex(null);
    }, [selectedSpikePlayerKey, spikeMode]);

    useEffect(() => {
        if (selectedSpikeFightIndex === null) return;
        const exists = spikeChartData.some((point) => point.index === selectedSpikeFightIndex);
        if (!exists) setSelectedSpikeFightIndex(null);
    }, [spikeChartData, selectedSpikeFightIndex]);

    useEffect(() => {
        if (incomingStrikeDamageData.players.length === 0) {
            if (selectedIncomingStrikePlayerKey !== null) setSelectedIncomingStrikePlayerKey(null);
            return;
        }
        if (!selectedIncomingStrikePlayerKey || !incomingStrikePlayerMap.has(selectedIncomingStrikePlayerKey)) {
            if (selectedIncomingStrikePlayerKey !== null) setSelectedIncomingStrikePlayerKey(null);
        }
    }, [incomingStrikeDamageData.players, incomingStrikePlayerMap, selectedIncomingStrikePlayerKey]);

    useEffect(() => {
        setSelectedIncomingStrikeFightIndex(null);
    }, [selectedIncomingStrikePlayerKey, incomingStrikeMode]);

    useEffect(() => {
        if (selectedIncomingStrikeFightIndex === null) return;
        const exists = incomingStrikeChartData.some((point) => point.index === selectedIncomingStrikeFightIndex);
        if (!exists) setSelectedIncomingStrikeFightIndex(null);
    }, [incomingStrikeChartData, selectedIncomingStrikeFightIndex]);

    const selectedPlayersSet = useMemo(() => new Set(selectedPlayers), [selectedPlayers]);

    const {
        playerMapByKey,
        playerTotalsForSkill,
        skillChartData,
        skillChartMaxY,
        groupedSkillUsagePlayers
    } = useSkillCharts({
        skillUsageData,
        selectedSkillId,
        selectedPlayers: selectedPlayersSet,
        skillUsageView: skillUsageView === 'perSecond' ? 'perSecond' : 'total'
    });

    const normalizeConditionData = useMemo(() => {
        const iconByName = new Map<string, string>();
        const absorbIcons = (entries: any[]) => {
            entries.forEach((entry) => {
                const name = normalizeConditionLabel(entry?.name) || entry?.name;
                if (!name) return;
                if (entry?.icon && !iconByName.has(name)) iconByName.set(name, entry.icon);
            });
        };
        const absorbPlayerIcons = (players: any[]) => {
            players.forEach((player) => {
                Object.entries(player?.conditions || {}).forEach(([rawName, cond]: any) => {
                    const name = normalizeConditionLabel(rawName) || rawName;
                    if (cond?.icon && !iconByName.has(name)) iconByName.set(name, cond.icon);
                });
            });
        };

        const normalizeSummary = (summary: any[]) => {
            const merged = new Map<string, any>();
            summary.forEach((entry) => {
                const name = normalizeConditionLabel(entry?.name) || entry?.name;
                if (!name) return;
                const existing = merged.get(name) || {
                    name,
                    icon: entry?.icon || iconByName.get(name) || getDefaultConditionIcon(name),
                    applications: 0,
                    damage: 0,
                    applicationsFromUptime: 0,
                    applicationsFromBuffs: 0,
                    applicationsFromBuffsActive: 0
                };
                existing.applications += Number(entry?.applications || 0);
                existing.damage += Number(entry?.damage || 0);
                if (entry?.applicationsFromUptime) {
                    existing.applicationsFromUptime += Number(entry.applicationsFromUptime || 0);
                }
                if (entry?.applicationsFromBuffs) {
                    existing.applicationsFromBuffs += Number(entry.applicationsFromBuffs || 0);
                }
                if (entry?.applicationsFromBuffsActive) {
                    existing.applicationsFromBuffsActive += Number(entry.applicationsFromBuffsActive || 0);
                }
                if (!existing.icon && entry?.icon) existing.icon = entry.icon;
                if (!existing.icon) existing.icon = getDefaultConditionIcon(name);
                merged.set(name, existing);
            });
            return Array.from(merged.values());
        };

        const normalizePlayers = (players: any[]) => players.map((player) => {
            const mergedConditions: Record<string, any> = {};
            Object.entries(player?.conditions || {}).forEach(([rawName, cond]: any) => {
                const name = normalizeConditionLabel(rawName) || rawName;
                if (!name) return;
                const existing = mergedConditions[name] || {
                    icon: cond?.icon || iconByName.get(name) || getDefaultConditionIcon(name),
                    applications: 0,
                    damage: 0,
                    applicationsFromUptime: 0,
                    applicationsFromBuffs: 0,
                    applicationsFromBuffsActive: 0,
                    skills: {}
                };
                existing.applications += Number(cond?.applications || 0);
                existing.damage += Number(cond?.damage || 0);
                if (cond?.applicationsFromUptime) {
                    existing.applicationsFromUptime += Number(cond.applicationsFromUptime || 0);
                }
                if (cond?.applicationsFromBuffs) {
                    existing.applicationsFromBuffs += Number(cond.applicationsFromBuffs || 0);
                }
                if (cond?.applicationsFromBuffsActive) {
                    existing.applicationsFromBuffsActive += Number(cond.applicationsFromBuffsActive || 0);
                }
                if (!existing.icon && cond?.icon) existing.icon = cond.icon;
                if (!existing.icon) existing.icon = getDefaultConditionIcon(name);
                Object.values(cond?.skills || {}).forEach((skill: any) => {
                    const skillName = skill?.name || 'Unknown';
                    const skillEntry = existing.skills[skillName] || { name: skillName, hits: 0, damage: 0, icon: skill?.icon };
                    skillEntry.hits += Number(skill?.hits || 0);
                    skillEntry.damage += Number(skill?.damage || 0);
                    if (!skillEntry.icon && skill?.icon) skillEntry.icon = skill.icon;
                    existing.skills[skillName] = skillEntry;
                });
                mergedConditions[name] = existing;
            });
            return { ...player, conditions: mergedConditions };
        });

        return (summary: any[], players: any[]) => {
            absorbIcons(summary);
            absorbPlayerIcons(players);
            return {
                summary: normalizeSummary(summary),
                players: normalizePlayers(players)
            };
        };
    }, []);

    const conditionRawSummary = conditionDirection === 'outgoing' ? safeStats.outgoingConditionSummary : safeStats.incomingConditionSummary;
    const conditionRawPlayers = conditionDirection === 'outgoing' ? safeStats.outgoingConditionPlayers : safeStats.incomingConditionPlayers;
    const { summary: conditionSummary, players: conditionPlayers } = useMemo(
        () => normalizeConditionData(conditionRawSummary || [], conditionRawPlayers || []),
        [normalizeConditionData, conditionRawSummary, conditionRawPlayers]
    );
    useEffect(() => {
        if (activeConditionName === 'all') return;
        if (conditionSummary.some((entry: any) => entry.name === activeConditionName)) return;
        const normalized = normalizeConditionLabel(activeConditionName);
        if (normalized && conditionSummary.some((entry: any) => entry.name === normalized)) {
            setActiveConditionName(normalized);
        } else {
            setActiveConditionName('all');
        }
    }, [activeConditionName, conditionSummary, setActiveConditionName]);

    // Define classMaxTotals to fix undefined variable error
    const classMaxTotals = useMemo(() => {
        const totals: Record<string, number> = {};
        playerTotalsForSkill.forEach((total, playerKey) => {
            const player = playerMapByKey.get(playerKey);
            if (!player) return;
            const prof = player.profession;
            if (!totals[prof] || total > totals[prof]) {
                totals[prof] = total;
            }
        });
        return totals;
    }, [playerTotalsForSkill, playerMapByKey]);

    const isSectionVisible = useCallback(
        (id: string) => (sectionVisibility ? sectionVisibility(id) : true),
        [sectionVisibility]
    );
    const sectionClass = useCallback((id: string, base: string) => {
        const visible = isSectionVisible(id);
        if (sectionVisibility) {
            return `${base} ${visible ? '' : 'hidden'}`;
        }
        return `${base} transition-[opacity,transform] duration-700 ease-in-out ${visible
            ? 'opacity-100 translate-y-0 max-h-[99999px]'
            : 'opacity-0 -translate-y-2 max-h-0 h-0 min-h-0 overflow-hidden pointer-events-none p-0 !p-0 m-0 !mb-0 !mt-0 border-0 !border-0 border-transparent'}`;
    }, [isSectionVisible, sectionVisibility]);
    const firstVisibleSectionId = useMemo(
        () => ORDERED_SECTION_IDS.find((id) => isSectionVisible(id)) || null,
        [isSectionVisible]
    );
    const isFirstVisibleSection = useCallback((id: string) => id === firstVisibleSectionId, [firstVisibleSectionId]);
    const classRankByPlayer = useMemo(() => {
        const ranks = new Map<string, number>();
        const grouped = new Map<string, Array<{ key: string; total: number }>>();
        selectedPlayers.forEach((playerKey) => {
            const player = playerMapByKey.get(playerKey);
            if (!player) return;
            const total = playerTotalsForSkill.get(playerKey) ?? 0;
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
        const total = playerTotalsForSkill.get(playerKey) ?? 0;
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

    const adjustHexColor = (hex: string, factor: number) => { // Keep adjustHexColor
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

    const skillMetaById = useMemo(() => {
        const map = new Map<string, { name: string; icon?: string }>();
        skillUsageData.skillOptions.forEach((option) => {
            map.set(option.id, { name: option.name, icon: option.icon });
        });
        return map;
    }, [skillUsageData.skillOptions]);

    const skillBarData = useMemo(() => {
        if (selectedPlayers.length === 0) return [];
        const totals = new Map<string, number>();
        const classTotals = new Map<string, number>();
        let totalActiveSeconds = 0;
        selectedPlayers.forEach((playerKey) => {
            const player = playerMapByKey.get(playerKey);
            if (!player) return;
            totalActiveSeconds += player.totalActiveSeconds || 0;
            Object.entries(player.skillTotals || {}).forEach(([skillId, count]) => {
                totals.set(skillId, (totals.get(skillId) || 0) + Number(count || 0));
            });
            const profession = player.profession || 'Unknown';
            classTotals.set(profession, (classTotals.get(profession) || 0) + (player.totalActiveSeconds || 0));
        });
        const term = skillUsageSkillFilter.trim().toLowerCase();
        const isPerSecond = skillUsageView === 'perSecond';
        const dominantProfession = Array.from(classTotals.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
        const dominantColor = getProfessionColor(dominantProfession) || '#38bdf8';
        const accentFallback = '#64748b';
        const entries = Array.from(totals.entries())
            .map(([skillId, total]) => {
                const meta = skillMetaById.get(skillId);
                const name = meta?.name || skillId;
                const value = isPerSecond && totalActiveSeconds > 0 ? total / totalActiveSeconds : total;
                return { skillId, name, icon: meta?.icon, total: value };
            })
            .filter((entry) => entry.total > 0 && (!term || entry.name.toLowerCase().includes(term)))
            .sort((a, b) => b.total - a.total);
        return entries.map((entry, index) => ({
            ...entry,
            color: index === 0 ? dominantColor : adjustHexColor(dominantColor, 0.85 - Math.min(index * 0.06, 0.4)) || accentFallback
        }));
    }, [selectedPlayers, playerMapByKey, skillUsageSkillFilter, skillUsageView, skillMetaById]);

    useEffect(() => {
        if (skillBarData.length === 0) {
            if (selectedSkillId !== null) setSelectedSkillId(null);
            return;
        }
        if (!selectedSkillId || !skillBarData.some((entry) => entry.skillId === selectedSkillId)) {
            setSelectedSkillId(skillBarData[0].skillId);
        }
    }, [skillBarData, selectedSkillId, setSelectedSkillId]);

    const selectedSkillMeta = skillUsageData.skillOptions.find((option) => option.id === selectedSkillId);
    const selectedSkillName = selectedSkillMeta?.name || '';
    const selectedSkillIcon = selectedSkillMeta?.icon || null;
    const skillUsageReady = skillUsageAvailable && Boolean(selectedSkillId) && selectedPlayers.length > 0;

    const ALL_SKILLS_KEY = '__all__';

    const apmSpecAvailable = skillUsageAvailable && apmSpecTables.length > 0;
    const activeApmSpecTable = useMemo(
        () => apmSpecTables.find((spec) => spec.profession === activeApmSpec) ?? null,
        [apmSpecTables, activeApmSpec]
    );
    const isAllApmSkills = activeApmSkillId === ALL_SKILLS_KEY;
    const activeApmSkill = useMemo(
        () => activeApmSpecTable?.skills?.find((skill) => skill.id === activeApmSkillId) ?? null,
        [activeApmSpecTable, activeApmSkillId]
    );

    useEffect(() => {
        if (apmSpecTables.length === 0) {
            if (activeApmSpec !== null) {
                setActiveApmSpec(null);
            }
            if (expandedApmSpec !== null) {
                setExpandedApmSpec(null);
            }
            return;
        }
        if (!activeApmSpec || !apmSpecTables.some((spec) => spec.profession === activeApmSpec)) {
            const nextSpec = apmSpecTables[0].profession;
            setActiveApmSpec(nextSpec);
            setExpandedApmSpec(null);
        }
    }, [apmSpecTables, activeApmSpec, expandedApmSpec]);

    useEffect(() => {
        if (!activeApmSpecTable || activeApmSpecTable.skills.length === 0) {
            if (activeApmSkillId !== null) {
                setActiveApmSkillId(null);
            }
            return;
        }
        const hasSkill = activeApmSpecTable.skills.some((skill) => skill.id === activeApmSkillId);
        if (!activeApmSkillId || (!hasSkill && activeApmSkillId !== ALL_SKILLS_KEY)) {
            setActiveApmSkillId(ALL_SKILLS_KEY);
        }
    }, [activeApmSpecTable, activeApmSkillId]);

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
        const tables = safeStats.boonTables || [];
        if (!term) return tables;
        return tables.filter((boon: any) => boon.name.toLowerCase().includes(term));
    }, [safeStats.boonTables, boonSearch]);
    const activeBoonTable = useMemo(() => {
        if (!activeBoonTab) return null;
        return (safeStats.boonTables || []).find((boon: any) => boon.id === activeBoonTab) ?? null;
    }, [safeStats.boonTables, activeBoonTab]);
    const filteredSpecialTables = useMemo(() => {
        const term = specialSearch.trim().toLowerCase();
        const sorted = [...(safeStats.specialTables || [])].sort((a: any, b: any) => a.name.localeCompare(b.name));
        if (!term) return sorted;
        return sorted.filter((buff: any) => buff.name.toLowerCase().includes(term));
    }, [safeStats.specialTables, specialSearch]);
    const sigilRelicTables = useMemo(() => {
        const tables = safeStats.specialTables || [];
        return [...tables]
            .filter((buff: any) => /\b(sigil|relic)\b/i.test(String(buff?.name || '')))
            .sort((a: any, b: any) => a.name.localeCompare(b.name));
    }, [safeStats.specialTables]);
    const filteredSigilRelicTables = useMemo(() => {
        const term = sigilRelicSearch.trim().toLowerCase();
        if (!term) return sigilRelicTables;
        return sigilRelicTables.filter((buff: any) => buff.name.toLowerCase().includes(term));
    }, [sigilRelicTables, sigilRelicSearch]);
    const activeSpecialTable = useMemo(() => {
        if (!activeSpecialTab) return null;
        return (safeStats.specialTables || []).find((buff: any) => buff.id === activeSpecialTab) ?? null;
    }, [safeStats.specialTables, activeSpecialTab]);
    const activeSigilRelicTable = useMemo(() => {
        if (!activeSigilRelicTab) return null;
        return sigilRelicTables.find((buff: any) => buff.id === activeSigilRelicTab) ?? null;
    }, [sigilRelicTables, activeSigilRelicTab]);

    useEffect(() => {
        if (!safeStats.boonTables || safeStats.boonTables.length === 0) return;
        if (!activeBoonTab || !safeStats.boonTables.some((tab: any) => tab.id === activeBoonTab)) {
            setActiveBoonTab(safeStats.boonTables[0].id);
        }
    }, [safeStats.boonTables, activeBoonTab]);

    useEffect(() => {
        if (!safeStats.specialTables || safeStats.specialTables.length === 0) return;
        if (!activeSpecialTab || !safeStats.specialTables.some((tab: any) => tab.id === activeSpecialTab)) {
            setActiveSpecialTab(safeStats.specialTables[0].id);
        }
    }, [safeStats.specialTables, activeSpecialTab]);
    useEffect(() => {
        if (!sigilRelicTables || sigilRelicTables.length === 0) {
            if (activeSigilRelicTab !== null) setActiveSigilRelicTab(null);
            return;
        }
        if (!activeSigilRelicTab || !sigilRelicTables.some((tab: any) => tab.id === activeSigilRelicTab)) {
            setActiveSigilRelicTab(sigilRelicTables[0].id);
        }
    }, [sigilRelicTables, activeSigilRelicTab]);

    useEffect(() => {
        const clearSelection = () => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                selection.removeAllRanges();
            }
        };
        const preventChartSelection = (event: Event) => {
            const target = event.target as HTMLElement | null;
            if (!target?.closest?.('.recharts-wrapper')) return;
            event.preventDefault();
            clearSelection();
        };
        document.addEventListener('selectstart', preventChartSelection);
        document.addEventListener('mousedown', preventChartSelection);
        document.addEventListener('mousemove', preventChartSelection);
        document.addEventListener('dragstart', preventChartSelection);
        return () => {
            document.removeEventListener('selectstart', preventChartSelection);
            document.removeEventListener('mousedown', preventChartSelection);
            document.removeEventListener('mousemove', preventChartSelection);
            document.removeEventListener('dragstart', preventChartSelection);
        };
    }, []);



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

    const sortByCountDesc = (a: any, b: any) => {
        const diff = (b?.value || 0) - (a?.value || 0);
        if (diff !== 0) return diff;
        return String(a?.name || '').localeCompare(String(b?.name || ''));
    };
    const squadClassData = Array.isArray(safeStats?.squadClassData) ? safeStats.squadClassData : [];
    const enemyClassData = Array.isArray(safeStats?.enemyClassData) ? safeStats.enemyClassData : [];
    const attendanceData = Array.isArray(safeStats?.attendanceData) ? safeStats.attendanceData : [];
    const squadCompByFight = Array.isArray(safeStats?.squadCompByFight) ? safeStats.squadCompByFight : [];
    const fightBreakdownRows = Array.isArray(safeStats?.fightBreakdown) ? safeStats.fightBreakdown : [];
    const fightCompByFight = useMemo(() => {
        const breakdownById = new Map<string, any>();
        fightBreakdownRows.forEach((fight: any) => {
            const id = String(fight?.id || '');
            if (id) breakdownById.set(id, fight);
        });
        return squadCompByFight.map((fight: any) => {
            const match = breakdownById.get(String(fight?.id || '')) || null;
            return {
                ...fight,
                enemyClassCounts: match?.enemyClassCounts || {}
            };
        });
    }, [squadCompByFight, fightBreakdownRows]);
    const sortedSquadClassData = useMemo(() => [...squadClassData].sort(sortByCountDesc), [squadClassData]);
    const sortedEnemyClassData = useMemo(() => [...enemyClassData].sort(sortByCountDesc), [enemyClassData]);

    const useModernLayout = false;
    const containerClass = embedded
        ? 'stats-view min-h-screen flex flex-col p-0 w-full max-w-none'
        : 'stats-view h-full flex flex-col p-1 w-full max-w-none overflow-hidden';
    const scrollContainerClass = embedded
        ? `stats-sections space-y-0 min-h-0 px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4 rounded-xl border border-white/5 ${expandedSection ? '' : 'backdrop-blur-xl'
        }`
        : `flex-1 overflow-y-auto pr-2 space-y-6 min-h-0 border border-white/5 p-4 rounded-xl ${expandedSection ? '' : 'backdrop-blur-2xl'
        }`;
    const scrollContainerStyle: CSSProperties | undefined = (embedded && uiTheme !== 'matte' && uiTheme !== 'kinetic')
        ? {
            backgroundColor: 'rgba(3, 7, 18, 0.75)',
            backgroundImage: 'linear-gradient(160deg, rgba(var(--accent-rgb), 0.12), rgba(var(--accent-rgb), 0.04) 70%)'
        }
        : (embedded && uiTheme === 'kinetic')
            ? {
                backgroundColor: 'var(--bg-elevated)',
                backgroundImage: 'none'
            }
            : undefined;


    const formatSkillUsageValue = (val: number) => {
        return skillUsageView === 'perSecond'
            ? val.toFixed(1)
            : Math.round(val).toLocaleString();
    };

    const formatCastRateValue = (val: number) => val.toFixed(1);
    const formatCastCountValue = (val: number) => Math.round(val).toLocaleString();
    const formatApmValue = (val: any) => {
        if (typeof val === 'number' && Number.isFinite(val)) return val.toFixed(1);
        return '0.0';
    };

    const renderProfessionIcon = renderProfessionIconShared;

    return (
        <div className={containerClass}>
            {expandedSection && (
                <div
                    className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-md modal-backdrop ${expandedSectionClosing ? 'modal-backdrop-exit' : 'modal-backdrop-enter'
                        }`}
                    onClick={closeExpandedSection}
                />
            )}
            <StatsHeader
                embedded={embedded}
                dashboardTitle={dashboardTitle}
                totalLogs={safeStats.total}
                onBack={onBack}
                devMockAvailable={devMockAvailable}
                devMockUploadState={devMockUploadState}
                onDevMockUpload={handleDevMockUpload}
                uploadingWeb={uploadingWeb}
                onWebUpload={handleWebUpload}
                sharing={sharing}
                canShareDiscord={canShareDiscord}
                onShare={handleShare}
            />

            <WebUploadBanner
                embedded={embedded}
                webUploadMessage={webUploadMessage}
                webUploadUrl={webUploadUrl}
                webUploadBuildStatus={webUploadBuildStatus}
                webCopyStatus={webCopyStatus}
                setWebCopyStatus={setWebCopyStatus}
            />

            <DevMockBanner
                embedded={embedded}
                devMockAvailable={devMockAvailable}
                devMockUploadState={devMockUploadState}
            />

            <div className={embedded ? '' : 'flex-1 min-h-0 flex'}>
                <div
                    id="stats-dashboard-container"
                    ref={scrollContainerRef}
                    className={`${scrollContainerClass} ${embedded ? '' : 'flex-1'}`}
                    style={scrollContainerStyle}
                >
                {useModernLayout ? (
                    <div className="stats-layout stats-layout-modern grid gap-4 grid-cols-1">
                        <div className="space-y-4 min-w-0">
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <OverviewSection
                                    stats={safeStats}
                                    isSectionVisible={isSectionVisible}
                                    isFirstVisibleSection={isFirstVisibleSection}
                                    sectionClass={sectionClass}
                                />

                                <FightBreakdownSection
                                    stats={safeStats}
                                    fightBreakdownTab={fightBreakdownTab}
                                    setFightBreakdownTab={setFightBreakdownTab}
                                    isSectionVisible={isSectionVisible}
                                    isFirstVisibleSection={isFirstVisibleSection}
                                    sectionClass={sectionClass}
                                />

                                <TopPlayersSection
                                    stats={safeStats}
                                    showTopStats={showTopStats}
                                    showMvp={showMvp}
                                    topStatsMode={topStatsMode}
                                    expandedLeader={expandedLeader}
                                    setExpandedLeader={setExpandedLeader}
                                    formatTopStatValue={formatTopStatValue}
                                    formatWithCommas={formatWithCommas}
                                    isMvpStatEnabled={isMvpStatEnabled}
                                    renderProfessionIcon={renderProfessionIcon}
                                    isSectionVisible={isSectionVisible}
                                    isFirstVisibleSection={isFirstVisibleSection}
                                    sectionClass={sectionClass}
                                />
                            </div>

                            <TopSkillsSection
                                stats={safeStats}
                                topSkillsMetric={topSkillsMetric}
                                onTopSkillsMetricChange={updateTopSkillsMetric}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                            />

                            <BoonOutputSection
                                stats={safeStats}
                                activeBoonCategory={activeBoonCategory}
                                setActiveBoonCategory={(val: string) => setActiveBoonCategory(val as BoonCategory)}
                                activeBoonMetric={activeBoonMetric}
                                setActiveBoonMetric={setActiveBoonMetric}
                                activeBoonTab={activeBoonTab}
                                setActiveBoonTab={setActiveBoonTab}
                                activeBoonTable={activeBoonTable}
                                filteredBoonTables={filteredBoonTables}
                                boonSearch={boonSearch}
                                setBoonSearch={setBoonSearch}
                                formatBoonMetricDisplay={formatBoonMetricDisplay}
                                getBoonMetricValue={getBoonMetricValue}
                                renderProfessionIcon={renderProfessionIcon}
                                roundCountStats={roundCountStats}
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                sidebarListClass={sidebarListClass}
                            />

                            <OffenseSection
                                stats={safeStats}
                                OFFENSE_METRICS={OFFENSE_METRICS}
                                roundCountStats={roundCountStats}
                                offenseSearch={offenseSearch}
                                setOffenseSearch={setOffenseSearch}
                                activeOffenseStat={activeOffenseStat}
                                setActiveOffenseStat={setActiveOffenseStat}
                                offenseViewMode={offenseViewMode}
                                setOffenseViewMode={setOffenseViewMode}
                                formatWithCommas={formatWithCommas}
                                renderProfessionIcon={renderProfessionIcon}
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                sidebarListClass={sidebarListClass}
                            />

                            <PlayerBreakdownSection
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                sidebarListClass={sidebarListClass}
                                viewMode={playerBreakdownViewMode}
                                setViewMode={setPlayerBreakdownViewMode}
                                playerSkillBreakdowns={playerSkillBreakdowns}
                                classSkillBreakdowns={classSkillBreakdowns}
                                activePlayerKey={activePlayerBreakdownKey}
                                setActivePlayerKey={setActivePlayerBreakdownKey}
                                expandedPlayerKey={expandedPlayerBreakdownKey}
                                setExpandedPlayerKey={setExpandedPlayerBreakdownKey}
                                activePlayerSkillId={activePlayerBreakdownSkillId}
                                setActivePlayerSkillId={setActivePlayerBreakdownSkillId}
                                activeClassKey={activeClassBreakdownKey}
                                setActiveClassKey={setActiveClassBreakdownKey}
                                expandedClassKey={expandedClassBreakdownKey}
                                setExpandedClassKey={setExpandedClassBreakdownKey}
                                activeClassSkillId={activeClassBreakdownSkillId}
                                setActiveClassSkillId={setActiveClassBreakdownSkillId}
                                skillSearch={playerBreakdownSkillSearch}
                                setSkillSearch={setPlayerBreakdownSkillSearch}
                                activePlayerBreakdown={activePlayerBreakdown}
                                activePlayerSkill={activePlayerSkill}
                                activeClassBreakdown={activeClassBreakdown}
                                activeClassSkill={activeClassSkill}
                                renderProfessionIcon={renderProfessionIcon}
                            />

                            <SpikeDamageSection
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                spikePlayerFilter={spikePlayerFilter}
                                setSpikePlayerFilter={setSpikePlayerFilter}
                                groupedSpikePlayers={groupedSpikePlayers}
                                spikeMode={spikeMode}
                                setSpikeMode={setSpikeMode}
                                selectedSpikePlayerKey={selectedSpikePlayerKey}
                                setSelectedSpikePlayerKey={setSelectedSpikePlayerKey}
                                selectedSpikePlayer={selectedSpikePlayer}
                                spikeChartData={spikeChartData}
                                spikeChartMaxY={spikeChartMaxY}
                                selectedSpikeFightIndex={selectedSpikeFightIndex}
                                setSelectedSpikeFightIndex={setSelectedSpikeFightIndex}
                                spikeDrilldownTitle={spikeDrilldown.title}
                                spikeDrilldownData={spikeDrilldown.data}
                                spikeDrilldownDownIndices={spikeDrilldown.downIndices}
                                spikeDrilldownDeathIndices={spikeDrilldown.deathIndices}
                                spikeFightSkillRows={spikeFightSkillRows}
                                spikeFightSkillTitle="Outgoing Skill Damage (Selected Fight)"
                                formatWithCommas={formatWithCommas}
                                renderProfessionIcon={renderProfessionIcon}
                            />

                            <ConditionsSection
                                conditionSummary={conditionSummary}
                                conditionPlayers={conditionPlayers}
                                conditionSearch={conditionSearch}
                                setConditionSearch={setConditionSearch}
                                activeConditionName={activeConditionName}
                                setActiveConditionName={setActiveConditionName}
                                conditionDirection={conditionDirection}
                                setConditionDirection={setConditionDirection}
                                conditionGridClass={conditionGridClass}
                                effectiveConditionSort={effectiveConditionSort as any}
                                setConditionSort={setConditionSort as any}
                                showConditionDamage={showConditionDamage}
                                renderProfessionIcon={renderProfessionIcon}
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                sidebarListClass={sidebarListClass}
                            />

                            <DefenseSection
                                stats={safeStats}
                                DEFENSE_METRICS={DEFENSE_METRICS}
                                defenseSearch={defenseSearch}
                                setDefenseSearch={setDefenseSearch}
                                activeDefenseStat={activeDefenseStat}
                                setActiveDefenseStat={setActiveDefenseStat}
                                defenseViewMode={defenseViewMode}
                                setDefenseViewMode={setDefenseViewMode}
                                roundCountStats={roundCountStats}
                                formatWithCommas={formatWithCommas}
                                renderProfessionIcon={renderProfessionIcon}
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                sidebarListClass={sidebarListClass}
                            />

                            <SpikeDamageSection
                                sectionId="incoming-strike-damage"
                                title="Incoming Strike Damage"
                                subtitle="Select one enemy class to chart incoming strike pressure per fight."
                                listTitle="Enemy Classes"
                                searchPlaceholder="Search enemy class"
                                titleIconClassName="text-cyan-300"
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                spikePlayerFilter={incomingStrikePlayerFilter}
                                setSpikePlayerFilter={setIncomingStrikePlayerFilter}
                                groupedSpikePlayers={groupedIncomingStrikePlayers}
                                spikeMode={incomingStrikeMode}
                                setSpikeMode={setIncomingStrikeMode}
                                selectedSpikePlayerKey={selectedIncomingStrikePlayerKey}
                                setSelectedSpikePlayerKey={setSelectedIncomingStrikePlayerKey}
                                selectedSpikePlayer={selectedIncomingStrikePlayer}
                                spikeChartData={incomingStrikeChartData}
                                spikeChartMaxY={incomingStrikeChartMaxY}
                                selectedSpikeFightIndex={selectedIncomingStrikeFightIndex}
                                setSelectedSpikeFightIndex={setSelectedIncomingStrikeFightIndex}
                                spikeDrilldownTitle={incomingStrikeDrilldown.title}
                                spikeDrilldownData={incomingStrikeDrilldown.data}
                                spikeDrilldownDownIndices={incomingStrikeDrilldown.downIndices}
                                spikeDrilldownDeathIndices={incomingStrikeDrilldown.deathIndices}
                                spikeFightSkillRows={incomingStrikeFightSkillRows}
                                spikeFightSkillTitle="Incoming Skill Damage (Selected Fight)"
                                formatWithCommas={formatWithCommas}
                                renderProfessionIcon={renderProfessionIcon}
                            />

                            <DamageMitigationSection
                                stats={safeStats}
                                DAMAGE_MITIGATION_METRICS={DAMAGE_MITIGATION_METRICS}
                                damageMitigationSearch={damageMitigationSearch}
                                setDamageMitigationSearch={setDamageMitigationSearch}
                                activeDamageMitigationStat={activeDamageMitigationStat}
                                setActiveDamageMitigationStat={setActiveDamageMitigationStat}
                                damageMitigationViewMode={damageMitigationViewMode}
                                setDamageMitigationViewMode={setDamageMitigationViewMode}
                                damageMitigationScope={damageMitigationScope}
                                setDamageMitigationScope={setDamageMitigationScope}
                                roundCountStats={roundCountStats}
                                formatWithCommas={formatWithCommas}
                                renderProfessionIcon={renderProfessionIcon}
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                sidebarListClass={sidebarListClass}
                            />

                            <SupportSection
                                stats={safeStats}
                                SUPPORT_METRICS={SUPPORT_METRICS}
                                supportSearch={supportSearch}
                                setSupportSearch={setSupportSearch}
                                activeSupportStat={activeSupportStat}
                                setActiveSupportStat={setActiveSupportStat}
                                supportViewMode={supportViewMode}
                                setSupportViewMode={setSupportViewMode}
                                cleanseScope={cleanseScope}
                                setCleanseScope={setCleanseScope}
                                roundCountStats={roundCountStats}
                                formatWithCommas={formatWithCommas}
                                renderProfessionIcon={renderProfessionIcon}
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                sidebarListClass={sidebarListClass}
                            />

                            <HealingSection
                                stats={safeStats}
                                HEALING_METRICS={HEALING_METRICS}
                                activeHealingMetric={activeHealingMetric}
                                setActiveHealingMetric={setActiveHealingMetric}
                                healingCategory={healingCategory}
                                setHealingCategory={setHealingCategory}
                                activeResUtilitySkill={activeResUtilitySkill}
                                setActiveResUtilitySkill={setActiveResUtilitySkill}
                                skillUsageData={skillUsageData}
                                formatWithCommas={formatWithCommas}
                                renderProfessionIcon={renderProfessionIcon}
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                            />

                            <FightDiffModeSection
                                stats={safeStats}
                                formatWithCommas={formatWithCommas}
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                            />

                            <SpecialBuffsSection
                                stats={safeStats}
                                specialSearch={specialSearch}
                                setSpecialSearch={setSpecialSearch}
                                filteredSpecialTables={filteredSpecialTables}
                                activeSpecialTab={activeSpecialTab}
                                setActiveSpecialTab={setActiveSpecialTab}
                                activeSpecialTable={activeSpecialTable}
                                formatWithCommas={formatWithCommas}
                                renderProfessionIcon={renderProfessionIcon}
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                sidebarListClass={sidebarListClass}
                            />

                            <SigilRelicUptimeSection
                                hasSigilRelicTables={sigilRelicTables.length > 0}
                                sigilRelicSearch={sigilRelicSearch}
                                setSigilRelicSearch={setSigilRelicSearch}
                                filteredSigilRelicTables={filteredSigilRelicTables}
                                activeSigilRelicTab={activeSigilRelicTab}
                                setActiveSigilRelicTab={setActiveSigilRelicTab}
                                activeSigilRelicTable={activeSigilRelicTable}
                                formatWithCommas={formatWithCommas}
                                renderProfessionIcon={renderProfessionIcon}
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                sidebarListClass={sidebarListClass}
                            />

                            <SkillUsageSection
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                selectedPlayers={selectedPlayers}
                                setSelectedPlayers={setSelectedPlayers}
                                removeSelectedPlayer={removeSelectedPlayer}
                                playerMapByKey={playerMapByKey}
                                groupedSkillUsagePlayers={groupedSkillUsagePlayers}
                                expandedSkillUsageClass={expandedSkillUsageClass}
                                setExpandedSkillUsageClass={setExpandedSkillUsageClass}
                                togglePlayerSelection={togglePlayerSelection}
                                skillUsagePlayerFilter={skillUsagePlayerFilter}
                                setSkillUsagePlayerFilter={setSkillUsagePlayerFilter}
                                skillUsageView={skillUsageView}
                                setSkillUsageView={setSkillUsageView}
                                skillUsageData={skillUsageData}
                                skillUsageSkillFilter={skillUsageSkillFilter}
                                setSkillUsageSkillFilter={setSkillUsageSkillFilter}
                                selectedSkillId={selectedSkillId}
                                setSelectedSkillId={setSelectedSkillId}
                                skillBarData={skillBarData}
                                selectedSkillName={selectedSkillName}
                                selectedSkillIcon={selectedSkillIcon}
                                skillUsageReady={skillUsageReady}
                                skillUsageAvailable={skillUsageAvailable}
                                isSkillUsagePerSecond={isSkillUsagePerSecond}
                                skillChartData={skillChartData}
                                skillChartMaxY={skillChartMaxY}
                                playerTotalsForSkill={playerTotalsForSkill}
                                hoveredSkillPlayer={hoveredSkillPlayer}
                                setHoveredSkillPlayer={setHoveredSkillPlayer}
                                getLineStrokeColor={getLineStrokeColor}
                                getLineDashForPlayer={getLineDashForPlayer}
                                formatSkillUsageValue={formatSkillUsageValue}
                                renderProfessionIcon={renderProfessionIcon}
                            />

                            <ApmSection
                                expandedSection={expandedSection}
                                expandedSectionClosing={expandedSectionClosing}
                                openExpandedSection={openExpandedSection}
                                closeExpandedSection={closeExpandedSection}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                                sidebarListClass={sidebarListClass}
                                apmSpecAvailable={apmSpecAvailable}
                                skillUsageAvailable={skillUsageAvailable}
                                apmSpecTables={apmSpecTables}
                                activeApmSpec={activeApmSpec}
                                setActiveApmSpec={setActiveApmSpec}
                                expandedApmSpec={expandedApmSpec}
                                setExpandedApmSpec={setExpandedApmSpec}
                                activeApmSkillId={activeApmSkillId}
                                setActiveApmSkillId={setActiveApmSkillId}
                                ALL_SKILLS_KEY={ALL_SKILLS_KEY}
                                apmSkillSearch={apmSkillSearch}
                                setApmSkillSearch={setApmSkillSearch}
                                activeApmSpecTable={activeApmSpecTable}
                                activeApmSkill={activeApmSkill}
                                isAllApmSkills={isAllApmSkills}
                                apmView={apmView}
                                setApmView={setApmView}
                                formatApmValue={formatApmValue}
                                formatCastRateValue={formatCastRateValue}
                                formatCastCountValue={formatCastCountValue}
                                renderProfessionIcon={renderProfessionIcon}
                            />

                        </div>
                        <div className="space-y-4 min-w-0">
                            <SquadCompositionSection
                                sortedSquadClassData={sortedSquadClassData}
                                sortedEnemyClassData={sortedEnemyClassData}
                                getProfessionIconPath={getProfessionIconPath}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                            />

                            <AttendanceSection
                                attendanceRows={attendanceData}
                                getProfessionIconPath={getProfessionIconPath}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                            />

                            <SquadCompByFightSection
                                fights={squadCompByFight}
                                getProfessionIconPath={getProfessionIconPath}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                            />

                            <FightCompSection
                                fights={fightCompByFight}
                                getProfessionIconPath={getProfessionIconPath}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                            />

                            <MapDistributionSection
                                mapData={safeStats.mapData}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                            />

                            <TimelineSection
                                timelineData={safeStats.timelineData}
                                timelineFriendlyScope={timelineFriendlyScope}
                                setTimelineFriendlyScope={setTimelineFriendlyScope}
                                isSectionVisible={isSectionVisible}
                                isFirstVisibleSection={isFirstVisibleSection}
                                sectionClass={sectionClass}
                            />
                        </div>
                    </div>
                ) : (
                    <>
                        {isSectionVisible('overview') && <OverviewSection
                            stats={safeStats}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('fight-breakdown') && <FightBreakdownSection
                            stats={safeStats}
                            fightBreakdownTab={fightBreakdownTab}
                            setFightBreakdownTab={setFightBreakdownTab}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('top-players') && <TopPlayersSection
                            stats={safeStats}
                            showTopStats={showTopStats}
                            showMvp={showMvp}
                            topStatsMode={topStatsMode}
                            expandedLeader={expandedLeader}
                            setExpandedLeader={setExpandedLeader}
                            formatTopStatValue={formatTopStatValue}
                            formatWithCommas={formatWithCommas}
                            isMvpStatEnabled={isMvpStatEnabled}
                            renderProfessionIcon={renderProfessionIcon}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('top-skills-outgoing') && <TopSkillsSection
                            stats={safeStats}
                            topSkillsMetric={topSkillsMetric}
                            onTopSkillsMetricChange={updateTopSkillsMetric}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('squad-composition') && <SquadCompositionSection
                            sortedSquadClassData={sortedSquadClassData}
                            sortedEnemyClassData={sortedEnemyClassData}
                            getProfessionIconPath={getProfessionIconPath}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('attendance-ledger') && <AttendanceSection
                            attendanceRows={attendanceData}
                            getProfessionIconPath={getProfessionIconPath}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('squad-comp-fight') && <SquadCompByFightSection
                            fights={squadCompByFight}
                            getProfessionIconPath={getProfessionIconPath}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('fight-comp') && <FightCompSection
                            fights={fightCompByFight}
                            getProfessionIconPath={getProfessionIconPath}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('timeline') && <TimelineSection
                            timelineData={safeStats.timelineData}
                            timelineFriendlyScope={timelineFriendlyScope}
                            setTimelineFriendlyScope={setTimelineFriendlyScope}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('map-distribution') && <MapDistributionSection
                            mapData={safeStats.mapData}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('offense-detailed') && <OffenseSection
                            stats={safeStats}
                            OFFENSE_METRICS={OFFENSE_METRICS}
                            roundCountStats={roundCountStats}
                            offenseSearch={offenseSearch}
                            setOffenseSearch={setOffenseSearch}
                            activeOffenseStat={activeOffenseStat}
                            setActiveOffenseStat={setActiveOffenseStat}
                            offenseViewMode={offenseViewMode}
                            setOffenseViewMode={setOffenseViewMode}
                            formatWithCommas={formatWithCommas}
                            renderProfessionIcon={renderProfessionIcon}
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            sidebarListClass={sidebarListClass}
                        />}

                        {isSectionVisible('player-breakdown') && <PlayerBreakdownSection
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            sidebarListClass={sidebarListClass}
                            viewMode={playerBreakdownViewMode}
                            setViewMode={setPlayerBreakdownViewMode}
                            playerSkillBreakdowns={playerSkillBreakdowns}
                            classSkillBreakdowns={classSkillBreakdowns}
                            activePlayerKey={activePlayerBreakdownKey}
                            setActivePlayerKey={setActivePlayerBreakdownKey}
                            expandedPlayerKey={expandedPlayerBreakdownKey}
                            setExpandedPlayerKey={setExpandedPlayerBreakdownKey}
                            activePlayerSkillId={activePlayerBreakdownSkillId}
                            setActivePlayerSkillId={setActivePlayerBreakdownSkillId}
                            activeClassKey={activeClassBreakdownKey}
                            setActiveClassKey={setActiveClassBreakdownKey}
                            expandedClassKey={expandedClassBreakdownKey}
                            setExpandedClassKey={setExpandedClassBreakdownKey}
                            activeClassSkillId={activeClassBreakdownSkillId}
                            setActiveClassSkillId={setActiveClassBreakdownSkillId}
                            skillSearch={playerBreakdownSkillSearch}
                            setSkillSearch={setPlayerBreakdownSkillSearch}
                            activePlayerBreakdown={activePlayerBreakdown}
                            activePlayerSkill={activePlayerSkill}
                            activeClassBreakdown={activeClassBreakdown}
                            activeClassSkill={activeClassSkill}
                            renderProfessionIcon={renderProfessionIcon}
                        />}

                        {isSectionVisible('spike-damage') && <SpikeDamageSection
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            spikePlayerFilter={spikePlayerFilter}
                            setSpikePlayerFilter={setSpikePlayerFilter}
                            groupedSpikePlayers={groupedSpikePlayers}
                            spikeMode={spikeMode}
                            setSpikeMode={setSpikeMode}
                            selectedSpikePlayerKey={selectedSpikePlayerKey}
                            setSelectedSpikePlayerKey={setSelectedSpikePlayerKey}
                            selectedSpikePlayer={selectedSpikePlayer}
                            spikeChartData={spikeChartData}
                            spikeChartMaxY={spikeChartMaxY}
                            selectedSpikeFightIndex={selectedSpikeFightIndex}
                            setSelectedSpikeFightIndex={setSelectedSpikeFightIndex}
                            spikeDrilldownTitle={spikeDrilldown.title}
                            spikeDrilldownData={spikeDrilldown.data}
                            spikeDrilldownDownIndices={spikeDrilldown.downIndices}
                            spikeDrilldownDeathIndices={spikeDrilldown.deathIndices}
                            spikeFightSkillRows={spikeFightSkillRows}
                            spikeFightSkillTitle="Outgoing Skill Damage (Selected Fight)"
                            formatWithCommas={formatWithCommas}
                            renderProfessionIcon={renderProfessionIcon}
                        />}

                        {isSectionVisible('conditions-outgoing') && <ConditionsSection
                            conditionSummary={conditionSummary}
                            conditionPlayers={conditionPlayers}
                            conditionSearch={conditionSearch}
                            setConditionSearch={setConditionSearch}
                            activeConditionName={activeConditionName}
                            setActiveConditionName={setActiveConditionName}
                            conditionDirection={conditionDirection}
                            setConditionDirection={setConditionDirection}
                            conditionGridClass={conditionGridClass}
                            effectiveConditionSort={effectiveConditionSort as any}
                            setConditionSort={setConditionSort as any}
                            showConditionDamage={showConditionDamage}
                            renderProfessionIcon={renderProfessionIcon}
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            sidebarListClass={sidebarListClass}
                        />}

                        {isSectionVisible('defense-detailed') && <DefenseSection
                            stats={safeStats}
                            DEFENSE_METRICS={DEFENSE_METRICS}
                            defenseSearch={defenseSearch}
                            setDefenseSearch={setDefenseSearch}
                            activeDefenseStat={activeDefenseStat}
                            setActiveDefenseStat={setActiveDefenseStat}
                            defenseViewMode={defenseViewMode}
                            setDefenseViewMode={setDefenseViewMode}
                            roundCountStats={roundCountStats}
                            formatWithCommas={formatWithCommas}
                            renderProfessionIcon={renderProfessionIcon}
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            sidebarListClass={sidebarListClass}
                        />}

                        {isSectionVisible('incoming-strike-damage') && <SpikeDamageSection
                            sectionId="incoming-strike-damage"
                            title="Incoming Strike Damage"
                            subtitle="Select one enemy class to chart incoming strike pressure per fight."
                            listTitle="Enemy Classes"
                            searchPlaceholder="Search enemy class"
                            titleIconClassName="text-cyan-300"
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            spikePlayerFilter={incomingStrikePlayerFilter}
                            setSpikePlayerFilter={setIncomingStrikePlayerFilter}
                            groupedSpikePlayers={groupedIncomingStrikePlayers}
                            spikeMode={incomingStrikeMode}
                            setSpikeMode={setIncomingStrikeMode}
                            selectedSpikePlayerKey={selectedIncomingStrikePlayerKey}
                            setSelectedSpikePlayerKey={setSelectedIncomingStrikePlayerKey}
                            selectedSpikePlayer={selectedIncomingStrikePlayer}
                            spikeChartData={incomingStrikeChartData}
                            spikeChartMaxY={incomingStrikeChartMaxY}
                            selectedSpikeFightIndex={selectedIncomingStrikeFightIndex}
                            setSelectedSpikeFightIndex={setSelectedIncomingStrikeFightIndex}
                            spikeDrilldownTitle={incomingStrikeDrilldown.title}
                            spikeDrilldownData={incomingStrikeDrilldown.data}
                            spikeDrilldownDownIndices={incomingStrikeDrilldown.downIndices}
                            spikeDrilldownDeathIndices={incomingStrikeDrilldown.deathIndices}
                            spikeFightSkillRows={incomingStrikeFightSkillRows}
                            spikeFightSkillTitle="Incoming Skill Damage (Selected Fight)"
                            formatWithCommas={formatWithCommas}
                            renderProfessionIcon={renderProfessionIcon}
                        />}

                        {isSectionVisible('defense-mitigation') && <DamageMitigationSection
                            stats={safeStats}
                            DAMAGE_MITIGATION_METRICS={DAMAGE_MITIGATION_METRICS}
                            damageMitigationSearch={damageMitigationSearch}
                            setDamageMitigationSearch={setDamageMitigationSearch}
                            activeDamageMitigationStat={activeDamageMitigationStat}
                            setActiveDamageMitigationStat={setActiveDamageMitigationStat}
                            damageMitigationViewMode={damageMitigationViewMode}
                            setDamageMitigationViewMode={setDamageMitigationViewMode}
                            damageMitigationScope={damageMitigationScope}
                            setDamageMitigationScope={setDamageMitigationScope}
                            roundCountStats={roundCountStats}
                            formatWithCommas={formatWithCommas}
                            renderProfessionIcon={renderProfessionIcon}
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            sidebarListClass={sidebarListClass}
                        />}

                        {isSectionVisible('boon-output') && <BoonOutputSection
                            stats={safeStats}
                            activeBoonCategory={activeBoonCategory}
                            setActiveBoonCategory={(val: string) => setActiveBoonCategory(val as BoonCategory)}
                            activeBoonMetric={activeBoonMetric}
                            setActiveBoonMetric={setActiveBoonMetric}
                            activeBoonTab={activeBoonTab}
                            setActiveBoonTab={setActiveBoonTab}
                            activeBoonTable={activeBoonTable}
                            filteredBoonTables={filteredBoonTables}
                            boonSearch={boonSearch}
                            setBoonSearch={setBoonSearch}
                            formatBoonMetricDisplay={formatBoonMetricDisplay}
                            getBoonMetricValue={getBoonMetricValue}
                            renderProfessionIcon={renderProfessionIcon}
                            roundCountStats={roundCountStats}
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            sidebarListClass={sidebarListClass}
                        />}

                        {isSectionVisible('support-detailed') && <SupportSection
                            stats={safeStats}
                            SUPPORT_METRICS={SUPPORT_METRICS}
                            supportSearch={supportSearch}
                            setSupportSearch={setSupportSearch}
                            activeSupportStat={activeSupportStat}
                            setActiveSupportStat={setActiveSupportStat}
                            supportViewMode={supportViewMode}
                            setSupportViewMode={setSupportViewMode}
                            cleanseScope={cleanseScope}
                            setCleanseScope={setCleanseScope}
                            roundCountStats={roundCountStats}
                            formatWithCommas={formatWithCommas}
                            renderProfessionIcon={renderProfessionIcon}
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            sidebarListClass={sidebarListClass}
                        />}

                        {isSectionVisible('healing-stats') && <HealingSection
                            stats={safeStats}
                            HEALING_METRICS={HEALING_METRICS}
                            activeHealingMetric={activeHealingMetric}
                            setActiveHealingMetric={setActiveHealingMetric}
                            healingCategory={healingCategory}
                            setHealingCategory={setHealingCategory}
                            activeResUtilitySkill={activeResUtilitySkill}
                            setActiveResUtilitySkill={setActiveResUtilitySkill}
                            skillUsageData={skillUsageData}
                            formatWithCommas={formatWithCommas}
                            renderProfessionIcon={renderProfessionIcon}
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('fight-diff-mode') && <FightDiffModeSection
                            stats={safeStats}
                            formatWithCommas={formatWithCommas}
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />}

                        {isSectionVisible('special-buffs') && <SpecialBuffsSection
                            stats={safeStats}
                            specialSearch={specialSearch}
                            setSpecialSearch={setSpecialSearch}
                            filteredSpecialTables={filteredSpecialTables}
                            activeSpecialTab={activeSpecialTab}
                            setActiveSpecialTab={setActiveSpecialTab}
                            activeSpecialTable={activeSpecialTable}
                            formatWithCommas={formatWithCommas}
                            renderProfessionIcon={renderProfessionIcon}
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            sidebarListClass={sidebarListClass}
                        />}

                        {isSectionVisible('sigil-relic-uptime') && <SigilRelicUptimeSection
                            hasSigilRelicTables={sigilRelicTables.length > 0}
                            sigilRelicSearch={sigilRelicSearch}
                            setSigilRelicSearch={setSigilRelicSearch}
                            filteredSigilRelicTables={filteredSigilRelicTables}
                            activeSigilRelicTab={activeSigilRelicTab}
                            setActiveSigilRelicTab={setActiveSigilRelicTab}
                            activeSigilRelicTable={activeSigilRelicTable}
                            formatWithCommas={formatWithCommas}
                            renderProfessionIcon={renderProfessionIcon}
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            sidebarListClass={sidebarListClass}
                        />}

                        {isSectionVisible('skill-usage') && <SkillUsageSection
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            selectedPlayers={selectedPlayers}
                            setSelectedPlayers={setSelectedPlayers}
                            removeSelectedPlayer={removeSelectedPlayer}
                            playerMapByKey={playerMapByKey}
                            groupedSkillUsagePlayers={groupedSkillUsagePlayers}
                            expandedSkillUsageClass={expandedSkillUsageClass}
                            setExpandedSkillUsageClass={setExpandedSkillUsageClass}
                            togglePlayerSelection={togglePlayerSelection}
                            skillUsagePlayerFilter={skillUsagePlayerFilter}
                            setSkillUsagePlayerFilter={setSkillUsagePlayerFilter}
                            skillUsageView={skillUsageView}
                            setSkillUsageView={setSkillUsageView}
                            skillUsageData={skillUsageData}
                            skillUsageSkillFilter={skillUsageSkillFilter}
                            setSkillUsageSkillFilter={setSkillUsageSkillFilter}
                            selectedSkillId={selectedSkillId}
                            setSelectedSkillId={setSelectedSkillId}
                            skillBarData={skillBarData}
                            selectedSkillName={selectedSkillName}
                            selectedSkillIcon={selectedSkillIcon}
                            skillUsageReady={skillUsageReady}
                            skillUsageAvailable={skillUsageAvailable}
                            isSkillUsagePerSecond={isSkillUsagePerSecond}
                            skillChartData={skillChartData}
                            skillChartMaxY={skillChartMaxY}
                            playerTotalsForSkill={playerTotalsForSkill}
                            hoveredSkillPlayer={hoveredSkillPlayer}
                            setHoveredSkillPlayer={setHoveredSkillPlayer}
                            getLineStrokeColor={getLineStrokeColor}
                            getLineDashForPlayer={getLineDashForPlayer}
                            formatSkillUsageValue={formatSkillUsageValue}

                            renderProfessionIcon={renderProfessionIcon}
                        />}

                        {isSectionVisible('apm-stats') && <ApmSection
                            expandedSection={expandedSection}
                            expandedSectionClosing={expandedSectionClosing}
                            openExpandedSection={openExpandedSection}
                            closeExpandedSection={closeExpandedSection}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                            sidebarListClass={sidebarListClass}
                            apmSpecAvailable={apmSpecAvailable}
                            skillUsageAvailable={skillUsageAvailable}
                            apmSpecTables={apmSpecTables}
                            activeApmSpec={activeApmSpec}
                            setActiveApmSpec={setActiveApmSpec}
                            expandedApmSpec={expandedApmSpec}
                            setExpandedApmSpec={setExpandedApmSpec}
                            activeApmSkillId={activeApmSkillId}
                            setActiveApmSkillId={setActiveApmSkillId}
                            ALL_SKILLS_KEY={ALL_SKILLS_KEY}
                            apmSkillSearch={apmSkillSearch}
                            setApmSkillSearch={setApmSkillSearch}
                            activeApmSpecTable={activeApmSpecTable}
                            activeApmSkill={activeApmSkill}
                            isAllApmSkills={isAllApmSkills}
                            apmView={apmView}
                            setApmView={setApmView}
                            formatApmValue={formatApmValue}
                            formatCastRateValue={formatCastRateValue}
                            formatCastCountValue={formatCastCountValue}
                            renderProfessionIcon={renderProfessionIcon}
                        />}

                    </>
                )}
                {!embedded && <div className="h-24" aria-hidden="true" />}
            </div>
            </div>
        </div>
    );
}
