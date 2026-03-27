import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Clock3, FilePlus2, LayoutDashboard, Minus, RefreshCw, Settings as SettingsIcon, Square, X } from 'lucide-react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { SettingsView } from '../SettingsView';
import { StatsView } from '../StatsView';
import { StatsErrorBoundary } from '../stats/StatsErrorBoundary';
import { StatsNavSidebar } from '../stats/StatsNavSidebar';
import { Terminal } from '../Terminal';
import { UpdateErrorModal } from '../UpdateErrorModal';
import { WalkthroughModal } from '../WalkthroughModal';
import { WebhookModal } from '../WebhookModal';
import { WhatsNewModal } from '../WhatsNewModal';
import { DevDatasetsModal } from './DevDatasetsModal';
import { FilePickerModal } from './FilePickerModal';
import { WebUploadOverlay } from './WebUploadOverlay';
import { FightReportHistoryView } from '../FightReportHistoryView';


export function AppLayout({ ctx }: { ctx: any }) {
    const {
        shellClassName,
        isDev,
        axibridgeLogoStyle,
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

    useEffect(() => {
        setActiveNavView(view);
    }, [view]);

    useEffect(() => {
        return () => {
            if (navSwitchRafRef.current !== null) {
                window.cancelAnimationFrame(navSwitchRafRef.current);
                navSwitchRafRef.current = null;
            }
        };
    }, []);

    // Stable setters that skip updates when values haven't changed (prevents unnecessary aggregation recalcs)
    const stableSetStatsViewSettings = useCallback((next: any) => {
        setStatsViewSettings((prev: any) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    }, [setStatsViewSettings]);
    const stableSetMvpWeights = useCallback((next: any) => {
        setMvpWeights((prev: any) => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
    }, [setMvpWeights]);
    const stableSetDisruptionMethod = useCallback((next: any) => {
        setDisruptionMethod((prev: any) => prev === next ? prev : next);
    }, [setDisruptionMethod]);

    const stableOnBack = useCallback(() => setView('dashboard'), [setView]);

    const stableOnStatsViewSettingsChange = useCallback((next: any) => {
        setStatsViewSettings(next);
        window.electronAPI?.saveSettings?.({ statsViewSettings: next });
    }, [setStatsViewSettings]);

    const stableAggregationResult = useMemo(() => ({
        stats: computedStats,
        skillUsageData: computedSkillUsageData,
        aggregationProgress,
        aggregationDiagnostics,
    }), [computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics]);

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


    return (
        <div className={shellClassName}>
            {/* Custom Title Bar */}
            <div className="app-titlebar h-12 shrink-0 w-full flex justify-between items-center px-4 border-b drag-region select-none z-50" style={{ background: 'var(--bg-base)', borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center gap-2.5">
                    <span className="axibridge-logo h-5 w-5" style={axibridgeLogoStyle} aria-label="AxiBridge logo" />
                    <span style={{ fontFamily: '"Cinzel", serif', fontSize: '0.95rem', letterSpacing: '0.06em', fontWeight: 500 }}>
                        <span style={{ color: '#ffffff' }}>Axi</span>
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

                {view === 'dashboard' && (
                    <div className="flex flex-1 min-h-0 relative flex-col">
                        <div className="dashboard-view dashboard-modern flex flex-1 min-h-0 overflow-hidden matte-dashboard-shell">
                            <div className="dashboard-rail flex flex-col gap-3 overflow-y-auto p-3 matte-panel-shell matte-rail-shell" style={{ width: '300px', flexShrink: 0, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-subtle)' }}>
                                {configurationPanel}
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto p-3 matte-activity-shell">
                                {activityPanel}
                            </div>
                        </div>
                    </div>
                )}
                {view === 'stats' && (
                    <div className="flex flex-1 min-h-0 relative">
                        <div className="flex-1 min-h-0 flex gap-3">
                            <StatsNavSidebar />
                            <div className="flex-1 min-h-0 flex flex-col">
                                <StatsErrorBoundary>
                                    <StatsView
                                        logs={logsForStats}
                                        onBack={stableOnBack}
                                        mvpWeights={mvpWeights}
                                        disruptionMethod={disruptionMethod}
                                        statsViewSettings={statsViewSettings}
                                        precomputedStats={precomputedStats || undefined}
                                        aggregationResult={stableAggregationResult}
                                        statsDataProgress={statsDataProgress}
                                        onStatsViewSettingsChange={stableOnStatsViewSettingsChange}
                                        webUploadState={webUploadState}
                                        onWebUpload={handleWebUpload}
                                    />
                                </StatsErrorBoundary>
                            </div>
                        </div>
                    </div>
                )}
                {view === 'history' && (
                    <div className="flex flex-1 min-h-0 relative flex-col">
                        <FightReportHistoryView />
                    </div>
                )}
                {view === 'settings' && (
                    <div className="flex flex-1 min-h-0 relative flex-col">
                        <SettingsView
                            onBack={() => setView('dashboard')}
                            onEmbedStatSettingsSaved={setEmbedStatSettings}
                            onMvpWeightsSaved={stableSetMvpWeights}
                            onStatsViewSettingsSaved={stableSetStatsViewSettings}
                            onDisruptionMethodSaved={stableSetDisruptionMethod}
                            onColorPaletteSaved={setColorPalette}
                            onGlassSurfacesSaved={setGlassSurfaces}
                            developerSettingsTrigger={developerSettingsTrigger}
                            helpUpdatesFocusTrigger={helpUpdatesFocusTrigger}
                            onHelpUpdatesFocusConsumed={handleHelpUpdatesFocusConsumed}
                            onOpenWalkthrough={() => setWalkthroughOpen(true)}
                            onOpenWhatsNew={() => setWhatsNewOpen(true)}
                            isBulkUploadActive={isBulkUploadActive}
                        />
                    </div>
                )}
            </div>

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
