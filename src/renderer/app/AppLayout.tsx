import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, ChevronDown, Clock3, FilePlus2, LayoutDashboard, Minus, RefreshCw, Settings as SettingsIcon, Square, X } from 'lucide-react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { SettingsView } from '../SettingsView';
import { StatsView } from '../StatsView';
import { StatsErrorBoundary } from '../stats/StatsErrorBoundary';
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
import { FightReportHistoryView } from '../FightReportHistoryView';

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
        setWebUploadState,
        statsViewMounted,
        logsForStats,
        mvpWeights,
        disruptionMethod,
        statsViewSettings,
        precomputedStats,
        computedStats,
        computedSkillUsageData,
        aggregationProgress,
        aggregationDiagnostics,
        statsDataProgress,
        setStatsViewSettings,
        setColorPalette,
        setGlassSurfaces,
        handleWebUpload,
        selectedWebhookId,
        setEmbedStatSettings,
        setMvpWeights,
        setDisruptionMethod,
        developerSettingsTrigger,
        helpUpdatesFocusTrigger,
        handleHelpUpdatesFocusConsumed,
        setWalkthroughOpen,
        setWhatsNewOpen,
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
        handleWalkthroughLearnMore,
        isBulkUploadActive
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

    const handleNavViewChange = (nextView: 'dashboard' | 'stats' | 'history' | 'settings') => {
        setActiveNavView(nextView);
        if (navSwitchRafRef.current !== null) {
            window.cancelAnimationFrame(navSwitchRafRef.current);
            navSwitchRafRef.current = null;
        }
        navSwitchRafRef.current = window.requestAnimationFrame(() => {
            navSwitchRafRef.current = null;
            if (view === nextView) return;
            setView(nextView);
        });
    };

    const activeStatsGroupDef = useMemo(
        () => STATS_TOC_GROUPS.find((group) => group.id === statsActiveGroup) || STATS_TOC_GROUPS[0],
        [statsActiveGroup]
    );
    const statsSidebarSurfaceClass = 'border border-[color:var(--border-default)]';
    const statsSidebarShadowClass = '';
    const statsSidebarBlurClass = '';
    const statsSubnavItemsClass = 'rounded-[4px] border border-[color:var(--border-subtle)]';
    const statsNavGroupShellClass = 'rounded-[4px] border border-[color:var(--border-default)]';
    const statsNavGroupButtonStateClass = 'text-[color:var(--text-primary)] hover:bg-[var(--bg-hover)]';
    const statsNavGroupButtonActiveClass = 'text-white';
    const statsNavEntryStateClass = 'text-[color:var(--text-primary)] hover:bg-[var(--bg-hover)]';
    const statsNavEntryActiveClass = 'text-white';
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
            <div className="app-titlebar h-12 shrink-0 w-full flex justify-between items-center px-4 border-b drag-region select-none z-50" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center gap-2.5">
                    <span className="arcbridge-logo h-5 w-5" style={arcbridgeLogoStyle} aria-label="ArcBridge logo" />
                    <span style={{ fontFamily: '"Cinzel", serif', fontSize: '0.95rem', letterSpacing: '0.06em', fontWeight: 500 }}>
                        <span style={{ color: '#ffffff' }}>Arc</span>
                        <span style={{ color: 'var(--brand-primary)' }}>Bridge</span>
                    </span>
                    {isDev ? (
                        <span className="dev-build-badge ml-1 rounded-md border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.3em] text-amber-300">
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

            <div className="flex items-center px-3 py-1.5 gap-1 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                {([
                    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
                    { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
                    { id: 'history' as const, label: 'History', icon: Clock3 },
                    { id: 'settings' as const, label: 'Settings', icon: SettingsIcon },
                ]).map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        title={label}
                        onClick={() => handleNavViewChange(id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[4px] transition-colors ${
                            activeNavView === id
                                ? 'text-[color:var(--brand-primary)]'
                                : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                        }`}
                        style={activeNavView === id ? { background: 'var(--accent-bg)' } : {}}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                    </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
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
                                        className="flex items-center gap-2 text-[10px] font-medium px-2 py-0.5 rounded-[4px] border transition-colors"
                                        style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', borderColor: 'rgba(34,197,94,0.3)' }}
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                        <span>Restart to Update</span>
                                    </button>
                                ) : (
                                    <div
                                        className="flex items-center gap-2 text-[10px] font-medium px-2 py-0.5 rounded-[4px] border"
                                        style={{ background: 'var(--accent-bg)', color: 'var(--brand-primary)', borderColor: 'var(--accent-border)' }}
                                    >
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
                                    className="flex items-center gap-2 text-[10px] font-medium px-2 py-0.5 rounded-[4px] border"
                                    style={updateStatus.includes('Error')
                                        ? { background: 'rgba(239,68,68,0.15)', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }
                                        : { background: 'var(--bg-card)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }
                                    }
                                >
                                    <RefreshCw className={`w-3 h-3 ${updateStatus.includes('Checking') ? 'animate-spin' : ''}`} />
                                    <span>{updateStatus}</span>
                                </motion.div>
                            )
                        )}
                    </AnimatePresence>
                    {!autoUpdateSupported && (
                        <div
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-[4px] border"
                            style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.3)' }}
                            title={autoUpdateDisabledReason === 'portable'
                                ? 'Portable build detected'
                                : autoUpdateDisabledReason === 'missing-config'
                                    ? 'Update config missing for this build'
                                    : 'Auto-updates disabled in development'}
                        >
                            Auto-updates disabled
                        </div>
                    )}
                    <button
                        onClick={() => setShowTerminal(!showTerminal)}
                        className={`p-1 rounded-[4px] transition-colors ${showTerminal ? 'text-[color:var(--text-primary)]' : 'text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]'}`}
                        style={showTerminal ? { background: 'var(--accent-bg)' } : {}}
                        title="Toggle Terminal"
                    >
                        <TerminalIcon className="w-3.5 h-3.5" />
                    </button>
                    {devDatasetsEnabled && (
                        <button
                            type="button"
                            onClick={() => setDevDatasetsOpen(true)}
                            className="p-1 rounded-[4px] transition-colors"
                            style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.3)' }}
                            title="Dev Datasets"
                        >
                            <FilePlus2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <span
                        className="app-version-pill text-[10px] px-2 py-0.5 rounded-[4px] border cursor-pointer select-none transition-colors"
                        style={{ color: 'var(--text-muted)', borderColor: 'var(--border-subtle)', background: 'var(--bg-card)' }}
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
                    </span>
                </div>
            </div>

            <div className={`app-content relative z-10 max-w-none flex-1 w-full min-w-0 flex flex-col min-h-0 ${(view === 'stats' || view === 'history') ? 'pt-4 px-4 pb-2 overflow-hidden' : 'p-4 overflow-hidden'}`} style={{ background: 'var(--bg-elevated)' }}>

                <WebUploadOverlay
                    webUploadState={webUploadState}
                    isDev={isDev}
                    setWebUploadState={setWebUploadState}
                />

                {statsViewMounted && (
                    <div className="flex flex-1 min-h-0" style={view !== 'stats' ? { display: 'none' } : undefined}>
                        <div className="flex-1 min-h-0 flex gap-3">
                            <aside
                                className="relative w-[248px] -mr-[176px] shrink-0 self-stretch min-h-0 overflow-visible"
                            >
                                <div
                                    className={`stats-dashboard-nav-panel group/statsnavpanel absolute inset-y-0 left-0 z-40 min-h-0 w-[72px] hover:w-[248px] rounded-[4px] ${statsSidebarSurfaceClass} ${statsSidebarBlurClass} ${statsSidebarShadowClass} overflow-hidden will-change-[width] transition-[width] duration-[1250ms] ease-[cubic-bezier(0.16,1,0.3,1)]`}
                                    style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-card)' }}
                                    onMouseEnter={handleStatsNavMouseEnter}
                                    onMouseLeave={handleStatsNavMouseLeave}
                                >
                                    <div className="h-full min-h-0 overflow-y-auto py-3 px-3 space-y-1.5">
                                        <div className="px-2 h-5 flex items-center gap-2 opacity-0 transition-opacity duration-300 group-hover/statsnavpanel:opacity-100">
                                            <span
                                                className="w-4 h-4 inline-block shrink-0"
                                                style={{
                                                    backgroundColor: 'var(--brand-primary)',
                                                    WebkitMaskImage: 'url(/svg/AxiBridge.svg)',
                                                    maskImage: 'url(/svg/AxiBridge.svg)',
                                                    WebkitMaskSize: 'contain',
                                                    maskSize: 'contain',
                                                    WebkitMaskRepeat: 'no-repeat',
                                                    maskRepeat: 'no-repeat',
                                                    WebkitMaskPosition: 'center',
                                                    maskPosition: 'center',
                                                }}
                                            />
                                            <span className="text-[10px] uppercase tracking-[0.28em]" style={{ color: 'var(--text-secondary)' }}>Jump to</span>
                                        </div>
                                        {STATS_TOC_GROUPS.map((group) => {
                                            const GroupIcon = group.icon as any;
                                            const isActiveGroup = group.id === activeStatsGroupDef?.id;
                                            const isCurrentGroup = statsOpenGroup === group.id;
                                            const defaultGroupTarget = group.sectionIds?.[0] || group.items[0]?.id || 'overview';
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
                                                <div key={group.id} className={`stats-nav-group-shell ${statsNavGroupShellClass}`}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (isOpenGroup) return;
                                                            handleStatsNavItemClick(group.id, defaultGroupTarget);
                                                        }}
                                                        className={`stats-nav-group-button ${isActiveGroup ? 'stats-nav-group-button--active' : ''} w-full h-9 flex items-center justify-start gap-0 pl-[21px] pr-[21px] text-left transition-[padding,gap,background-color,color] duration-[980ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/statsnavpanel:gap-2 group-hover/statsnavpanel:pl-3 group-hover/statsnavpanel:pr-3 ${isActiveGroup ? statsNavGroupButtonActiveClass : statsNavGroupButtonStateClass}`}
                                                    >
                                                        <GroupIcon className={`w-3.5 h-3.5 text-[color:var(--brand-primary)] shrink-0 transition-transform duration-[1050ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isStatsNavExpanded ? 'scale-110' : 'scale-100'}`} />
                                                        <span className={`stats-nav-group-label text-[11px] leading-none font-semibold uppercase tracking-[0.18em] whitespace-nowrap overflow-hidden transition-[opacity,transform,max-width] duration-[1050ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isStatsNavExpanded ? 'opacity-100 translate-x-0 max-w-[160px]' : 'opacity-0 -translate-x-2 max-w-0'}`}>{group.label}</span>
                                                        <span className={`inline-flex ml-auto overflow-hidden transition-[opacity,transform,max-width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isStatsNavExpanded ? 'opacity-100 scale-100 max-w-[24px]' : 'opacity-0 scale-75 max-w-0'} ${isOpenGroup || isNavClosingGroup || isSwitchClosingGroup ? 'rotate-0' : '-rotate-90'}`}>
                                                            <ChevronDown className="w-4 h-4 text-gray-300" />
                                                        </span>
                                                    </button>
                                                        <div className={`${isExpanded ? 'max-h-[560px]' : 'max-h-0'} overflow-hidden transition-[max-height] ${isSwitchClosingPhase ? 'duration-[320ms]' : 'duration-[1180ms]'} ease-[cubic-bezier(0.16,1,0.3,1)]`}>
                                                        <div className={`stats-nav-subnav-shell origin-top pt-1.5 pb-1.5 px-2 space-y-0.5 will-change-[opacity,transform] ${disableChildFade ? '' : (isSwitchClosingPhase ? 'transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]' : 'transition-[opacity,transform] duration-[1020ms] ease-[cubic-bezier(0.16,1,0.3,1)]')} ${statsSubnavItemsClass} ${showClosingContent ? 'opacity-100 translate-y-0 scale-y-100' : (isSwitchClosingPhase ? 'opacity-0 -translate-y-1 scale-y-95' : 'opacity-0 -translate-y-2 scale-y-95')}`}>
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
                                                                            className={`stats-nav-entry ${isActiveItem ? 'stats-nav-entry--active' : ''} w-full h-[34px] flex items-center text-left rounded-md transition-colors duration-150 ${isStatsNavExpanded ? 'justify-start gap-2 px-2' : 'justify-center gap-0 px-2'} ${isActiveItem ? statsNavEntryActiveClass : statsNavEntryStateClass}`}
                                                                        >
                                                                            <ItemIcon className="w-3.5 h-3.5 text-[color:var(--brand-primary)] shrink-0" />
                                                                            <span className={`stats-nav-item-label text-xs leading-tight truncate overflow-hidden transition-[opacity,max-width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isStatsNavExpanded ? 'opacity-100 max-w-[140px] translate-x-0' : 'opacity-0 max-w-0 -translate-x-1'}`}>{item.label}</span>
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
                            <StatsErrorBoundary>
                                <StatsView
                                    logs={logsForStats}
                                    onBack={() => setView('dashboard')}
                                    mvpWeights={mvpWeights}
                                    disruptionMethod={disruptionMethod}
                                    statsViewSettings={statsViewSettings}
                                    precomputedStats={precomputedStats || undefined}
                                    aggregationResult={{ stats: computedStats, skillUsageData: computedSkillUsageData, aggregationProgress, aggregationDiagnostics }}
                                    statsDataProgress={statsDataProgress}
                                    onStatsViewSettingsChange={(next) => {
                                        setStatsViewSettings(next);
                                        window.electronAPI?.saveSettings?.({ statsViewSettings: next });
                                    }}
                                    webUploadState={webUploadState}
                                    onWebUpload={handleWebUpload}
                                    canShareDiscord={!!selectedWebhookId}
                                    sectionVisibility={statsSectionVisibility}
                                />
                            </StatsErrorBoundary>
                        </div>
                    </div>
                )}
                {view === 'stats' && !statsViewMounted && (
                    <div className="flex-1 min-h-0 flex items-center justify-center">
                        <div className="w-full max-w-md rounded-[4px] border px-6 py-8 text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                            <div className="mx-auto mb-3 h-12 w-12 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
                                <RefreshCw className="h-5 w-5 animate-spin" style={{ color: 'var(--brand-primary)' }} />
                            </div>
                            <div className="text-sm font-semibold tracking-wide" style={{ color: 'var(--text-primary)' }}>Loading Stats Dashboard</div>
                            <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>Preparing sections and rendering data...</div>
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
                        onColorPaletteSaved={setColorPalette}
                        onGlassSurfacesSaved={setGlassSurfaces}
                        developerSettingsTrigger={developerSettingsTrigger}
                        helpUpdatesFocusTrigger={helpUpdatesFocusTrigger}
                        onHelpUpdatesFocusConsumed={handleHelpUpdatesFocusConsumed}
                        onOpenWalkthrough={() => setWalkthroughOpen(true)}
                        onOpenWhatsNew={() => setWhatsNewOpen(true)}
                        isBulkUploadActive={isBulkUploadActive}
                    />
                ) : view === 'history' ? (
                    <FightReportHistoryView />
                ) : view === 'stats' ? null : (
                    <div className="dashboard-view dashboard-modern flex flex-1 min-h-0 overflow-hidden matte-dashboard-shell">
                        <div className="dashboard-rail flex flex-col gap-3 overflow-y-auto p-3 matte-panel-shell matte-rail-shell" style={{ width: '300px', flexShrink: 0, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-subtle)' }}>
                            {configurationPanel}
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto p-3 matte-activity-shell">
                            {activityPanel}
                        </div>
                    </div>
                )}
            </div>

            <ScreenshotContainer
                screenshotData={screenshotData}
                embedStatSettings={embedStatSettings}
                disruptionMethod={disruptionMethod}
                showClassIcons={showClassIcons}
                enabledTopListCount={enabledTopListCount}
            />

            <DevDatasetsModal ctx={devDatasetsCtx} isBulkUploadActive={isBulkUploadActive} />

            <FilePickerModal ctx={filePickerCtx} isBulkUploadActive={isBulkUploadActive} />

            {webhookDropdownOpen && webhookDropdownStyle && createPortal(
                <div
                    ref={webhookDropdownPortalRef}
                    className="app-dropdown rounded-[4px] overflow-hidden border"
                    style={{ ...webhookDropdownStyle, background: 'var(--bg-card)', borderColor: 'var(--border-default)', boxShadow: 'var(--shadow-dropdown)' } as React.CSSProperties}
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
                            className="w-full px-3 py-2 text-left text-sm transition-colors"
                            style={!selectedWebhookId
                                ? { background: 'var(--accent-bg)', color: 'var(--brand-primary)' }
                                : { color: 'var(--text-secondary)' }}
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
                                className="w-full px-3 py-2 text-left text-sm transition-colors"
                                style={selectedWebhookId === hook.id
                                    ? { background: 'var(--accent-bg)', color: 'var(--brand-primary)' }
                                    : { color: 'var(--text-secondary)' }}
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
                onRetry={() => {
                    setShowUpdateErrorModal(false);
                    window.electronAPI.checkForUpdates();
                }}
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
