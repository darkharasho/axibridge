import { CSSProperties, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert, Eraser } from 'lucide-react';



import { formatTopStatValue, formatWithCommas } from './stats/utils/dashboardUtils';
import { sanitizeWvwLabel, buildFightLabelV2, computeFightAvgPosition } from './stats/utils/labelUtils';
import { parseTimestamp } from './stats/utils/timestampUtils';
import { NON_DAMAGING_CONDITIONS, type CleanseScope } from './stats/statsMetrics';
import { normalizeEnabledTopStats } from './stats/topStatsCatalog';
import { StatsSharedContext } from './stats/StatsViewContext';
import { StatsGroupContainer } from './stats/ui/StatsGroupContainer';
import { SectionPanel } from './stats/ui/SectionPanel';
import { useStatsNavigation, STATS_TOC_GROUPS } from './stats/hooks/useStatsNavigation';
import { GROUP_ACCENT_COLORS } from './stats/sectionColors';
import { useStatsStore } from './stats/statsStore';
import { isReplayUnsliceable } from './stats/slice/replaySlicing';
import { statsLogKey } from './stats/utils/statsLogKey';
import { selectSlicedLogs } from './app/selectSlicedLogs';
import { useStatsUploads } from './stats/hooks/useStatsUploads';
import { useStatsAggregationWorker, type AggregationDiagnosticsState, type AggregationProgressState } from './stats/hooks/useStatsAggregationWorker';
import { isReplayElided } from './workers/replayTransfer';
import { useApmStats } from './stats/hooks/useApmStats';
import { useSkillCharts } from './stats/hooks/useSkillCharts';
import { getProfessionColor, PROFESSION_COLORS } from '../shared/professionUtils';
import { getProfessionIconPath } from './classIconUtils';
import { BoonCategory, BoonMetric, formatBoonMetricDisplay, getBoonMetricValue } from '../shared/boonGeneration';
import { DEFAULT_STATS_VIEW_SETTINGS, DEFAULT_WEB_UPLOAD_STATE, DisruptionMethod, IMvpWeightProfiles, IStatsViewSettings, IWebUploadState } from './global.d';
import type { PlayerSkillBreakdown, PlayerSkillDamageEntry, SkillUsageSummary } from './stats/statsTypes';
import { getDefaultConditionIcon, normalizeConditionLabel } from '../shared/conditionsMetrics';
import { DetailsCacheContext } from './cache/DetailsCacheContext';
import { AxilogCoverageBanner } from './stats/ui/AxilogCoverageBanner';
import { useAxilogHeal } from './stats/hooks/useAxilogHeal';
import { EMPTY_AXILOG_COVERAGE, type AxilogCoverage } from './stats/utils/axilogCoverage';

import { SkillUsageSection } from './stats/sections/SkillUsageSection';
import { ApmSection } from './stats/sections/ApmSection';
import { PlayerBreakdownSection } from './stats/sections/PlayerBreakdownSection';
import { DamageBreakdownSection } from './stats/sections/DamageBreakdownSection';
import { BoonTimelineSection } from './stats/sections/BoonTimelineSection';
import { BoonUptimeSection } from './stats/sections/BoonUptimeSection';
import { OffenseSection } from './stats/sections/OffenseSection';
import { DamageModifiersSection } from './stats/sections/DamageModifiersSection';
import { ConditionsSection } from './stats/sections/ConditionsSection';
import { BoonOutputSection } from './stats/sections/BoonOutputSection';
import { DefenseSection } from './stats/sections/DefenseSection';
import { BoonStripComparisonSection } from './stats/sections/BoonStripComparisonSection';
import { DamageMitigationSection } from './stats/sections/DamageMitigationSection';
import { SupportSection } from './stats/sections/SupportSection';
import { HealingSection } from './stats/sections/HealingSection';
import { HealingBreakdownSection } from './stats/sections/HealingBreakdownSection';
import { HealEffectivenessSection } from './stats/sections/HealEffectivenessSection';
import { SpecialBuffsSection } from './stats/sections/SpecialBuffsSection';
import { SigilRelicUptimeSection } from './stats/sections/SigilRelicUptimeSection';
import { FightDiffModeSection } from './stats/sections/FightDiffModeSection';
import { OverviewSection } from './stats/sections/OverviewSection';
import { FightBreakdownSection } from './stats/sections/FightBreakdownSection';
import { TopPlayersSection } from './stats/sections/TopPlayersSection';
import { TopSkillsSection } from './stats/sections/TopSkillsSection';
import { DataMapSection } from './stats/sections/DataMapSection';
import { SquadCompositionSection } from './stats/sections/SquadCompositionSection';
import { TimelineSection } from './stats/sections/TimelineSection';
import { MapDistributionSection } from './stats/sections/MapDistributionSection';
import { SpikeDamageSection } from './stats/sections/SpikeDamageSection';
import { StabPerformanceSection } from './stats/sections/StabPerformanceSection';
import { AllDamageSection } from './stats/sections/AllDamageSection';
import { AllBoonsSection } from './stats/sections/AllBoonsSection';
import type { AllBoonsBoon } from './stats/sections/AllBoonsSection';
import type { AllDamageData } from './stats/computeAllDamageData';
import { FightMetricSection } from './stats/sections/FightMetricSection';
import type { FightMetricPlayer, FightMetricPoint } from './stats/sections/FightMetricSection';
import type { StripFight, StripPlayer } from './stats/computeStripSpikesData';
import { AttendanceSection } from './stats/sections/AttendanceSection';
import { CommanderPushTimingSection, CommanderStatsSection, CommanderTagDeathResponseSection, CommanderTagMovementSection, CommanderTargetConversionSection } from './stats/sections/CommanderStatsSection';
import { SquadCompByFightSection } from './stats/sections/SquadCompByFightSection';
import { FightCompSection } from './stats/sections/FightCompSection';
import { SquadDamageComparisonSection } from './stats/sections/SquadDamageComparisonSection';
import { SquadKillPressureSection } from './stats/sections/SquadKillPressureSection';
import { SquadTagDistanceDeathsSection } from './stats/sections/SquadTagDistanceDeathsSection';
import { SquadDistanceToTagSection } from './stats/sections/SquadDistanceToTagSection';
import { SquadDistanceToTagVisualSection } from './stats/sections/SquadDistanceToTagVisualSection';
import { OnTagReviewSection } from './stats/sections/OnTagReviewSection';
import type { DistanceToTagResult } from './stats/computeDistanceToTag';
import type { OnTagReviewResult } from './stats/computeOnTagReview';
import { PlayerComparisonSection } from './stats/sections/PlayerComparisonSection';
import { ReplaySection } from './stats/sections/ReplaySection';
import type { TagDistanceDeathFightSummary } from './stats/computeTagDistanceDeaths';
import { StatsHeader } from './stats/ui/StatsHeader';
import { FightSliceTray, FightSliceBanner } from './stats/components/FightSliceTray';
import { WebUploadBanner } from './stats/ui/WebUploadBanner';
import { DevMockBanner } from './stats/ui/DevMockBanner';
import { prefetchIconUrls, renderProfessionIcon as renderProfessionIconShared } from './stats/ui/StatsViewShared';
import { STATS_LOADING_JOKE_INTERVAL_MS, STATS_LOADING_JOKES, shuffled } from './stats/loadingJokes';
import { computeHealEffectivenessData } from './stats/computeHealEffectivenessData';
import { SearchPalette } from './stats/search/SearchPalette';
import { useSearchJump } from './stats/search/useSearchJump';
import { buildSearchIndex } from './stats/search/searchIndex';

interface StatsViewProps {
    logs: ILogData[];
    onBack: () => void;
    mvpWeights?: IMvpWeightProfiles;
    statsViewSettings?: IStatsViewSettings;
    onStatsViewSettingsChange?: (settings: IStatsViewSettings) => void;
    webUploadState?: IWebUploadState;
    onWebUpload?: (payload: { meta: any; stats: any; logIds?: string[]; repoFullName?: string; repoOwner?: string; repoName?: string }) => Promise<void> | void;
    webUploadLogEntries?: import('./app/hooks/useWebUpload').LogEntry[];
    disruptionMethod?: DisruptionMethod;
    precomputedStats?: any;
    embedded?: boolean;
    sectionVisibility?: (id: string) => boolean;
    /** Host override for where a search-palette selection's category activation goes.
     *  Desktop default (StatsView itself) writes directly to the shared stats store. */
    onRequestCategory?: (categoryId: string) => void;
    /** Called once with a stable opener for the embedded search palette, so a host
     *  chrome (e.g. the web report's header/mobile-nav magnifier buttons) can trigger
     *  it without StatsView mounting a second palette or keydown listener. */
    onSearchAvailable?: (open: () => void) => void;
    dashboardTitle?: string;
    statsDataProgress?: {
        active: boolean;
        total: number;
        processed: number;
        pending: number;
        unavailable: number;
    };
    aggregationResult?: {
        stats: any;
        skillUsageData: SkillUsageSummary;
        aggregationProgress?: AggregationProgressState;
        aggregationDiagnostics?: AggregationDiagnosticsState | null;
        axilogCoverage?: AxilogCoverage;
    };
    /** Called with the file paths of logs an Axilog re-parse repaired. */
    onLogsHealed?: (filePaths: string[]) => void;
    /** Published web report only: true when the report shipped a slice sidecar,
     *  so the pill/tray/banner should render even though the view is embedded.
     *  A historical FightReportHistoryView (also embedded) leaves this unset. */
    sliceEnabled?: boolean;
    /** Published web report only: awaited before the tray opens, so the first
     *  open is what triggers the sidecar fetch (Task 18) rather than report load. */
    onOpenSliceTray?: () => Promise<unknown>;
    /** Published web report only: builds and copies a shareable slice link for
     *  the current selection. Absent everywhere else, so the banner's copy
     *  control only appears where a link is actually meaningful. */
    onCopySliceLink?: () => void;
    /** Published-report only: the slice recompute failed or refused, so the
     *  stats being rendered are the FULL report's. The banner switches to an
     *  honest "Slice unavailable" line rather than claiming a subset. */
    sliceUnavailable?: boolean;
}

const sidebarListClass = 'space-y-0.5 max-h-72 overflow-y-auto';
const ORDERED_SECTION_IDS = [
    'overview',
    'fight-breakdown',
    'top-players',
    'top-skills-outgoing',
    'squad-composition',
    'commander-stats',
    'commander-push-timing',
    'commander-target-conversion',
    'commander-tag-movement',
    'commander-tag-death-response',
    'squad-damage-comparison',
    'squad-kill-pressure',
    'heal-effectiveness',
    'squad-tag-distance-deaths',
    'on-tag-review',
    'squad-distance-to-tag',
    'squad-distance-to-tag-visual',
    'attendance-ledger',
    'squad-comp-fight',
    'fight-comp',
    'timeline',
    'map-distribution',
    'boon-output',
    'all-boons',
    'boon-timeline',
    'boon-uptime',
    'stab-performance',
    'offense-detailed',
    'damage-modifiers',
    'player-breakdown',
    'damage-breakdown',
    'spike-damage',
    'all-damage',
    'conditions-outgoing',
    'defense-detailed',
    'incoming-damage-modifiers',
    'incoming-strike-damage',
    'support-detailed',
    'healing-stats',
    'healing-breakdown',
    'fight-diff-mode',
    'special-buffs',
    'sigil-relic-uptime',
    'skill-usage',
    'apm-stats',
    'player-comparison'
] as const;

// Section ids whose render entries are conditionally omitted entirely when
// noEgoMode is on (see the `...(!noEgoMode ? [...] : [])` guards below). The
// data map's directory must skip these too, or it offers dead links to
// sections that were never mounted — and its buttons re-use the taxonomy's
// section labels, which duplicate the sections' own on-page headings once
// they're allowed to render, breaking exact-text queries against either.
const NO_EGO_HIDDEN_SECTION_IDS = new Set(['top-skills-outgoing', 'top-skills-incoming', 'player-comparison']);

const EMPTY_SKILL_USAGE_SUMMARY: SkillUsageSummary = {
    logRecords: [],
    players: [],
    skillOptions: [],
    resUtilitySkills: []
};

const EMPTY_ANY_ARRAY: any[] = [];

// Web uploads compress replay fights to save space. Re-expand before passing to the viewer:
//   - boonIcons/skillIcons are lifted into stats.replayIcons and need re-injecting per fight.
//   - targetFocusSamples.memberKey is stored as a numeric index into fight.memberKeys[].
function resolveReplayFights(stats: any): any[] {
    const fights: any[] = stats?.replayFights ?? [];
    if (!fights.length) return fights;
    const icons = stats?.replayIcons;
    const needsResolve = icons || fights.some((f: any) => Array.isArray(f?.memberKeys));
    if (!needsResolve) return fights;
    return fights.map((f: any) => {
        if (!f) return f;
        let result = f;

        // Re-inject shared icons stripped at upload time.
        if (icons && f.movementData) {
            const md = f.movementData;
            const hasBoon = md.boonIcons && Object.keys(md.boonIcons).length > 0;
            const hasSkill = md.skillIcons && Object.keys(md.skillIcons).length > 0;
            if (!hasBoon || !hasSkill) {
                result = {
                    ...result,
                    movementData: {
                        ...md,
                        boonIcons: hasBoon ? md.boonIcons : icons.boonIcons,
                        skillIcons: hasSkill ? md.skillIcons : icons.skillIcons,
                    }
                };
            }
        }

        // Restore targetFocusSamples memberKey indices back to account strings.
        if (Array.isArray(f.memberKeys) && Array.isArray(f.targetFocusSamples)) {
            const keys = f.memberKeys as string[];
            const { memberKeys: _discarded, ...rest } = result;
            result = {
                ...rest,
                targetFocusSamples: f.targetFocusSamples.map((s: any) => ({
                    ...s,
                    memberKey: typeof s.memberKey === 'number' ? (keys[s.memberKey] ?? '') : s.memberKey,
                })),
            };
        }

        return result;
    });
}

/**
 * The raw-log derivations below (spike/burst chart data, heal-effectiveness
 * fallback) must honour the ephemeral fight slice, but an embedded StatsView
 * renders a historical report and must never see the live session's slice.
 */
export const deriveStatsViewLogs = (logs: any[], excluded: Set<string>, embedded: boolean): any[] =>
    embedded ? logs : selectSlicedLogs(logs, excluded);

