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
import { OverviewSection } from './stats/sections/OverviewSection';
import { FightBreakdownSection } from './stats/sections/FightBreakdownSection';
import { TopPlayersSection } from './stats/sections/TopPlayersSection';
import { TopSkillsSection } from './stats/sections/TopSkillsSection';
import { SquadCompositionSection } from './stats/sections/SquadCompositionSection';
import { TimelineSection } from './stats/sections/TimelineSection';
import { MapDistributionSection } from './stats/sections/MapDistributionSection';
import { StatsHeader } from './stats/ui/StatsHeader';
import { WebUploadBanner } from './stats/ui/WebUploadBanner';
import { DevMockBanner } from './stats/ui/DevMockBanner';
import { StatsMobileNav } from './stats/ui/StatsMobileNav';
import { prefetchIconUrls } from './stats/ui/StatsViewShared';

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
    uiTheme?: 'classic' | 'modern' | 'crt' | 'matte';
    canShareDiscord?: boolean;
}

const sidebarListClass = 'space-y-1 pr-1 max-h-72 overflow-y-auto';
const NON_DAMAGING_CONDITIONS = new Set(['Vulnerability', 'Weakness', 'Blind', 'Chill', 'Cripple', 'Slow', 'Taunt', 'Fear', 'Immobilize']);
const ORDERED_SECTION_IDS = [
    'overview',
    'fight-breakdown',
    'top-players',
    'top-skills-outgoing',
    'squad-composition',
    'timeline',
    'map-distribution',
    'boon-output',
    'offense-detailed',
    'conditions-outgoing',
    'defense-detailed',
    'support-detailed',
    'healing-stats',
    'special-buffs',
    'skill-usage',
    'apm-stats'
] as const;

export function StatsView({ logs, onBack, mvpWeights, statsViewSettings, onStatsViewSettingsChange, webUploadState, onWebUpload, disruptionMethod, precomputedStats, embedded = false, sectionVisibility, dashboardTitle, uiTheme, canShareDiscord = true }: StatsViewProps) {
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
    const { result: aggregationResult } = useStatsAggregationWorker({ logs, precomputedStats, mvpWeights, statsViewSettings, disruptionMethod });
    const { stats, skillUsageData: computedSkillUsageData } = aggregationResult;

    const safeStats = useMemo(() => {
        const source = stats && typeof stats === 'object' ? stats : {};
        const asArray = (value: any) => (Array.isArray(value) ? value : []);
        const asObject = (value: any) => (value && typeof value === 'object' ? value : {});
        const withFallbackObject = (value: any, fallback: any) => (value && typeof value === 'object' ? value : fallback);
        const emptyTopStat = { value: 0, player: '-', profession: 'Unknown', professionList: [], count: 0 };
        const emptyMvp = { account: '-', profession: 'Unknown', professionList: [], reason: '', topStats: [], score: 0 };
        return {
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
            playerSkillBreakdowns: asArray((source as any).playerSkillBreakdowns)
        };
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
        mobileNavOpen,
        setMobileNavOpen,
        activeNavId,
        scrollContainerRef,
        tocItems,
        scrollToSection,
        stepSection
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
    const [offenseSearch, setOffenseSearch] = useState('');
    const [defenseSearch, setDefenseSearch] = useState('');
    const [damageMitigationSearch, setDamageMitigationSearch] = useState('');
    const [conditionSearch, setConditionSearch] = useState('');
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
        return `${base} transition-[opacity,transform] duration-700 ease-in-out ${visible
            ? 'opacity-100 translate-y-0 max-h-[99999px]'
            : 'opacity-0 -translate-y-2 max-h-0 h-0 min-h-0 overflow-hidden pointer-events-none p-0 !p-0 m-0 !mb-0 !mt-0 border-0 !border-0 border-transparent'}`;
    }, [isSectionVisible]);
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
    const activeSpecialTable = useMemo(() => {
        if (!activeSpecialTab) return null;
        return (safeStats.specialTables || []).find((buff: any) => buff.id === activeSpecialTab) ?? null;
    }, [safeStats.specialTables, activeSpecialTab]);

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
    const sortedSquadClassData = useMemo(() => [...squadClassData].sort(sortByCountDesc), [squadClassData]);
    const sortedEnemyClassData = useMemo(() => [...enemyClassData].sort(sortByCountDesc), [enemyClassData]);

    const useModernLayout = false;
    const containerClass = embedded
        ? 'stats-view min-h-screen flex flex-col p-0 w-full max-w-none'
        : 'stats-view h-full flex flex-col p-1 w-full max-w-6xl mx-auto overflow-hidden';
    const scrollContainerClass = embedded
        ? `stats-sections space-y-0 min-h-0 px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4 rounded-xl border border-white/5 ${expandedSection ? '' : 'backdrop-blur-xl'
        }`
        : `flex-1 overflow-y-auto pr-2 space-y-6 min-h-0 border border-white/5 p-4 rounded-xl ${expandedSection ? '' : 'backdrop-blur-2xl'
        }`;
    const scrollContainerStyle: CSSProperties | undefined = (embedded && uiTheme !== 'matte')
        ? {
            backgroundColor: 'rgba(3, 7, 18, 0.75)',
            backgroundImage: 'linear-gradient(160deg, rgba(var(--accent-rgb), 0.12), rgba(var(--accent-rgb), 0.04) 70%)'
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

    const renderProfessionIcon = useCallback((profession?: string, _professionList?: string[], className?: string) => {
        const iconPath = getProfessionIconPath(profession || '');
        if (!iconPath) return null;
        const iconClass = className ? `${className} object-contain` : 'w-5 h-5 object-contain';
        return <img src={iconPath} alt={profession} className={iconClass} />;
    }, []);

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

            <div
                id="stats-dashboard-container"
                ref={scrollContainerRef}
                className={scrollContainerClass}
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

                        <TopSkillsSection
                            stats={safeStats}
                            topSkillsMetric={topSkillsMetric}
                            onTopSkillsMetricChange={updateTopSkillsMetric}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
                        />

                        <SquadCompositionSection
                            sortedSquadClassData={sortedSquadClassData}
                            sortedEnemyClassData={sortedEnemyClassData}
                            getProfessionIconPath={getProfessionIconPath}
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

                        <MapDistributionSection
                            mapData={safeStats.mapData}
                            isSectionVisible={isSectionVisible}
                            isFirstVisibleSection={isFirstVisibleSection}
                            sectionClass={sectionClass}
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
                    </>
                )}
                {!embedded && <div className="h-24" aria-hidden="true" />}
            </div>

            <StatsMobileNav
                embedded={embedded}
                mobileNavOpen={mobileNavOpen}
                setMobileNavOpen={setMobileNavOpen}
                tocItems={tocItems}
                activeNavId={activeNavId}
                scrollToSection={scrollToSection}
                stepSection={stepSection}
            />
        </div>
    );
}
