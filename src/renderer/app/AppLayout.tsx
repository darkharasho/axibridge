import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, BarChart3, Clock3, LayoutDashboard, Minus, RefreshCw, Settings as SettingsIcon, Square, X, Zap } from 'lucide-react';
import { CommanderIcon } from '../commander/CommanderIcon';
import { Terminal as TerminalIcon } from 'lucide-react';
import { SettingsView } from '../SettingsView';
import { StatsView } from '../StatsView';
import { StatsErrorBoundary } from '../stats/StatsErrorBoundary';
import { Terminal } from '../Terminal';
import { UpdateErrorModal } from '../UpdateErrorModal';
import { WalkthroughModal } from '../WalkthroughModal';
import { WebhookModal } from '../WebhookModal';
import { WhatsNewModal } from '../WhatsNewModal';
import { AxiRail } from './AxiRail';
import { FilePickerModal } from './FilePickerModal';
import { WebUploadOverlay } from './WebUploadOverlay';
import { FightReportHistoryView } from '../FightReportHistoryView';
import { CommanderView } from '../commander/CommanderView';
import { useParticleEffect, PRESETS } from '../particles';
import { TRANSITION } from '../motion';
import { useMapSlicePainter } from '../mapSlice/useMapSlicePainter';

const UNPUBLISHED_REPLAY: ReadonlySet<string> = new Set(['replay']);



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
        webUploadState,
        setWebUploadState,
        webUploadLogEntries,
        logsForStats,
        mvpWeights,
        disruptionMethod,
        statsViewSettings,
        computedStats,
        computedSkillUsageData,
        aggregationProgress,
        aggregationDiagnostics,
        axilogCoverage,
        handleLogsHealed,
        getStoredLogs,
        statsDataProgress,
        setStatsViewSettings,
        setColorPalette,
        axiTheme,
        setAxiTheme,
        particlesEnabled,
        setParticlesEnabled,
        handleWebUpload,
        setEmbedStatSettings,
        setMvpWeights,
        setDisruptionMethod,
        developerSettingsTrigger,
        helpUpdatesFocusTrigger,
        handleHelpUpdatesFocusConsumed,
        parserSettingsFocusTrigger,
        handleParserSettingsFocusConsumed,
        howToTrigger,
        handleHowToConsumed,
        setWalkthroughOpen,
        setWhatsNewOpen,
        activityPanel,
        configurationPanel,
        filePickerCtx,
        webhookDropdownOpen,
        webhookDropdownStyle,
        webhookDropdownPortalRef,
        webhooks,
        setWebhookDropdownOpen,
        webhookModalOpen,
        setWebhookModalOpen,
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
        isBulkUploadActive,
        setAllowLocalJson,
        setR2PreciseReplay,
        setR2HostingEnabled,
        setR2SliceEnabled,
        refreshR2Status,
        setParserSettings,
        parserSettings,
        setParserSetting,
        enabledWebhookIds,
        handleSetDestinationEnabled,
        handleSaveWebhooks,
        logDirectory,
        handleSelectDirectory,
    } = ctx;

    const [activeNavView, setActiveNavView] = useState(view);

    // Replay is kept locally but published only on opt-in; the stats view marks
    // it until then. Unknown settings (still loading) read as published, so
    // nothing flashes. Retention off means no replay at all, so no marker either.
    const replayPublishing = useMemo(() => ({
        published: !parserSettings
            || parserSettings.parseCombatReplay
            || parserSettings.keepCombatReplayLocally === false,
        onEnable: () => setParserSetting('parseCombatReplay', true),
    }), [parserSettings, setParserSetting]);
    const navSwitchRafRef = useRef<number | null>(null);

    const [maximized, setMaximized] = useState(false);
    useEffect(() => {
        return window.electronAPI?.onMaximizedChange?.((m: boolean) => setMaximized(m));
    }, []);

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

    useMapSlicePainter();

    const { emitterNode: tabEmitter, trigger: triggerTabTransition } = useParticleEffect();
    const prevViewRef = useRef(view);
    useEffect(() => {
        if (view !== prevViewRef.current) {
            prevViewRef.current = view;
            if (particlesEnabled) triggerTabTransition(PRESETS.tabTransition);
        }
    }, [view, particlesEnabled, triggerTabTransition]);

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
        stableSetStatsViewSettings(next);
        window.electronAPI?.saveSettings?.({ statsViewSettings: next });
    }, [stableSetStatsViewSettings]);

    const stableAggregationResult = useMemo(() => ({
        stats: computedStats,
        skillUsageData: computedSkillUsageData,
        aggregationProgress,
        aggregationDiagnostics,
        axilogCoverage,
    }), [computedStats, computedSkillUsageData, aggregationProgress, aggregationDiagnostics, axilogCoverage]);

    const handleNavViewChange = (nextView: 'dashboard' | 'stats' | 'commander' | 'history' | 'settings') => {
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
        <div className={shellClassName} style={{ borderRadius: maximized ? 0 : 'var(--axi-radius)', overflow: 'hidden' }}>
            {/* Custom Title Bar */}
            <div className="app-titlebar axi-titlebar w-full justify-between px-4 drag-region select-none z-50">
                <div className="flex items-center gap-2.5">
                    <span className="axibridge-logo h-5 w-5" style={axibridgeLogoStyle} aria-label="AxiBridge logo" />
                    <span style={{ fontFamily: '"Cinzel", serif', fontSize: '0.95rem', letterSpacing: '0.06em', fontWeight: 500 }}>
                        <span style={{ color: '#ffffff' }}>Axi</span>
                        <span className="app-brand-bridge" style={{ color: 'var(--axi-accent)' }}>Bridge</span>
                    </span>
                    {isDev ? (
                        <span className="dev-build-badge ml-1 axi-chip axi-chip--warn">
                            Dev Build
                        </span>
                    ) : null}
                </div>
                <div className="axi-titlebar__btns items-center gap-4 no-drag">
                    <button onClick={() => window.electronAPI.windowControl('minimize')} className="axi-action axi-action--glyph axi-ink-dim">
                        <Minus className="w-4 h-4" />
                    </button>
                    <button onClick={() => window.electronAPI.windowControl('maximize')} className="axi-action axi-action--glyph axi-ink-dim">
                        <Square className="w-3 h-3" />
                    </button>
                    <button onClick={() => window.electronAPI.windowControl('close')} className="axi-action axi-action--glyph axi-ink-dim">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div data-nav-strip className="flex items-center px-3 py-2 border-b border-b-[length:var(--axi-border-panel)] axi-edge-line bg-[color:var(--axi-surface-paint)] shrink-0">
                {/* Upstream's tab strip. It marks the current view with
                    aria-current="page" rather than a class, so what a screen
                    reader is told and what the fill says cannot disagree - and
                    the fill, the ink outline and the offset block all arrive
                    from axi.css. Only the icon row inside each tab is ours. */}
                <nav className="axi-tabs">
                    {([
                        { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
                        { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
                        { id: 'commander' as const, label: 'Commander', icon: CommanderIcon },
                        { id: 'history' as const, label: 'History', icon: Clock3 },
                        { id: 'settings' as const, label: 'Settings', icon: SettingsIcon },
                    ]).map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            title={label}
                            aria-current={activeNavView === id ? 'page' : undefined}
                            onClick={() => handleNavViewChange(id)}
                            className="axi-action inline-flex items-center gap-1.5"
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                </nav>
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
                                        className="axi-btn axi-btn--xs"
                                        style={{ background: 'var(--axi-surface-raised-paint)', color: 'var(--axi-ok)', borderColor: 'var(--axi-ok)' }}
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                        <span>Restart to Update</span>
                                    </button>
                                ) : (
                                    <div
                                        className="axi-chip"
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
                                    className={`axi-chip ${updateStatus.includes('Error') ? 'axi-chip--danger' : ''}`}
                                >
                                    <RefreshCw className={`w-3 h-3 ${updateStatus.includes('Checking') ? 'animate-spin' : ''}`} />
                                    <span>{updateStatus}</span>
                                </motion.div>
                            )
                        )}
                    </AnimatePresence>
                    {!autoUpdateSupported && (
                        <div
                            className="axi-chip axi-chip--warn"
                            title={autoUpdateDisabledReason === 'portable'
                                ? 'Portable build detected'
                                : autoUpdateDisabledReason === 'missing-config'
                                    ? 'Update config missing for this build'
                                    : 'Auto-updates disabled in development'}
                        >
                            Auto-updates disabled
                        </div>
                    )}
                    <span
                        className="app-version-pill axi-chip axi-chip--action axi-ink-faint select-none"
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
                    <button
                        onClick={() => setShowTerminal(!showTerminal)}
                        className={`p-1 transition-colors ${showTerminal ? 'text-[color:var(--axi-text)]' : 'text-[color:var(--axi-text-faint)] hover:text-[color:var(--axi-text-dim)]'}`}
                        style={showTerminal ? { background: 'var(--axi-surface-paint)' } : {}}
                        title="Toggle Terminal"
                    >
                        <TerminalIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>


            <div className={`app-content relative z-10 max-w-none flex-1 w-full min-w-0 flex flex-col min-h-0 ${(view === 'stats' || view === 'history' || view === 'commander') ? 'pt-4 px-4 pb-2 overflow-hidden' : 'p-4 overflow-hidden'}`}>

                {createPortal(
                    <WebUploadOverlay
                        webUploadState={webUploadState}
                        isDev={isDev}
                        setWebUploadState={setWebUploadState}
                        logEntries={webUploadLogEntries}
                    />,
                    document.body
                )}

                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 20 }}>
                    {tabEmitter}
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={view}
                        className={`flex flex-1 min-h-0 relative ${view !== 'stats' ? 'flex-col' : ''}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={TRANSITION.page}
                    >
                        {view === 'dashboard' && (
                            <div className="dashboard-view dashboard-modern flex flex-1 min-h-0 overflow-hidden matte-dashboard-shell">
                                <div className="dashboard-rail flex flex-col overflow-hidden p-2" style={{ width: '300px', flexShrink: 0 }}>
                                    {configurationPanel}
                                </div>
                                <div className="flex-1 min-h-0 overflow-y-auto p-3 matte-activity-shell">
                                    {activityPanel}
                                </div>
                            </div>
                        )}
                        {view === 'stats' && (
                            /* `min-w-0` on both levels is load-bearing, not decoration: a flex
                               item's automatic minimum size is its content's max-content width,
                               so without it a single wide stats table propagates its full width
                               up this chain until `app-content`'s overflow-hidden clips the
                               whole app — header included. With it, the width stops here and
                               `#stats-dashboard-container` scrolls horizontally instead. */
                            <div className="flex-1 min-h-0 min-w-0 flex gap-3">
                                <AxiRail unpublishedCategoryIds={replayPublishing.published ? undefined : UNPUBLISHED_REPLAY} />
                                <div className="flex-1 min-w-0 min-h-0 flex flex-col">
                                    <StatsErrorBoundary>
                                        <StatsView
                                            logs={logsForStats}
                                            onBack={stableOnBack}
                                            mvpWeights={mvpWeights}
                                            disruptionMethod={disruptionMethod}
                                            statsViewSettings={statsViewSettings}
                                            aggregationResult={stableAggregationResult}
                                            onLogsHealed={handleLogsHealed}
                                            statsDataProgress={statsDataProgress}
                                            onStatsViewSettingsChange={stableOnStatsViewSettingsChange}
                                            webUploadState={webUploadState}
                                            onWebUpload={handleWebUpload}
                                            webUploadLogEntries={webUploadLogEntries}
                                            replayPublishing={replayPublishing}
                                        />
                                    </StatsErrorBoundary>
                                </div>
                            </div>
                        )}
                        {view === 'commander' && (
                            <CommanderView logs={logsForStats} />
                        )}
                        {view === 'history' && (
                            <FightReportHistoryView />
                        )}
                        {view === 'settings' && (
                            <SettingsView
                                onBack={() => {
                                    // Credentials may have just been added or
                                    // cleared, which decides whether the R2 row
                                    // belongs in Quick Settings at all.
                                    refreshR2Status?.();
                                    setView('dashboard');
                                }}
                                onEmbedStatSettingsSaved={setEmbedStatSettings}
                                onMvpWeightsSaved={stableSetMvpWeights}
                                onStatsViewSettingsSaved={stableSetStatsViewSettings}
                                onDisruptionMethodSaved={stableSetDisruptionMethod}
                                onColorPaletteSaved={setColorPalette}
                                onAxiThemeSaved={setAxiTheme}
                                axiTheme={axiTheme}
                                onParticlesEnabledSaved={setParticlesEnabled}
                                onAllowLocalJsonSaved={setAllowLocalJson}
                                onParserSettingsSaved={setParserSettings}
                                onR2PreciseReplaySaved={setR2PreciseReplay}
                                onR2HostingEnabledSaved={setR2HostingEnabled}
                                onR2SliceEnabledSaved={setR2SliceEnabled}
                                onR2CredentialsChanged={refreshR2Status}
                                particlesEnabled={particlesEnabled}
                                developerSettingsTrigger={developerSettingsTrigger}
                                helpUpdatesFocusTrigger={helpUpdatesFocusTrigger}
                                onHelpUpdatesFocusConsumed={handleHelpUpdatesFocusConsumed}
                                parserSettingsFocusTrigger={parserSettingsFocusTrigger}
                                webhooks={webhooks}
                                enabledWebhookIds={enabledWebhookIds}
                                onSaveWebhooks={handleSaveWebhooks}
                                onSetDestinationEnabled={handleSetDestinationEnabled}
                                logDirectory={logDirectory}
                                onChangeLogDirectory={handleSelectDirectory}
                                onParserSettingsFocusConsumed={handleParserSettingsFocusConsumed}
                                howToTrigger={howToTrigger}
                                onHowToConsumed={handleHowToConsumed}
                                onLogsHealed={handleLogsHealed}
                                getStoredLogs={getStoredLogs}
                                onOpenWalkthrough={() => setWalkthroughOpen(true)}
                                onOpenWhatsNew={() => setWhatsNewOpen(true)}
                                isBulkUploadActive={isBulkUploadActive}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            <FilePickerModal ctx={filePickerCtx} isBulkUploadActive={isBulkUploadActive} />

            {webhookDropdownOpen && webhookDropdownStyle && createPortal(
                <div
                    ref={webhookDropdownPortalRef}
                    /* The inline --shadow-dropdown here is what the override layer needed
                       !important for: that token is the panel-sized block, so the one
                       dropdown painting its own shadow was the one not taking the control
                       step. The tile brings the right block, so the literal goes. */
                    className="app-dropdown axi-panel axi-panel--tile axi-panel--float overflow-hidden [--axi-panel-pad:0]"
                    style={webhookDropdownStyle as React.CSSProperties}
                    role="listbox"
                >
                    <div className="relative z-10 max-h-64 overflow-y-auto">
                        <button
                            type="button"
                            onClick={() => {
                                // Clearing is one explicit action, so it closes;
                                // per-row toggles stay open (see below).
                                for (const id of enabledWebhookIds) handleSetDestinationEnabled(id, false);
                                setWebhookDropdownOpen(false);
                            }}
                            className="w-full px-3 py-2 text-left text-sm transition-colors"
                            style={enabledWebhookIds.length === 0
                                ? { background: 'var(--axi-surface-paint)', color: 'var(--axi-text-dim)' }
                                : { color: 'var(--axi-text-dim)' }}
                            role="option"
                            aria-selected={enabledWebhookIds.length === 0}
                        >
                            Disabled
                        </button>
                        {webhooks.map((hook: any) => {
                            // Mirror the modal's bridge affordances (WebhookModal.tsx):
                            // a revoked bridge keeps its row but loses its token.
                            const isBridge = hook.kind === 'bridge';
                            const needsRelink = isBridge && !hook.token;
                            const isEnabled = enabledWebhookIds.includes(hook.id);
                            return (
                                <button
                                    key={hook.id}
                                    type="button"
                                    onClick={() => handleSetDestinationEnabled(hook.id, !isEnabled)}
                                    className="w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2"
                                    style={isEnabled
                                        ? { background: 'var(--axi-surface-paint)', color: 'var(--axi-text-dim)' }
                                        : { color: 'var(--axi-text-dim)' }}
                                    role="option"
                                    aria-selected={isEnabled}
                                >
                                    {needsRelink
                                        ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 axi-ink-warn" aria-hidden="true" />
                                        : isBridge && <Zap className="w-3.5 h-3.5 shrink-0 axi-ink-meta" aria-hidden="true" />}
                                    <span className="truncate">{hook.name}</span>
                                    {isBridge && (
                                        <span
                                            className={`ml-auto shrink-0 axi-chip ${needsRelink ? 'axi-chip--warn' : 'axi-chip--meta'}`}
                                        >
                                            {needsRelink ? 'Re-link' : 'Bridge'}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body
            )}

            {/* Webhook Management Modal */}
            <WebhookModal
                isOpen={webhookModalOpen}
                onClose={() => setWebhookModalOpen(false)}
                webhooks={webhooks}
                enabledWebhookIds={enabledWebhookIds}
                onSave={handleSaveWebhooks}
                onSetEnabled={handleSetDestinationEnabled}
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