export const StatsView = memo(function StatsView({ logs, onBack: _onBack, mvpWeights, statsViewSettings, onStatsViewSettingsChange, webUploadState, onWebUpload, webUploadLogEntries, disruptionMethod, precomputedStats, embedded = false, sectionVisibility, onRequestCategory, onSearchAvailable, dashboardTitle, statsDataProgress, aggregationResult: externalAggregationResult, onLogsHealed, sliceEnabled = false, onOpenSliceTray, onCopySliceLink, sliceUnavailable = false }: StatsViewProps) {
    // Defer heavy section rendering by one frame so the header + progress bar can paint first.
    const [sectionsDeferred, setSectionsDeferred] = useState(!embedded);
    useEffect(() => {
        if (!sectionsDeferred) return;
        const id = requestAnimationFrame(() => setSectionsDeferred(false));
        return () => cancelAnimationFrame(id);
    }, [sectionsDeferred]);

    const activeStatsViewSettings = statsViewSettings || DEFAULT_STATS_VIEW_SETTINGS;
    const activeWebUploadState = webUploadState || DEFAULT_WEB_UPLOAD_STATE;
    const noEgoMode = activeStatsViewSettings.noEgoMode === true;
    // No Ego mode forces the squad-summary layout on and the MVP podium off.
    const showTopStats = noEgoMode ? true : activeStatsViewSettings.showTopStats;
    const showMvp = noEgoMode ? false : activeStatsViewSettings.showMvp;
    const roundCountStats = activeStatsViewSettings.roundCountStats;
    const topStatsMode = activeStatsViewSettings.topStatsMode || 'total';
    const enabledTopStats = normalizeEnabledTopStats(activeStatsViewSettings.enabledTopStats);
    const [localTopSkillsMetric, setLocalTopSkillsMetric] = useState<IStatsViewSettings['topSkillsMetric']>(
        activeStatsViewSettings.topSkillsMetric || 'damage'
    );
    const topSkillsMetric = (onStatsViewSettingsChange ? activeStatsViewSettings.topSkillsMetric : localTopSkillsMetric) || 'damage';
    const uploadingWeb = activeWebUploadState.uploading;
    const webUploadMessage = activeWebUploadState.message;
    const webUploadUrl = activeWebUploadState.url;
    const webUploadBuildStatus = activeWebUploadState.buildStatus;
    const devMockAvailable = !embedded && import.meta.env.DEV && !!window.electronAPI?.mockWebReport;
    const [statsSettlingBannerJoke, setStatsSettlingBannerJoke] = useState(STATS_LOADING_JOKES[0] || '');
    const statsLoadingJokeDeckRef = useRef<string[]>([]);
    const statsLoadingJokeCursorRef = useRef(0);
    const statsLoadingJokeTimerRef = useRef<number | null>(null);
    const statsLoadingJokeLastChangeRef = useRef(0);

    const isSectionVisibleFast = useCallback(
        (id: string) => (sectionVisibility ? sectionVisibility(id) : true),
        [sectionVisibility]
    );

    const detailsCache = useContext(DetailsCacheContext);

    // Axilog coverage + repair. The aggregation observed which logs arrived
    // without Axilog data while it was already resolving their
    // details; this view is where that becomes visible and actionable.
    const axilogCoverage = externalAggregationResult?.axilogCoverage ?? EMPTY_AXILOG_COVERAGE;
    const [parserBackend, setParserBackend] = useState<'axilog' | 'elite-insights' | null>(null);
    useEffect(() => {
        if (embedded) return;
        let cancelled = false;
        window.electronAPI?.getParserBackend?.()
            .then((info: any) => {
                if (!cancelled && (info?.backend === 'axilog' || info?.backend === 'elite-insights')) {
                    setParserBackend(info.backend);
                }
            })
            .catch(() => { /* leave null — the banner just omits the remedy */ });
        return () => { cancelled = true; };
    }, [embedded]);
    const { healState, heal } = useAxilogHeal({ detailsCache, onLogsHealed });

    const getDetails = (log: any): any => {
        if (detailsCache && log?.id) {
            const cached = detailsCache.peek(log.id);
            if (cached) return cached;
        }
        return {};
    };

    // --- Hook Integration ---
    // Read from zustand store (populated by App.tsx sync in Task 8)
    const storeResult = useStatsStore((s) => s.result);
    const storeProgress = useStatsStore((s) => s.progress);
    const storeDiagnostics = useStatsStore((s) => s.diagnostics);
    const activeCategory = useStatsStore((s) => s.activeCategory);

    // Raw-log derivations below must honour the fight slice, but an embedded
    // StatsView renders a historical report and must never see the live slice.
    const excludedFightKeys = useStatsStore((s) => s.excludedFightKeys);
    const derivationLogs = useMemo(
        () => deriveStatsViewLogs(logs, excludedFightKeys, embedded),
        [embedded, logs, excludedFightKeys]
    );

    // For embedded consumers (web report, FightReportHistoryView), use the prop directly.
    // For the desktop path (non-embedded), prefer the store and fall back to the prop.
    const useExternalAggregation = !!externalAggregationResult;
    const {
        result: internalAggregationResult,
        aggregationProgress: internalAggregationProgress
    } = useStatsAggregationWorker({
        logs: useExternalAggregation ? [] : logs,
        precomputedStats: useExternalAggregation ? undefined : precomputedStats,
        mvpWeights,
        statsViewSettings,
        disruptionMethod
    });
    const aggregationSource = embedded
        ? (externalAggregationResult || internalAggregationResult)
        : (storeResult ?? externalAggregationResult ?? internalAggregationResult);
    const aggregationResult = aggregationSource;
    const aggregationProgress = embedded
        ? (externalAggregationResult?.aggregationProgress || internalAggregationProgress)
        : (storeProgress ?? externalAggregationResult?.aggregationProgress ?? internalAggregationProgress);
    // storeDiagnostics is available via the zustand store for consumers that need it
    // (e.g. future diagnostic panels). Not consumed in StatsView render directly.
    void storeDiagnostics;
    const { stats, skillUsageData: computedSkillUsageData } = aggregationResult;

    // R2 lazy-load: if stats.replayDataUrl is set, replay data lives in R2 and must be fetched.
    const [r2ReplayFights, setR2ReplayFights] = useState<any[] | null>(null);
    const [r2ReplayStatus, setR2ReplayStatus] = useState<'idle' | 'loading' | 'error'>('idle');
    const [r2ReplayError, setR2ReplayError] = useState<string | null>(null);
    useEffect(() => {
        const replayDataUrl: string | undefined =
            ((stats as any)?.replayDataUrl as string | undefined)
            ?? logs?.find((l) => l.replayDataUrl)?.replayDataUrl
            ?? undefined;
        if (!replayDataUrl || r2ReplayFights !== null || r2ReplayStatus !== 'idle') return;
        setR2ReplayStatus('loading');
        const fetchJson = async (): Promise<any> => {
            // In Electron, proxy through the main process to avoid CORS restrictions.
            if (window.electronAPI?.fetchR2Json) {
                const result = await window.electronAPI.fetchR2Json(replayDataUrl);
                if (!result.success) throw new Error(result.error ?? 'Fetch failed');
                return result.json;
            }
            const res = await fetch(replayDataUrl, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        };
        fetchJson()
            .then((data: any) => {
                setR2ReplayFights(Array.isArray(data?.replayFights) ? data.replayFights : []);
                setR2ReplayStatus('idle');
            })
            .catch((err) => {
                const msg = err?.message ?? String(err);
                console.error('[StatsView] R2 replay fetch failed:', replayDataUrl, msg);
                setR2ReplayError(msg);
                setR2ReplayStatus('error');
            });
    }, [stats, logs, r2ReplayFights, r2ReplayStatus]);

    const getReplayFights = useCallback((): any[] => {
        const localFights = (stats as any)?.replayFights;
        if (Array.isArray(localFights) && localFights.length > 0) {
            return resolveReplayFights(stats);
        }
        return r2ReplayFights ?? [];
    }, [stats, r2ReplayFights]);

    /**
     * The combat replay cannot be sliced.
     *
     * `r2ReplayFights` is fetched once from the report's `replayDataUrl` and
     * cached; it always holds EVERY fight in the session. Sliced stats carry no
     * `replayFights` of their own (frames deliberately exclude replay payloads
     * — they are 66% of report.json and none of the merge maths needs them), so
     * `getReplayFights()` above falls through to that whole-session cache. The
     * result would be a replay playing all 7 fights while every other section
     * on the page shows the 3 the user picked, with nothing saying so.
     *
     * Filtering the cache by slice is not viable: the replay payload is keyed
     * on its own fight identities, not the sidecar's roster ordinals. So the
     * section is replaced by an explicit note while a slice is active.
     *
     * Scoped narrowly on purpose: when `stats.replayFights` IS populated the
     * replay came from the same (already-sliced) aggregation as everything else
     * — that is the desktop path, and it stays fully functional under a slice.
     */
    const replayUnsliceable = isReplayUnsliceable({
        replayFights: (stats as any)?.replayFights,
        excludedFightCount: excludedFightKeys.size,
    });

    const replaySliceNotice = (
        <div className="flex flex-col items-center justify-center w-full gap-2 text-center px-6">
            <span className="text-sm text-gray-300">Combat replay is not available while a fight slice is active.</span>
            <span className="text-xs text-gray-500 max-w-md">
                The replay covers the full session and cannot be narrowed to the selected fights.
                Clear the slice to watch it.
            </span>
        </div>
    );

    const aggregationSettling = useMemo(() => {
        // Prefer real aggregation progress over the generic "Preparing" placeholder.
        // This avoids showing "Preparing fights for stats" when the worker is already
        // streaming but logsForStats hasn't fully synced into StatsView yet.
        const total = Math.max(0, Number(aggregationProgress?.total || logs.length || 0));
        const phase = aggregationProgress?.phase;
        const active = Boolean(aggregationProgress?.active)
            && (phase === 'streaming' || phase === 'computing')
            && total > 0;
        if (active) {
            const streamed = Math.min(Math.max(Number(aggregationProgress?.streamed || 0), 0), total);
            const phaseLabel = phase === 'streaming'
                ? 'Loading fight data'
                : 'Finalizing squad stats';
            const progressText = phase === 'streaming'
                ? `${streamed} of ${total} fights loaded`
                : 'All fights loaded • calculating final totals';
            const progressPercent = phase === 'streaming'
                ? Math.max(1, Math.min(99, Math.round((streamed / total) * 100)))
                : 99;
            return {
                active: true,
                phaseLabel,
                progressText,
                progressPercent
            };
        }
        // "Syncing" state: statsDataProgress reports logs but logs prop hasn't updated yet
        // Skip syncing state if all fights are unavailable — let detailsProgress show that instead
        const detailsTotal = Math.max(0, Number(statsDataProgress?.total || logs.length || 0));
        const detailsUnavailableForSync = Math.max(0, Number(statsDataProgress?.unavailable || 0));
        const allUnavailable = detailsTotal > 0 && detailsUnavailableForSync >= detailsTotal;
        if (detailsTotal > 0 && logs.length === 0 && !allUnavailable) {
            return {
                active: true,
                phaseLabel: 'Preparing fights for stats',
                progressText: 'Syncing uploaded fights into the stats dashboard',
                progressPercent: 5
            };
        }
        return {
            active: false,
            phaseLabel: '',
            progressText: '',
            progressPercent: 0
        };
    }, [aggregationProgress, statsDataProgress, logs.length]);

    const detailsProgress = useMemo(() => {
        const detailsTotal = Math.max(0, Number(statsDataProgress?.total || logs.length || 0));
        const detailsPending = Math.min(detailsTotal, Math.max(0, Number(statsDataProgress?.pending || 0)));
        const detailsProcessed = Math.min(detailsTotal, Math.max(0, Number(statsDataProgress?.processed || (detailsTotal - detailsPending))));
        const detailsUnavailable = Math.max(0, Number(statsDataProgress?.unavailable || 0));
        const detailsActive = Boolean(statsDataProgress?.active) && detailsTotal > 0 && detailsPending > 0;
        if (detailsActive) {
            const unavailableText = detailsUnavailable > 0 ? ` • ${detailsUnavailable} unavailable` : '';
            return {
                active: true,
                phaseLabel: 'Loading fight details',
                progressText: `${detailsProcessed} of ${detailsTotal} fights prepared${unavailableText}`,
                progressPercent: detailsTotal > 0
                    ? Math.max(1, Math.min(99, Math.round((detailsProcessed / detailsTotal) * 100)))
                    : 0
            };
        }
        if (detailsTotal > 0 && detailsUnavailable >= detailsTotal) {
            return {
                active: true,
                phaseLabel: 'Fight details unavailable',
                progressText: `${detailsUnavailable} of ${detailsTotal} fights could not be loaded from dps.report`,
                progressPercent: 100
            };
        }
        return { active: false, phaseLabel: '', progressText: '', progressPercent: 0 };
    }, [statsDataProgress, logs.length]);

    const showDissolveLoading = aggregationSettling.active && !embedded;

    // Joke rotation for the loading spinner
    useEffect(() => {
        if (statsLoadingJokeTimerRef.current !== null) {
            window.clearTimeout(statsLoadingJokeTimerRef.current);
            statsLoadingJokeTimerRef.current = null;
        }
        if (!showDissolveLoading) return;
        const nextJoke = () => {
            if (statsLoadingJokeDeckRef.current.length === 0 || statsLoadingJokeCursorRef.current >= statsLoadingJokeDeckRef.current.length) {
                statsLoadingJokeDeckRef.current = shuffled(STATS_LOADING_JOKES);
                statsLoadingJokeCursorRef.current = 0;
            }
            const joke = statsLoadingJokeDeckRef.current[statsLoadingJokeCursorRef.current];
            statsLoadingJokeCursorRef.current += 1;
            if (joke) {
                setStatsSettlingBannerJoke(joke);
                statsLoadingJokeLastChangeRef.current = Date.now();
            }
        };
        const scheduleNext = (delayMs: number) => {
            statsLoadingJokeTimerRef.current = window.setTimeout(() => {
                statsLoadingJokeTimerRef.current = null;
                nextJoke();
                scheduleNext(STATS_LOADING_JOKE_INTERVAL_MS);
            }, Math.max(300, delayMs));
        };
        if (statsLoadingJokeLastChangeRef.current <= 0) {
            nextJoke();
            scheduleNext(STATS_LOADING_JOKE_INTERVAL_MS);
            return () => {
                if (statsLoadingJokeTimerRef.current !== null) {
                    window.clearTimeout(statsLoadingJokeTimerRef.current);
                    statsLoadingJokeTimerRef.current = null;
                }
            };
        }
        const elapsed = Date.now() - statsLoadingJokeLastChangeRef.current;
        const initialDelay = STATS_LOADING_JOKE_INTERVAL_MS - elapsed;
        scheduleNext(initialDelay);
        return () => {
            if (statsLoadingJokeTimerRef.current !== null) {
                window.clearTimeout(statsLoadingJokeTimerRef.current);
                statsLoadingJokeTimerRef.current = null;
            }
        };
    }, [showDissolveLoading]);

    // Block the web upload until combat replay data settles. While the worker is
    // still streaming/computing, intermediate results have their replay payload
    // elided (replayFightsElided), and uploading then publishes a replay-less
    // report (replay.json 404). Re-enables once the final flush restores replay.
    const replaySettling = isReplayElided(stats);
    const aggregationBusy = Boolean(aggregationProgress?.active)
        && (aggregationProgress?.phase === 'streaming' || aggregationProgress?.phase === 'computing');
    const statsActionsDisabled = replaySettling || aggregationBusy;

    const renderSectionWrap = (children: React.ReactNode) => (
        <div className="stats-section-wrap">
            {children}
        </div>
    );

    const renderGroup = (groupId: string, sections: Array<{ id: string; element: React.ReactNode }>) => {
        const group = STATS_TOC_GROUPS.find(g => g.id === groupId);
        if (!group) return null;

        // For embedded mode (web report), only render the visible group's sections.
        // Non-visible groups get a lightweight placeholder to preserve scroll targets.
        if (embedded) {
            const anyVisible = group.sectionIds.some(id => isSectionVisible(id));
            if (!anyVisible) {
                return (
                    <div key={groupId} id={`group-${groupId}`} style={{ height: 0 }} />
                );
            }
            return (
                <div key={groupId}>
                    <StatsGroupContainer
                        groupId={groupId}
                        visible
                        embedded
                        label={group.label}
                        icon={group.icon as React.ComponentType<{ className?: string }>}
                        accentColor={GROUP_ACCENT_COLORS[groupId] || 'var(--brand-primary)'}
                        sectionCount={sections.length}
                    >
                        {sections.map((s, i) => (
                            <SectionPanel key={s.id} sectionId={s.id} isLast={i === sections.length - 1} index={i}>
                                {renderSectionWrap(s.element)}
                            </SectionPanel>
                        ))}
                    </StatsGroupContainer>
                </div>
            );
        }

        // For non-embedded (desktop), only render the active category's content.
        // Inactive categories get a zero-height placeholder (no content mounted —
        // the placeholder-height store was removed in Task 2, so there are no
        // measured heights to preserve; the category bar drives switching).
        if (groupId !== activeCategory) {
            return (
                <div
                    key={groupId}
                    id={`group-${groupId}`}
                    style={{ height: 0 }}
                    className="pointer-events-none"
                />
            );
        }

        return (
            <div key={groupId}>
                <StatsGroupContainer
                    groupId={groupId}
                    visible
                    label={group.label}
                    icon={group.icon as React.ComponentType<{ className?: string }>}
                    accentColor={GROUP_ACCENT_COLORS[groupId] || 'var(--brand-primary)'}
                    sectionCount={sections.length}
                >
                    {sections.map((s, i) => (
                        <SectionPanel key={s.id} sectionId={s.id} isLast={i === sections.length - 1} index={i}>
                            {renderSectionWrap(s.element)}
                        </SectionPanel>
                    ))}
                </StatsGroupContainer>
            </div>
        );
    };

    const needsTopSkillsData = (
        isSectionVisibleFast('top-skills-outgoing')
        || isSectionVisibleFast('player-breakdown')
        || isSectionVisibleFast('damage-breakdown')
    );
    const needsSkillUsageData = isSectionVisibleFast('skill-usage');
    const needsApmData = isSectionVisibleFast('apm-stats');
    const needsSpikeData = isSectionVisibleFast('spike-damage');
    const needsIncomingStrikeData = isSectionVisibleFast('incoming-strike-damage');
    const needsAllDamageData = isSectionVisibleFast('all-damage');
    const needsConditionData = isSectionVisibleFast('conditions-outgoing');

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
            topStatsPerMinute: asObject((source as any).topStatsPerMinute),
            topStatsLeaderboardsPerMinute: asObject((source as any).topStatsLeaderboardsPerMinute),
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
            healEffectiveness: asArray((source as any).healEffectiveness),
            boonTables: asArray((source as any).boonTables),
            boonTimeline: asArray((source as any).boonTimeline),
            boonUptimeTimeline: asArray((source as any).boonUptimeTimeline),
            specialTables: asArray((source as any).specialTables),
            outgoingConditionSummary: asArray((source as any).outgoingConditionSummary),
            outgoingConditionPlayers: asArray((source as any).outgoingConditionPlayers),
            incomingConditionSummary: asArray((source as any).incomingConditionSummary),
            incomingConditionPlayers: asArray((source as any).incomingConditionPlayers),
            squadClassData: asArray((source as any).squadClassData),
            enemyClassData: asArray((source as any).enemyClassData),
            attendanceData: asArray((source as any).attendanceData),
            commanderStats: withFallbackObject((source as any).commanderStats, { rows: [] }),
            squadCompByFight: asArray((source as any).squadCompByFight),
            fightDiffMode: asArray((source as any).fightDiffMode),
            playerSkillBreakdowns: asArray((source as any).playerSkillBreakdowns),
            healingBreakdownPlayers: asArray((source as any).healingBreakdownPlayers)
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
        let cancelled = false;
        const run = () => {
            if (cancelled) return;
            const urls = new Set<string>();
            const addUrl = (value: any) => {
                if (typeof value !== 'string') return;
                if (!/^https?:\/\//i.test(value)) return;
                urls.add(value);
            };
            const collectIconRows = (rows: any[]) => {
                rows.forEach((row: any) => {
                    addUrl(row?.icon);
                    addUrl(row?.iconUrl);
                });
            };
            collectIconRows(Array.isArray((safeStats as any)?.topSkills) ? (safeStats as any).topSkills : []);
            collectIconRows(Array.isArray((safeStats as any)?.topIncomingSkills) ? (safeStats as any).topIncomingSkills : []);
            collectIconRows(Array.isArray((safeStats as any)?.topSkillsByDamage) ? (safeStats as any).topSkillsByDamage : []);
            collectIconRows(Array.isArray((safeStats as any)?.topSkillsByDownContribution) ? (safeStats as any).topSkillsByDownContribution : []);
            collectIconRows(Array.isArray((safeStats as any)?.outgoingConditionSummary) ? (safeStats as any).outgoingConditionSummary : []);
            collectIconRows(Array.isArray((safeStats as any)?.incomingConditionSummary) ? (safeStats as any).incomingConditionSummary : []);
            const boonTables = Array.isArray((safeStats as any)?.boonTables) ? (safeStats as any).boonTables : [];
            boonTables.forEach((table: any) => {
                addUrl(table?.icon);
            });
            const specialTables = Array.isArray((safeStats as any)?.specialTables) ? (safeStats as any).specialTables : [];
            specialTables.forEach((table: any) => {
                addUrl(table?.icon);
            });
            if (needsTopSkillsData) {
                const playerBreakdowns = Array.isArray((safeStats as any)?.playerSkillBreakdowns) ? (safeStats as any).playerSkillBreakdowns : [];
                playerBreakdowns.forEach((player: any) => {
                    const skills = Array.isArray(player?.skills) ? player.skills : [];
                    collectIconRows(skills);
                });
            }
            if (urls.size > 0) {
                prefetchIconUrls(Array.from(urls));
            }
        };
        const requestIdle = (window as any).requestIdleCallback;
        let handle: number | null = null;
        if (typeof requestIdle === 'function') {
            handle = requestIdle(() => run(), { timeout: 500 });
        } else {
            handle = window.setTimeout(run, 120);
        }
        return () => {
            cancelled = true;
            if (handle === null) return;
            if (typeof requestIdle === 'function') {
                const cancelIdle = (window as any).cancelIdleCallback;
                if (typeof cancelIdle === 'function') {
                    cancelIdle(handle);
                }
            } else {
                window.clearTimeout(handle);
            }
        };
    }, [safeStats, needsTopSkillsData]);

    const skillUsageData = useMemo(() => {
        const source = (precomputedStats?.skillUsageData ?? computedSkillUsageData) as Partial<SkillUsageSummary> | undefined;
        return {
            logRecords: Array.isArray(source?.logRecords) ? source.logRecords : [],
            players: Array.isArray(source?.players) ? source.players : [],
            skillOptions: Array.isArray(source?.skillOptions) ? source.skillOptions : [],
            resUtilitySkills: Array.isArray(source?.resUtilitySkills) ? source.resUtilitySkills : []
        } as SkillUsageSummary;
    }, [computedSkillUsageData, precomputedStats?.skillUsageData]);

    const healEffectivenessFights = useMemo(() => {
        const precomputed = Array.isArray((safeStats as any)?.healEffectiveness) ? (safeStats as any).healEffectiveness : [];
        if (precomputed.length > 0) return precomputed;
        return computeHealEffectivenessData(derivationLogs);
    }, [safeStats, derivationLogs]);

    const tagDistanceDeathsData: TagDistanceDeathFightSummary[] = useMemo(() => {
        return Array.isArray((safeStats as any)?.tagDistanceDeaths) ? (safeStats as any).tagDistanceDeaths : [];
    }, [safeStats]);

    const distanceToTagResult: DistanceToTagResult = useMemo(() => {
        const v = (safeStats as any)?.distanceToTag;
        return v && Array.isArray(v.rows) ? v : { rows: [], commanderCount: 0 };
    }, [safeStats]);

    const onTagReviewResult: OnTagReviewResult = useMemo(() => {
        const v = (safeStats as any)?.onTagReview;
        return v && Array.isArray(v.rows) ? v : { rows: [], usableFightCount: 0 };
    }, [safeStats]);

    const [distanceToTagFilterEnabled, setDistanceToTagFilterEnabled] = useState(false);
    const [distanceToTagMinFights, setDistanceToTagMinFights] = useState(3);

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
    } = useStatsNavigation(embedded, true);

    // Universal search palette (Ctrl/Cmd+K). Mounted unconditionally so it works
    // identically in desktop, embedded History, and embedded web hosts.
    const [searchOpen, setSearchOpen] = useState(false);
    // Fight-slice tray (desktop-only; gated on !embedded everywhere it renders).
    const [sliceTrayOpen, setSliceTrayOpen] = useState(false);
    const searchIndex = useMemo(() => buildSearchIndex({
        players: safeStats.playerSkillBreakdowns ?? [],
        // Filtered ONLY by noEgo exclusions — deliberately NOT by the embedded
        // sectionVisibility fn, which is "active group only" (jumping changes the
        // group; see NO_EGO_HIDDEN_SECTION_IDS above for why the data map uses the
        // same exclusion set). The web report (Task 9) reuses this same unfiltered
        // index via onRequestCategory/onSearchAvailable rather than building its own.
        isSectionAllowed: (id) => !(noEgoMode && NO_EGO_HIDDEN_SECTION_IDS.has(id)),
    }), [safeStats.playerSkillBreakdowns, noEgoMode]);
    const requestCategory = onRequestCategory ?? ((categoryId: string) => useStatsStore.getState().setActiveCategory(categoryId));
    const { jumpToEntry } = useSearchJump({ onRequestCategory: requestCategory });

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((v) => !v); }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // Register a stable opener with the host once, so external chrome (the web
    // report's header/mobile-nav magnifier buttons) can open this same palette
    // instead of mounting a second one with its own Ctrl/Cmd+K listener.
    useEffect(() => {
        onSearchAvailable?.(() => setSearchOpen(true));
    }, []);

    const {
        devMockUploadState,
        webCopyStatus,
        setWebCopyStatus,
        webUploadTargets,
        reportWebhooks,
        initialWebhookSelection,
        handleWebUpload,
        handleWebUploadToTarget,
        handleDevMockUpload,
        publishBlockedReason
    } = useStatsUploads({
        logs,
        stats: safeStats,
        skillUsageData,
        activeStatsViewSettings: statsViewSettings || DEFAULT_STATS_VIEW_SETTINGS,
        mvpWeights,
        disruptionMethod,
        embedded,
        onWebUpload
    });

    // MVP pills are built only from weighted stats (the scoring `contribs`), so all are shown.
    const isMvpStatEnabled = (_name: string) => true;

    const [expandedLeader, setExpandedLeader] = useState<string | null>(null);
    const [activeBoonTab, setActiveBoonTab] = useState<string | null>(null);
    const [activeBoonCategory, setActiveBoonCategory] = useState<BoonCategory>('totalBuffs');
    const [activeBoonMetric, setActiveBoonMetric] = useState<BoonMetric>('total');
    const [boonSearch, setBoonSearch] = useState('');
    const [boonTimelineSearch, setBoonTimelineSearch] = useState('');
    const [activeBoonTimelineId, setActiveBoonTimelineId] = useState<string | null>(null);
    const [boonTimelineScope, setBoonTimelineScope] = useState<'selfBuffs' | 'groupBuffs' | 'squadBuffs' | 'totalBuffs'>('squadBuffs');
    const [boonTimelinePlayerFilter, setBoonTimelinePlayerFilter] = useState('');
    const [selectedBoonTimelinePlayerKey, setSelectedBoonTimelinePlayerKey] = useState<string | null>(null);
    const [selectedBoonTimelineFightIndex, setSelectedBoonTimelineFightIndex] = useState<number | null>(null);
    const [showBoonTimelineIncomingHeatmap, setShowBoonTimelineIncomingHeatmap] = useState(false);
    const [stabPerfPlayerFilter, setStabPerfPlayerFilter] = useState('');
    const [selectedStabPerfPlayerKey, setSelectedStabPerfPlayerKey] = useState<string | null>(null);
    const [selectedStabPerfFightIndex, setSelectedStabPerfFightIndex] = useState<number | null>(null);
    const [showStabPerfHeatmap, setShowStabPerfHeatmap] = useState(false);
    const [showStabPerfDeaths, setShowStabPerfDeaths] = useState(true);
    const [showStabPerfDistance, setShowStabPerfDistance] = useState(true);
    const [allBoonsActiveBoonId, setAllBoonsActiveBoonId] = useState<string | null>(null);
    const [allBoonsScope, setAllBoonsScope] = useState<'selfBuffs' | 'groupBuffs' | 'squadBuffs' | 'totalBuffs'>('squadBuffs');
    const [allBoonsSelectedFightIndex, setAllBoonsSelectedFightIndex] = useState<number | null>(null);
    const [allBoonsSelectedPlayerKey, setAllBoonsSelectedPlayerKey] = useState<string | null>(null);
    const [showBoonUptimeIncomingHeatmap, setShowBoonUptimeIncomingHeatmap] = useState(false);
    const [boonUptimeSearch, setBoonUptimeSearch] = useState('');
    const [activeBoonUptimeId, setActiveBoonUptimeId] = useState<string | null>(null);
    const [boonUptimePlayerFilter, setBoonUptimePlayerFilter] = useState('');
    const [selectedBoonUptimePlayerKey, setSelectedBoonUptimePlayerKey] = useState<string | null>(null);
    const [selectedBoonUptimeFightIndex, setSelectedBoonUptimeFightIndex] = useState<number | null>(null);
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
    const [conditionSort, setConditionSort] = useState<{ key: 'applications' | 'damage' | 'uptime' | 'avgUptime'; dir: 'asc' | 'desc' }>({
        key: 'damage',
        dir: 'desc'
    });
    const isNonDamagingCondition = activeConditionName !== 'all' && NON_DAMAGING_CONDITIONS.has(activeConditionName);
    const showConditionDamage = !isNonDamagingCondition;
    const hasUptimeColumn = conditionDirection === 'outgoing';
    const hasAvgUptimeColumn = conditionDirection === 'outgoing';
    const conditionGridClass = showConditionDamage && hasUptimeColumn && hasAvgUptimeColumn
        ? 'grid-cols-[0.4fr_1.6fr_1fr_1fr_1fr_1fr]'
        : showConditionDamage && (hasUptimeColumn || hasAvgUptimeColumn)
            ? 'grid-cols-[0.4fr_1.6fr_1fr_1fr_1fr]'
            : (hasUptimeColumn && hasAvgUptimeColumn)
                ? 'grid-cols-[0.4fr_1.6fr_1fr_1fr_1fr]'
                : showConditionDamage || hasUptimeColumn || hasAvgUptimeColumn
                    ? 'grid-cols-[0.4fr_1.6fr_1fr_1fr]'
                    : 'grid-cols-[0.4fr_1.6fr_1fr]';
    const effectiveConditionSort = showConditionDamage
        ? conditionSort
        : conditionSort.key === 'damage'
            ? { key: 'applications' as const, dir: 'desc' as const }
            : conditionSort;
    const [activeSupportStat, setActiveSupportStat] = useState<string>('condiCleanse');
    const [activeHealingMetric, setActiveHealingMetric] = useState<string>('healing');
    const [healingCategory, setHealingCategory] = useState<'total' | 'squad' | 'group' | 'self' | 'offSquad'>('total');
    const [activeResUtilitySkill, setActiveResUtilitySkill] = useState<string>('all');
    const [offenseViewMode, setOffenseViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    const [defenseViewMode, setDefenseViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    const [damageMitigationViewMode, setDamageMitigationViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    const [supportViewMode, setSupportViewMode] = useState<'total' | 'per1s' | 'per60s'>('total');
    // Defaults to 'arcdps' so our number matches what players see on their own
    // in-game meter. SupportSection degrades this to 'all' (Elite Insights
    // parity) for datasets whose logs carry no pet/minion cleanse data.
    const [cleanseScope, setCleanseScope] = useState<CleanseScope>('arcdps');
    const [timelineFriendlyScope, setTimelineFriendlyScope] = useState<'squad' | 'squadAllies'>('squad');
    const [damageMitigationScope, setDamageMitigationScope] = useState<'player' | 'minions'>('player');
    const [damageModSearch, setDamageModSearch] = useState('');
    const [activeDamageMod, setActiveDamageMod] = useState('');
    const [incomingDamageModSearch, setIncomingDamageModSearch] = useState('');
    const [activeIncomingDamageMod, setActiveIncomingDamageMod] = useState('');

    const [comparisonMode, setComparisonMode] = useState<'head-to-head' | 'vs-average'>('head-to-head');
    const [comparisonCategory, setComparisonCategory] = useState<'offense' | 'defense' | 'support' | 'healing' | 'general'>('general');
    const [comparisonPlayerAKey, setComparisonPlayerAKey] = useState<string | null>(null);
    const [comparisonPlayerBKey, setComparisonPlayerBKey] = useState<string | null>(null);

    const [skillUsagePlayerFilter, setSkillUsagePlayerFilter] = useState('');
    const [skillUsageSkillFilter, setSkillUsageSkillFilter] = useState('');
    const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [selectedSpikePlayerKey, setSelectedSpikePlayerKey] = useState<string | null>(null);
    const [selectedSpikeFightIndex, setSelectedSpikeFightIndex] = useState<number | null>(null);
    const [spikeMode, setSpikeMode] = useState<'hit' | '1s' | '5s' | '30s'>('hit');
    const [spikeDamageBasis, setSpikeDamageBasis] = useState<'all' | 'downContribution'>('all');
    const [allDamageMode, setAllDamageMode] = useState<'damage' | 'downContribution'>('damage');
    const [allDamageSelectedFightIndex, setAllDamageSelectedFightIndex] = useState<number | null>(null);
    const [allDamageSelectedPlayerKey, setAllDamageSelectedPlayerKey] = useState<string | null>(null);
    const [stripPlayerFilter, setStripPlayerFilter] = useState('');
    const [selectedStripPlayerKey, setSelectedStripPlayerKey] = useState<string | null>(null);
    const [stripMode, setStripMode] = useState<string>('strips');
    const [selectedIncomingStrikePlayerKey, setSelectedIncomingStrikePlayerKey] = useState<string | null>(null);
    const [selectedIncomingStrikeFightIndex, setSelectedIncomingStrikeFightIndex] = useState<number | null>(null);
    const [incomingStrikeMode, setIncomingStrikeMode] = useState<'hit' | '1s' | '5s' | '30s'>('hit');
    const [incomingStrikeUseTotalDamage, setIncomingStrikeUseTotalDamage] = useState(false);
    const [hoveredSkillPlayer, setHoveredSkillPlayer] = useState<string[]>([]);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);
    const [expandedSectionClosing, setExpandedSectionClosing] = useState(false);
    const expandedCloseTimerRef = useRef<number | null>(null);
    const expandedPortalRef = useRef<HTMLDivElement | null>(null);
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

    const apmSkillUsageData = needsApmData ? skillUsageData : EMPTY_SKILL_USAGE_SUMMARY;
    const { apmSpecBuckets: apmSpecTables } = useApmStats(apmSkillUsageData);
    const playerSkillBreakdowns = useMemo(
        () => (needsTopSkillsData ? ((safeStats.playerSkillBreakdowns || []) as PlayerSkillBreakdown[]) : EMPTY_ANY_ARRAY as PlayerSkillBreakdown[]),
        [needsTopSkillsData, safeStats.playerSkillBreakdowns]
    );
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
        ? activePlayerBreakdown.skillMap?.[activePlayerBreakdownSkillId]
            || activePlayerBreakdown.skills.find((skill) => skill.id === activePlayerBreakdownSkillId)
            || null
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
        hitDown: number;
        burst1sDown: number;
        burst5sDown: number;
        burst30sDown: number;
        totalDamage?: number;
        skillName: string;
        buckets5s?: number[];
        buckets5sDown?: number[];
        downIndices5s?: number[];
        deathIndices5s?: number[];
        skillRows?: Array<{ skillName: string; damage: number; downContribution?: number; hits: number; icon?: string }>;
    }>;
    maxHit: number;
    max1s: number;
    max5s: number;
    max30s: number;
    maxTotal?: number;
    maxHitDown: number;
    max1sDown: number;
    max5sDown: number;
    max30sDown: number;
};

    const resolveFightBySelectedPoint = (
        fights: SpikeFight[],
        selectedPoint: { index: number; fightId: string } | null
    ): SpikeFight | null => {
        if (!selectedPoint) return null;
        const selectedIndex = Number(selectedPoint.index);
        if (Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < fights.length) {
            return fights[selectedIndex] || null;
        }
        const selectedFightId = String(selectedPoint.fightId || '').trim();
        if (selectedFightId) {
            return fights.find((fight) => String(fight?.id || '').trim() === selectedFightId) || null;
        }
        return null;
    };
    const normalizeSpikeValueEntry = (entry: any) => {
        if (entry && typeof entry === 'object') {
            const legacyDamage = Number(entry?.damage || 0);
            const skillRows = Array.isArray(entry?.skillRows) ? entry.skillRows : undefined;
            const downFromRows = (skillRows || []).reduce((sum: number, row: any) => sum + Number(row?.downContribution || 0), 0);
            return {
                hit: Number(entry?.hit ?? legacyDamage),
                burst1s: Number(entry?.burst1s || 0),
                burst5s: Number(entry?.burst5s || 0),
                burst30s: Number(entry?.burst30s || 0),
                hitDown: Number(entry?.hitDown || downFromRows || 0),
                burst1sDown: Number(entry?.burst1sDown || 0),
                burst5sDown: Number(entry?.burst5sDown || 0),
                burst30sDown: Number(entry?.burst30sDown || 0),
                totalDamage: Number(entry?.totalDamage ?? ((Array.isArray(entry?.buckets5s) ? entry.buckets5s : []).reduce((sum: number, value: any) => sum + Number(value || 0), 0))),
                skillName: String(entry?.skillName || ''),
                buckets5s: Array.isArray(entry?.buckets5s) ? entry.buckets5s : undefined,
                buckets5sDown: Array.isArray(entry?.buckets5sDown) ? entry.buckets5sDown : undefined,
                downIndices5s: Array.isArray(entry?.downIndices5s) ? entry.downIndices5s : undefined,
                deathIndices5s: Array.isArray(entry?.deathIndices5s) ? entry.deathIndices5s : undefined,
                skillRows
            };
        }
        const legacyDamage = Number(entry || 0);
        return {
            hit: legacyDamage,
            burst1s: 0,
            burst5s: 0,
            burst30s: 0,
            hitDown: 0,
            burst1sDown: 0,
            burst5sDown: 0,
            burst30sDown: 0,
            totalDamage: 0,
            skillName: '',
            buckets5s: undefined,
            buckets5sDown: undefined,
            downIndices5s: undefined,
            deathIndices5s: undefined,
            skillRows: undefined
        };
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
        peakHitDown: number;
        peak1sDown: number;
        peak5sDown: number;
        peak30sDown: number;
        totalDamage?: number;
        peakFightLabel: string;
        peakSkillName: string;
    };

    const spikeDamageData = useMemo<{ fights: SpikeFight[]; players: SpikePlayer[] }>(() => {
        if (!needsSpikeData) {
            return { fights: [], players: [] };
        }
        const resolveFightTimestampMs = (details: any, fallback?: any) => parseTimestamp(
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
        const precomputedHasDownContributionValues = precomputedFights.some((fight: any) => {
            const rawValues = fight?.values && typeof fight.values === 'object' ? Object.values(fight.values) : [];
            return rawValues.some((value: any) => value && typeof value === 'object' && (
                Number((value as any).hitDown || 0) > 0
                || Number((value as any).burst1sDown || 0) > 0
                || Number((value as any).burst5sDown || 0) > 0
                || Number((value as any).burst30sDown || 0) > 0
            ));
        }) || precomputedPlayers.some((player: any) =>
            Number(player?.peakHitDown || 0) > 0
            || Number(player?.peak1sDown || 0) > 0
            || Number(player?.peak5sDown || 0) > 0
            || Number(player?.peak30sDown || 0) > 0
        );
        const shouldUsePrecomputedSpike = (precomputedFights.length > 0 || precomputedPlayers.length > 0)
            && (precomputedHasBurstValues || logs.length === 0)
            && (spikeDamageBasis !== 'downContribution' || precomputedHasDownContributionValues || logs.length === 0);
        if (shouldUsePrecomputedSpike) {
            const fights: SpikeFight[] = precomputedFights.map((fight: any, index: number) => {
                const values = fight?.values && typeof fight.values === 'object' ? fight.values : {};
                return {
                    id: String(fight?.id || `fight-${index + 1}`),
                    shortLabel: String(fight?.shortLabel || `F${index + 1}`),
                    fullLabel: sanitizeWvwLabel(fight?.fullLabel || `Fight ${index + 1}`),
                    timestamp: Number(fight?.timestamp || 0),
                    values,
                    maxHit: Number(fight?.maxHit ?? fight?.maxDamage ?? 0),
                    max1s: Number(fight?.max1s || 0),
                    max5s: Number(fight?.max5s || 0),
                    max30s: Number(fight?.max30s || 0),
                    maxHitDown: Number(fight?.maxHitDown || 0),
                    max1sDown: Number(fight?.max1sDown || 0),
                    max5sDown: Number(fight?.max5sDown || 0),
                    max30sDown: Number(fight?.max30sDown || 0)
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
                peakHitDown: Number(player?.peakHitDown || 0),
                peak1sDown: Number(player?.peak1sDown || 0),
                peak5sDown: Number(player?.peak5sDown || 0),
                peak30sDown: Number(player?.peak30sDown || 0),
                peakFightLabel: sanitizeWvwLabel(player?.peakFightLabel || ''),
                peakSkillName: String(player?.peakSkillName || '')
            }));
            return { fights, players };
        }

        const getHighestSingleHit = (player: any, details: any) => {
            const skillMap = details?.skillMap || {};
            const buffMap = details?.buffMap || {};
            let bestValue = 0;
            let bestDownContribution = 0;
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
                if (entry.indirectDamage) return;
                const totalDamage = Number(entry.totalDamage || 0);
                const candidates = [
                    Number(entry.max),
                    Number(entry.maxDamage),
                    Number(entry.maxHit)
                ].filter((n) => Number.isFinite(n) && n > 0);
                let peak = candidates.length > 0 ? Math.max(...candidates) : 0;
                // Guard: max should never exceed totalDamage (corrupted totalDamageDist entries)
                if (peak > 0 && Number.isFinite(totalDamage) && totalDamage > 0 && peak > totalDamage) {
                    peak = totalDamage;
                }
                if (peak > bestValue) {
                    bestValue = peak;
                    bestName = resolveSkillName(entry.id);
                }
                const downContribution = Number(entry.downContribution || 0);
                if (downContribution > bestDownContribution) {
                    bestDownContribution = downContribution;
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
            return { peak: bestValue, peakDownContribution: bestDownContribution, skillName: bestName || 'Unknown Skill' };
        };

        const getPerSecondDamageSeries = (player: any): { perSecond: number[]; usedFallback: boolean } => {
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
            const usedFallback = !targetPhase0;
            const cumulative = targetPhase0
                ? targetPhase0
                : (Array.isArray(totalPhase0) ? totalPhase0.map((v: any) => Number(v || 0)) : []);
            return { perSecond: toPerSecond(cumulative), usedFallback };
        };
        const getMaxRollingDamage = (values: number[], window: number) => {
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
        const getBuckets = (values: number[], bucketSizeSeconds: number) => {
            if (!Array.isArray(values) || values.length === 0 || bucketSizeSeconds <= 0) return [] as number[];
            const out: number[] = [];
            for (let i = 0; i < values.length; i += bucketSizeSeconds) {
                const end = Math.min(i + bucketSizeSeconds, values.length);
                const bucket = values.slice(i, end).reduce((sum, value) => sum + Number(value || 0), 0);
                out.push(bucket);
            }
            return out;
        };
        const getDamageAndDownContributionTotals = (player: any, details: any) => {
            let damageTotal = 0;
            let downContributionTotal = 0;
            const totalsBySkill = new Map<number, { damage: number; downContribution: number }>();
            const consume = (entry: any) => {
                if (!entry || typeof entry !== 'object') return;
                if (entry.indirectDamage) return;
                const damage = Number(entry.totalDamage || 0);
                const downContribution = Number(entry.downContribution || 0);
                if (!Number.isFinite(damage) && !Number.isFinite(downContribution)) return;
                damageTotal += Number.isFinite(damage) ? damage : 0;
                downContributionTotal += Number.isFinite(downContribution) ? downContribution : 0;
            };
            if (Array.isArray(player?.targetDamageDist)) {
                player.targetDamageDist.forEach((targetGroup: any) => {
                    if (!Array.isArray(targetGroup)) return;
                    targetGroup.forEach((list: any) => {
                        if (!Array.isArray(list)) return;
                        list.forEach((entry: any) => {
                            const skillId = Number(entry?.id);
                            if (Number.isFinite(skillId)) {
                                const existing = totalsBySkill.get(skillId) || { damage: 0, downContribution: 0 };
                                existing.damage += Number(entry?.totalDamage || 0);
                                existing.downContribution += Number(entry?.downContribution || 0);
                                totalsBySkill.set(skillId, existing);
                            }
                            consume(entry);
                        });
                    });
                });
            }
            const allowTotalSupplement = !details?.detailedWvW;
            if (allowTotalSupplement && Array.isArray(player?.totalDamageDist)) {
                player.totalDamageDist.forEach((list: any) => {
                    if (!Array.isArray(list)) return;
                    list.forEach((entry: any) => {
                        const skillId = Number(entry?.id);
                        if (!Number.isFinite(skillId)) {
                            consume(entry);
                            return;
                        }
                        const existing = totalsBySkill.get(skillId);
                        if (!existing) {
                            consume(entry);
                            return;
                        }
                        const deltaDamage = Number(entry?.totalDamage || 0) - Number(existing.damage || 0);
                        const deltaDown = Number(entry?.downContribution || 0) - Number(existing.downContribution || 0);
                        if (deltaDamage <= 0 && deltaDown <= 0) return;
                        consume({
                            ...entry,
                            totalDamage: Math.max(0, deltaDamage),
                            downContribution: Math.max(0, deltaDown)
                        });
                    });
                });
            }
            return {
                damageTotal: Math.max(0, damageTotal),
                downContributionTotal: Math.max(0, downContributionTotal)
            };
        };

        const fights: SpikeFight[] = [];
        const playerMap = new Map<string, SpikePlayer>();

        derivationLogs.forEach((log) => {
            const details = getDetails(log);
            if (!details || !details.players) return;
            const fightIndex = fights.length + 1;
            const fullLabel = buildFightLabelV2({
                zone: details.fightName || log.fightName || `Fight ${fightIndex}`,
                durationMs: details?.durationMS,
                avgPosition: computeFightAvgPosition(details),
            });
            const values: Record<string, {
                hit: number;
                burst1s: number;
                burst5s: number;
                burst30s: number;
                hitDown: number;
                burst1sDown: number;
                burst5sDown: number;
                burst30sDown: number;
                skillName: string;
                buckets5s?: number[];
                buckets5sDown?: number[];
            }> = {};

            const fightPlayers = Array.isArray(details.players) ? details.players : [];
            fightPlayers.forEach((player: any) => {
                if (player?.notInSquad) return;
                const account = String(player?.account || player?.name || 'Unknown');
                const characterName = String(player?.character_name || player?.display_name || player?.name || '');
                const profession = String(player?.profession || 'Unknown');
                const key = `${account}|${profession}`;
                const spike = getHighestSingleHit(player, details);
                const hit = Number(spike.peak || 0);
                const hitDown = Number(spike.peakDownContribution || 0);
                const { perSecond: perSecondRaw, usedFallback } = getPerSecondDamageSeries(player);
                const { damageTotal, downContributionTotal } = getDamageAndDownContributionTotals(player, details);
                // When damage1S fallback was used, it includes pet/minion damage.
                // Scale down to personal-only damage using targetDamageDist totals.
                const perSecondTotal = usedFallback ? perSecondRaw.reduce((sum, v) => sum + v, 0) : 0;
                const personalRatio = usedFallback && perSecondTotal > 0 && damageTotal > 0 && damageTotal < perSecondTotal
                    ? Math.min(1, damageTotal / perSecondTotal)
                    : 1;
                const perSecond = personalRatio < 1
                    ? perSecondRaw.map((v) => Math.round(v * personalRatio))
                    : perSecondRaw;
                const downRatio = damageTotal > 0 ? Math.min(1, Math.max(0, downContributionTotal / damageTotal)) : 0;
                const perSecondDown = perSecond.map((value) => Number(value || 0) * downRatio);
                const burst1s = Number(getMaxRollingDamage(perSecond, 1) || 0);
                const burst5s = Number(getMaxRollingDamage(perSecond, 5) || 0);
                const burst30s = Number(getMaxRollingDamage(perSecond, 30) || 0);
                const burst1sDown = Number(getMaxRollingDamage(perSecondDown, 1) || 0);
                const burst5sDown = Number(getMaxRollingDamage(perSecondDown, 5) || 0);
                const burst30sDown = Number(getMaxRollingDamage(perSecondDown, 30) || 0);
                const durationBuckets = Math.max(0, Math.ceil(Number(details?.durationMS || 0) / 5000));
                const damageBuckets = Math.max(0, Math.ceil(perSecond.length / 5));
                const downBuckets = Math.max(0, Math.ceil(perSecondDown.length / 5));
                const bucketCount = Math.max(durationBuckets, damageBuckets, downBuckets);
                const rawBuckets = getBuckets(perSecond, 5);
                const rawBucketsDown = getBuckets(perSecondDown, 5);
                const buckets5s = Array.from({ length: bucketCount }, (_, idx) => Number(rawBuckets[idx] || 0));
                const buckets5sDown = Array.from({ length: bucketCount }, (_, idx) => Number(rawBucketsDown[idx] || 0));
                values[key] = {
                    hit,
                    burst1s,
                    burst5s,
                    burst30s,
                    hitDown,
                    burst1sDown,
                    burst5sDown,
                    burst30sDown,
                    skillName: spike.skillName || 'Unknown Skill',
                    buckets5s,
                    buckets5sDown
                };

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
                    peakHitDown: 0,
                    peak1sDown: 0,
                    peak5sDown: 0,
                    peak30sDown: 0,
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
                if (hitDown > existing.peakHitDown) existing.peakHitDown = hitDown;
                if (burst1sDown > existing.peak1sDown) existing.peak1sDown = burst1sDown;
                if (burst5sDown > existing.peak5sDown) existing.peak5sDown = burst5sDown;
                if (burst30sDown > existing.peak30sDown) existing.peak30sDown = burst30sDown;
                playerMap.set(key, existing);
            });

            const maxHit = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hit || 0)), 0);
            const max1s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1s || 0)), 0);
            const max5s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5s || 0)), 0);
            const max30s = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30s || 0)), 0);
            const maxHitDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.hitDown || 0)), 0);
            const max1sDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst1sDown || 0)), 0);
            const max5sDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst5sDown || 0)), 0);
            const max30sDown = Object.values(values).reduce((best, value) => Math.max(best, Number(value?.burst30sDown || 0)), 0);
            fights.push({
                id: log.filePath || log.id || `fight-${fightIndex}`,
                shortLabel: `F${fightIndex}`,
                fullLabel,
                timestamp: resolveFightTimestampMs(details, log),
                values,
                maxHit,
                max1s,
                max5s,
                max30s,
                maxHitDown,
                max1sDown,
                max5sDown,
                max30sDown
            });
        });

        const players = Array.from(playerMap.values()).sort((a, b) => {
            if (b.peakHit !== a.peakHit) return b.peakHit - a.peakHit;
            return a.displayName.localeCompare(b.displayName);
        });

        return { fights, players };
    }, [derivationLogs, safeStats, needsSpikeData, spikeDamageBasis]);

    const allDamageData = useMemo<AllDamageData>(() => {
        if (!needsAllDamageData) return { fights: [], players: [] };
        const precomputed = (safeStats as any)?.allDamage;
        if (precomputed && Array.isArray(precomputed.fights)) {
            return precomputed as AllDamageData;
        }
        return { fights: [], players: [] };
    }, [safeStats, needsAllDamageData]);

    const incomingStrikeDamageData = useMemo<{ fights: SpikeFight[]; players: SpikePlayer[] }>(() => {
        if (!needsIncomingStrikeData) {
            return { fights: [], players: [] };
        }
        const precomputedIncoming = (safeStats as any)?.incomingStrikeDamage;
        const precomputedFights = Array.isArray(precomputedIncoming?.fights) ? precomputedIncoming.fights : [];
        const precomputedPlayers = Array.isArray(precomputedIncoming?.players) ? precomputedIncoming.players : [];
        if (precomputedFights.length === 0 && precomputedPlayers.length === 0) {
            return { fights: [], players: [] };
        }

        const fights: SpikeFight[] = precomputedFights.map((fight: any, index: number) => {
            const values = ((fight?.values && typeof fight.values === 'object' ? fight.values : {}) as SpikeFight['values']);
            return {
                id: String(fight?.id || `fight-${index + 1}`),
                shortLabel: String(fight?.shortLabel || `F${index + 1}`),
                fullLabel: sanitizeWvwLabel(fight?.fullLabel || `Fight ${index + 1}`),
                timestamp: Number(fight?.timestamp || 0),
                values,
                maxHit: Number(fight?.maxHit ?? fight?.maxDamage ?? 0),
                max1s: Number(fight?.max1s || 0),
                max5s: Number(fight?.max5s || 0),
                max30s: Number(fight?.max30s || 0),
                maxTotal: Number(
                    fight?.maxTotal
                    ?? Object.values(values).reduce((best, value: any) => Math.max(best, Number(value?.totalDamage || 0)), 0)
                ),
                maxHitDown: Number(fight?.maxHitDown || 0),
                max1sDown: Number(fight?.max1sDown || 0),
                max5sDown: Number(fight?.max5sDown || 0),
                max30sDown: Number(fight?.max30sDown || 0)
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
            peakHitDown: Number(player?.peakHitDown || 0),
            peak1sDown: Number(player?.peak1sDown || 0),
            peak5sDown: Number(player?.peak5sDown || 0),
            peak30sDown: Number(player?.peak30sDown || 0),
            totalDamage: Number(player?.totalDamage || 0),
            peakFightLabel: sanitizeWvwLabel(player?.peakFightLabel || ''),
            peakSkillName: String(player?.peakSkillName || '')
        }));

        return { fights, players };
    }, [safeStats, needsIncomingStrikeData]);

    const spikePlayerMap = useMemo(() => {
        const map = new Map<string, (typeof spikeDamageData.players)[number]>();
        spikeDamageData.players.forEach((player) => map.set(player.key, player));
        return map;
    }, [spikeDamageData.players]);

    const groupedSpikePlayers = useMemo(() => {
        const modeValue = (player: SpikePlayer) => (
            spikeDamageBasis === 'downContribution'
                ? (spikeMode === 'hit' ? player.peakHitDown : spikeMode === '1s' ? player.peak1sDown : spikeMode === '5s' ? player.peak5sDown : player.peak30sDown)
                : (spikeMode === 'hit' ? player.peakHit : spikeMode === '1s' ? player.peak1s : spikeMode === '5s' ? player.peak5s : player.peak30s)
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
    }, [spikeDamageData.players, spikePlayerFilter, spikeMode, spikeDamageBasis]);

    const selectedSpikePlayer = selectedSpikePlayerKey
        ? spikePlayerMap.get(selectedSpikePlayerKey) || null
        : null;

    const spikeChartData = useMemo(() => {
        if (!selectedSpikePlayerKey) return [];
        const getValue = (entry: {
            hit: number;
            burst1s: number;
            burst5s: number;
            burst30s: number;
            hitDown: number;
            burst1sDown: number;
            burst5sDown: number;
            burst30sDown: number;
        } | undefined) => {
            if (!entry) return 0;
            if (spikeDamageBasis === 'downContribution') {
                if (spikeMode === 'hit') return Number(entry.hitDown || 0);
                if (spikeMode === '1s') return Number(entry.burst1sDown || 0);
                if (spikeMode === '5s') return Number(entry.burst5sDown || 0);
                return Number(entry.burst30sDown || 0);
            }
            if (spikeMode === 'hit') return Number(entry.hit || 0);
            if (spikeMode === '1s') return Number(entry.burst1s || 0);
            if (spikeMode === '5s') return Number(entry.burst5s || 0);
            return Number(entry.burst30s || 0);
        };
        const getReference = (fight: SpikeFight) => {
            if (spikeDamageBasis === 'downContribution') {
                if (spikeMode === 'hit') return Number(fight.maxHitDown || 0);
                if (spikeMode === '1s') return Number(fight.max1sDown || 0);
                if (spikeMode === '5s') return Number(fight.max5sDown || 0);
                return Number(fight.max30sDown || 0);
            }
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
            damage: getValue(normalizeSpikeValueEntry(fight.values[selectedSpikePlayerKey])),
            maxDamage: getReference(fight),
            skillName: String(normalizeSpikeValueEntry(fight.values[selectedSpikePlayerKey]).skillName || '')
        }));
    }, [spikeDamageData.fights, selectedSpikePlayerKey, spikeMode, spikeDamageBasis]);

    const spikeChartMaxY = useMemo(() => {
        const selectedPeak = spikeChartData.reduce((best, entry) => Math.max(best, Number(entry.damage || 0)), 0);
        const fightPeak = spikeChartData.reduce((best, entry) => Math.max(best, Number(entry.maxDamage || 0)), 0);
        return Math.max(1, selectedPeak, fightPeak);
    }, [spikeChartData]);

    // ── Strip Spikes ──────────────────────────────────────────────────────────────
    const stripSpikesData = useMemo<{ fights: StripFight[]; players: StripPlayer[] }>(() => {
        const raw = safeStats?.stripSpikes;
        if (!raw) return { fights: [], players: [] };
        return {
            fights: Array.isArray(raw.fights) ? raw.fights : [],
            players: Array.isArray(raw.players) ? raw.players : [],
        };
    }, [safeStats]);

    const stripPlayerMap = useMemo(() => {
        const map = new Map<string, (typeof stripSpikesData.players)[number]>();
        stripSpikesData.players.forEach((player) => map.set(player.key, player));
        return map;
    }, [stripSpikesData.players]);

    const groupedStripPlayers = useMemo((): Array<{ profession: string; players: FightMetricPlayer[] }> => {
        const modeValue = (player: any) => {
            if (stripMode === 'stripTime') return Number(player.peakStripTime || 0);
            if (stripMode === 'stripDownContrib') return Number(player.peakStripDownContrib || 0);
            return Number(player.peakStrips || 0);
        };
        const term = stripPlayerFilter.trim().toLowerCase();
        const filtered = !term
            ? stripSpikesData.players
            : stripSpikesData.players.filter((player) =>
                player.displayName.toLowerCase().includes(term)
                || player.account.toLowerCase().includes(term)
                || player.profession.toLowerCase().includes(term)
            );
        const groups = new Map<string, FightMetricPlayer[]>();
        filtered.forEach((player) => {
            const profession = player.profession || 'Unknown';
            const list = groups.get(profession) || [];
            list.push({
                key: player.key,
                account: player.account,
                displayName: player.displayName,
                characterName: player.characterName,
                profession: player.profession,
                professionList: player.professionList,
                logs: player.logs,
                value: modeValue(player),
                peakFightLabel: player.peakFightLabel,
            });
            groups.set(profession, list);
        });
        return Array.from(groups.entries())
            .map(([profession, players]) => ({
                profession,
                players: [...players].sort((a, b) => b.value - a.value || a.displayName.localeCompare(b.displayName))
            }))
            .sort((a, b) => {
                const totalA = a.players.reduce((sum, p) => sum + p.value, 0);
                const totalB = b.players.reduce((sum, p) => sum + p.value, 0);
                return totalB - totalA;
            });
    }, [stripSpikesData.players, stripPlayerFilter, stripMode]);

    const selectedStripPlayer = selectedStripPlayerKey
        ? (() => {
            const raw = stripPlayerMap.get(selectedStripPlayerKey);
            if (!raw) return null;
            const modeValue = stripMode === 'stripTime' ? raw.peakStripTime
                : stripMode === 'stripDownContrib' ? raw.peakStripDownContrib
                : raw.peakStrips;
            return {
                key: raw.key,
                account: raw.account,
                displayName: raw.displayName,
                characterName: raw.characterName,
                profession: raw.profession,
                professionList: raw.professionList,
                logs: raw.logs,
                value: Number(modeValue || 0),
                peakFightLabel: raw.peakFightLabel,
            } as FightMetricPlayer;
        })()
        : null;

    const stripChartData = useMemo((): FightMetricPoint[] => {
        if (!selectedStripPlayerKey) return [];
        return stripSpikesData.fights.map((fight, index) => {
            const entry = fight.values?.[selectedStripPlayerKey];
            const value = stripMode === 'stripTime' ? Number(entry?.stripTime || 0)
                : stripMode === 'stripDownContrib' ? Number(entry?.stripDownContrib || 0)
                : Number(entry?.strips || 0);
            const maxValue = stripMode === 'stripTime' ? Number(fight.maxStripTime || 0)
                : stripMode === 'stripDownContrib' ? Number(fight.maxStripDownContrib || 0)
                : Number(fight.maxStrips || 0);
            return {
                index,
                fightId: fight.id,
                shortLabel: fight.shortLabel,
                fullLabel: fight.fullLabel,
                timestamp: Number(fight.timestamp || 0),
                value,
                maxValue,
            };
        });
    }, [stripSpikesData.fights, selectedStripPlayerKey, stripMode]);

    const stripChartMaxY = useMemo(() => {
        const selectedPeak = stripChartData.reduce((best, entry) => Math.max(best, Number(entry.value || 0)), 0);
        const fightPeak = stripChartData.reduce((best, entry) => Math.max(best, Number(entry.maxValue || 0)), 0);
        return Math.max(1, selectedPeak, fightPeak);
    }, [stripChartData]);


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
        const selectedFight = resolveFightBySelectedPoint(spikeDamageData.fights, selectedPoint);
        const [account, profession] = selectedSpikePlayerKey.split('|');
        const selectedLog = logs.find((log) => {
            const id = String(log?.filePath || log?.id || '');
            return id === String(selectedPoint.fightId || '');
        });
        const details = getDetails(selectedLog);
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
        const selectedFightEntry = normalizeSpikeValueEntry(selectedFight?.values?.[selectedSpikePlayerKey]);
        const precomputedBuckets = spikeDamageBasis === 'downContribution'
            ? (Array.isArray(selectedFightEntry?.buckets5sDown) ? selectedFightEntry?.buckets5sDown || [] : [])
            : (Array.isArray(selectedFightEntry?.buckets5s) ? selectedFightEntry?.buckets5s || [] : []);
        const precomputedDownIndices = Array.isArray(selectedFightEntry?.downIndices5s)
            ? (selectedFightEntry.downIndices5s as any[])
                .map((value: any) => Number(value))
                .filter((value: number) => Number.isFinite(value) && value >= 0)
            : [];
        const precomputedDeathIndices = Array.isArray(selectedFightEntry?.deathIndices5s)
            ? (selectedFightEntry.deathIndices5s as any[])
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
                title: `Fight Breakdown - ${selectedPoint.shortLabel || 'Fight'} (5s ${spikeDamageBasis === 'downContribution' ? 'Down Contribution' : 'Damage'} Buckets)`,
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
        const getDamageTotals = () => {
            let damageTotal = 0;
            let downContributionTotal = 0;
            const totalsBySkill = new Map<number, { damage: number; downContribution: number }>();
            const consume = (entry: any) => {
                if (!entry || typeof entry !== 'object') return;
                if (entry.indirectDamage) return;
                const damage = Number(entry.totalDamage || 0);
                const downContribution = Number(entry.downContribution || 0);
                if (!Number.isFinite(damage) && !Number.isFinite(downContribution)) return;
                damageTotal += Number.isFinite(damage) ? damage : 0;
                downContributionTotal += Number.isFinite(downContribution) ? downContribution : 0;
            };
            if (Array.isArray(selectedPlayerAny?.targetDamageDist)) {
                selectedPlayerAny.targetDamageDist.forEach((targetGroup: any) => {
                    if (!Array.isArray(targetGroup)) return;
                    targetGroup.forEach((list: any) => {
                        if (!Array.isArray(list)) return;
                        list.forEach((entry: any) => {
                            const skillId = Number(entry?.id);
                            if (Number.isFinite(skillId)) {
                                const existing = totalsBySkill.get(skillId) || { damage: 0, downContribution: 0 };
                                existing.damage += Number(entry?.totalDamage || 0);
                                existing.downContribution += Number(entry?.downContribution || 0);
                                totalsBySkill.set(skillId, existing);
                            }
                            consume(entry);
                        });
                    });
                });
            }
            if (!details?.detailedWvW && Array.isArray(selectedPlayerAny?.totalDamageDist)) {
                selectedPlayerAny.totalDamageDist.forEach((list: any) => {
                    if (!Array.isArray(list)) return;
                    list.forEach((entry: any) => {
                        const skillId = Number(entry?.id);
                        if (!Number.isFinite(skillId)) {
                            consume(entry);
                            return;
                        }
                        const existing = totalsBySkill.get(skillId);
                        if (!existing) {
                            consume(entry);
                            return;
                        }
                        const deltaDamage = Number(entry?.totalDamage || 0) - Number(existing.damage || 0);
                        const deltaDown = Number(entry?.downContribution || 0) - Number(existing.downContribution || 0);
                        if (deltaDamage <= 0 && deltaDown <= 0) return;
                        consume({
                            ...entry,
                            totalDamage: Math.max(0, deltaDamage),
                            downContribution: Math.max(0, deltaDown)
                        });
                    });
                });
            }
            return { damageTotal, downContributionTotal };
        };
        const { damageTotal: drilldownDamageTotal, downContributionTotal: drilldownDownContributionTotal } = getDamageTotals();
        const getDownContributionRatio = () => {
            if (drilldownDamageTotal <= 0) return 0;
            return Math.min(1, Math.max(0, drilldownDownContributionTotal / drilldownDamageTotal));
        };

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
        const usedDrilldownFallback = !targetPhase0;
        const cumulative = targetPhase0
            ? targetPhase0
            : (Array.isArray(totalPhase0) ? totalPhase0.map((v: any) => Number(v || 0)) : []);
        const perSecondRaw = toPerSecond(cumulative);
        // When damage1S fallback was used, it includes pet/minion damage.
        // Scale down to personal-only damage using targetDamageDist totals.
        const drilldownPerSecondTotal = usedDrilldownFallback ? perSecondRaw.reduce((sum, v) => sum + v, 0) : 0;
        const drilldownPersonalRatio = usedDrilldownFallback && drilldownPerSecondTotal > 0 && drilldownDamageTotal > 0 && drilldownDamageTotal < drilldownPerSecondTotal
            ? Math.min(1, drilldownDamageTotal / drilldownPerSecondTotal)
            : 1;
        const perSecond = drilldownPersonalRatio < 1
            ? perSecondRaw.map((v) => Math.round(v * drilldownPersonalRatio))
            : perSecondRaw;
        const downRatio = getDownContributionRatio();
        const perSecondSeries = spikeDamageBasis === 'downContribution'
            ? perSecond.map((value) => Number(value || 0) * downRatio)
            : perSecond;
        const bucketSizeSeconds = 5;
        const durationBuckets = Math.max(0, Math.ceil(Number(details?.durationMS || 0) / (bucketSizeSeconds * 1000)));
        const damageBuckets = Math.max(0, Math.ceil(perSecondSeries.length / bucketSizeSeconds));
        const bucketCount = Math.max(durationBuckets, damageBuckets);
        const data: Array<{ label: string; value: number }> = [];
        for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
            const start = bucketIndex * bucketSizeSeconds;
            const end = Math.min(start + bucketSizeSeconds, perSecondSeries.length);
            const value = perSecondSeries.slice(start, end).reduce((sum, entry) => sum + Number(entry || 0), 0);
            data.push({
                label: `${start}s-${start + bucketSizeSeconds}s`,
                value
            });
        }
        const labels = data.map((entry) => entry.label);
        return {
            title: `Fight Breakdown - ${fightLabel} (5s ${spikeDamageBasis === 'downContribution' ? 'Down Contribution' : 'Damage'} Buckets)`,
            data,
            downLabels: buildMarkerLabels(labels, downMsRaw),
            deathLabels: buildMarkerLabels(labels, deathMsRaw),
            downIndices: buildMarkerIndices(data.length, downMsRaw),
            deathIndices: buildMarkerIndices(data.length, deathMsRaw)
        };
    }, [selectedSpikeFightIndex, spikeChartData, selectedSpikePlayerKey, logs, spikeDamageData.fights, spikePlayerMap, spikeDamageBasis]);

    const incomingStrikePlayerMap = useMemo(() => {
        const map = new Map<string, (typeof incomingStrikeDamageData.players)[number]>();
        incomingStrikeDamageData.players.forEach((player) => map.set(player.key, player));
        return map;
    }, [incomingStrikeDamageData.players]);

    const groupedIncomingStrikePlayers = useMemo(() => {
        const modeValue = (player: SpikePlayer) => (
            incomingStrikeUseTotalDamage
                ? Number(player.totalDamage || 0)
                : incomingStrikeMode === 'hit' ? player.peakHit : incomingStrikeMode === '1s' ? player.peak1s : incomingStrikeMode === '5s' ? player.peak5s : player.peak30s
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
    }, [incomingStrikeDamageData.players, incomingStrikePlayerFilter, incomingStrikeMode, incomingStrikeUseTotalDamage]);

    const selectedIncomingStrikePlayer = selectedIncomingStrikePlayerKey
        ? incomingStrikePlayerMap.get(selectedIncomingStrikePlayerKey) || null
        : null;

    const incomingStrikeChartData = useMemo(() => {
        if (!selectedIncomingStrikePlayerKey) return [];
        const getValue = (entry: { hit: number; burst1s: number; burst5s: number; burst30s: number } | undefined) => {
            if (!entry) return 0;
            if (incomingStrikeUseTotalDamage) return Number((entry as any).totalDamage || 0);
            if (incomingStrikeMode === 'hit') return Number(entry.hit || 0);
            if (incomingStrikeMode === '1s') return Number(entry.burst1s || 0);
            if (incomingStrikeMode === '5s') return Number(entry.burst5s || 0);
            return Number(entry.burst30s || 0);
        };
        const getReference = (fight: SpikeFight) => {
            if (incomingStrikeUseTotalDamage) return Number(fight.maxTotal || 0);
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
            damage: getValue(normalizeSpikeValueEntry(fight.values[selectedIncomingStrikePlayerKey])),
            maxDamage: getReference(fight),
            skillName: incomingStrikeUseTotalDamage
                ? ''
                : String(normalizeSpikeValueEntry(fight.values[selectedIncomingStrikePlayerKey]).skillName || '')
        }));
    }, [incomingStrikeDamageData.fights, selectedIncomingStrikePlayerKey, incomingStrikeMode, incomingStrikeUseTotalDamage]);

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
        const selectedFight = resolveFightBySelectedPoint(incomingStrikeDamageData.fights, selectedPoint);
        const selectedFightEntry = normalizeSpikeValueEntry(selectedFight?.values?.[selectedIncomingStrikePlayerKey]);
        const precomputedBuckets = Array.isArray(selectedFightEntry?.buckets5s)
            ? selectedFightEntry?.buckets5s || []
            : [];
        const precomputedDownIndices = Array.isArray(selectedFightEntry?.downIndices5s)
            ? (selectedFightEntry.downIndices5s as any[])
                .map((value: any) => Number(value))
                .filter((value: number) => Number.isFinite(value) && value >= 0)
            : [];
        const precomputedDeathIndices = Array.isArray(selectedFightEntry?.deathIndices5s)
            ? (selectedFightEntry.deathIndices5s as any[])
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
        const fallbackMetricValue = (() => {
            if (incomingStrikeUseTotalDamage) return Number(selectedFightEntry.totalDamage || 0);
            if (incomingStrikeMode === 'hit') return Number(selectedFightEntry.hit || 0);
            if (incomingStrikeMode === '1s') return Number(selectedFightEntry.burst1s || 0);
            if (incomingStrikeMode === '5s') return Number(selectedFightEntry.burst5s || 0);
            return Number(selectedFightEntry.burst30s || 0);
        })();
        if (fallbackMetricValue > 0) {
            return {
                title: `Fight Breakdown - ${selectedPoint.shortLabel || 'Fight'} (Estimated)`,
                data: [{ label: '0s-5s', value: fallbackMetricValue }],
                downLabels: [] as string[],
                deathLabels: [] as string[],
                downIndices: [] as number[],
                deathIndices: [] as number[]
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
    }, [selectedIncomingStrikeFightIndex, incomingStrikeChartData, selectedIncomingStrikePlayerKey, incomingStrikeDamageData.fights, incomingStrikeMode, incomingStrikeUseTotalDamage]);

    const incomingStrikeFightSkillRows = useMemo(() => {
        if (selectedIncomingStrikeFightIndex === null || !selectedIncomingStrikePlayerKey) return [];
        const selectedPoint = incomingStrikeChartData.find((point) => point.index === selectedIncomingStrikeFightIndex);
        if (!selectedPoint) return [];
        const selectedFight = resolveFightBySelectedPoint(incomingStrikeDamageData.fights, selectedPoint);
        const selectedFightEntry = normalizeSpikeValueEntry(selectedFight?.values?.[selectedIncomingStrikePlayerKey]);
        const rows = selectedFightEntry?.skillRows || [];
        const normalizedRows = [...rows]
            .filter((row) => Number(row?.damage || 0) > 0 || Number(row?.downContribution || 0) > 0)
            .sort((a, b) => Number(b.damage || 0) - Number(a.damage || 0))
            .slice(0, 30);
        if (normalizedRows.length > 0) return normalizedRows;
        const selectedLog = logs.find((log) => String(log?.filePath || log?.id || '') === String(selectedPoint.fightId || ''));
        const details = getDetails(selectedLog);
        if (details && selectedIncomingStrikePlayerKey) {
            const knownProfessionNames = new Set(Object.keys(PROFESSION_COLORS));
            const knownProfessionList = Object.keys(PROFESSION_COLORS)
                .filter((name) => name && name !== 'Unknown')
                .sort((a, b) => b.length - a.length);
            const baseProfessionNames = ['Guardian', 'Revenant', 'Warrior', 'Engineer', 'Ranger', 'Thief', 'Elementalist', 'Mesmer', 'Necromancer'];
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
            const resolveSkillMeta = (rawId: any) => {
                const idNum = Number(rawId);
                if (!Number.isFinite(idNum)) return { name: String(rawId || 'Unknown Skill'), icon: undefined as string | undefined };
                const skillMap = details?.skillMap || {};
                const buffMap = details?.buffMap || {};
                const mapped = skillMap?.[`s${idNum}`] || skillMap?.[`${idNum}`];
                if (mapped?.name) return { name: String(mapped.name), icon: mapped?.icon };
                const buffMapped = buffMap?.[`b${idNum}`] || buffMap?.[`${idNum}`];
                if (buffMapped?.name) return { name: String(buffMapped.name), icon: buffMapped?.icon };
                return { name: `Skill ${idNum}`, icon: undefined as string | undefined };
            };
            const rowsMap = new Map<string, { skillName: string; damage: number; hits: number; icon?: string }>();
            const targets = Array.isArray(details?.targets) ? details.targets : [];
            targets.forEach((target: any) => {
                if (!target || target.isFake || target.enemyPlayer === false) return;
                const profession = resolveProfessionLabel(target?.profession || target?.name || target?.id);
                if (profession !== selectedIncomingStrikePlayerKey) return;
                if (!Array.isArray(target?.totalDamageDist)) return;
                target.totalDamageDist.forEach((list: any) => {
                    if (!Array.isArray(list)) return;
                    list.forEach((entry: any) => {
                        if (!entry || typeof entry !== 'object') return;
                        if (entry.indirectDamage) return;
                        const damage = Number(entry.totalDamage || 0);
                        if (!Number.isFinite(damage) || damage <= 0) return;
                        const hits = Number(entry.connectedHits || entry.hits || 0);
                        const meta = resolveSkillMeta(entry.id);
                        const skillName = meta.name;
                        const row = rowsMap.get(skillName) || { skillName, damage: 0, hits: 0, icon: meta.icon };
                        row.damage += damage;
                        row.hits += Number.isFinite(hits) ? hits : 0;
                        if (!row.icon && meta.icon) row.icon = meta.icon;
                        rowsMap.set(skillName, row);
                    });
                });
            });
            const computedRows = Array.from(rowsMap.values())
                .filter((row) => Number(row?.damage || 0) > 0)
                .sort((a, b) => Number(b.damage || 0) - Number(a.damage || 0))
                .slice(0, 30);
            if (computedRows.length > 0) return computedRows;
        }
        const fallbackDamage = Number(selectedFightEntry?.hit || 0);
        if (fallbackDamage <= 0) return normalizedRows;
        return [{
            skillName: String(selectedFightEntry?.skillName || 'Unknown Skill'),
            damage: fallbackDamage,
            hits: 1,
            icon: undefined
        }];
    }, [selectedIncomingStrikeFightIndex, selectedIncomingStrikePlayerKey, incomingStrikeChartData, incomingStrikeDamageData.fights, logs]);
    const spikeFightSkillRows = useMemo(() => {
        if (selectedSpikeFightIndex === null || !selectedSpikePlayerKey) return [];
        const selectedPoint = spikeChartData.find((point) => point.index === selectedSpikeFightIndex);
        if (!selectedPoint) return [];
        const selectedFight = resolveFightBySelectedPoint(spikeDamageData.fights, selectedPoint);
        const selectedFightEntry = normalizeSpikeValueEntry(selectedFight?.values?.[selectedSpikePlayerKey]);
        const rows = selectedFightEntry?.skillRows || [];
        const normalizedRows = [...rows]
            .filter((row) => Number(row?.damage || 0) > 0 || Number(row?.downContribution || 0) > 0)
            .sort((a, b) => Number(b.damage || 0) - Number(a.damage || 0))
            .slice(0, 30);
        if (normalizedRows.length > 0) return normalizedRows;
        const selectedLog = logs.find((log) => String(log?.filePath || log?.id || '') === String(selectedPoint.fightId || ''));
        const details = getDetails(selectedLog);
        if (details && selectedSpikePlayerKey) {
            const [account, profession] = selectedSpikePlayerKey.split('|');
            const resolveSkillMeta = (rawId: any) => {
                const idNum = Number(rawId);
                if (!Number.isFinite(idNum)) return { name: String(rawId || 'Unknown Skill'), icon: undefined as string | undefined };
                const skillMap = details?.skillMap || {};
                const buffMap = details?.buffMap || {};
                const mapped = skillMap?.[`s${idNum}`] || skillMap?.[`${idNum}`];
                if (mapped?.name) return { name: String(mapped.name), icon: mapped?.icon };
                const buffMapped = buffMap?.[`b${idNum}`] || buffMap?.[`${idNum}`];
                if (buffMapped?.name) return { name: String(buffMapped.name), icon: buffMapped?.icon };
                return { name: `Skill ${idNum}`, icon: undefined as string | undefined };
            };
            const rowsMap = new Map<string, { skillName: string; damage: number; downContribution: number; hits: number; icon?: string }>();
            const players = Array.isArray(details?.players) ? details.players : [];
            const player = players.find((entry: any) => {
                if (entry?.notInSquad) return false;
                const entryAccount = String(entry?.account || entry?.name || '');
                const entryProfession = String(entry?.profession || 'Unknown');
                const accountMatch = entryAccount === String(account || '');
                const professionMatch = entryProfession === String(profession || '');
                return accountMatch && professionMatch;
            }) || null;
            if (player) {
                const playerAny = player as any;
                const consumeDamageEntry = (entry: any) => {
                    if (!entry || typeof entry !== 'object') return;
                    if (entry.indirectDamage) return;
                    const damage = Number(entry.totalDamage || 0);
                    const downContribution = Number(entry.downContribution || 0);
                    if ((!Number.isFinite(damage) || damage <= 0) && (!Number.isFinite(downContribution) || downContribution <= 0)) return;
                    const hits = Number(entry.connectedHits || entry.hits || 0);
                    const meta = resolveSkillMeta(entry.id);
                    const row = rowsMap.get(meta.name) || { skillName: meta.name, damage: 0, downContribution: 0, hits: 0, icon: meta.icon };
                    row.damage += Number.isFinite(damage) ? damage : 0;
                    row.downContribution += Number.isFinite(downContribution) ? downContribution : 0;
                    row.hits += Number.isFinite(hits) ? hits : 0;
                    if (!row.icon && meta.icon) row.icon = meta.icon;
                    rowsMap.set(meta.name, row);
                };
                const targetSkillTotals = new Map<number, { damage: number; downContribution: number; hits: number }>();
                if (Array.isArray(playerAny?.targetDamageDist)) {
                    playerAny.targetDamageDist.forEach((targetGroup: any) => {
                        if (!Array.isArray(targetGroup)) return;
                        targetGroup.forEach((list: any) => {
                            if (!Array.isArray(list)) return;
                            list.forEach((entry: any) => {
                                const skillId = Number(entry?.id);
                                const damage = Number(entry?.totalDamage || 0);
                                const downContribution = Number(entry?.downContribution || 0);
                                if (Number.isFinite(skillId)) {
                                    const existing = targetSkillTotals.get(skillId) || { damage: 0, downContribution: 0, hits: 0 };
                                    existing.damage += Number.isFinite(damage) ? damage : 0;
                                    existing.downContribution += Number.isFinite(downContribution) ? downContribution : 0;
                                    existing.hits += Number(entry?.connectedHits || entry?.hits || 0);
                                    targetSkillTotals.set(skillId, existing);
                                }
                                consumeDamageEntry(entry);
                            });
                        });
                    });
                }
                const allowTotalSupplement = !details?.detailedWvW;
                if (allowTotalSupplement && Array.isArray(playerAny?.totalDamageDist)) {
                    playerAny.totalDamageDist.forEach((list: any) => {
                        if (!Array.isArray(list)) return;
                        list.forEach((entry: any) => {
                            const skillId = Number(entry?.id);
                            if (!Number.isFinite(skillId)) {
                                consumeDamageEntry(entry);
                                return;
                            }
                            const target = targetSkillTotals.get(skillId);
                            if (!target) {
                                consumeDamageEntry(entry);
                                return;
                            }
                            const totalDamage = Number(entry?.totalDamage || 0);
                            const totalDownContribution = Number(entry?.downContribution || 0);
                            const totalHits = Number(entry?.connectedHits || entry?.hits || 0);
                            const deltaDamage = totalDamage - Number(target.damage || 0);
                            const deltaDownContribution = totalDownContribution - Number(target.downContribution || 0);
                            const deltaHits = totalHits - Number(target.hits || 0);
                            if (deltaDamage <= 0 && deltaDownContribution <= 0 && deltaHits <= 0) return;
                            consumeDamageEntry({
                                ...entry,
                                totalDamage: Math.max(0, deltaDamage),
                                downContribution: Math.max(0, deltaDownContribution),
                                connectedHits: Math.max(0, deltaHits),
                                hits: Math.max(0, deltaHits)
                            });
                        });
                    });
                }
                const computedRows = Array.from(rowsMap.values())
                    .filter((row) => Number(row?.damage || 0) > 0 || Number(row?.downContribution || 0) > 0)
                    .sort((a, b) => Number(b.damage || 0) - Number(a.damage || 0))
                    .slice(0, 30);
                if (computedRows.length > 0) return computedRows;
            }
        }
        return normalizedRows;
    }, [selectedSpikeFightIndex, selectedSpikePlayerKey, spikeChartData, spikeDamageData.fights, logs]);

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
    }, [selectedSpikePlayerKey, spikeMode, spikeDamageBasis]);

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
    }, [selectedIncomingStrikePlayerKey, incomingStrikeMode, incomingStrikeUseTotalDamage]);

    useEffect(() => {
        if (selectedIncomingStrikeFightIndex === null) return;
        const exists = incomingStrikeChartData.some((point) => point.index === selectedIncomingStrikeFightIndex);
        if (!exists) setSelectedIncomingStrikeFightIndex(null);
    }, [incomingStrikeChartData, selectedIncomingStrikeFightIndex]);

    const selectedPlayersSet = useMemo(() => new Set(selectedPlayers), [selectedPlayers]);
    const skillChartSkillUsageData = needsSkillUsageData ? skillUsageData : EMPTY_SKILL_USAGE_SUMMARY;

    const {
        playerMapByKey,
        playerTotalsForSkill,
        skillChartData,
        skillChartMaxY,
        groupedSkillUsagePlayers
    } = useSkillCharts({
        skillUsageData: skillChartSkillUsageData,
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
                    applicationsFromBuffsActive: 0,
                    uptimeMs: 0
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
                if (entry?.uptimeMs) {
                    existing.uptimeMs += Number(entry.uptimeMs || 0);
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
                    uptimeMs: 0,
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
                if (cond?.uptimeMs) {
                    existing.uptimeMs += Number(cond.uptimeMs || 0);
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

    const conditionRawSummary = needsConditionData
        ? (conditionDirection === 'outgoing' ? safeStats.outgoingConditionSummary : safeStats.incomingConditionSummary)
        : EMPTY_ANY_ARRAY;
    const conditionRawPlayers = needsConditionData
        ? (conditionDirection === 'outgoing' ? safeStats.outgoingConditionPlayers : safeStats.incomingConditionPlayers)
        : EMPTY_ANY_ARRAY;
    const { summary: conditionSummary, players: conditionPlayers } = useMemo(
        () => normalizeConditionData(conditionRawSummary || [], conditionRawPlayers || []),
        [normalizeConditionData, conditionRawSummary, conditionRawPlayers]
    );
    useEffect(() => {
        if (!needsConditionData) return;
        if (activeConditionName === 'all') return;
        if (conditionSummary.some((entry: any) => entry.name === activeConditionName)) return;
        const normalized = normalizeConditionLabel(activeConditionName);
        if (normalized && conditionSummary.some((entry: any) => entry.name === normalized)) {
            setActiveConditionName(normalized);
        } else {
            setActiveConditionName('all');
        }
    }, [activeConditionName, conditionSummary, setActiveConditionName, needsConditionData]);

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

    // For non-embedded (desktop), sections in the active category are visible.
    // Only the active category is actually mounted with content — renderGroup gives
    // inactive categories a zero-height placeholder instead of unmounting them.
    // For embedded, use the sectionVisibility prop as before.
    const activeCategorySectionIds = useMemo(() => {
        const group = STATS_TOC_GROUPS.find(g => g.id === activeCategory);
        return new Set(group?.sectionIds ?? []);
    }, [activeCategory]);

    const isSectionVisible = useCallback(
        (id: string) => {
            if (embedded) return isSectionVisibleFast(id);
            return activeCategorySectionIds.has(id);
        },
        [embedded, isSectionVisibleFast, activeCategorySectionIds]
    );
    // Data map directory: a HOST-LEVEL predicate that allows every taxonomy
    // section minus the noEgo omissions — the active category and the embedded
    // active-group visibility fn both play NO role here. The data map renders
    // only while its host category ('overview') is active AND lists sections
    // from every category, so any predicate keyed on the active
    // category/group — `isSectionVisible` (desktop, scoped to
    // activeCategorySectionIds) OR the embedded `sectionVisibility` prop that
    // real hosts pass (reportApp/CategoryBar push an active-group-scoped fn) —
    // would mark 9 of 10 categories' sections disallowed and collapse the
    // directory to a single Overview card. This deliberately mirrors the search
    // index's predicate (see buildSearchIndex above): both are category-agnostic
    // directories of the whole report, filtered only by the noEgo exclusions
    // (those render entries don't exist at all while noEgoMode is on).
    const isDataMapSectionAllowed = useCallback(
        (id: string) => !(noEgoMode && NO_EGO_HIDDEN_SECTION_IDS.has(id)),
        [noEgoMode]
    );
    const sectionClass = useCallback((id: string, base: string) => {
        const visible = isSectionVisible(id);
        if (embedded && sectionVisibility) {
            return `${base} ${visible ? '' : 'hidden'}`;
        }
        return `${base} transition-[opacity,transform] duration-700 ease-in-out ${visible
            ? 'opacity-100 translate-y-0 max-h-[99999px]'
            : 'opacity-0 -translate-y-2 max-h-0 h-0 min-h-0 overflow-hidden pointer-events-none p-0 !p-0 m-0 !mb-0 !mt-0 border-0 !border-0 border-transparent'}`;
    }, [isSectionVisible, embedded, sectionVisibility]);
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
        skillChartSkillUsageData.skillOptions.forEach((option) => {
            map.set(option.id, { name: option.name, icon: option.icon });
        });
        return map;
    }, [skillChartSkillUsageData.skillOptions]);

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
        if (!needsSkillUsageData) return;
        if (skillBarData.length === 0) {
            if (selectedSkillId !== null) setSelectedSkillId(null);
            return;
        }
        if (!selectedSkillId || !skillBarData.some((entry) => entry.skillId === selectedSkillId)) {
            setSelectedSkillId(skillBarData[0].skillId);
        }
    }, [skillBarData, selectedSkillId, setSelectedSkillId, needsSkillUsageData]);

    const selectedSkillMeta = skillChartSkillUsageData.skillOptions.find((option) => option.id === selectedSkillId);
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

    const activeBoonTable = useMemo(() => {
        if (!activeBoonTab) return null;
        return (safeStats.boonTables || []).find((boon: any) => boon.id === activeBoonTab) ?? null;
    }, [safeStats.boonTables, activeBoonTab]);
    const getBoonTimelineTotals = (value: any) => ({
        selfBuffs: (value?.totals && typeof value.totals === 'object')
            ? Number(value?.totals?.selfBuffs || 0)
            : 0,
        groupBuffs: (value?.totals && typeof value.totals === 'object')
            ? Number(value?.totals?.groupBuffs || 0)
            : 0,
        squadBuffs: (value?.totals && typeof value.totals === 'object')
            ? Number(value?.totals?.squadBuffs || 0)
            : Number(value?.total || 0),
        totalBuffs: (value?.totals && typeof value.totals === 'object')
            ? Number((value?.totals?.totalBuffs ?? value?.total) || 0)
            : Number(value?.total || 0)
    });
    const getBoonTimelineScopeTotal = (
        value: any,
        scope: 'selfBuffs' | 'groupBuffs' | 'squadBuffs' | 'totalBuffs'
    ) => {
        const totals = getBoonTimelineTotals(value);
        const resolved = Number(totals?.[scope] || 0);
        return Number.isFinite(resolved) ? Math.max(0, resolved) : 0;
    };
    const boonTimelineScopeLabel = boonTimelineScope === 'selfBuffs'
        ? 'Self'
        : boonTimelineScope === 'groupBuffs'
            ? 'Group'
            : boonTimelineScope === 'squadBuffs'
                ? 'Squad'
                : 'All';
    const boonTimelineBoons = useMemo(() => {
        const source = Array.isArray((safeStats as any)?.boonTimeline) ? (safeStats as any).boonTimeline : [];
        return source.map((boon: any) => ({
            id: String(boon?.id || ''),
            name: String(boon?.name || boon?.id || 'Unknown Boon'),
            icon: typeof boon?.icon === 'string' ? boon.icon : undefined,
            stacking: Boolean(boon?.stacking),
            players: (Array.isArray(boon?.players) ? boon.players : []).map((player: any) => ({
                key: String(player?.key || ''),
                account: String(player?.account || player?.displayName || 'Unknown'),
                displayName: String(player?.displayName || player?.account || 'Unknown'),
                profession: String(player?.profession || 'Unknown'),
                professionList: Array.isArray(player?.professionList) ? player.professionList.map((entry: any) => String(entry || '')) : [],
                logs: Number(player?.logs || 0),
                totals: getBoonTimelineTotals(player)
            })),
            fights: (Array.isArray(boon?.fights) ? boon.fights : []).map((fight: any, index: number) => ({
                id: String(fight?.id || `fight-${index + 1}`),
                shortLabel: String(fight?.shortLabel || `F${index + 1}`),
                fullLabel: String(fight?.fullLabel || `Fight ${index + 1}`),
                timestamp: Number(fight?.timestamp || 0),
                durationMs: Number(fight?.durationMs || 0),
                maxTotal: Number(fight?.maxTotal || 0),
                values: (fight?.values && typeof fight.values === 'object')
                    ? Object.fromEntries(Object.entries(fight.values).map(([key, value]: [string, any]) => [
                        String(key || ''),
                        {
                            total: Number(value?.total || 0),
                            totals: getBoonTimelineTotals(value),
                            bucketWeights5s: Array.isArray(value?.bucketWeights5s)
                                ? value.bucketWeights5s.map((entry: any) => Number(entry || 0))
                                : [],
                            buckets5s: Array.isArray(value?.buckets5s) ? value.buckets5s.map((entry: any) => Number(entry || 0)) : []
                        }
                    ]))
                    : {}
            }))
        })).filter((boon: any) => boon.id && boon.players.length > 0 && boon.fights.length > 0);
    }, [safeStats.boonTimeline]);
    const filteredBoonTimelineBoons = useMemo(() => {
        const term = boonTimelineSearch.trim().toLowerCase();
        if (!term) return boonTimelineBoons;
        return boonTimelineBoons.filter((boon: any) => String(boon?.name || '').toLowerCase().includes(term));
    }, [boonTimelineBoons, boonTimelineSearch]);
    const activeBoonTimeline = useMemo(() => {
        if (!activeBoonTimelineId) return null;
        return boonTimelineBoons.find((boon: any) => boon.id === activeBoonTimelineId) || null;
    }, [boonTimelineBoons, activeBoonTimelineId]);
    const boonTimelinePlayersWithScope = useMemo(() => {
        const players = Array.isArray(activeBoonTimeline?.players) ? activeBoonTimeline.players : [];
        return [...players]
            .map((player: any) => ({
                ...player,
                total: getBoonTimelineScopeTotal(player, boonTimelineScope)
            }))
            .sort((a, b) => Number(b.total || 0) - Number(a.total || 0)
                || String(a.displayName || '').localeCompare(String(b.displayName || '')));
    }, [activeBoonTimeline, boonTimelineScope]);
    const filteredBoonTimelinePlayers = useMemo(() => {
        const players = boonTimelinePlayersWithScope;
        const term = boonTimelinePlayerFilter.trim().toLowerCase();
        if (!term) return players;
        return players.filter((player: any) => (
            String(player?.displayName || '').toLowerCase().includes(term)
            || String(player?.account || '').toLowerCase().includes(term)
            || String(player?.profession || '').toLowerCase().includes(term)
        ));
    }, [boonTimelinePlayersWithScope, boonTimelinePlayerFilter]);
    const boonTimelinePlayerMap = useMemo(() => {
        const map = new Map<string, any>();
        boonTimelinePlayersWithScope.forEach((player: any) => {
            map.set(String(player?.key || ''), player);
        });
        return map;
    }, [boonTimelinePlayersWithScope]);
    const selectedBoonTimelinePlayer = selectedBoonTimelinePlayerKey
        ? boonTimelinePlayerMap.get(selectedBoonTimelinePlayerKey) || null
        : null;
    const boonTimelineChartData = useMemo<Array<{
        index: number;
        fightId: string;
        shortLabel: string;
        fullLabel: string;
        timestamp: number;
        total: number;
        maxTotal: number;
    }>>(() => {
        if (!activeBoonTimeline || !selectedBoonTimelinePlayerKey) return [];
        return (activeBoonTimeline.fights || []).map((fight: any, index: number) => {
            const playerValue = fight?.values?.[selectedBoonTimelinePlayerKey];
            const computedFightMax = Object.entries((fight?.values && typeof fight.values === 'object') ? fight.values : {})
                .filter(([key]) => String(key || '') !== '__all__')
                .reduce((best: number, [, value]: [string, any]) => Math.max(best, getBoonTimelineScopeTotal(value, boonTimelineScope)), 0);
            return {
                index,
                fightId: String(fight?.id || ''),
                shortLabel: String(fight?.shortLabel || `F${index + 1}`),
                fullLabel: String(fight?.fullLabel || `Fight ${index + 1}`),
                timestamp: Number(fight?.timestamp || 0),
                total: getBoonTimelineScopeTotal(playerValue, boonTimelineScope),
                maxTotal: computedFightMax > 0 ? computedFightMax : Number(fight?.maxTotal || 0)
            };
        });
    }, [activeBoonTimeline, selectedBoonTimelinePlayerKey, boonTimelineScope]);
    const boonTimelineChartMaxY = useMemo(() => {
        const selectedPeak = boonTimelineChartData.reduce((best: number, entry) => Math.max(best, Number(entry?.total || 0)), 0);
        const fightPeak = boonTimelineChartData.reduce((best: number, entry) => Math.max(best, Number(entry?.maxTotal || 0)), 0);
        return Math.max(1, selectedPeak, fightPeak);
    }, [boonTimelineChartData]);
    const squadIncomingDamageBucketsByFightId = useMemo(() => {
        const source = (safeStats as any)?.incomingDamagePerSecondByFightId;
        const map = new Map<string, { buckets: number[]; perSecond: number[]; total: number }>();
        if (source && typeof source === 'object') {
            Object.entries(source).forEach(([fightId, entry]: [string, any]) => {
                map.set(fightId, {
                    perSecond: Array.isArray(entry?.perSecond) ? entry.perSecond : [],
                    buckets: Array.isArray(entry?.buckets5s) ? entry.buckets5s : [],
                    total: Number(entry?.total || 0),
                });
            });
        }
        return map;
    }, [safeStats.incomingDamagePerSecondByFightId]);
    const fallbackIncomingDamageBucketsByFightId = useMemo(() => {
        const map = new Map<string, number[]>();
        incomingStrikeDamageData.fights.forEach((fight: any, fightIndex: number) => {
            const values = (fight?.values && typeof fight.values === 'object') ? Object.values(fight.values) as any[] : [];
            const bucketCount = Math.max(
                0,
                ...values.map((entry: any) => Array.isArray(entry?.buckets5s) ? entry.buckets5s.length : 0)
            );
            const buckets = Array.from({ length: bucketCount }, (_, bucketIndex) => values.reduce((sum: number, entry: any) => {
                const series = Array.isArray(entry?.buckets5s) ? entry.buckets5s : [];
                return sum + Number(series[bucketIndex] || 0);
            }, 0));
            map.set(String(fight?.id || `fight-${fightIndex + 1}`), buckets);
        });
        return map;
    }, [incomingStrikeDamageData.fights]);
    const squadIncomingDamageTotalByFightId = useMemo(() => {
        const map = new Map<string, number>();
        const fights = Array.isArray((safeStats as any)?.fightBreakdown) ? (safeStats as any).fightBreakdown : [];
        fights.forEach((fight: any, index: number) => {
            map.set(String(fight?.id || `fight-${index + 1}`), Math.max(0, Number(fight?.totalIncomingDamage || 0)));
        });
        return map;
    }, [safeStats.fightBreakdown]);
    const boonTimelineDrilldown = useMemo(() => {
        const selectedPoint = selectedBoonTimelineFightIndex === null
            ? null
            : boonTimelineChartData.find((entry) => entry.index === selectedBoonTimelineFightIndex) || null;
        if (!selectedPoint || !activeBoonTimeline || !selectedBoonTimelinePlayerKey) {
            return {
                title: 'Fight Breakdown',
                data: [] as Array<{
                    label: string;
                    value: number;
                    incomingDamage: number;
                    incomingIntensity: number;
                }>
            };
        }
        const selectedFight = activeBoonTimeline.fights[selectedPoint.index];
        const playerValue = selectedFight?.values?.[selectedBoonTimelinePlayerKey] || {
            total: 0,
            totals: { selfBuffs: 0, groupBuffs: 0, squadBuffs: 0, totalBuffs: 0 },
            bucketWeights5s: [],
            buckets5s: []
        };
        const selectedTotal = getBoonTimelineScopeTotal(playerValue, boonTimelineScope);
        const rawWeights = Array.isArray(playerValue?.bucketWeights5s) ? playerValue.bucketWeights5s : [];
        const legacyBuckets = Array.isArray(playerValue?.buckets5s) ? playerValue.buckets5s : [];
        const bucketCount = Math.max(
            rawWeights.length,
            legacyBuckets.length,
            Math.ceil(Math.max(0, Number(selectedFight?.durationMs || 0)) / 5000),
            1
        );
        const normalizedWeights = Array.from({ length: bucketCount }, (_, index) => Number(rawWeights[index] || 0));
        const weightsSum = normalizedWeights.reduce((sum, value) => sum + Number(value || 0), 0);
        let scaledBuckets: number[] = [];
        if (weightsSum > 0) {
            const factor = selectedTotal > 0 ? selectedTotal / weightsSum : 0;
            scaledBuckets = normalizedWeights.map((value) => Number(value || 0) * factor);
        } else if (legacyBuckets.length > 0) {
            const normalizedLegacy = Array.from({ length: bucketCount }, (_, index) => Number(legacyBuckets[index] || 0));
            if (boonTimelineScope === 'totalBuffs' || !playerValue?.totals) {
                scaledBuckets = normalizedLegacy;
            } else {
                const baseTotal = getBoonTimelineScopeTotal({ totals: getBoonTimelineTotals(playerValue) }, 'totalBuffs');
                const factor = baseTotal > 0 ? selectedTotal / baseTotal : 0;
                scaledBuckets = normalizedLegacy.map((value) => Number(value || 0) * factor);
            }
        } else {
            const uniform = selectedTotal > 0 ? selectedTotal / Math.max(1, bucketCount) : 0;
            scaledBuckets = Array.from({ length: bucketCount }, () => uniform);
        }
        const data = Array.from({ length: bucketCount }, (_, index) => ({
            label: `${index * 5}s-${(index + 1) * 5}s`,
            value: Number(scaledBuckets[index] || 0)
        }));
        const primaryIncomingEntry = squadIncomingDamageBucketsByFightId.get(String(selectedFight?.id || ''))
            || squadIncomingDamageBucketsByFightId.get(String(selectedPoint?.fightId || ''));
        const primaryIncomingByFightId = primaryIncomingEntry?.buckets || [];
        const fallbackIncomingByFightId = fallbackIncomingDamageBucketsByFightId.get(String(selectedFight?.id || ''))
            || fallbackIncomingDamageBucketsByFightId.get(String(selectedPoint?.fightId || ''))
            || [];
        const primaryIncomingTotal = primaryIncomingByFightId.reduce((sum, value) => sum + Number(value || 0), 0);
        const fallbackIncomingTotal = fallbackIncomingByFightId.reduce((sum, value) => sum + Number(value || 0), 0);
        const incomingShape = primaryIncomingTotal > 0 ? primaryIncomingByFightId : fallbackIncomingByFightId;
        const incomingShapeTotal = primaryIncomingTotal > 0 ? primaryIncomingTotal : fallbackIncomingTotal;
        const incomingTotal = Math.max(
            0,
            Number(squadIncomingDamageTotalByFightId.get(String(selectedFight?.id || ''))
                ?? squadIncomingDamageTotalByFightId.get(String(selectedPoint?.fightId || ''))
                ?? 0)
        );
        let incomingBuckets = Array.from({ length: bucketCount }, (_, index) => Number(incomingShape[index] || 0));
        if (incomingTotal > 0 && incomingShapeTotal > 0) {
            const scale = incomingTotal / incomingShapeTotal;
            incomingBuckets = incomingBuckets.map((value) => Number(value || 0) * scale);
        }
        const incomingMax = incomingBuckets.reduce((best, value) => Math.max(best, Number(value || 0)), 0);
        const dataWithIncoming = data.map((entry, index) => {
            const incomingDamage = Number(incomingBuckets[index] || 0);
            return {
                ...entry,
                incomingDamage,
                incomingIntensity: incomingMax > 0 ? Math.max(0, Math.min(1, incomingDamage / incomingMax)) : 0
            };
        });
        return {
            title: `Fight Breakdown - ${selectedPoint.shortLabel || 'Fight'} (5s ${boonTimelineScopeLabel} Generation Buckets)`,
            data: dataWithIncoming
        };
    }, [selectedBoonTimelineFightIndex, boonTimelineChartData, activeBoonTimeline, selectedBoonTimelinePlayerKey, boonTimelineScope, boonTimelineScopeLabel, squadIncomingDamageBucketsByFightId, fallbackIncomingDamageBucketsByFightId, squadIncomingDamageTotalByFightId]);

    // ── Stab Performance (stability boon b1122) ──────────────────────────
    const stabBoon = useMemo(() =>
        boonTimelineBoons.find((b: any) => String(b?.id || '') === 'b1122') || null,
        [boonTimelineBoons]
    );
    const stabPerfPlayersWithScope = useMemo(() => {
        if (!stabBoon) return [];
        const players = Array.isArray(stabBoon?.players) ? stabBoon.players : [];
        return [...players]
            .map((player: any) => ({
                ...player,
                total: getBoonTimelineScopeTotal(player, 'squadBuffs')
            }))
            .sort((a: any, b: any) => Number(b.total || 0) - Number(a.total || 0)
                || String(a.displayName || '').localeCompare(String(b.displayName || '')));
    }, [stabBoon]);
    const stabPerfFilteredPlayers = useMemo(() => {
        const term = stabPerfPlayerFilter.trim().toLowerCase();
        if (!term) return stabPerfPlayersWithScope;
        return stabPerfPlayersWithScope.filter((p: any) =>
            String(p?.displayName || '').toLowerCase().includes(term)
            || String(p?.account || '').toLowerCase().includes(term)
            || String(p?.profession || '').toLowerCase().includes(term)
        );
    }, [stabPerfPlayersWithScope, stabPerfPlayerFilter]);
    const stabPerfPlayerMap = useMemo(() => {
        const map = new Map<string, any>();
        stabPerfPlayersWithScope.forEach((p: any) => map.set(String(p?.key || ''), p));
        return map;
    }, [stabPerfPlayersWithScope]);
    const selectedStabPerfPlayer = selectedStabPerfPlayerKey
        ? stabPerfPlayerMap.get(selectedStabPerfPlayerKey) || null
        : null;
    const stabPerfChartData = useMemo<Array<{
        index: number;
        fightId: string;
        shortLabel: string;
        fullLabel: string;
        timestamp: number;
        total: number;
        maxTotal: number;
    }>>(() => {
        if (!stabBoon || !selectedStabPerfPlayerKey) return [];
        return (stabBoon.fights || []).map((fight: any, index: number) => {
            const playerValue = fight?.values?.[selectedStabPerfPlayerKey];
            const computedFightMax = Object.entries((fight?.values && typeof fight.values === 'object') ? fight.values : {})
                .filter(([key]) => String(key || '') !== '__all__')
                .reduce((best: number, [, value]: [string, any]) => Math.max(best, getBoonTimelineScopeTotal(value, 'squadBuffs')), 0);
            return {
                index,
                fightId: String(fight?.id || ''),
                shortLabel: String(fight?.shortLabel || `F${index + 1}`),
                fullLabel: String(fight?.fullLabel || `Fight ${index + 1}`),
                timestamp: Number(fight?.timestamp || 0),
                total: getBoonTimelineScopeTotal(playerValue, 'squadBuffs'),
                maxTotal: computedFightMax > 0 ? computedFightMax : Number(fight?.maxTotal || 0)
            };
        });
    }, [stabBoon, selectedStabPerfPlayerKey]);
    const stabPerfChartMaxY = useMemo(() => {
        const selectedPeak = stabPerfChartData.reduce((best, e) => Math.max(best, Number(e?.total || 0)), 0);
        const fightPeak = stabPerfChartData.reduce((best, e) => Math.max(best, Number(e?.maxTotal || 0)), 0);
        return Math.max(1, selectedPeak, fightPeak);
    }, [stabPerfChartData]);
    const stabPerformanceDrilldown = (safeStats as any)?.stabPerformanceDrilldown;
    const stabPerfDrilldown = useMemo(() => {
        const emptyResult = {
            title: 'Fight Breakdown (5s Squad Stab Generation Buckets)',
            data: [] as Array<{ label: string; value: number; incomingDamage: number; incomingIntensity: number; partyDeaths: number; partyDeathNames: string[]; partyAvgDistance: number; partyFarNames: string[]; [key: string]: any }>,
            partyMembers: [] as Array<{ key: string; displayName: string }>
        };
        const selectedPoint = selectedStabPerfFightIndex === null
            ? null
            : stabPerfChartData.find((e) => e.index === selectedStabPerfFightIndex) || null;
        if (!selectedPoint || !stabBoon || !selectedStabPerfPlayerKey) {
            return emptyResult;
        }
        const selectedFight = stabBoon.fights[selectedPoint.index];
        if (!selectedFight) return emptyResult;
        const playerValue = selectedFight?.values?.[selectedStabPerfPlayerKey] || {
            total: 0,
            totals: { selfBuffs: 0, groupBuffs: 0, squadBuffs: 0, totalBuffs: 0 },
            bucketWeights5s: [],
            buckets5s: []
        };
        const rawBuckets5s = Array.isArray(playerValue?.buckets5s) ? playerValue.buckets5s : [];
        const rawWeights5s = Array.isArray(playerValue?.bucketWeights5s) ? playerValue.bucketWeights5s : [];
        const durationMS = Number(selectedFight?.durationMs || selectedFight?.durationMS || 0);
        const durationBuckets = durationMS > 0 ? Math.ceil(durationMS / 5000) : rawBuckets5s.length;
        const bucketCount = Math.max(1, durationBuckets, rawBuckets5s.length);
        const data: Array<{ label: string; value: number; partyDeaths: number; partyDeathNames: string[]; partyAvgDistance: number; partyFarNames: string[] }> = Array.from({ length: bucketCount }, (_, i) => {
            const rawVal = rawBuckets5s[i];
            const weight = Number(rawWeights5s[i] || 0);
            let value: number;
            if (rawVal !== undefined && rawVal !== null) {
                value = Number(rawVal);
            } else {
                value = 0;
            }
            if (weight > 0 && weight < 1) {
                value = value / weight;
            }
            return {
                label: `${i * 5}s-${(i + 1) * 5}s`,
                value: Math.max(0, value),
                partyDeaths: 0,
                partyDeathNames: [],
                partyAvgDistance: 0,
                partyFarNames: []
            };
        });
        const selectedFightId = String(selectedFight?.id || '');
        const drilldownFights: any[] = Array.isArray(stabPerformanceDrilldown?.fights) ? stabPerformanceDrilldown.fights : [];
        const normPath = (p: string) => p.replace(/\\/g, '/').toLowerCase();
        const normFightId = normPath(selectedFightId);
        const drilldownFight = drilldownFights.find((f) => String(f?.id || '') === selectedFightId)
            || drilldownFights.find((f) => normPath(String(f?.id || '')) === normFightId)
            || null;
        const drilldownPlayers: Record<string, any> = drilldownFight?.players || {};
        const selectedPlayerEntry = drilldownPlayers[selectedStabPerfPlayerKey];
        const selectedPlayerGroup = Number(selectedPlayerEntry?.group || 0);
        const stabIncomingBuckets: number[] = Array.isArray(drilldownFight?.incomingDamage)
            ? drilldownFight.incomingDamage.slice(0, bucketCount)
            : [];
        while (stabIncomingBuckets.length < bucketCount) stabIncomingBuckets.push(0);
        const incomingMax = stabIncomingBuckets.reduce((best: number, v: number) => Math.max(best, Number(v || 0)), 0);
        const partyMembers: Array<{ key: string; displayName: string }> = [];
        const partyData: Record<string, { stacks: number[]; deaths: number[]; distances: number[] }> = {};
        if (drilldownFight && selectedPlayerGroup > 0) {
            Object.entries(drilldownPlayers).forEach(([key, val]: [string, any]) => {
                if (Number(val?.group || 0) !== selectedPlayerGroup) return;
                partyMembers.push({ key, displayName: String(val?.displayName || key.split('.')[0]) });
                partyData[key] = {
                    stacks: Array.isArray(val?.stacks) ? val.stacks : [],
                    deaths: Array.isArray(val?.deaths) ? val.deaths : [],
                    distances: Array.isArray(val?.distances) ? val.distances : []
                };
            });
        }
        const dataWithOverlays = data.map((entry, i) => {
            const partyIncomingDamage = Number(stabIncomingBuckets[i] || 0);
            const intensity = incomingMax > 0 ? Math.max(0, Math.min(1, partyIncomingDamage / incomingMax)) : 0;
            const overlay: Record<string, any> = {};
            partyMembers.forEach(({ key }) => {
                const pd = partyData[key];
                overlay[`pm_${key}`] = Number(pd?.stacks?.[i] || 0);
                overlay[`playerDeaths_${key}`] = Number(pd?.deaths?.[i] || 0);
                overlay[`playerDistance_${key}`] = Number(pd?.distances?.[i] || 0);
            });
            return {
                ...entry,
                incomingDamage: partyIncomingDamage,
                incomingIntensity: intensity,
                ...overlay
            };
        });
        return {
            title: `Fight Breakdown - ${selectedPoint.shortLabel || 'Fight'} (5s Squad Stab Generation Buckets)`,
            data: dataWithOverlays,
            partyMembers
        };
    }, [stabBoon, stabPerfChartData, selectedStabPerfFightIndex, selectedStabPerfPlayerKey, stabPerformanceDrilldown]);

    const boonUptimeSubgroupKeyPrefix = '__subgroup__:';
    const boonUptimeBoons = useMemo(() => {
        const source = Array.isArray((safeStats as any)?.boonUptimeTimeline) ? (safeStats as any).boonUptimeTimeline : [];
        return source.map((boon: any) => ({
            id: String(boon?.id || ''),
            name: String(boon?.name || boon?.id || 'Unknown Boon'),
            icon: typeof boon?.icon === 'string' ? boon.icon : undefined,
            stacking: Boolean(boon?.stacking),
            players: (Array.isArray(boon?.players) ? boon.players : [])
                .map((player: any) => ({
                    key: String(player?.key || ''),
                    account: String(player?.account || player?.displayName || 'Unknown'),
                    displayName: String(player?.displayName || player?.account || 'Unknown'),
                    profession: String(player?.profession || 'Unknown'),
                    professionList: Array.isArray(player?.professionList) ? player.professionList.map((entry: any) => String(entry || '')) : [],
                    logs: Number(player?.logs || 0),
                    total: Math.max(0, Number(player?.total || 0)),
                    peak: Math.max(0, Number(player?.peak || 0))
                }))
                .filter((player: any) => player.key && player.key !== '__all__'),
            fights: (Array.isArray(boon?.fights) ? boon.fights : []).map((fight: any, index: number) => ({
                id: String(fight?.id || `fight-${index + 1}`),
                shortLabel: String(fight?.shortLabel || `F${index + 1}`),
                fullLabel: String(fight?.fullLabel || `Fight ${index + 1}`),
                timestamp: Number(fight?.timestamp || 0),
                durationMs: Number(fight?.durationMs || 0),
                maxTotal: Math.max(0, Number(fight?.maxTotal || 0)),
                values: (fight?.values && typeof fight.values === 'object')
                    ? Object.fromEntries(Object.entries(fight.values).map(([key, value]: [string, any]) => [
                        String(key || ''),
                        {
                            total: Math.max(0, Number(value?.total || 0)),
                            peak: Math.max(0, Number(value?.peak || 0)),
                            buckets: Array.isArray(value?.buckets) ? value.buckets.map((entry: any) => Math.max(0, Number(entry || 0))) : []
                        }
                    ]))
                    : {}
            }))
        })).filter((boon: any) => boon.id && boon.players.length > 0 && boon.fights.length > 0);
    }, [safeStats.boonUptimeTimeline]);
    /* ── intervalMs per-boon (set by computeBoonUptimeTimeline) ── */
    const boonUptimeIntervalMap = useMemo(() => {
        const source = Array.isArray((safeStats as any)?.boonUptimeTimeline) ? (safeStats as any).boonUptimeTimeline : [];
        const map = new Map<string, number>();
        source.forEach((boon: any) => {
            if (boon?.id && Number.isFinite(Number(boon?.intervalMs)) && Number(boon.intervalMs) > 0) {
                map.set(String(boon.id), Number(boon.intervalMs));
            }
        });
        return map;
    }, [safeStats.boonUptimeTimeline]);
    const boonUptimeSubgroupsByFightId = useMemo(() => {
        const fights = Array.isArray((safeStats as any)?.squadCompByFight) ? (safeStats as any).squadCompByFight : [];
        const map = new Map<string, Map<number, string[]>>();
        fights.forEach((fight: any, index: number) => {
            const fightId = String(fight?.id || `fight-${index + 1}`);
            const subgroupMap = new Map<number, Set<string>>();
            const parties = Array.isArray(fight?.parties) ? fight.parties : [];
            parties.forEach((party: any) => {
                const subgroupId = Number(party?.party ?? 0);
                if (!Number.isFinite(subgroupId) || subgroupId <= 0) return;
                const members = Array.isArray(party?.players) ? party.players : [];
                const accounts = members
                    .map((player: any) => String(player?.account || '').trim())
                    .filter((account: string) => account.length > 0 && account !== 'Unknown');
                if (!accounts.length) return;
                const existing = subgroupMap.get(subgroupId) || new Set<string>();
                accounts.forEach((account: string) => existing.add(account));
                subgroupMap.set(subgroupId, existing);
            });
            map.set(
                fightId,
                new Map(
                    Array.from(subgroupMap.entries()).map(([subgroupId, accounts]) => [subgroupId, Array.from(accounts.values())])
                )
            );
        });
        return map;
    }, [safeStats.squadCompByFight]);
    const filteredBoonUptimeBoons = useMemo(() => {
        const term = boonUptimeSearch.trim().toLowerCase();
        if (!term) return boonUptimeBoons;
        return boonUptimeBoons.filter((boon: any) => String(boon?.name || '').toLowerCase().includes(term));
    }, [boonUptimeBoons, boonUptimeSearch]);
    const activeBoonUptime = useMemo(() => {
        if (!activeBoonUptimeId) return null;
        const boon = boonUptimeBoons.find((b: any) => b.id === activeBoonUptimeId) || null;
        if (!boon) return null;
        const intervalMs = boonUptimeIntervalMap.get(boon.id) || 5000;
        return { ...boon, intervalMs };
    }, [boonUptimeBoons, activeBoonUptimeId, boonUptimeIntervalMap]);
    const boonUptimeFightsWithSubgroups = useMemo(() => {
        const fights = Array.isArray(activeBoonUptime?.fights) ? activeBoonUptime.fights : [];
        return fights.map((fight: any) => {
            const baseValues = (fight?.values && typeof fight.values === 'object') ? fight.values : {};
            const values: Record<string, any> = { ...baseValues };
            const subgroupMap = boonUptimeSubgroupsByFightId.get(String(fight?.id || '')) || new Map<number, string[]>();
            const fallbackBucketCount = Math.max(
                Math.ceil(Math.max(0, Number(fight?.durationMs || 0)) / (activeBoonUptime?.intervalMs || 5000)),
                1
            );
            subgroupMap.forEach((members, subgroupId) => {
                if (!Array.isArray(members) || members.length <= 0) return;
                const bucketCount = members.reduce((best: number, account: string) => {
                    const memberBuckets = Array.isArray(baseValues?.[account]?.buckets) ? baseValues[account].buckets : [];
                    return Math.max(best, memberBuckets.length);
                }, fallbackBucketCount);
                const averagedBuckets = Array.from({ length: bucketCount }, (_, bucketIndex) => {
                    const sum = members.reduce((total: number, account: string) => {
                        const memberValue = baseValues?.[account];
                        const bucketValue = Array.isArray(memberValue?.buckets) ? memberValue.buckets[bucketIndex] : 0;
                        return total + Math.max(0, Number(bucketValue || 0));
                    }, 0);
                    return members.length > 0 ? (sum / members.length) : 0;
                });
                const total = averagedBuckets.reduce((sum: number, value: number) => sum + value, 0);
                const peak = averagedBuckets.reduce((best: number, value: number) => Math.max(best, value), 0);
                values[`${boonUptimeSubgroupKeyPrefix}${subgroupId}`] = {
                    total,
                    peak,
                    buckets: averagedBuckets
                };
            });
            return {
                ...fight,
                values
            };
        });
    }, [activeBoonUptime, boonUptimeSubgroupsByFightId, boonUptimeSubgroupKeyPrefix]);
    const boonUptimeSubgroupEntries = useMemo(() => {
        const subgroups = new Map<number, any>();
        boonUptimeFightsWithSubgroups.forEach((fight: any) => {
            const values = (fight?.values && typeof fight.values === 'object') ? fight.values : {};
            Object.entries(values).forEach(([key, value]: [string, any]) => {
                if (!String(key).startsWith(boonUptimeSubgroupKeyPrefix)) return;
                const subgroupId = Number(String(key).slice(boonUptimeSubgroupKeyPrefix.length));
                if (!Number.isFinite(subgroupId) || subgroupId <= 0) return;
                const current = subgroups.get(subgroupId) || {
                    key,
                    account: `Subgroup ${subgroupId}`,
                    displayName: `Subgroup ${subgroupId}`,
                    profession: 'Subgroup',
                    professionList: [],
                    logs: 0,
                    total: 0,
                    peak: 0,
                    entryType: 'subgroup' as const,
                    subgroupId
                };
                current.logs += 1;
                current.total += Math.max(0, Number(value?.total || 0));
                current.peak = Math.max(current.peak, Math.max(0, Number(value?.peak || 0)));
                subgroups.set(subgroupId, current);
            });
        });
        return Array.from(subgroups.values()).sort((a, b) => Number(a.subgroupId || 0) - Number(b.subgroupId || 0));
    }, [boonUptimeFightsWithSubgroups, boonUptimeSubgroupKeyPrefix]);
    const boonUptimeSubgroupMembers = useMemo(() => {
        const fights = Array.isArray((safeStats as any)?.squadCompByFight) ? (safeStats as any).squadCompByFight : [];
        const memberMap = new Map<number, Map<string, { account: string; professions: Set<string>; fightCount: number }>>();
        fights.forEach((fight: any) => {
            const parties = Array.isArray(fight?.parties) ? fight.parties : [];
            parties.forEach((party: any) => {
                const subgroupId = Number(party?.party ?? 0);
                if (!Number.isFinite(subgroupId) || subgroupId <= 0) return;
                if (!memberMap.has(subgroupId)) memberMap.set(subgroupId, new Map());
                const subgroupMap = memberMap.get(subgroupId)!;
                const players = Array.isArray(party?.players) ? party.players : [];
                players.forEach((player: any) => {
                    const account = String(player?.account || '').trim();
                    if (!account || account === 'Unknown') return;
                    const profession = String(player?.profession || 'Unknown');
                    const existing = subgroupMap.get(account);
                    if (existing) {
                        existing.fightCount += 1;
                        existing.professions.add(profession);
                    } else {
                        subgroupMap.set(account, { account, professions: new Set([profession]), fightCount: 1 });
                    }
                });
            });
        });
        const result = new Map<number, Array<{ account: string; profession: string; professionList: string[]; fightCount: number }>>();
        memberMap.forEach((members, subgroupId) => {
            const entries = Array.from(members.values())
                .map((member) => {
                    const profList = Array.from(member.professions);
                    return {
                        account: member.account,
                        profession: profList[0] || 'Unknown',
                        professionList: profList,
                        fightCount: member.fightCount
                    };
                })
                .sort((a, b) => b.fightCount - a.fightCount || a.account.localeCompare(b.account));
            result.set(subgroupId, entries);
        });
        return result;
    }, [safeStats.squadCompByFight]);
    const boonUptimePercentByPlayer = useMemo(() => {
        const map = new Map<string, number>();
        const players = [
            ...(Array.isArray(activeBoonUptime?.players) ? activeBoonUptime.players : []),
            ...boonUptimeSubgroupEntries
        ];
        const fights = boonUptimeFightsWithSubgroups;
        if (!players.length || !fights.length) return map;
        const totalSamplesAllFights = fights.reduce((sum: number, fight: any) => {
            const bucketCount = Math.max(
                Math.ceil(Math.max(0, Number(fight?.durationMs || 0)) / (activeBoonUptime?.intervalMs || 5000)),
                1
            );
            return sum + bucketCount;
        }, 0);
        if (totalSamplesAllFights <= 0) return map;
        players.forEach((player: any) => {
            const key = String(player?.key || '');
            if (!key || key === '__all__') return;
            let activeSamples = 0;
            fights.forEach((fight: any) => {
                const playerValue = fight?.values?.[key];
                const buckets = Array.isArray(playerValue?.buckets) ? playerValue.buckets : [];
                const bucketCount = Math.max(
                    buckets.length,
                    Math.ceil(Math.max(0, Number(fight?.durationMs || 0)) / (activeBoonUptime?.intervalMs || 5000)),
                    1
                );
                for (let index = 0; index < bucketCount; index += 1) {
                    if (Math.max(0, Number(buckets[index] || 0)) > 0) activeSamples += 1;
                }
            });
            map.set(key, (activeSamples / totalSamplesAllFights) * 100);
        });
        return map;
    }, [activeBoonUptime, boonUptimeFightsWithSubgroups, boonUptimeSubgroupEntries]);
    const boonUptimePlayers = useMemo(() => {
        const sourcePlayers = Array.isArray(activeBoonUptime?.players) ? activeBoonUptime.players : [];
        const players = [
            ...sourcePlayers.map((player: any) => ({
                ...player,
                entryType: 'player' as const,
                uptimePercent: Number(boonUptimePercentByPlayer.get(String(player?.key || '')) || 0)
            })),
            ...boonUptimeSubgroupEntries.map((player: any) => ({
                ...player,
                uptimePercent: Number(boonUptimePercentByPlayer.get(String(player?.key || '')) || 0)
            }))
        ];
        const sortedPlayers = [...players].sort((a, b) =>
            Number(boonUptimePercentByPlayer.get(String(b?.key || '')) || 0) - Number(boonUptimePercentByPlayer.get(String(a?.key || '')) || 0)
            || Number(b.peak || 0) - Number(a.peak || 0)
            || Number(b.total || 0) - Number(a.total || 0)
            || String(a.displayName || '').localeCompare(String(b.displayName || ''))
        );
        const subgroupEntries = sortedPlayers
            .filter((entry) => entry.entryType === 'subgroup')
            .sort((a, b) => Number(a.subgroupId || 0) - Number(b.subgroupId || 0));
        const playerEntries = sortedPlayers.filter((entry) => entry.entryType !== 'subgroup');
        return [...subgroupEntries, ...playerEntries];
    }, [activeBoonUptime, boonUptimePercentByPlayer, boonUptimeSubgroupEntries]);
    const filteredBoonUptimePlayers = useMemo(() => {
        const term = boonUptimePlayerFilter.trim().toLowerCase();
        if (!term) return boonUptimePlayers;
        return boonUptimePlayers.filter((player: any) => (
            String(player?.displayName || '').toLowerCase().includes(term)
            || String(player?.account || '').toLowerCase().includes(term)
            || String(player?.profession || '').toLowerCase().includes(term)
        ));
    }, [boonUptimePlayers, boonUptimePlayerFilter]);
    const boonUptimePlayerMap = useMemo(() => {
        const map = new Map<string, any>();
        boonUptimePlayers.forEach((player: any) => {
            map.set(String(player?.key || ''), player);
        });
        return map;
    }, [boonUptimePlayers]);
    const selectedBoonUptimePlayer = selectedBoonUptimePlayerKey
        ? boonUptimePlayerMap.get(selectedBoonUptimePlayerKey) || null
        : null;
    const boonUptimeChartData = useMemo<Array<{
        index: number;
        fightId: string;
        shortLabel: string;
        fullLabel: string;
        timestamp: number;
        durationMs: number;
        total: number;
        average: number;
        uptimePercent: number;
        peak: number;
        maxTotal: number;
        maxAverage: number;
        maxUptimePercent: number;
    }>>(() => {
        if (!activeBoonUptime || !selectedBoonUptimePlayerKey) return [];
        return boonUptimeFightsWithSubgroups.map((fight: any, index: number) => {
            const playerValue = fight?.values?.[selectedBoonUptimePlayerKey] || { total: 0, peak: 0 };
            const playerBuckets = Array.isArray(playerValue?.buckets) ? playerValue.buckets : [];
            const playerBucketCount = Math.max(
                playerBuckets.length,
                Math.ceil(Math.max(0, Number(fight?.durationMs || 0)) / (activeBoonUptime?.intervalMs || 5000)),
                1
            );
            const playerAverage = Math.max(0, Number(playerValue?.total || 0)) / playerBucketCount;
            const playerActiveBuckets = Array.from({ length: playerBucketCount }, (_, i) => Math.max(0, Number(playerBuckets[i] || 0)))
                .reduce((sum: number, value: number) => sum + (value > 0 ? 1 : 0), 0);
            const playerUptimePercent = (playerActiveBuckets / playerBucketCount) * 100;
            const computedFightMax = Object.entries((fight?.values && typeof fight.values === 'object') ? fight.values : {})
                .filter(([key]) => String(key || '') !== '__all__')
                .reduce((best: number, [, value]: [string, any]) => Math.max(best, Math.max(0, Number(value?.peak || 0))), 0);
            const computedFightAverageMax = Object.entries((fight?.values && typeof fight.values === 'object') ? fight.values : {})
                .filter(([key]) => String(key || '') !== '__all__')
                .reduce((best: number, [, value]: [string, any]) => {
                    const buckets = Array.isArray(value?.buckets) ? value.buckets : [];
                    const bucketCount = Math.max(
                        buckets.length,
                        Math.ceil(Math.max(0, Number(fight?.durationMs || 0)) / (activeBoonUptime?.intervalMs || 5000)),
                        1
                    );
                    const avg = Math.max(0, Number(value?.total || 0)) / bucketCount;
                    return Math.max(best, avg);
                }, 0);
            const computedFightUptimePercentMax = Object.entries((fight?.values && typeof fight.values === 'object') ? fight.values : {})
                .filter(([key]) => String(key || '') !== '__all__')
                .reduce((best: number, [, value]: [string, any]) => {
                    const buckets = Array.isArray(value?.buckets) ? value.buckets : [];
                    const bucketCount = Math.max(
                        buckets.length,
                        Math.ceil(Math.max(0, Number(fight?.durationMs || 0)) / (activeBoonUptime?.intervalMs || 5000)),
                        1
                    );
                    const activeBuckets = Array.from({ length: bucketCount }, (_, i) => Math.max(0, Number(buckets[i] || 0)))
                        .reduce((sum: number, bucketValue: number) => sum + (bucketValue > 0 ? 1 : 0), 0);
                    const percent = (activeBuckets / bucketCount) * 100;
                    return Math.max(best, percent);
                }, 0);
            return {
                index,
                fightId: String(fight?.id || ''),
                shortLabel: String(fight?.shortLabel || `F${index + 1}`),
                fullLabel: String(fight?.fullLabel || `Fight ${index + 1}`),
                timestamp: Number(fight?.timestamp || 0),
                durationMs: Number(fight?.durationMs || 0),
                total: Math.max(0, Number(playerValue?.total || 0)),
                average: playerAverage,
                uptimePercent: playerUptimePercent,
                peak: Math.max(0, Number(playerValue?.peak || 0)),
                maxTotal: computedFightMax > 0 ? computedFightMax : Math.max(0, Number(fight?.maxTotal || 0)),
                maxAverage: computedFightAverageMax,
                maxUptimePercent: computedFightUptimePercentMax
            };
        });
    }, [activeBoonUptime, selectedBoonUptimePlayerKey, boonUptimeFightsWithSubgroups]);
    const boonUptimeChartMaxY = useMemo(() => {
        const useAverage = Boolean(activeBoonUptime?.stacking);
        const selectedPeak = boonUptimeChartData.reduce((best: number, entry) => Math.max(
            best,
            Number(useAverage ? entry?.average : entry?.uptimePercent || 0)
        ), 0);
        const fightPeak = boonUptimeChartData.reduce((best: number, entry) => Math.max(
            best,
            Number(useAverage ? entry?.maxAverage : entry?.maxUptimePercent || 0)
        ), 0);
        const stackCap = activeBoonUptime?.stacking ? 25 : 100;
        return Math.max(1, selectedPeak, fightPeak, stackCap);
    }, [boonUptimeChartData, activeBoonUptime?.stacking]);
    const boonUptimeDrilldown = useMemo(() => {
        const selectedPoint = selectedBoonUptimeFightIndex === null
            ? null
            : boonUptimeChartData.find((entry) => entry.index === selectedBoonUptimeFightIndex) || null;
        if (!selectedPoint || !activeBoonUptime || !selectedBoonUptimePlayerKey) {
            return {
                title: 'Fight Breakdown',
                data: [] as Array<{ label: string; value: number; maxValue: number; incomingDamage: number; incomingIntensity: number }>
            };
        }
        const selectedFight = boonUptimeFightsWithSubgroups?.[selectedPoint.index];
        if (!selectedFight) {
            return {
                title: 'Fight Breakdown',
                data: [] as Array<{ label: string; value: number; maxValue: number; incomingDamage: number; incomingIntensity: number }>
            };
        }
        const selectedValue = selectedFight?.values?.[selectedBoonUptimePlayerKey];
        const selectedBuckets = Array.isArray(selectedValue?.buckets) ? selectedValue.buckets : [];
        const bucketCount = Math.max(
            selectedBuckets.length,
            Math.ceil(Math.max(0, Number(selectedFight?.durationMs || 0)) / (activeBoonUptime?.intervalMs || 5000)),
            1
        );
        const intervalSec = (activeBoonUptime?.intervalMs || 5000) / 1000;
        const data = Array.from({ length: bucketCount }, (_, index) => {
            const maxValue = Object.entries((selectedFight?.values && typeof selectedFight.values === 'object') ? selectedFight.values : {})
                .filter(([key]) => String(key || '') !== '__all__')
                .reduce((best: number, [, value]: [string, any]) => Math.max(best, Math.max(0, Number(value?.buckets?.[index] || 0))), 0);
            return {
                label: `${index * intervalSec}s-${(index + 1) * intervalSec}s`,
                value: Math.max(0, Number(selectedBuckets[index] || 0)),
                maxValue
            };
        });
        const primaryIncomingEntry = squadIncomingDamageBucketsByFightId.get(String(selectedFight?.id || ''))
            || squadIncomingDamageBucketsByFightId.get(String(selectedPoint?.fightId || ''));
        const fallbackIncomingByFightId = fallbackIncomingDamageBucketsByFightId.get(String(selectedFight?.id || ''))
            || fallbackIncomingDamageBucketsByFightId.get(String(selectedPoint?.fightId || ''))
            || [];
        const intervalSeconds = Math.max(1, Math.round(intervalSec));
        const primaryPerSecond = primaryIncomingEntry?.perSecond || [];
        const aggregatedBuckets: number[] = [];
        if (primaryPerSecond.length > 0) {
            for (let i = 0; i < bucketCount; i += 1) {
                const start = i * intervalSeconds;
                const end = Math.min(start + intervalSeconds, primaryPerSecond.length);
                let sum = 0;
                for (let j = start; j < end; j += 1) {
                    sum += Number(primaryPerSecond[j] || 0);
                }
                aggregatedBuckets.push(sum);
            }
        }
        const primaryIncomingTotal = aggregatedBuckets.reduce((sum, value) => sum + Number(value || 0), 0);
        const incomingBuckets = primaryIncomingTotal > 0
            ? Array.from({ length: bucketCount }, (_, index) => Number(aggregatedBuckets[index] || 0))
            : Array.from({ length: bucketCount }, (_, index) => Number(fallbackIncomingByFightId[index] || 0));
        const incomingMax = incomingBuckets.reduce((best, value) => Math.max(best, Number(value || 0)), 0);
        const dataWithIncoming = data.map((entry, index) => {
            const incomingDamage = Number(incomingBuckets[index] || 0);
            return {
                ...entry,
                incomingDamage,
                incomingIntensity: incomingMax > 0 ? Math.max(0, Math.min(1, incomingDamage / incomingMax)) : 0
            };
        });
        return {
            title: `Fight Breakdown - ${selectedPoint.shortLabel || 'Fight'} (${(activeBoonUptime?.intervalMs || 5000) / 1000}s Stack Buckets)`,
            data: dataWithIncoming
        };
    }, [selectedBoonUptimeFightIndex, boonUptimeChartData, boonUptimeFightsWithSubgroups, selectedBoonUptimePlayerKey, activeBoonUptime, squadIncomingDamageBucketsByFightId, fallbackIncomingDamageBucketsByFightId]);
    const boonUptimeOverallPercent = useMemo(() => {
        if (!selectedBoonUptimePlayerKey) return null;
        const value = boonUptimePercentByPlayer.get(selectedBoonUptimePlayerKey);
        return Number.isFinite(Number(value)) ? Number(value) : null;
    }, [boonUptimePercentByPlayer, selectedBoonUptimePlayerKey]);
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
        if (boonTimelineBoons.length === 0) {
            if (activeBoonTimelineId !== null) setActiveBoonTimelineId(null);
            return;
        }
        if (!activeBoonTimelineId || !boonTimelineBoons.some((boon: any) => boon.id === activeBoonTimelineId)) {
            setActiveBoonTimelineId(boonTimelineBoons[0].id);
        }
    }, [boonTimelineBoons, activeBoonTimelineId]);
    useEffect(() => {
        if (boonTimelineBoons.length === 0) {
            if (allBoonsActiveBoonId !== null) setAllBoonsActiveBoonId(null);
            return;
        }
        if (!allBoonsActiveBoonId || !boonTimelineBoons.some((boon: any) => boon.id === allBoonsActiveBoonId)) {
            setAllBoonsActiveBoonId(boonTimelineBoons[0].id);
        }
    }, [boonTimelineBoons, allBoonsActiveBoonId]);
    useEffect(() => {
        const players = activeBoonTimeline?.players || [];
        if (players.length === 0) {
            if (selectedBoonTimelinePlayerKey !== null) setSelectedBoonTimelinePlayerKey(null);
            return;
        }
        const preferred = players.find((player: any) => player.key === '__all__')?.key || players[0].key;
        if (!selectedBoonTimelinePlayerKey || !players.some((player: any) => player.key === selectedBoonTimelinePlayerKey)) {
            setSelectedBoonTimelinePlayerKey(preferred);
        }
    }, [activeBoonTimeline, selectedBoonTimelinePlayerKey]);
    useEffect(() => {
        setSelectedBoonTimelineFightIndex(null);
    }, [activeBoonTimelineId, selectedBoonTimelinePlayerKey]);
    useEffect(() => {
        if (boonUptimeBoons.length === 0) {
            if (activeBoonUptimeId !== null) setActiveBoonUptimeId(null);
            return;
        }
        if (!activeBoonUptimeId || !boonUptimeBoons.some((boon: any) => boon.id === activeBoonUptimeId)) {
            setActiveBoonUptimeId(boonUptimeBoons[0].id);
        }
    }, [boonUptimeBoons, activeBoonUptimeId]);
    useEffect(() => {
        const players = boonUptimePlayers;
        if (players.length === 0) {
            if (selectedBoonUptimePlayerKey !== null) setSelectedBoonUptimePlayerKey(null);
            return;
        }
        const preferred = players[0].key;
        if (!selectedBoonUptimePlayerKey || !players.some((player: any) => player.key === selectedBoonUptimePlayerKey)) {
            setSelectedBoonUptimePlayerKey(preferred);
        }
    }, [boonUptimePlayers, selectedBoonUptimePlayerKey]);
    useEffect(() => {
        if (
            selectedBoonUptimeFightIndex !== null
            && (selectedBoonUptimeFightIndex < 0 || selectedBoonUptimeFightIndex >= boonUptimeChartData.length)
        ) {
            setSelectedBoonUptimeFightIndex(null);
        }
    }, [boonUptimeChartData, selectedBoonUptimeFightIndex]);
    useEffect(() => {
        setSelectedBoonUptimeFightIndex(null);
    }, [activeBoonUptimeId, selectedBoonUptimePlayerKey]);

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



    const openExpandedSection = useCallback((sectionId: string) => {
        if (expandedCloseTimerRef.current) {
            window.clearTimeout(expandedCloseTimerRef.current);
            expandedCloseTimerRef.current = null;
        }
        setExpandedSectionClosing(false);
        setExpandedSection(sectionId);
    }, []);

    const closeExpandedSection = useCallback(() => {
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
    }, [expandedSection]);

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
    const commanderStats = safeStats?.commanderStats && typeof safeStats.commanderStats === 'object'
        ? safeStats.commanderStats
        : { rows: [] };
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
                enemyClassCounts: match?.enemyClassCounts || {},
                isWin: typeof match?.isWin === 'boolean' ? match.isWin : undefined,
                fullLabel: match?.fullLabel
            };
        });
    }, [squadCompByFight, fightBreakdownRows]);

    const mergeFightRoster = useStatsStore((s) => s.mergeFightRoster);
    useEffect(() => {
        if (embedded) return;
        mergeFightRoster(
            fightCompByFight.map((fight: any) => ({
                id: String(fight.id),
                label: String(fight.fullLabel || fight.mapName || fight.label || ''),
                timestamp: Number(fight.timestamp || 0),
                duration: String(fight.duration || ''),
                isWin: fight.isWin,
                enemyClassCounts: fight.enemyClassCounts,
            })),
            logs.map((log, index) => statsLogKey(log, index)),
        );
    }, [embedded, fightCompByFight, logs, mergeFightRoster]);

    const sortedSquadClassData = useMemo(() => [...squadClassData].sort(sortByCountDesc), [squadClassData]);
    const sortedEnemyClassData = useMemo(() => [...enemyClassData].sort(sortByCountDesc), [enemyClassData]);

    const useModernLayout = false;
    const containerClass = embedded
        ? 'stats-view min-h-screen flex flex-col p-0 w-full max-w-none'
        : 'stats-view h-full flex flex-col p-1 w-full max-w-none overflow-hidden';
    const scrollContainerClass = embedded
        ? `stats-sections space-y-0 min-h-0 px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4 rounded-xl border border-white/5 ${expandedSection ? '' : 'backdrop-blur-xl'
        }`
        : `flex-1 overflow-y-auto pr-2 space-y-6 min-h-0 ${expandedSection ? '' : 'backdrop-blur-2xl'
        }`;
    const scrollContainerStyle: CSSProperties | undefined = useMemo(() => embedded
        ? {
            backgroundColor: 'rgba(3, 7, 18, 0.75)',
            backgroundImage: 'linear-gradient(160deg, rgba(var(--accent-rgb), 0.12), rgba(var(--accent-rgb), 0.04) 70%)'
        }
        : undefined, [embedded]);
    const resolvedScrollContainerStyle = scrollContainerStyle;


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
    const headerTotalLogs = Math.max(
        Math.max(0, Number(safeStats.total || 0)),
        Math.max(0, Number(logs.length || 0)),
        Math.max(0, Number(statsDataProgress?.total || 0))
    );

    const renderProfessionIcon = renderProfessionIconShared;
    const sharedCtxValue = useMemo(() => ({
        stats: safeStats,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
        isSectionVisible,
        isFirstVisibleSection,
        sectionClass,
        sidebarListClass,
        formatWithCommas,
        renderProfessionIcon,
        roundCountStats,
        mvpBoonMetric: activeStatsViewSettings.mvpBoonMetric || 'uptime',
        expandedPortalRef,
    }), [safeStats, expandedSection, expandedSectionClosing, openExpandedSection,
        closeExpandedSection, isSectionVisible, isFirstVisibleSection, sectionClass,
        formatWithCommas, renderProfessionIcon, roundCountStats,
        activeStatsViewSettings.mvpBoonMetric]);
    const canUploadWeb = useMemo(() => {
        const total = Number((safeStats as any).total || 0);
        if (Number.isFinite(total) && total > 0) return true;

        const nonEmptyArrayKeys = [
            'fightBreakdown',
            'timelineData',
            'mapData',
            'attendanceData',
            'offensePlayers',
            'defensePlayers',
            'supportPlayers',
            'healingPlayers',
            'boonTables',
            'squadClassData',
            'enemyClassData',
            'playerSkillBreakdowns',
            'topSkills',
            'topIncomingSkills'
        ];

        return nonEmptyArrayKeys.some((key) => Array.isArray((safeStats as any)[key]) && (safeStats as any)[key].length > 0);
    }, [safeStats]);

    return (
        <div className={containerClass}>
            {expandedSection && (
                <div
                    className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-md modal-backdrop ${expandedSectionClosing ? 'modal-backdrop-exit' : 'modal-backdrop-enter'
                        }`}
                    onClick={closeExpandedSection}
                />
            )}
            {/* Portal target for expanded sections — lives at the StatsView root so
                position:fixed escapes ancestor transforms/filters/backdrop-filters. */}
            <div ref={expandedPortalRef} />
            <SearchPalette
                open={searchOpen}
                onClose={() => setSearchOpen(false)}
                index={searchIndex}
                onSelect={jumpToEntry}
            />
            <StatsHeader
                embedded={embedded}
                dashboardTitle={dashboardTitle}
                totalLogs={headerTotalLogs}
                devMockAvailable={devMockAvailable}
                devMockUploadState={devMockUploadState}
                onDevMockUpload={handleDevMockUpload}
                uploadingWeb={uploadingWeb}
                onWebUpload={handleWebUpload}
                uploadTargets={webUploadTargets}
                onWebUploadToTarget={handleWebUploadToTarget}
                reportWebhooks={reportWebhooks}
                initialWebhookSelection={initialWebhookSelection}
                canUploadWeb={canUploadWeb}
                actionsDisabled={statsActionsDisabled}
                publishBlockedReason={publishBlockedReason}
                onSearchClick={() => setSearchOpen(true)}
                onToggleSliceTray={(!embedded || sliceEnabled) ? () => {
                    setSliceTrayOpen((open) => {
                        const next = !open;
                        if (next && onOpenSliceTray) {
                            void onOpenSliceTray();
                        }
                        return next;
                    });
                } : undefined}
            />

            <AxilogCoverageBanner
                embedded={embedded}
                coverage={axilogCoverage}
                parserBackend={parserBackend}
                healState={healState}
                onHeal={() => heal(axilogCoverage.missingLogs)}
            />

            <WebUploadBanner
                embedded={embedded}
                webUploadMessage={webUploadMessage}
                webUploadUrl={webUploadUrl}
                webUploadBuildStatus={webUploadBuildStatus}
                webCopyStatus={webCopyStatus}
                setWebCopyStatus={setWebCopyStatus}
                logEntries={webUploadLogEntries}
            />

            <DevMockBanner
                embedded={embedded}
                devMockAvailable={devMockAvailable}
                devMockUploadState={devMockUploadState}
            />

            {(!embedded || sliceEnabled) && sliceTrayOpen && <FightSliceTray onClose={() => setSliceTrayOpen(false)} />}
            {(!embedded || sliceEnabled) && <FightSliceBanner onCopyLink={onCopySliceLink} unavailable={sliceUnavailable} />}

            {/* Processing indicator: particle spinner with witty remarks (desktop) */}
            {(aggregationSettling.active || detailsProgress.active) && !embedded && (
                <div className="mb-3 flex items-center justify-end gap-3 text-xs min-w-0">
                    {aggregationSettling.active && statsSettlingBannerJoke && (
                        <div className="stats-dissolve-joke">{statsSettlingBannerJoke}</div>
                    )}
                    {!aggregationSettling.active && detailsProgress.active && (
                        <span className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                            {detailsProgress.phaseLabel} {detailsProgress.progressText}
                        </span>
                    )}
                    <div className="stats-particle-spinner">
                        <div className="stats-particle-spinner__ring" />
                        <div className="stats-particle-spinner__orbit">
                            <span className="stats-particle-spinner__particle" />
                            <span className="stats-particle-spinner__particle" />
                            <span className="stats-particle-spinner__particle" />
                            <span className="stats-particle-spinner__particle" />
                        </div>
                    </div>
                </div>
            )}
            {/* Embedded mode: text-only status labels (no spinner) */}
            {embedded && aggregationSettling.active && (
                <div className="mb-3 text-xs">
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <span className="font-medium">{aggregationSettling.phaseLabel}</span>
                        <span style={{ opacity: 0.7 }}>{aggregationSettling.progressText}</span>
                    </div>
                </div>
            )}
            {embedded && !aggregationSettling.active && detailsProgress.active && (
                <div className="mb-3 text-xs">
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        <span className="font-medium">{detailsProgress.phaseLabel}</span>
                        <span style={{ opacity: 0.7 }}>{detailsProgress.progressText}</span>
                    </div>
                </div>
            )}

            {/* Replay: full-page experience — skip all section chrome, but keep a real
                #replay anchor (matches the SectionPanel-rendered id used everywhere else)
                so deep links / search-jump can still target this category in desktop mode. */}
            {!embedded && !sectionsDeferred && activeCategory === 'replay' && (
                <div id="replay" className="flex-1 min-h-0 flex" style={{ minHeight: 0 }}>
                    {r2ReplayStatus === 'error' ? (
                        <div className="flex flex-col items-center justify-center w-full gap-1">
                            <span className="text-sm text-rose-400">Failed to load replay data.</span>
                            {r2ReplayError && <span className="text-xs text-rose-300/70">{r2ReplayError}</span>}
                        </div>
                    ) : replayUnsliceable ? (
                        replaySliceNotice
                    ) : (
                        <div style={{ display: 'contents' }}>
                            {r2ReplayStatus === 'loading' && (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, pointerEvents: 'none' }}>
                                    <span className="text-sm text-gray-400">Loading replay data...</span>
                                </div>
                            )}
                            <ReplaySection fights={getReplayFights()} />
                        </div>
                    )}
                </div>
            )}

            {!sectionsDeferred && (embedded || activeCategory !== 'replay') && (<div
                className={`${embedded ? '' : 'flex-1 min-h-0 flex'} relative`}
            >
                <div
                    id="stats-dashboard-container"
                    ref={scrollContainerRef}
                    className={`${scrollContainerClass} ${embedded ? '' : 'flex-1'}`}
                    style={resolvedScrollContainerStyle}
                >
                <StatsSharedContext.Provider value={sharedCtxValue}>
                {useModernLayout ? (
                    <div className="stats-layout stats-layout-modern grid gap-4 grid-cols-1">
                        <div className="space-y-4 min-w-0">
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                {renderSectionWrap(<OverviewSection
                                />)}

                                {renderSectionWrap(<FightBreakdownSection
                                    fightBreakdownTab={fightBreakdownTab}
                                    setFightBreakdownTab={setFightBreakdownTab}
                                />)}

                                {renderSectionWrap(<TopPlayersSection
                                    showTopStats={showTopStats}
                                    showMvp={showMvp}
                                    topStatsMode={topStatsMode}
                                    expandedLeader={expandedLeader}
                                    setExpandedLeader={setExpandedLeader}
                                    formatTopStatValue={formatTopStatValue}
                                    isMvpStatEnabled={isMvpStatEnabled}
                                    enabledTopStats={enabledTopStats}
                                    noEgoMode={noEgoMode}
                                />)}
                            </div>

                            {!noEgoMode && renderSectionWrap(<TopSkillsSection
                                topSkillsMetric={topSkillsMetric}
                                onTopSkillsMetricChange={updateTopSkillsMetric}
                            />)}

                            {renderSectionWrap(<BoonOutputSection
                                activeBoonCategory={activeBoonCategory}
                                setActiveBoonCategory={(val: string) => setActiveBoonCategory(val as BoonCategory)}
                                activeBoonMetric={activeBoonMetric}
                                setActiveBoonMetric={setActiveBoonMetric}
                                activeBoonTab={activeBoonTab}
                                setActiveBoonTab={setActiveBoonTab}
                                activeBoonTable={activeBoonTable}
                                boonSearch={boonSearch}
                                setBoonSearch={setBoonSearch}
                                formatBoonMetricDisplay={formatBoonMetricDisplay}
                                getBoonMetricValue={getBoonMetricValue}
                            />)}
                            {renderSectionWrap(<BoonTimelineSection
                                boonSearch={boonTimelineSearch}
                                setBoonSearch={setBoonTimelineSearch}
                                boons={filteredBoonTimelineBoons}
                                activeBoonId={activeBoonTimelineId}
                                setActiveBoonId={setActiveBoonTimelineId}
                                timelineScope={boonTimelineScope}
                                setTimelineScope={setBoonTimelineScope}
                                playerFilter={boonTimelinePlayerFilter}
                                setPlayerFilter={setBoonTimelinePlayerFilter}
                                players={filteredBoonTimelinePlayers}
                                selectedPlayerKey={selectedBoonTimelinePlayerKey}
                                setSelectedPlayerKey={setSelectedBoonTimelinePlayerKey}
                                selectedPlayer={selectedBoonTimelinePlayer}
                                chartData={boonTimelineChartData}
                                chartMaxY={boonTimelineChartMaxY}
                                selectedFightIndex={selectedBoonTimelineFightIndex}
                                setSelectedFightIndex={setSelectedBoonTimelineFightIndex}
                                drilldownTitle={boonTimelineDrilldown.title}
                                drilldownData={boonTimelineDrilldown.data}
                                showIncomingHeatmap={showBoonTimelineIncomingHeatmap}
                                setShowIncomingHeatmap={setShowBoonTimelineIncomingHeatmap}
                            />)}
                            {renderSectionWrap(<BoonUptimeSection
                                boonSearch={boonUptimeSearch}
                                setBoonSearch={setBoonUptimeSearch}
                                boons={filteredBoonUptimeBoons}
                                activeBoonId={activeBoonUptimeId}
                                setActiveBoonId={setActiveBoonUptimeId}
                                playerFilter={boonUptimePlayerFilter}
                                setPlayerFilter={setBoonUptimePlayerFilter}
                                players={filteredBoonUptimePlayers}
                                selectedPlayerKey={selectedBoonUptimePlayerKey}
                                setSelectedPlayerKey={setSelectedBoonUptimePlayerKey}
                                selectedPlayer={selectedBoonUptimePlayer}
                                chartData={boonUptimeChartData}
                                chartMaxY={boonUptimeChartMaxY}
                                selectedFightIndex={selectedBoonUptimeFightIndex}
                                setSelectedFightIndex={setSelectedBoonUptimeFightIndex}
                                drilldownTitle={boonUptimeDrilldown.title}
                                drilldownData={boonUptimeDrilldown.data}
                                overallUptimePercent={boonUptimeOverallPercent}
                                showStackCapLine={Boolean(activeBoonUptime?.stacking)}
                                subgroupMembers={boonUptimeSubgroupMembers}
                                showIncomingHeatmap={showBoonUptimeIncomingHeatmap}
                                setShowIncomingHeatmap={setShowBoonUptimeIncomingHeatmap}
                            />)}
                            {renderSectionWrap(<StabPerformanceSection
                                playerFilter={stabPerfPlayerFilter}
                                setPlayerFilter={setStabPerfPlayerFilter}
                                players={stabPerfFilteredPlayers}
                                selectedPlayerKey={selectedStabPerfPlayerKey}
                                setSelectedPlayerKey={setSelectedStabPerfPlayerKey}
                                selectedPlayer={selectedStabPerfPlayer}
                                chartData={stabPerfChartData}
                                chartMaxY={stabPerfChartMaxY}
                                selectedFightIndex={selectedStabPerfFightIndex}
                                setSelectedFightIndex={setSelectedStabPerfFightIndex}
                                drilldownTitle={stabPerfDrilldown.title}
                                drilldownData={stabPerfDrilldown.data}
                                partyMembers={stabPerfDrilldown.partyMembers}
                                showIncomingHeatmap={showStabPerfHeatmap}
                                setShowIncomingHeatmap={setShowStabPerfHeatmap}
                                showPartyDeaths={showStabPerfDeaths}
                                setShowPartyDeaths={setShowStabPerfDeaths}
                                showPartyDistance={showStabPerfDistance}
                                setShowPartyDistance={setShowStabPerfDistance}
                            />)}

                            {renderSectionWrap(<OffenseSection
                                offenseSearch={offenseSearch}
                                setOffenseSearch={setOffenseSearch}
                                activeOffenseStat={activeOffenseStat}
                                setActiveOffenseStat={setActiveOffenseStat}
                                offenseViewMode={offenseViewMode}
                                setOffenseViewMode={setOffenseViewMode}
                                noEgoMode={noEgoMode}
                            />)}

                            {renderSectionWrap(<DamageModifiersSection
                                search={damageModSearch}
                                setSearch={setDamageModSearch}
                                activeMod={activeDamageMod}
                                setActiveMod={setActiveDamageMod}
                                incoming={false}
                            />)}

                            {renderSectionWrap(<PlayerBreakdownSection
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
                            />)}

                            {renderSectionWrap(<DamageBreakdownSection
                                playerSkillBreakdowns={playerSkillBreakdowns}
                            />)}

                            {renderSectionWrap(<SpikeDamageSection
                                spikePlayerFilter={spikePlayerFilter}
                                setSpikePlayerFilter={setSpikePlayerFilter}
                                groupedSpikePlayers={groupedSpikePlayers}
                                spikeMode={spikeMode}
                                setSpikeMode={setSpikeMode}
                                damageBasis={spikeDamageBasis}
                                setDamageBasis={setSpikeDamageBasis}
                                showDamageBasisToggle
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
                            />)}

                            {renderSectionWrap(<FightMetricSection
                                sectionId="strip-spikes"
                                title="Strip Spikes"
                                titleIcon={Eraser}
                                titleIconClassName="text-amber-300"
                                modes={[
                                    { id: 'strips', label: 'Strips' },
                                    { id: 'stripDownContrib', label: 'Down Contrib' },
                                ]}
                                activeMode={stripMode}
                                setActiveMode={setStripMode}
                                playerFilter={stripPlayerFilter}
                                setPlayerFilter={setStripPlayerFilter}
                                groupedPlayers={groupedStripPlayers}
                                selectedPlayerKey={selectedStripPlayerKey}
                                setSelectedPlayerKey={setSelectedStripPlayerKey}
                                selectedPlayer={selectedStripPlayer}
                                chartData={stripChartData}
                                chartMaxY={stripChartMaxY}
                                formatValue={(v: number) => formatWithCommas(v, 0)}
                                valueSuffix={stripMode === 'strips' ? 'strips' : ''}
                            />)}

                            {renderSectionWrap(<ConditionsSection
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
                            />)}

                            {renderSectionWrap(<DefenseSection
                                defenseSearch={defenseSearch}
                                setDefenseSearch={setDefenseSearch}
                                activeDefenseStat={activeDefenseStat}
                                setActiveDefenseStat={setActiveDefenseStat}
                                defenseViewMode={defenseViewMode}
                                setDefenseViewMode={setDefenseViewMode}
                                noEgoMode={noEgoMode}
                            />)}

                            {renderSectionWrap(<DamageModifiersSection
                                search={incomingDamageModSearch}
                                setSearch={setIncomingDamageModSearch}
                                activeMod={activeIncomingDamageMod}
                                setActiveMod={setActiveIncomingDamageMod}
                                incoming={true}
                            />)}

                            {renderSectionWrap(<SpikeDamageSection
                                sectionId="incoming-strike-damage"
                                title="Incoming Strike Damage"
                                subtitle="Select one enemy class to chart incoming strike pressure per fight."
                                listTitle="Enemy Classes"
                                searchPlaceholder="Search enemy class"
                                titleIcon={ShieldAlert}
                                titleIconClassName="text-cyan-300"
                                spikePlayerFilter={incomingStrikePlayerFilter}
                                setSpikePlayerFilter={setIncomingStrikePlayerFilter}
                                groupedSpikePlayers={groupedIncomingStrikePlayers}
                                spikeMode={incomingStrikeMode}
                                setSpikeMode={setIncomingStrikeMode}
                                showTotalDamageToggle
                                useTotalDamage={incomingStrikeUseTotalDamage}
                                setUseTotalDamage={setIncomingStrikeUseTotalDamage}
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
                            />)}

                            {renderSectionWrap(<DamageMitigationSection
                                damageMitigationSearch={damageMitigationSearch}
                                setDamageMitigationSearch={setDamageMitigationSearch}
                                activeDamageMitigationStat={activeDamageMitigationStat}
                                setActiveDamageMitigationStat={setActiveDamageMitigationStat}
                                damageMitigationViewMode={damageMitigationViewMode}
                                setDamageMitigationViewMode={setDamageMitigationViewMode}
                                damageMitigationScope={damageMitigationScope}
                                setDamageMitigationScope={setDamageMitigationScope}
                            />)}

                            {renderSectionWrap(<BoonStripComparisonSection />)}

                            {renderSectionWrap(<SupportSection
                                supportSearch={supportSearch}
                                setSupportSearch={setSupportSearch}
                                activeSupportStat={activeSupportStat}
                                setActiveSupportStat={setActiveSupportStat}
                                supportViewMode={supportViewMode}
                                setSupportViewMode={setSupportViewMode}
                                cleanseScope={cleanseScope}
                                setCleanseScope={setCleanseScope}
                                noEgoMode={noEgoMode}
                            />)}

                            {renderSectionWrap(<HealingSection
                                activeHealingMetric={activeHealingMetric}
                                setActiveHealingMetric={setActiveHealingMetric}
                                healingCategory={healingCategory}
                                setHealingCategory={setHealingCategory}
                                activeResUtilitySkill={activeResUtilitySkill}
                                setActiveResUtilitySkill={setActiveResUtilitySkill}
                                skillUsageData={skillUsageData}
                            />)}

                            {renderSectionWrap(<HealingBreakdownSection
                                healingBreakdownPlayers={safeStats.healingBreakdownPlayers}
                            />)}

                            {renderSectionWrap(<FightDiffModeSection
                            />)}

                            {renderSectionWrap(<SpecialBuffsSection
                                specialSearch={specialSearch}
                                setSpecialSearch={setSpecialSearch}
                                activeSpecialTab={activeSpecialTab}
                                setActiveSpecialTab={setActiveSpecialTab}
                                activeSpecialTable={activeSpecialTable}
                            />)}

                            {renderSectionWrap(<SigilRelicUptimeSection
                                hasSigilRelicTables={sigilRelicTables.length > 0}
                                sigilRelicSearch={sigilRelicSearch}
                                setSigilRelicSearch={setSigilRelicSearch}
                                filteredSigilRelicTables={filteredSigilRelicTables}
                                activeSigilRelicTab={activeSigilRelicTab}
                                setActiveSigilRelicTab={setActiveSigilRelicTab}
                                activeSigilRelicTable={activeSigilRelicTable}
                            />)}

                            {renderSectionWrap(<SkillUsageSection
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
                            />)}

                            {renderSectionWrap(<ApmSection
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
                            />)}

                        </div>
                        <div className="space-y-4 min-w-0">
                            {renderSectionWrap(<SquadCompositionSection
                                sortedSquadClassData={sortedSquadClassData}
                                sortedEnemyClassData={sortedEnemyClassData}
                                getProfessionIconPath={getProfessionIconPath}
                            />)}

                            {renderSectionWrap(<CommanderStatsSection
                                commanderStats={commanderStats}
                                getProfessionIconPath={getProfessionIconPath}
                            />)}

                            {renderSectionWrap(<SquadDamageComparisonSection />)}

                            {renderSectionWrap(<SquadKillPressureSection />)}

                            {renderSectionWrap(<HealEffectivenessSection
                                fights={healEffectivenessFights}
                            />)}

                            {renderSectionWrap(<SquadTagDistanceDeathsSection
                                fights={tagDistanceDeathsData}
                            />)}

                            {renderSectionWrap(<OnTagReviewSection
                                result={onTagReviewResult}
                            />)}

                            {renderSectionWrap(<SquadDistanceToTagSection
                                result={distanceToTagResult}
                                filterEnabled={distanceToTagFilterEnabled}
                                onFilterEnabledChange={setDistanceToTagFilterEnabled}
                                minFights={distanceToTagMinFights}
                                onMinFightsChange={setDistanceToTagMinFights}
                            />)}

                            {renderSectionWrap(<SquadDistanceToTagVisualSection
                                result={distanceToTagResult}
                                filterEnabled={distanceToTagFilterEnabled}
                                minFights={distanceToTagMinFights}
                            />)}

                            {renderSectionWrap(<AttendanceSection
                                attendanceRows={attendanceData}
                                getProfessionIconPath={getProfessionIconPath}
                            />)}

                            {renderSectionWrap(<SquadCompByFightSection
                                fights={squadCompByFight}
                                getProfessionIconPath={getProfessionIconPath}
                            />)}

                            {renderSectionWrap(<FightCompSection
                                fights={fightCompByFight}
                                getProfessionIconPath={getProfessionIconPath}
                            />)}

                            {renderSectionWrap(<MapDistributionSection
                                mapData={safeStats.mapData}
                            />)}

                            {renderSectionWrap(<TimelineSection
                                timelineData={safeStats.timelineData}
                                timelineFriendlyScope={timelineFriendlyScope}
                                setTimelineFriendlyScope={setTimelineFriendlyScope}
                            />)}
                        </div>
                    </div>
                ) : (
                    <>
                        {renderGroup('data-map', [
                            { id: 'data-map', element: <DataMapSection
                                // Route through the same jump path as the search palette: jumpToEntry
                                // activates the owning category via `requestCategory` (the host's
                                // onRequestCategory mechanism — the web drives its own nav off this,
                                // not the store) then polls + scrollIntoView-es the target. This is the
                                // only path that works on all three surfaces (desktop, embedded History,
                                // web); the old store-write + container.scrollTo was a no-op off-desktop.
                                onNavigate={(categoryId, sectionId) => jumpToEntry({
                                    type: 'section', categoryId, sectionId, label: '', sublabel: '', haystack: [],
                                })}
                                isSectionAllowed={isDataMapSectionAllowed}
                            /> },
                        ])}
                        {renderGroup('overview', [
                            { id: 'overview', element: <OverviewSection
                            /> },
                            { id: 'fight-breakdown', element: <FightBreakdownSection
                                fightBreakdownTab={fightBreakdownTab}
                                setFightBreakdownTab={setFightBreakdownTab}
                            /> },
                            { id: 'top-players', element: <TopPlayersSection
                                showTopStats={showTopStats}
                                showMvp={showMvp}
                                topStatsMode={topStatsMode}
                                expandedLeader={expandedLeader}
                                setExpandedLeader={setExpandedLeader}
                                formatTopStatValue={formatTopStatValue}
                                isMvpStatEnabled={isMvpStatEnabled}
                                enabledTopStats={enabledTopStats}
                                noEgoMode={noEgoMode}
                            /> },
                            // Outgoing + incoming render as one two-column section (the classic
                            // layout); the incoming column carries its own #top-skills-incoming
                            // anchor inside the combined block.
                            ...(!noEgoMode ? [{ id: 'top-skills-outgoing', element: <TopSkillsSection
                                topSkillsMetric={topSkillsMetric}
                                onTopSkillsMetricChange={updateTopSkillsMetric}
                            /> }] : []),
                            { id: 'squad-composition', element: <SquadCompositionSection
                                sortedSquadClassData={sortedSquadClassData}
                                sortedEnemyClassData={sortedEnemyClassData}
                                getProfessionIconPath={getProfessionIconPath}
                            /> },
                            { id: 'timeline', element: <TimelineSection
                                timelineData={safeStats.timelineData}
                                timelineFriendlyScope={timelineFriendlyScope}
                                setTimelineFriendlyScope={setTimelineFriendlyScope}
                            /> },
                            { id: 'map-distribution', element: <MapDistributionSection
                                mapData={safeStats.mapData}
                            /> },
                            { id: 'fight-diff-mode', element: <FightDiffModeSection
                            /> },
                        ])}

                        {renderGroup('offense', [
                            { id: 'offense-detailed', element: <OffenseSection
                                offenseSearch={offenseSearch}
                                setOffenseSearch={setOffenseSearch}
                                activeOffenseStat={activeOffenseStat}
                                setActiveOffenseStat={setActiveOffenseStat}
                                offenseViewMode={offenseViewMode}
                                setOffenseViewMode={setOffenseViewMode}
                                noEgoMode={noEgoMode}
                            /> },
                            { id: 'damage-breakdown', element: <DamageBreakdownSection
                                playerSkillBreakdowns={playerSkillBreakdowns}
                            /> },
                            { id: 'all-damage', element: <AllDamageSection
                                fights={allDamageData.fights}
                                mode={allDamageMode}
                                setMode={setAllDamageMode}
                                selectedFightIndex={allDamageSelectedFightIndex}
                                setSelectedFightIndex={setAllDamageSelectedFightIndex}
                                selectedDrilldownPlayerKey={allDamageSelectedPlayerKey}
                                setSelectedDrilldownPlayerKey={setAllDamageSelectedPlayerKey}
                            /> },
                            { id: 'spike-damage', element: <SpikeDamageSection
                                spikePlayerFilter={spikePlayerFilter}
                                setSpikePlayerFilter={setSpikePlayerFilter}
                                groupedSpikePlayers={groupedSpikePlayers}
                                spikeMode={spikeMode}
                                setSpikeMode={setSpikeMode}
                                damageBasis={spikeDamageBasis}
                                setDamageBasis={setSpikeDamageBasis}
                                showDamageBasisToggle
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
                            /> },
                            { id: 'damage-modifiers', element: <DamageModifiersSection
                                search={damageModSearch}
                                setSearch={setDamageModSearch}
                                activeMod={activeDamageMod}
                                setActiveMod={setActiveDamageMod}
                                incoming={false}
                            /> },
                            { id: 'conditions-outgoing', element: <ConditionsSection
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
                            /> },
                        ])}

                        {renderGroup('defense', [
                            { id: 'defense-detailed', element: <DefenseSection
                                defenseSearch={defenseSearch}
                                setDefenseSearch={setDefenseSearch}
                                activeDefenseStat={activeDefenseStat}
                                setActiveDefenseStat={setActiveDefenseStat}
                                defenseViewMode={defenseViewMode}
                                setDefenseViewMode={setDefenseViewMode}
                                noEgoMode={noEgoMode}
                            /> },
                            { id: 'incoming-strike-damage', element: <SpikeDamageSection
                                sectionId="incoming-strike-damage"
                                title="Incoming Strike Damage"
                                subtitle="Select one enemy class to chart incoming strike pressure per fight."
                                listTitle="Enemy Classes"
                                searchPlaceholder="Search enemy class"
                                titleIcon={ShieldAlert}
                                titleIconClassName="text-cyan-300"
                                spikePlayerFilter={incomingStrikePlayerFilter}
                                setSpikePlayerFilter={setIncomingStrikePlayerFilter}
                                groupedSpikePlayers={groupedIncomingStrikePlayers}
                                spikeMode={incomingStrikeMode}
                                setSpikeMode={setIncomingStrikeMode}
                                showTotalDamageToggle
                                useTotalDamage={incomingStrikeUseTotalDamage}
                                setUseTotalDamage={setIncomingStrikeUseTotalDamage}
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
                            /> },
                            { id: 'incoming-damage-modifiers', element: <DamageModifiersSection
                                search={incomingDamageModSearch}
                                setSearch={setIncomingDamageModSearch}
                                activeMod={activeIncomingDamageMod}
                                setActiveMod={setActiveIncomingDamageMod}
                                incoming={true}
                            /> },
                            { id: 'defense-mitigation', element: <DamageMitigationSection
                                damageMitigationSearch={damageMitigationSearch}
                                setDamageMitigationSearch={setDamageMitigationSearch}
                                activeDamageMitigationStat={activeDamageMitigationStat}
                                setActiveDamageMitigationStat={setActiveDamageMitigationStat}
                                damageMitigationViewMode={damageMitigationViewMode}
                                setDamageMitigationViewMode={setDamageMitigationViewMode}
                                damageMitigationScope={damageMitigationScope}
                                setDamageMitigationScope={setDamageMitigationScope}
                            /> },
                        ])}

                        {renderGroup('boons-strips', [
                            { id: 'boon-output', element: <BoonOutputSection
                                activeBoonCategory={activeBoonCategory}
                                setActiveBoonCategory={(val: string) => setActiveBoonCategory(val as BoonCategory)}
                                activeBoonMetric={activeBoonMetric}
                                setActiveBoonMetric={setActiveBoonMetric}
                                activeBoonTab={activeBoonTab}
                                setActiveBoonTab={setActiveBoonTab}
                                activeBoonTable={activeBoonTable}
                                boonSearch={boonSearch}
                                setBoonSearch={setBoonSearch}
                                formatBoonMetricDisplay={formatBoonMetricDisplay}
                                getBoonMetricValue={getBoonMetricValue}
                            /> },
                            { id: 'boon-uptime', element: <BoonUptimeSection
                                boonSearch={boonUptimeSearch}
                                setBoonSearch={setBoonUptimeSearch}
                                boons={filteredBoonUptimeBoons}
                                activeBoonId={activeBoonUptimeId}
                                setActiveBoonId={setActiveBoonUptimeId}
                                playerFilter={boonUptimePlayerFilter}
                                setPlayerFilter={setBoonUptimePlayerFilter}
                                players={filteredBoonUptimePlayers}
                                selectedPlayerKey={selectedBoonUptimePlayerKey}
                                setSelectedPlayerKey={setSelectedBoonUptimePlayerKey}
                                selectedPlayer={selectedBoonUptimePlayer}
                                chartData={boonUptimeChartData}
                                chartMaxY={boonUptimeChartMaxY}
                                selectedFightIndex={selectedBoonUptimeFightIndex}
                                setSelectedFightIndex={setSelectedBoonUptimeFightIndex}
                                drilldownTitle={boonUptimeDrilldown.title}
                                drilldownData={boonUptimeDrilldown.data}
                                overallUptimePercent={boonUptimeOverallPercent}
                                showStackCapLine={Boolean(activeBoonUptime?.stacking)}
                                subgroupMembers={boonUptimeSubgroupMembers}
                                showIncomingHeatmap={showBoonUptimeIncomingHeatmap}
                                setShowIncomingHeatmap={setShowBoonUptimeIncomingHeatmap}
                            /> },
                            { id: 'all-boons', element: <AllBoonsSection
                                boons={boonTimelineBoons as AllBoonsBoon[]}
                                activeBoonId={allBoonsActiveBoonId}
                                setActiveBoonId={setAllBoonsActiveBoonId}
                                scope={allBoonsScope}
                                setScope={setAllBoonsScope}
                                selectedFightIndex={allBoonsSelectedFightIndex}
                                setSelectedFightIndex={setAllBoonsSelectedFightIndex}
                                selectedPlayerKey={allBoonsSelectedPlayerKey}
                                setSelectedPlayerKey={setAllBoonsSelectedPlayerKey}
                            /> },
                            { id: 'boon-timeline', element: <BoonTimelineSection
                                boonSearch={boonTimelineSearch}
                                setBoonSearch={setBoonTimelineSearch}
                                boons={filteredBoonTimelineBoons}
                                activeBoonId={activeBoonTimelineId}
                                setActiveBoonId={setActiveBoonTimelineId}
                                timelineScope={boonTimelineScope}
                                setTimelineScope={setBoonTimelineScope}
                                playerFilter={boonTimelinePlayerFilter}
                                setPlayerFilter={setBoonTimelinePlayerFilter}
                                players={filteredBoonTimelinePlayers}
                                selectedPlayerKey={selectedBoonTimelinePlayerKey}
                                setSelectedPlayerKey={setSelectedBoonTimelinePlayerKey}
                                selectedPlayer={selectedBoonTimelinePlayer}
                                chartData={boonTimelineChartData}
                                chartMaxY={boonTimelineChartMaxY}
                                selectedFightIndex={selectedBoonTimelineFightIndex}
                                setSelectedFightIndex={setSelectedBoonTimelineFightIndex}
                                drilldownTitle={boonTimelineDrilldown.title}
                                drilldownData={boonTimelineDrilldown.data}
                                showIncomingHeatmap={showBoonTimelineIncomingHeatmap}
                                setShowIncomingHeatmap={setShowBoonTimelineIncomingHeatmap}
                            /> },
                            { id: 'stab-performance', element: <StabPerformanceSection
                                playerFilter={stabPerfPlayerFilter}
                                setPlayerFilter={setStabPerfPlayerFilter}
                                players={stabPerfFilteredPlayers}
                                selectedPlayerKey={selectedStabPerfPlayerKey}
                                setSelectedPlayerKey={setSelectedStabPerfPlayerKey}
                                selectedPlayer={selectedStabPerfPlayer}
                                chartData={stabPerfChartData}
                                chartMaxY={stabPerfChartMaxY}
                                selectedFightIndex={selectedStabPerfFightIndex}
                                setSelectedFightIndex={setSelectedStabPerfFightIndex}
                                drilldownTitle={stabPerfDrilldown.title}
                                drilldownData={stabPerfDrilldown.data}
                                partyMembers={stabPerfDrilldown.partyMembers}
                                showIncomingHeatmap={showStabPerfHeatmap}
                                setShowIncomingHeatmap={setShowStabPerfHeatmap}
                                showPartyDeaths={showStabPerfDeaths}
                                setShowPartyDeaths={setShowStabPerfDeaths}
                                showPartyDistance={showStabPerfDistance}
                                setShowPartyDistance={setShowStabPerfDistance}
                            /> },
                            { id: 'boon-strip-comparison', element: <BoonStripComparisonSection /> },
                            { id: 'strip-spikes', element: <FightMetricSection
                                sectionId="strip-spikes"
                                title="Strip Spikes"
                                titleIcon={Eraser}
                                titleIconClassName="text-amber-300"
                                modes={[
                                    { id: 'strips', label: 'Strips' },
                                    { id: 'stripDownContrib', label: 'Down Contrib' },
                                ]}
                                activeMode={stripMode}
                                setActiveMode={setStripMode}
                                playerFilter={stripPlayerFilter}
                                setPlayerFilter={setStripPlayerFilter}
                                groupedPlayers={groupedStripPlayers}
                                selectedPlayerKey={selectedStripPlayerKey}
                                setSelectedPlayerKey={setSelectedStripPlayerKey}
                                selectedPlayer={selectedStripPlayer}
                                chartData={stripChartData}
                                chartMaxY={stripChartMaxY}
                                formatValue={(v: number) => formatWithCommas(v, 0)}
                                valueSuffix={stripMode === 'strips' ? 'strips' : ''}
                            /> },
                        ])}

                        {renderGroup('support-healing', [
                            { id: 'support-detailed', element: <SupportSection
                                supportSearch={supportSearch}
                                setSupportSearch={setSupportSearch}
                                activeSupportStat={activeSupportStat}
                                setActiveSupportStat={setActiveSupportStat}
                                supportViewMode={supportViewMode}
                                setSupportViewMode={setSupportViewMode}
                                cleanseScope={cleanseScope}
                                setCleanseScope={setCleanseScope}
                                noEgoMode={noEgoMode}
                            /> },
                            { id: 'healing-stats', element: <HealingSection
                                activeHealingMetric={activeHealingMetric}
                                setActiveHealingMetric={setActiveHealingMetric}
                                healingCategory={healingCategory}
                                setHealingCategory={setHealingCategory}
                                activeResUtilitySkill={activeResUtilitySkill}
                                setActiveResUtilitySkill={setActiveResUtilitySkill}
                                skillUsageData={skillUsageData}
                            /> },
                            { id: 'healing-breakdown', element: <HealingBreakdownSection
                                healingBreakdownPlayers={safeStats.healingBreakdownPlayers}
                            /> },
                            { id: 'heal-effectiveness', element: <HealEffectivenessSection
                                fights={healEffectivenessFights}
                            /> },
                        ])}

                        {renderGroup('squad-cohesion', [
                            { id: 'on-tag-review', element: <OnTagReviewSection
                                result={onTagReviewResult}
                            /> },
                            { id: 'squad-distance-to-tag', element: <SquadDistanceToTagSection
                                result={distanceToTagResult}
                                filterEnabled={distanceToTagFilterEnabled}
                                onFilterEnabledChange={setDistanceToTagFilterEnabled}
                                minFights={distanceToTagMinFights}
                                onMinFightsChange={setDistanceToTagMinFights}
                            /> },
                            { id: 'squad-distance-to-tag-visual', element: <SquadDistanceToTagVisualSection
                                result={distanceToTagResult}
                                filterEnabled={distanceToTagFilterEnabled}
                                minFights={distanceToTagMinFights}
                            /> },
                            { id: 'squad-tag-distance-deaths', element: <SquadTagDistanceDeathsSection
                                fights={tagDistanceDeathsData}
                            /> },
                            { id: 'squad-kill-pressure', element: <SquadKillPressureSection /> },
                            { id: 'squad-damage-comparison', element: <SquadDamageComparisonSection /> },
                        ])}

                        {renderGroup('commander', [
                            { id: 'commander-stats', element: <CommanderStatsSection
                                commanderStats={commanderStats}
                                getProfessionIconPath={getProfessionIconPath}
                            /> },
                            { id: 'commander-push-timing', element: <CommanderPushTimingSection
                                commanderStats={commanderStats}
                            /> },
                            { id: 'commander-target-conversion', element: <CommanderTargetConversionSection
                                commanderStats={commanderStats}
                            /> },
                            { id: 'commander-tag-movement', element: <CommanderTagMovementSection
                                commanderStats={commanderStats}
                            /> },
                            { id: 'commander-tag-death-response', element: <CommanderTagDeathResponseSection
                                commanderStats={commanderStats}
                            /> },
                        ])}

                        {renderGroup('players', [
                            { id: 'player-breakdown', element: <PlayerBreakdownSection
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
                            /> },
                            ...(!noEgoMode ? [{ id: 'player-comparison', element: <PlayerComparisonSection
                                comparisonMode={comparisonMode}
                                setComparisonMode={setComparisonMode}
                                comparisonCategory={comparisonCategory}
                                setComparisonCategory={setComparisonCategory}
                                playerAKey={comparisonPlayerAKey}
                                setPlayerAKey={setComparisonPlayerAKey}
                                playerBKey={comparisonPlayerBKey}
                                setPlayerBKey={setComparisonPlayerBKey}
                            /> }] : []),
                            { id: 'apm-stats', element: <ApmSection
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
                            /> },
                            { id: 'skill-usage', element: <SkillUsageSection
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
                            /> },
                            { id: 'sigil-relic-uptime', element: <SigilRelicUptimeSection
                                hasSigilRelicTables={sigilRelicTables.length > 0}
                                sigilRelicSearch={sigilRelicSearch}
                                setSigilRelicSearch={setSigilRelicSearch}
                                filteredSigilRelicTables={filteredSigilRelicTables}
                                activeSigilRelicTab={activeSigilRelicTab}
                                setActiveSigilRelicTab={setActiveSigilRelicTab}
                                activeSigilRelicTable={activeSigilRelicTable}
                            /> },
                            { id: 'special-buffs', element: <SpecialBuffsSection
                                specialSearch={specialSearch}
                                setSpecialSearch={setSpecialSearch}
                                activeSpecialTab={activeSpecialTab}
                                setActiveSpecialTab={setActiveSpecialTab}
                                activeSpecialTable={activeSpecialTable}
                            /> },
                        ])}

                        {renderGroup('roster', [
                            { id: 'attendance-ledger', element: <AttendanceSection
                                attendanceRows={attendanceData}
                                getProfessionIconPath={getProfessionIconPath}
                            /> },
                            { id: 'squad-comp-fight', element: <SquadCompByFightSection
                                fights={squadCompByFight}
                                getProfessionIconPath={getProfessionIconPath}
                            /> },
                            { id: 'fight-comp', element: <FightCompSection
                                fights={fightCompByFight}
                                getProfessionIconPath={getProfessionIconPath}
                            /> },
                        ])}

                        {renderGroup('replay', [
                            { id: 'replay', element: <div style={{ height: '88vh', minHeight: 500, maxHeight: 1000, display: 'flex', width: '100%' }}>{replayUnsliceable ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>{replaySliceNotice}</div> : r2ReplayStatus === 'loading' ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', fontSize: '0.875rem', color: '#9ca3af' }}>Loading replay data...</div> : r2ReplayStatus === 'error' ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', fontSize: '0.875rem', color: '#fb7185' }}>Failed to load replay data.</div> : <ReplaySection fights={getReplayFights()} />}</div> },
                        ])}
                    </>
                )}
                </StatsSharedContext.Provider>
                {!embedded && <div className="h-24" aria-hidden="true" />}
            </div>
            </div>)}
        </div>
    );
});
