import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FilePlus2, LayoutGrid, Minus, RefreshCw, Settings, Square, Trophy, X } from 'lucide-react';
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

            <div className={`app-content relative z-10 ${isModernTheme ? 'max-w-none' : 'max-w-5xl mx-auto'} flex-1 w-full min-w-0 flex flex-col min-h-0 ${view === 'stats' ? 'pt-8 px-8 pb-2 overflow-hidden' : (isModernTheme ? 'p-8 overflow-visible' : 'p-8 overflow-hidden')}`}>
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
                            onClick={() => setView('dashboard')}
                            className={`p-2 rounded-xl transition-all ${view === 'dashboard' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="Dashboard"
                        >
                            <LayoutGrid className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setView('stats')}
                            className={`p-2 rounded-xl transition-all ${view === 'stats' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="View Stats"
                        >
                            <Trophy className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setView('settings')}
                            className={`p-2 rounded-xl transition-all ${view === 'settings' ? 'bg-purple-500/20 text-purple-500 border border-purple-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
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

                {statsViewMounted && (
                    <div className="flex-1 min-h-0" style={{ display: view === 'stats' ? 'flex' : 'none' }}>
                        <StatsView
                            logs={logsForStats}
                            onBack={() => setView('dashboard')}
                            mvpWeights={mvpWeights}
                            disruptionMethod={disruptionMethod}
                            statsViewSettings={statsViewSettings}
                            precomputedStats={precomputedStats || undefined}
                            onStatsViewSettingsChange={(next) => {
                                setStatsViewSettings(next);
                                window.electronAPI?.saveSettings?.({ statsViewSettings: next });
                            }}
                            uiTheme={uiTheme}
                            webUploadState={webUploadState}
                            onWebUpload={handleWebUpload}
                            canShareDiscord={!!selectedWebhookId}
                        />
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
