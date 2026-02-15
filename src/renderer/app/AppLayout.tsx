import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, FilePlus2, LayoutGrid, Minus, RefreshCw, Settings, Square, Trophy, X } from 'lucide-react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { SettingsView } from '../SettingsView';
import { StatsView } from '../StatsView';
import { Terminal } from '../Terminal';
import { UpdateErrorModal } from '../UpdateErrorModal';
import { WalkthroughModal } from '../WalkthroughModal';
import { WebhookModal } from '../WebhookModal';
import { WhatsNewModal } from '../WhatsNewModal';
import { DevDatasetsModal } from './DevDatasetsModal';
import { FilePickerModal } from './FilePickerModal';
import { ScreenshotContainer } from './ScreenshotContainer';
import { WebUploadOverlay } from './WebUploadOverlay';
import { STATS_TOC_GROUPS } from '../stats/hooks/useStatsNavigation';

export function AppLayout({ ctx }: { ctx: any }) {
    const {
        shellClassName,
        isDev,
        arcbridgeLogoStyle,
        updateAvailable,
        updateDownloaded,
        updateProgress,
        updateStatus,
        autoUpdateSupported,
        autoUpdateDisabledReason,
        view,
        settingsUpdateCheckRef,
        versionClickTimesRef,
        versionClickTimeoutRef,
        setDeveloperSettingsTrigger,
        appVersion,
        setView,
        showTerminal,
        setShowTerminal,
        devDatasetsEnabled,
        setDevDatasetsOpen,
        webUploadState,
        isModernTheme,
        setWebUploadState,
        statsViewMounted,
        logsForStats,
        mvpWeights,
        disruptionMethod,
        statsViewSettings,
        precomputedStats,
        computedStats,
        computedSkillUsageData,
        setStatsViewSettings,
        uiTheme,
        handleWebUpload,
        selectedWebhookId,
        setEmbedStatSettings,
        setMvpWeights,
        setDisruptionMethod,
        setUiTheme,
        developerSettingsTrigger,
        helpUpdatesFocusTrigger,
        handleHelpUpdatesFocusConsumed,
        setWalkthroughOpen,
        setWhatsNewOpen,
        statsTilesPanel,
        activityPanel,
        configurationPanel,
        screenshotData,
        embedStatSettings,
        showClassIcons,
        enabledTopListCount,
        devDatasetsCtx,
        filePickerCtx,
        webhookDropdownOpen,
        webhookDropdownStyle,
        webhookDropdownPortalRef,
        webhooks,
        handleUpdateSettings,
        setSelectedWebhookId,
        setWebhookDropdownOpen,
        webhookModalOpen,
        setWebhookModalOpen,
        setWebhooks,
        showUpdateErrorModal,
        setShowUpdateErrorModal,
        updateError,
        whatsNewOpen,
        handleWhatsNewClose,
        whatsNewVersion,
        whatsNewNotes,
        walkthroughOpen,
        handleWalkthroughClose,
        handleWalkthroughLearnMore
    } = ctx;

    const [activeNavView, setActiveNavView] = useState(view);
    const navSwitchRafRef = useRef<number | null>(null);
    const [statsActiveNavId, setStatsActiveNavId] = useState('overview');
    const [statsActiveGroup, setStatsActiveGroup] = useState('overview');
    const [statsOpenGroup, setStatsOpenGroup] = useState('overview');
    const [isStatsNavExpanded, setIsStatsNavExpanded] = useState(false);
    const [isStatsNavSubnavReady, setIsStatsNavSubnavReady] = useState(false);
    const [isStatsNavClosing, setIsStatsNavClosing] = useState(false);
    const [isStatsNavContentClosing, setIsStatsNavContentClosing] = useState(false);
    const [statsClosingGroupId, setStatsClosingGroupId] = useState<string | null>(null);
    const [statsClosingContentGroupId, setStatsClosingContentGroupId] = useState<string | null>(null);
    const statsNavExpandDelayRef = useRef<number | null>(null);
    const statsNavCollapseDelayRef = useRef<number | null>(null);
    const statsGroupCloseDelayRef = useRef<number | null>(null);
    const statsNavContentCloseDelayRef = useRef<number | null>(null);
    const statsGroupContentCloseDelayRef = useRef<number | null>(null);
    const STATS_NAV_EXPAND_DELAY_MS = 180;
    const STATS_NAV_CLOSE_HOLD_MS = 1250;
    const STATS_NAV_CONTENT_HOLD_MS = 1450;
    const STATS_GROUP_SWITCH_CLOSE_MS = 320;
    const STATS_GROUP_SWITCH_CONTENT_HOLD_MS = 520;

    useEffect(() => {
        setActiveNavView(view);
    }, [view]);

    useEffect(() => {
        return () => {
            if (navSwitchRafRef.current !== null) {
                window.cancelAnimationFrame(navSwitchRafRef.current);
                navSwitchRafRef.current = null;
            }
            if (statsNavExpandDelayRef.current !== null) {
                window.clearTimeout(statsNavExpandDelayRef.current);
                statsNavExpandDelayRef.current = null;
            }
            if (statsNavCollapseDelayRef.current !== null) {
                window.clearTimeout(statsNavCollapseDelayRef.current);
                statsNavCollapseDelayRef.current = null;
            }
            if (statsGroupCloseDelayRef.current !== null) {
                window.clearTimeout(statsGroupCloseDelayRef.current);
                statsGroupCloseDelayRef.current = null;
            }
            if (statsNavContentCloseDelayRef.current !== null) {
                window.clearTimeout(statsNavContentCloseDelayRef.current);
                statsNavContentCloseDelayRef.current = null;
            }
            if (statsGroupContentCloseDelayRef.current !== null) {
                window.clearTimeout(statsGroupContentCloseDelayRef.current);
                statsGroupContentCloseDelayRef.current = null;
            }
        };
    }, []);

    const handleStatsNavMouseEnter = useCallback(() => {
        if (statsNavCollapseDelayRef.current !== null) {
            window.clearTimeout(statsNavCollapseDelayRef.current);
            statsNavCollapseDelayRef.current = null;
        }
        if (statsGroupCloseDelayRef.current !== null) {
            window.clearTimeout(statsGroupCloseDelayRef.current);
            statsGroupCloseDelayRef.current = null;
        }
        if (statsNavContentCloseDelayRef.current !== null) {
            window.clearTimeout(statsNavContentCloseDelayRef.current);
            statsNavContentCloseDelayRef.current = null;
        }
        if (statsGroupContentCloseDelayRef.current !== null) {
            window.clearTimeout(statsGroupContentCloseDelayRef.current);
            statsGroupContentCloseDelayRef.current = null;
        }
        setStatsClosingGroupId(null);
        setStatsClosingContentGroupId(null);
        setIsStatsNavClosing(false);
        setIsStatsNavContentClosing(false);
        setIsStatsNavExpanded(true);
        setIsStatsNavSubnavReady(false);
        if (statsNavExpandDelayRef.current !== null) {
            window.clearTimeout(statsNavExpandDelayRef.current);
            statsNavExpandDelayRef.current = null;
        }
        statsNavExpandDelayRef.current = window.setTimeout(() => {
            setIsStatsNavSubnavReady(true);
            statsNavExpandDelayRef.current = null;
        }, STATS_NAV_EXPAND_DELAY_MS);
    }, []);

    const handleStatsNavMouseLeave = useCallback(() => {
        if (statsNavExpandDelayRef.current !== null) {
            window.clearTimeout(statsNavExpandDelayRef.current);
            statsNavExpandDelayRef.current = null;
        }
        if (!isStatsNavSubnavReady) {
            setIsStatsNavClosing(false);
            setIsStatsNavContentClosing(false);
            setIsStatsNavExpanded(false);
            setIsStatsNavSubnavReady(false);
            return;
        }
        setIsStatsNavSubnavReady(false);
        setIsStatsNavClosing(true);
        setIsStatsNavContentClosing(true);
        if (statsNavCollapseDelayRef.current !== null) {
            window.clearTimeout(statsNavCollapseDelayRef.current);
            statsNavCollapseDelayRef.current = null;
        }
        statsNavCollapseDelayRef.current = window.setTimeout(() => {
            setIsStatsNavClosing(false);
            setIsStatsNavExpanded(false);
            statsNavCollapseDelayRef.current = null;
        }, STATS_NAV_CLOSE_HOLD_MS);
        if (statsNavContentCloseDelayRef.current !== null) {
            window.clearTimeout(statsNavContentCloseDelayRef.current);
            statsNavContentCloseDelayRef.current = null;
        }
        statsNavContentCloseDelayRef.current = window.setTimeout(() => {
            setIsStatsNavContentClosing(false);
            statsNavContentCloseDelayRef.current = null;
        }, STATS_NAV_CONTENT_HOLD_MS);
    }, [isStatsNavSubnavReady]);

    const handleNavViewChange = (nextView: 'dashboard' | 'stats' | 'settings') => {
        setActiveNavView(nextView);
        if (view === nextView) return;
        if (navSwitchRafRef.current !== null) {
            window.cancelAnimationFrame(navSwitchRafRef.current);
            navSwitchRafRef.current = null;
        }
        navSwitchRafRef.current = window.requestAnimationFrame(() => {
            navSwitchRafRef.current = null;
            setView(nextView);
        });
    };

    const activeStatsGroupDef = useMemo(
        () => STATS_TOC_GROUPS.find((group) => group.id === statsActiveGroup) || STATS_TOC_GROUPS[0],
        [statsActiveGroup]
    );
    const statsSidebarSurfaceClass = uiTheme === 'matte'
        ? 'border border-[color:var(--border-default)] bg-[color:var(--bg-card)]'
        : uiTheme === 'crt'
            ? 'border border-[#3a6b52]/60 bg-[#09140e]/90'
            : 'border border-white/10 bg-slate-950/85';
    const statsSidebarShadowClass = uiTheme === 'matte'
        ? 'shadow-[-6px_-6px_12px_rgba(255,255,255,0.04),6px_6px_14px_rgba(0,0,0,0.45)]'
        : 'shadow-[0_20px_60px_rgba(0,0,0,0.45)]';
    const statsSidebarBlurClass = uiTheme === 'matte' ? '' : 'backdrop-blur-md';
    const statsSubnavItemsClass = uiTheme === 'matte'
        ? 'rounded-lg border border-[color:var(--border-default)] bg-[color:var(--bg-input)] shadow-[inset_-4px_-4px_10px_rgba(255,255,255,0.03),inset_5px_5px_12px_rgba(0,0,0,0.4)]'
        : '';
    const statsSectionVisibility = useCallback((id: string) => {
        const sectionIds = Array.isArray((activeStatsGroupDef as any)?.sectionIds)
            ? (activeStatsGroupDef as any).sectionIds
            : ((activeStatsGroupDef as any)?.items || []).map((item: any) => item.id);
        return sectionIds.includes(id);
    }, [activeStatsGroupDef]);
    const scrollToStatsSection = useCallback((id: string) => {
        const targetId = id === 'kdr' ? 'overview' : id;
        let attempts = 0;
        const run = () => {
            const container = document.getElementById('stats-dashboard-container');
            const node = document.getElementById(targetId);
            if (!(container instanceof HTMLElement) || !(node instanceof HTMLElement)) {
                if (attempts < 8) {
                    attempts += 1;
                    requestAnimationFrame(run);
                }
                return;
            }
            const containerRect = container.getBoundingClientRect();
            const nodeRect = node.getBoundingClientRect();
            const rawTop = nodeRect.top - containerRect.top + container.scrollTop;
            const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
            const nextTop = Math.min(Math.max(rawTop - 16, 0), maxTop);
            container.scrollTo({ top: nextTop, behavior: 'smooth' });
        };
        run();
    }, []);
    const handleStatsNavItemClick = useCallback((groupId: string, itemId: string) => {
        if (groupId !== statsOpenGroup) {
            if (statsGroupCloseDelayRef.current !== null) {
                window.clearTimeout(statsGroupCloseDelayRef.current);
                statsGroupCloseDelayRef.current = null;
            }
            if (statsGroupContentCloseDelayRef.current !== null) {
                window.clearTimeout(statsGroupContentCloseDelayRef.current);
                statsGroupContentCloseDelayRef.current = null;
            }
            setStatsClosingGroupId(statsOpenGroup);
            setStatsClosingContentGroupId(statsOpenGroup);
            statsGroupCloseDelayRef.current = window.setTimeout(() => {
                setStatsClosingGroupId(null);
                statsGroupCloseDelayRef.current = null;
            }, STATS_GROUP_SWITCH_CLOSE_MS);
            statsGroupContentCloseDelayRef.current = window.setTimeout(() => {
                setStatsClosingContentGroupId(null);
                statsGroupContentCloseDelayRef.current = null;
            }, STATS_GROUP_SWITCH_CONTENT_HOLD_MS);
        }
        setStatsOpenGroup(groupId);
        setStatsActiveGroup(groupId);
        setStatsActiveNavId(itemId);
        requestAnimationFrame(() => scrollToStatsSection(itemId));
    }, [scrollToStatsSection, statsOpenGroup]);

    return (
        <div className={shellClassName}>
            {/* Custom Title Bar */}
            <div className="app-titlebar h-10 shrink-0 w-full flex justify-between items-center px-4 bg-black/20 backdrop-blur-md border-b border-white/5 drag-region select-none z-50">
                <div className="flex items-center gap-2">
                    <span className="arcbridge-logo h-4 w-4" style={arcbridgeLogoStyle} aria-label="ArcBridge logo" />
                    <span className="text-xs font-medium text-gray-400">ArcBridge</span>
                    {isDev ? (
                        <span className="ml-1 rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.3em] text-amber-300">
                            Dev Build
                        </span>
                    ) : null}
                </div>
                <div className="flex items-center gap-4 no-drag">
                    <button onClick={() => window.electronAPI.windowControl('minimize')} className="text-gray-400 hover:text-white transition-colors">
                        <Minus className="w-4 h-4" />
                    </button>
                    <button onClick={() => window.electronAPI.windowControl('maximize')} className="text-gray-400 hover:text-white transition-colors">
                        <Square className="w-3 h-3" />
                    </button>
                    <button onClick={() => window.electronAPI.windowControl('close')} className="text-gray-400 hover:text-red-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Background Orbs */}
            <div className="legacy-orb absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[100px] pointer-events-none" />
            <div className="legacy-orb absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[100px] pointer-events-none" />

            <div className={`app-content relative z-10 ${(isModernTheme || view === 'stats') ? 'max-w-none' : 'max-w-5xl mx-auto'} flex-1 w-full min-w-0 flex flex-col min-h-0 ${view === 'stats' ? 'pt-8 px-8 pb-2 overflow-hidden' : (isModernTheme ? 'p-8 overflow-visible' : 'p-8 overflow-hidden')}`}>
                <header className="app-header flex flex-wrap justify-between items-center gap-3 mb-10 shrink-0">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 min-w-0"
                    >
                        <div className="flex items-center gap-3">
                            <span className="arcbridge-logo h-8 w-8 rounded-md" style={arcbridgeLogoStyle} aria-label="ArcBridge logo" />
                            <h1 className="text-3xl font-bold arcbridge-gradient-text">
                                ArcBridge
                            </h1>
                        </div>
                    </motion.div>
                    <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
                        <AnimatePresence mode="wait">
                            {(updateAvailable || updateDownloaded) ? (
                                <motion.div
                                    key="updating"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="flex items-center gap-2"
                                >
                                    {updateDownloaded ? (
                                        <button
                                            onClick={() => window.electronAPI.restartApp()}
                                            className="flex items-center gap-2 text-xs font-medium px-3 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30 hover:bg-green-500/30 transition-colors"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            <span>Restart to Update</span>
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2 text-xs font-medium px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full border border-blue-500/30">
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            <span>{updateProgress ? `${Math.round(updateProgress.percent)}%` : 'Updating...'}</span>
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                updateStatus && (
                                    <motion.div
                                        key="status"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        className={`flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border ${updateStatus.includes('Error')
                                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                            : 'bg-white/5 text-gray-400 border-white/10'
                                            }`}
                                    >
                                        <RefreshCw className={`w-3 h-3 ${updateStatus.includes('Checking') ? 'animate-spin' : ''}`} />
                                        <span>{updateStatus}</span>
                                    </motion.div>
                                )
                            )}
                        </AnimatePresence>
                        {!autoUpdateSupported && (
                            <div
                                className="flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border bg-amber-500/15 text-amber-200 border-amber-500/30"
                                title={autoUpdateDisabledReason === 'portable'
                                    ? 'Portable build detected'
                                    : autoUpdateDisabledReason === 'missing-config'
                                        ? 'Update config missing for this build'
                                        : 'Auto-updates disabled in development'}
                            >
                                Auto-updates disabled
                            </div>
                        )}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-xs font-medium px-3 py-1 bg-white/5 rounded-full border border-white/10 cursor-pointer hover:bg-white/10 transition-colors select-none"
                            onClick={() => {
                                if (view === 'settings') {
                                    if (!settingsUpdateCheckRef.current) {
                                        window.electronAPI.checkForUpdates();
                                        settingsUpdateCheckRef.current = true;
                                    }
                                } else {
                                    window.electronAPI.checkForUpdates();
                                }
                                if (view !== 'settings') return;
                                const now = Date.now();
                                versionClickTimesRef.current = versionClickTimesRef.current.filter((t: number) => now - t < 5000);
                                versionClickTimesRef.current.push(now);
                                if (versionClickTimeoutRef.current) {
                                    clearTimeout(versionClickTimeoutRef.current);
                                }
                                versionClickTimeoutRef.current = setTimeout(() => {
                                    versionClickTimesRef.current = [];
                                }, 5200);
                                if (versionClickTimesRef.current.length >= 5) {
                                    setDeveloperSettingsTrigger((prev: number) => prev + 1);
                                    versionClickTimesRef.current = [];
                                }
                            }}
                            title="Check for updates"
                        >
                            v{appVersion}
                        </motion.div>
                        <button
                            onClick={() => handleNavViewChange('dashboard')}
                            className={`p-2 rounded-xl transition-all ${activeNavView === 'dashboard' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="Dashboard"
                        >
                            <LayoutGrid className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => handleNavViewChange('stats')}
                            className={`p-2 rounded-xl transition-all ${activeNavView === 'stats' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="View Stats"
                        >
                            <Trophy className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => handleNavViewChange('settings')}
                            className={`p-2 rounded-xl transition-all ${activeNavView === 'settings' ? 'bg-purple-500/20 text-purple-500 border border-purple-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setShowTerminal(!showTerminal)}
                            className={`p-2 rounded-xl transition-all ${showTerminal ? 'bg-gray-700/50 text-white border-gray-600' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="Toggle Terminal"
                        >
                            <TerminalIcon className="w-5 h-5" />
                        </button>
                        {devDatasetsEnabled && (
                            <button
                                type="button"
                                onClick={() => setDevDatasetsOpen(true)}
                                className="p-2 rounded-xl transition-all bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30"
                                title="Dev Datasets"
                            >
                                <FilePlus2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </header>

                <WebUploadOverlay
                    webUploadState={webUploadState}
                    isDev={isDev}
                    isModernTheme={isModernTheme}
                    setWebUploadState={setWebUploadState}
                />

                {view === 'stats' && statsViewMounted && (
                    <div className="flex flex-1 min-h-0">
                        <div className="flex-1 min-h-0 flex gap-3">
                            <aside
                                className="relative w-[248px] -mr-[176px] shrink-0 self-stretch min-h-0 overflow-visible"
                            >
                                <div
                                    className={`group/statsnavpanel absolute inset-y-0 left-0 z-40 min-h-0 w-[72px] hover:w-[248px] rounded-xl ${statsSidebarSurfaceClass} ${statsSidebarBlurClass} ${statsSidebarShadowClass} overflow-hidden will-change-[width] transition-[width] duration-[1250ms] ease-[cubic-bezier(0.16,1,0.3,1)]`}
                                    onMouseEnter={handleStatsNavMouseEnter}
                                    onMouseLeave={handleStatsNavMouseLeave}
                                >
                                    <div className="h-full min-h-0 overflow-y-auto py-3 px-2 space-y-1.5">
                                        <div className="px-2 h-5 text-[10px] uppercase tracking-[0.28em] text-gray-400 opacity-0 transition-opacity duration-300 group-hover/statsnavpanel:opacity-100">
                                            Jump to
                                        </div>
                                        {STATS_TOC_GROUPS.map((group) => {
                                            const GroupIcon = group.icon as any;
                                            const isActiveGroup = group.id === activeStatsGroupDef?.id;
                                            const isCurrentGroup = statsOpenGroup === group.id;
                                            const isOpenGroup = isStatsNavSubnavReady && isCurrentGroup;
                                            const isNavClosingGroup = isStatsNavClosing && isCurrentGroup;
                                            const isSwitchClosingGroup = statsClosingGroupId === group.id;
                                            const isNavContentClosingGroup = isStatsNavContentClosing && isCurrentGroup;
                                            const isSwitchContentClosingGroup = statsClosingContentGroupId === group.id;
                                            const isClosingPhase = isNavClosingGroup && !isOpenGroup;
                                            const showCompactChildren = isCurrentGroup && (!isStatsNavExpanded || !isStatsNavSubnavReady);
                                            const isExpanded = isOpenGroup || isNavClosingGroup || isSwitchClosingGroup || showCompactChildren;
                                            const showClosingContent = isOpenGroup || isNavContentClosingGroup || isSwitchContentClosingGroup || showCompactChildren;
                                            const isSwitchClosingPhase = isSwitchClosingGroup && !isOpenGroup;
                                            const disableChildFade = isClosingPhase || isSwitchClosingPhase;
                                            return (
                                                <div key={group.id} className="rounded-lg border border-white/10 bg-white/[0.04]">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (isOpenGroup) return;
                                                            handleStatsNavItemClick(group.id, group.items[0]?.id || 'overview');
                                                        }}
                                                        className={`w-full h-9 flex items-center justify-start gap-0 pl-[21px] pr-[21px] text-left transition-[padding,gap,background-color,color] duration-[980ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/statsnavpanel:gap-2 group-hover/statsnavpanel:pl-3 group-hover/statsnavpanel:pr-3 ${isActiveGroup ? 'bg-white/10 text-white' : 'text-gray-200 hover:bg-white/[0.08]'}`}
                                                    >
                                                        <GroupIcon className={`w-3.5 h-3.5 text-[color:var(--accent)] shrink-0 transition-transform duration-[1050ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isStatsNavExpanded ? 'scale-110' : 'scale-100'}`} />
                                                        <span className={`text-[11px] leading-none font-semibold uppercase tracking-[0.18em] whitespace-nowrap overflow-hidden transition-[opacity,transform,max-width] duration-[1050ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isStatsNavExpanded ? 'opacity-100 translate-x-0 max-w-[160px]' : 'opacity-0 -translate-x-2 max-w-0'}`}>{group.label}</span>
                                                        <span className={`inline-flex ml-auto overflow-hidden transition-[opacity,transform,max-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isStatsNavExpanded ? 'opacity-100 scale-100 max-w-[24px]' : 'opacity-0 scale-75 max-w-0'} ${isOpenGroup || isNavClosingGroup || isSwitchClosingGroup ? 'rotate-0' : '-rotate-90'}`}>
                                                            <ChevronDown className="w-4 h-4 text-gray-300" />
                                                        </span>
                                                    </button>
                                                    <div className={`${isExpanded ? 'max-h-[560px]' : 'max-h-0'} overflow-hidden transition-[max-height] ${isSwitchClosingPhase ? 'duration-[320ms]' : 'duration-[1180ms]'} ease-[cubic-bezier(0.16,1,0.3,1)]`}>
                                                        <div className={`origin-top pt-1.5 pb-1.5 px-2 space-y-0.5 will-change-[opacity,transform] ${disableChildFade ? '' : (isSwitchClosingPhase ? 'transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]' : 'transition-[opacity,transform] duration-[1020ms] ease-[cubic-bezier(0.16,1,0.3,1)]')} ${statsSubnavItemsClass} ${showClosingContent ? 'opacity-100 translate-y-0 scale-y-100' : (isSwitchClosingPhase ? 'opacity-0 -translate-y-1 scale-y-95' : 'opacity-0 -translate-y-2 scale-y-95')}`}>
                                                            {group.items.map((item, index) => {
                                                                const ItemIcon = item.icon;
                                                                const isActiveItem = statsActiveNavId === item.id;
                                                                const enterDelay = 420 + Math.min(index * 34, 204);
                                                                return (
                                                                    <div
                                                                        key={item.id}
                                                                        style={{ transitionDelay: isOpenGroup ? `${enterDelay}ms` : '0ms' }}
                                                                        className={`${disableChildFade ? '' : (isSwitchClosingPhase ? 'transition-[opacity,transform] duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]' : 'transition-[opacity,transform] duration-[560ms] ease-[cubic-bezier(0.16,1,0.3,1)]')} ${showClosingContent ? 'opacity-100 translate-x-0' : (isSwitchClosingPhase ? 'opacity-0 -translate-x-1' : 'opacity-0 -translate-x-2')}`}
                                                                    >
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleStatsNavItemClick(group.id, item.id)}
                                                                            className={`stats-nav-entry w-full h-[34px] flex items-center text-left rounded-md transition-colors duration-150 ${isStatsNavExpanded ? 'justify-start gap-2 px-2' : 'justify-center gap-0 px-2'} ${isActiveItem ? 'bg-white/10 text-white' : 'text-gray-200 hover:bg-white/[0.08]'}`}
                                                                        >
                                                                            <ItemIcon className="w-3.5 h-3.5 text-[color:var(--accent)] shrink-0" />
                                                                            <span className={`text-xs leading-tight truncate overflow-hidden transition-[opacity,max-width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isStatsNavExpanded ? 'opacity-100 max-w-[140px] translate-x-0' : 'opacity-0 max-w-0 -translate-x-1'}`}>{item.label}</span>
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </aside>
                            <StatsView
                                logs={logsForStats}
                                onBack={() => setView('dashboard')}
                                mvpWeights={mvpWeights}
                                disruptionMethod={disruptionMethod}
                                statsViewSettings={statsViewSettings}
                                precomputedStats={precomputedStats || undefined}
                                aggregationResult={{ stats: computedStats, skillUsageData: computedSkillUsageData }}
                                onStatsViewSettingsChange={(next) => {
                                    setStatsViewSettings(next);
                                    window.electronAPI?.saveSettings?.({ statsViewSettings: next });
                                }}
                                uiTheme={uiTheme}
                                webUploadState={webUploadState}
                                onWebUpload={handleWebUpload}
                                canShareDiscord={!!selectedWebhookId}
                                sectionVisibility={statsSectionVisibility}
                            />
                        </div>
                    </div>
                )}
                {view === 'stats' && !statsViewMounted && (
                    <div className="flex-1 min-h-0 flex items-center justify-center">
                        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/35 backdrop-blur-md px-6 py-8 text-center shadow-2xl">
                            <div className="mx-auto mb-3 h-12 w-12 rounded-full border border-cyan-400/35 bg-cyan-500/10 flex items-center justify-center">
                                <RefreshCw className="h-5 w-5 text-cyan-300 animate-spin" />
                            </div>
                            <div className="text-sm font-semibold tracking-wide text-cyan-100">Loading Stats Dashboard</div>
                            <div className="mt-1 text-xs text-cyan-200/75">Preparing sections and rendering data...</div>
                        </div>
                    </div>
                )}
                {view === 'settings' ? (
                    <SettingsView
                        onBack={() => setView('dashboard')}
                        onEmbedStatSettingsSaved={setEmbedStatSettings}
                        onMvpWeightsSaved={setMvpWeights}
                        onStatsViewSettingsSaved={setStatsViewSettings}
                        onDisruptionMethodSaved={setDisruptionMethod}
                        onUiThemeSaved={setUiTheme}
                        developerSettingsTrigger={developerSettingsTrigger}
                        helpUpdatesFocusTrigger={helpUpdatesFocusTrigger}
                        onHelpUpdatesFocusConsumed={handleHelpUpdatesFocusConsumed}
                        onOpenWalkthrough={() => setWalkthroughOpen(true)}
                        onOpenWhatsNew={() => setWhatsNewOpen(true)}
                    />
                ) : view === 'stats' ? null : (
                    isModernTheme ? (
                        <div className="dashboard-view dashboard-modern flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1 matte-dashboard-shell">
                            <div className="matte-panel-shell">
                                {statsTilesPanel}
                            </div>
                            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 flex-1 min-h-0 content-start">
                                <div className="order-2 xl:order-1 min-h-0 matte-activity-shell">
                                    {activityPanel}
                                </div>
                                <div className="dashboard-rail order-1 xl:order-2 flex flex-col gap-4 overflow-y-auto pr-0 matte-panel-shell matte-rail-shell">
                                    {configurationPanel}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="dashboard-view grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0 overflow-y-auto pr-1 matte-dashboard-shell">
                            <div className="space-y-6 overflow-y-auto pr-2 matte-panel-shell matte-rail-shell">
                                {configurationPanel}
                                {statsTilesPanel}
                            </div>
                            <div className="lg:col-span-2 flex flex-col min-h-0 matte-activity-shell">
                                {activityPanel}
                            </div>
                        </div>
                    )
                )}
            </div>

            <ScreenshotContainer
                screenshotData={screenshotData}
                embedStatSettings={embedStatSettings}
                disruptionMethod={disruptionMethod}
                showClassIcons={showClassIcons}
                enabledTopListCount={enabledTopListCount}
            />

            <DevDatasetsModal ctx={devDatasetsCtx} />

            <FilePickerModal ctx={filePickerCtx} />

            {webhookDropdownOpen && webhookDropdownStyle && createPortal(
                <div
                    ref={webhookDropdownPortalRef}
                    className={`rounded-xl overflow-hidden ${uiTheme === 'matte'
                        ? 'bg-[#222629] shadow-[-5px_-5px_10px_#2b3034,5px_5px_10px_#191c1e]'
                        : 'glass-dropdown border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)]'
                        }`}
                    style={webhookDropdownStyle}
                    role="listbox"
                >
                    <div className="relative z-10 max-h-64 overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedWebhookId(null);
                                handleUpdateSettings({ selectedWebhookId: null });
                                setWebhookDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left ${uiTheme === 'modern' ? 'text-xs' : 'text-sm'} transition-colors ${!selectedWebhookId
                                ? 'bg-purple-500/20 text-purple-100'
                                : 'text-gray-300 hover:bg-white/10'
                                }`}
                            role="option"
                            aria-selected={!selectedWebhookId}
                        >
                            Disabled
                        </button>
                        {webhooks.map((hook: any) => (
                            <button
                                key={hook.id}
                                type="button"
                                onClick={() => {
                                    setSelectedWebhookId(hook.id);
                                    handleUpdateSettings({ selectedWebhookId: hook.id });
                                    setWebhookDropdownOpen(false);
                                }}
                                className={`w-full px-3 py-2 text-left ${uiTheme === 'modern' ? 'text-xs' : 'text-sm'} transition-colors ${selectedWebhookId === hook.id
                                    ? 'bg-purple-500/20 text-purple-100'
                                    : 'text-gray-300 hover:bg-white/10'
                                    }`}
                                role="option"
                                aria-selected={selectedWebhookId === hook.id}
                            >
                                {hook.name}
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}

            {/* Webhook Management Modal */}
            <WebhookModal
                isOpen={webhookModalOpen}
                onClose={() => setWebhookModalOpen(false)}
                webhooks={webhooks}
                onSave={(newWebhooks) => {
                    setWebhooks(newWebhooks);
                    handleUpdateSettings({ webhooks: newWebhooks });
                    // If the selected webhook was deleted, clear selection
                    if (selectedWebhookId && !newWebhooks.find(w => w.id === selectedWebhookId)) {
                        setSelectedWebhookId(null);
                        handleUpdateSettings({ selectedWebhookId: null });
                    }
                }}
            />

            {/* Update Error Modal */}
            <UpdateErrorModal
                isOpen={showUpdateErrorModal}
                onClose={() => setShowUpdateErrorModal(false)}
                error={updateError}
            />

            <WhatsNewModal
                isOpen={whatsNewOpen}
                onClose={handleWhatsNewClose}
                version={whatsNewVersion}
                releaseNotes={whatsNewNotes}
            />
            <WalkthroughModal
                isOpen={walkthroughOpen}
                onClose={handleWalkthroughClose}
                onLearnMore={handleWalkthroughLearnMore}
            />

            {/* Terminal */}
            <Terminal isOpen={showTerminal} onClose={() => setShowTerminal(false)} />
        </div >
    );
}
