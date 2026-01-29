import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, UploadCloud, FileText, Settings, Minus, Square, X, Image as ImageIcon, Layout, RefreshCw, Trophy, ChevronDown, ChevronLeft, ChevronRight, Grid3X3, LayoutGrid, Trash2, FilePlus2 } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ExpandableLogCard } from './ExpandableLogCard';
import { StatsView } from './StatsView';
import { SettingsView } from './SettingsView';
import { WebhookModal, Webhook } from './WebhookModal';
import { UpdateErrorModal } from './UpdateErrorModal';
import { Terminal } from './Terminal';
import { Terminal as TerminalIcon } from 'lucide-react';
import { DEFAULT_DISRUPTION_METHOD, DEFAULT_EMBED_STATS, DEFAULT_MVP_WEIGHTS, DisruptionMethod, IEmbedStatSettings, IMvpWeights } from './global.d';
import { WhatsNewModal } from './WhatsNewModal';

const dataUrlToUint8Array = (dataUrl: string): Uint8Array => {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
        throw new Error('Invalid data URL');
    }
    const base64 = dataUrl.slice(commaIndex + 1);
    if (typeof globalThis.atob !== 'function') {
        throw new Error('Base64 decoder is not available');
    }
    const binaryString = globalThis.atob(base64);
    const buffer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
        buffer[i] = binaryString.charCodeAt(i);
    }
    return buffer;
};

function App() {
    const [logDirectory, setLogDirectory] = useState<string | null>(null);
    const [notificationType, setNotificationType] = useState<'image' | 'image-beta' | 'embed'>('image');
    const [logs, setLogs] = useState<ILogData[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const canceledLogsRef = useRef<Set<string>>(new Set());
    const [embedStatSettings, setEmbedStatSettings] = useState<IEmbedStatSettings>(DEFAULT_EMBED_STATS);
    const [mvpWeights, setMvpWeights] = useState<IMvpWeights>(DEFAULT_MVP_WEIGHTS);
    const [disruptionMethod, setDisruptionMethod] = useState<DisruptionMethod>(DEFAULT_DISRUPTION_METHOD);

    const [screenshotData, setScreenshotData] = useState<ILogData | null>(null);

    // Updater State
    const [updateStatus, setUpdateStatus] = useState<string>('');
    const [updateProgress, setUpdateProgress] = useState<any>(null);
    const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
    const [updateDownloaded, setUpdateDownloaded] = useState<boolean>(false);
    const [showUpdateErrorModal, setShowUpdateErrorModal] = useState(false);
    const [updateError, setUpdateError] = useState<string | null>(null);

    // Terminal State
    const [showTerminal, setShowTerminal] = useState(false);

    // View State
    const [view, setView] = useState<'dashboard' | 'stats' | 'settings'>('dashboard');

    // App Version
    const [appVersion, setAppVersion] = useState<string>('...');
    const [whatsNewOpen, setWhatsNewOpen] = useState(false);
    const [whatsNewVersion, setWhatsNewVersion] = useState<string>('');
    const [whatsNewNotes, setWhatsNewNotes] = useState<string | null>(null);

    // Webhook Management
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
    const [webhookModalOpen, setWebhookModalOpen] = useState(false);

    // File picker modal state
    const [filePickerOpen, setFilePickerOpen] = useState(false);
    const [filePickerAvailable, setFilePickerAvailable] = useState<Array<{ path: string; name: string; mtimeMs: number; size: number }>>([]);
    const [filePickerSelected, setFilePickerSelected] = useState<Set<string>>(new Set());
    const [filePickerFilter, setFilePickerFilter] = useState('');
    const [selectSinceOpen, setSelectSinceOpen] = useState(false);
    const [selectSinceDate, setSelectSinceDate] = useState<Date | null>(null);
    const [selectSinceView, setSelectSinceView] = useState<Date>(() => new Date());
    const [selectSinceHour, setSelectSinceHour] = useState<number>(12);
    const [selectSinceMinute, setSelectSinceMinute] = useState<number>(0);
    const [selectSinceMeridiem, setSelectSinceMeridiem] = useState<'AM' | 'PM'>('AM');
    const [selectSinceMonthOpen, setSelectSinceMonthOpen] = useState(false);
    const [filePickerError, setFilePickerError] = useState<string | null>(null);
    const [filePickerLoading, setFilePickerLoading] = useState(false);
    const lastPickedIndexRef = useRef<number | null>(null);

    // Persistence removed

    const enabledTopListCount = [
        embedStatSettings.showDamage,
        embedStatSettings.showDownContribution,
        embedStatSettings.showHealing,
        embedStatSettings.showBarrier,
        embedStatSettings.showCleanses,
        embedStatSettings.showBoonStrips,
        embedStatSettings.showCC,
        embedStatSettings.showStability,
        embedStatSettings.showResurrects,
        embedStatSettings.showDistanceToTag,
        embedStatSettings.showKills,
        embedStatSettings.showDowns,
        embedStatSettings.showBreakbarDamage,
        embedStatSettings.showDamageTaken,
        embedStatSettings.showDeaths,
        embedStatSettings.showDodges
    ].filter(Boolean).length;
    const showClassIcons = notificationType === 'image' || notificationType === 'image-beta';


    // Stats calculation
    const totalUploads = logs.length;
    const avgSquadSize = logs.length > 0
        ? Math.round(logs.reduce((acc, log) => acc + (log.details?.players?.filter((p: any) => !p.notInSquad)?.length || 0), 0) / logs.length)
        : 0;
    const avgEnemies = logs.length > 0
        ? Math.round(logs.reduce((acc, log) => acc + (log.details?.targets?.filter((t: any) => !t.isFake)?.length || 0), 0) / logs.length)
        : 0;
    const successRate = logs.length > 0
        ? Math.round((logs.filter(log => log.details?.success).length / logs.length) * 100)
        : 0;

    useEffect(() => {
        // Load saved settings
        const loadSettings = async () => {
            const settings = await window.electronAPI.getSettings();
            if (settings.logDirectory) {
                setLogDirectory(settings.logDirectory);
                window.electronAPI.startWatching(settings.logDirectory);
            }
            if (settings.discordNotificationType) {
                setNotificationType(settings.discordNotificationType);
            }
            if (settings.webhooks) {
                setWebhooks(settings.webhooks);
            }
            if (settings.selectedWebhookId) {
                setSelectedWebhookId(settings.selectedWebhookId);
            }
            if (settings.embedStatSettings) {
                setEmbedStatSettings({ ...DEFAULT_EMBED_STATS, ...settings.embedStatSettings });
            }
            if (settings.mvpWeights) {
                setMvpWeights({ ...DEFAULT_MVP_WEIGHTS, ...settings.mvpWeights });
            }
            if (settings.disruptionMethod) {
                setDisruptionMethod(settings.disruptionMethod);
            }

            const whatsNew = await window.electronAPI.getWhatsNew();
            setAppVersion(whatsNew.version);
            setWhatsNewVersion(whatsNew.version);
            setWhatsNewNotes(whatsNew.releaseNotes);
            if (whatsNew.version && whatsNew.version !== whatsNew.lastSeenVersion) {
                setWhatsNewOpen(true);
            }
        };
        loadSettings();

        // Listen for status updates during upload process
        const cleanupStatus = window.electronAPI.onUploadStatus((data: ILogData) => {
            if (data.filePath && canceledLogsRef.current.has(data.filePath)) {
                return;
            }
            setLogs((currentLogs) => {
                const existingIndex = currentLogs.findIndex(log => log.filePath === data.filePath);
                if (existingIndex >= 0) {
                    const updated = [...currentLogs];
                    updated[existingIndex] = { ...updated[existingIndex], ...data };
                    return updated;
                } else {
                    return [data, ...currentLogs];
                }
            });
        });

        const cleanupUpload = window.electronAPI.onUploadComplete((data: ILogData) => {
            if (data.filePath && canceledLogsRef.current.has(data.filePath)) {
                return;
            }
            setLogs((currentLogs) => {
                const existingIndex = currentLogs.findIndex(log => log.filePath === data.filePath);
                if (existingIndex >= 0) {
                    const updated = [...currentLogs];
                    updated[existingIndex] = data;
                    return updated;
                } else {
                    return [data, ...currentLogs];
                }
            });
        });

        const cleanupScreenshot = window.electronAPI.onRequestScreenshot(async (data: ILogData) => {
            const logKey = data.id || data.filePath;
            console.log("Screenshot requested for:", logKey);
            if (!logKey) {
                console.error('Screenshot request missing log identifier.');
                return;
            }
            setScreenshotData({ ...data, id: logKey });

            const escapeSelector = (value: string) => {
                if (typeof window !== 'undefined' && (window as any).CSS?.escape) {
                    return (window as any).CSS.escape(value);
                }
                return value.replace(/"/g, '\\"');
            };

            const waitForNodes = async (selector: string, expectedCount: number, timeoutMs: number) => {
                const start = performance.now();
                while (performance.now() - start < timeoutMs) {
                    const nodes = Array.from(document.querySelectorAll(selector));
                    if (nodes.length >= expectedCount) {
                        return nodes;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
                return Array.from(document.querySelectorAll(selector));
            };

            const waitForNode = async (nodeId: string, timeoutMs: number) => {
                const start = performance.now();
                while (performance.now() - start < timeoutMs) {
                    const node = document.getElementById(nodeId);
                    if (node) return node;
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
                return document.getElementById(nodeId);
            };

            // Wait for render
            setTimeout(async () => {
                const mode = (data as any)?.mode || 'image';

                // Helper to prevent hanging calls
                const safeToPng = async (node: HTMLElement, options: any) => {
                    return Promise.race([
                        toPng(node, { ...options, cacheBust: false, skipAutoScale: true }),
                        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Screenshot generation timed out')), 5000))
                    ]);
                };

                if (mode === 'image-beta') {
                    const selector = `[data-screenshot-id="${escapeSelector(logKey)}"]`;
                    const expectedCount = (embedStatSettings.showSquadSummary ? 1 : 0)
                        + (embedStatSettings.showEnemySummary ? 1 : 0)
                        + (embedStatSettings.showIncomingStats ? 4 : 0)
                        + enabledTopListCount;
                    const nodes = await waitForNodes(selector, Math.max(1, expectedCount), 5000);
                    if (nodes.length === 0) {
                        console.error("Screenshot nodes not found, falling back to full card.");
                        const fallbackNode = await waitForNode(`log-screenshot-${logKey}`, 1500);
                        if (fallbackNode) {
                            try {
                                const dataUrl = await safeToPng(fallbackNode, {
                                    backgroundColor: '#0f172a',
                                    quality: 0.95,
                                    pixelRatio: 3
                                });
                                const buffer = dataUrlToUint8Array(dataUrl);
                                window.electronAPI.sendScreenshot(logKey, buffer);
                            } catch (err) {
                                console.error("Fallback screenshot failed:", err);
                                // Ensure we clean up even on error so UI doesn't hang
                                setScreenshotData(null);
                            }
                        } else {
                            // If everything fails, clean up
                            console.error("No fallback node found either.");
                            setScreenshotData(null);
                        }
                        return;
                    }
                    try {
                        const buffers: { group: string; buffer: Uint8Array }[] = [];
                        for (const node of nodes) {
                            const transparent = (node as HTMLElement).dataset.screenshotTransparent === 'true';
                            try {
                                const dataUrl = await safeToPng(node as HTMLElement, {
                                    backgroundColor: transparent ? 'rgba(0,0,0,0)' : '#0f172a',
                                    quality: 0.95,
                                    pixelRatio: 3,
                                    width: (node as HTMLElement).offsetWidth,
                                    height: (node as HTMLElement).offsetHeight
                                });
                                const buffer = dataUrlToUint8Array(dataUrl);
                                const group = (node as HTMLElement).dataset.screenshotGroup || 'default';
                                buffers.push({ group, buffer });
                            } catch (innerErr) {
                                console.error("Failed to screenshot a specific tile:", innerErr);
                                // Continue with other tiles if one fails
                            }
                        }

                        if (buffers.length === 0) {
                            throw new Error("No tiles were successfully captured");
                        }

                        const groups: Uint8Array[][] = [];
                        const incomingBuffers: Uint8Array[] = [];
                        let currentPair: Uint8Array[] = [];
                        let i = 0;
                        while (i < buffers.length) {
                            const entry = buffers[i];
                            if (entry.group === 'incoming') {
                                while (i < buffers.length && buffers[i].group === 'incoming') {
                                    incomingBuffers.push(buffers[i].buffer);
                                    i += 1;
                                }
                                if (currentPair.length > 0) {
                                    groups.push(currentPair);
                                    currentPair = [];
                                }
                                if (incomingBuffers.length > 0) {
                                    groups.push([...incomingBuffers]);
                                    incomingBuffers.length = 0;
                                }
                                continue;
                            }
                            currentPair.push(entry.buffer);
                            if (currentPair.length === 2) {
                                groups.push(currentPair);
                                currentPair = [];
                            }
                            i += 1;
                        }
                        if (currentPair.length > 0) {
                            groups.push(currentPair);
                        }
                        window.electronAPI.sendScreenshotsGroups(logKey, groups);
                        setScreenshotData(null);
                    } catch (err) {
                        console.error("Screenshot failed:", err);
                        setScreenshotData(null);
                    }
                } else {
                    const node = await waitForNode(`log-screenshot-${logKey}`, 2000);
                    if (node) {
                        try {
                            const dataUrl = await safeToPng(node, {
                                backgroundColor: '#0f172a', // Match bg-slate-900
                                quality: 0.95,
                                pixelRatio: 3 // Higher fidelity for Discord
                            });
                            const buffer = dataUrlToUint8Array(dataUrl);

                            window.electronAPI.sendScreenshot(logKey, buffer);
                            setScreenshotData(null); // Cleanup
                        } catch (err) {
                            console.error("Screenshot failed:", err);
                            setScreenshotData(null);
                        }
                    } else {
                        console.error("Screenshot node not found");
                        setScreenshotData(null);
                    }
                }
            }, 800);
        });

        return () => {
            cleanupStatus();
            cleanupUpload();
            cleanupScreenshot();
        };
    }, []);

    useEffect(() => {
        if (updateStatus) console.log('[Updater]', updateStatus);
    }, [updateStatus]);

    useEffect(() => {
        if (!filePickerOpen) return;
        loadLogFiles(logDirectory);
    }, [filePickerOpen, logDirectory]);

    useEffect(() => {
        const cleanupMessage = window.electronAPI.onUpdateMessage((message) => setUpdateStatus(message));
        const cleanupAvailable = window.electronAPI.onUpdateAvailable(() => {
            setUpdateAvailable(true);
            setUpdateStatus('Update available.');
        });
        const cleanupNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
            setUpdateStatus('App is up to date.');
            setTimeout(() => setUpdateStatus(''), 5000);
        });
        const cleanupError = window.electronAPI.onUpdateError((err) => {
            const errorMessage = err.message || (typeof err === 'string' ? err : 'Unknown update error');
            setUpdateStatus('Error: ' + errorMessage);
            setUpdateError(errorMessage);
            setShowUpdateErrorModal(true);
            setUpdateAvailable(false); // Reset so spinner stops
            setUpdateProgress(null);
        });
        const cleanupProgress = window.electronAPI.onDownloadProgress((progress) => {
            setUpdateProgress(progress);
        });
        const cleanupDownloaded = window.electronAPI.onUpdateDownloaded(() => {
            setUpdateStatus('Update downloaded. Ready to restart.');
            setUpdateDownloaded(true);
            setUpdateProgress(null);
        });

        return () => {
            cleanupMessage();
            cleanupAvailable();
            cleanupNotAvailable();
            cleanupError();
            cleanupProgress();
            cleanupDownloaded();
        };
    }, []);

    const handleSelectDirectory = async () => {
        const path = await window.electronAPI.selectDirectory();
        if (path) {
            setLogDirectory(path);
            window.electronAPI.startWatching(path);
        }
    };

    const loadLogFiles = async (dir: string | null) => {
        if (!dir) {
            setFilePickerAvailable([]);
            return;
        }
        if (!window.electronAPI.listLogFiles) {
            setFilePickerError('Log listing is unavailable in this build.');
            return;
        }
        setFilePickerLoading(true);
        setFilePickerError(null);
        try {
            const result = await window.electronAPI.listLogFiles({ dir });
            if (result?.success) {
                setFilePickerAvailable(result.files || []);
            } else {
                setFilePickerError(result?.error || 'Failed to load logs.');
            }
        } catch (err: any) {
            setFilePickerError(err?.message || 'Failed to load logs.');
        } finally {
            setFilePickerLoading(false);
        }
    };

    const handleAddSelectedFiles = () => {
        const files = Array.from(filePickerSelected);
        if (!files.length) {
            setFilePickerError('Select at least one log file.');
            return;
        }
        const optimisticLogs: ILogData[] = [];
        files.forEach((filePath) => {
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            optimisticLogs.push({
                id: fileName,
                filePath,
                status: 'queued',
                fightName: fileName,
                uploadTime: Date.now() / 1000,
                permalink: ''
            });
        });
        setLogs((currentLogs) => {
            const newLogs = [...currentLogs];
            optimisticLogs.forEach((optLog) => {
                if (!newLogs.some((l) => l.filePath === optLog.filePath)) {
                    newLogs.unshift(optLog);
                }
            });
            return newLogs;
        });
        window.electronAPI.manualUploadBatch(files);
        setFilePickerOpen(false);
        setFilePickerSelected(new Set());
        setFilePickerError(null);
    };

    const handleUpdateSettings = (updates: any) => {
        window.electronAPI.saveSettings(updates);
    };

    const handleWhatsNewClose = async () => {
        setWhatsNewOpen(false);
        if (whatsNewVersion) {
            await window.electronAPI.setLastSeenVersion(whatsNewVersion);
        }
    };

    return (
        <div className="h-screen w-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900 via-gray-900 to-black text-white font-sans overflow-hidden flex flex-col">
            {/* Custom Title Bar */}
            <div className="h-10 shrink-0 w-full flex justify-between items-center px-4 bg-black/20 backdrop-blur-md border-b border-white/5 drag-region select-none z-50">
                <div className="flex items-center gap-2">
                    <img src="./img/logo.svg" alt="Icon" className="w-4 h-4" />
                    <span className="text-xs font-medium text-gray-400">GW2 Arc Log Uploader</span>
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
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/20 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[100px] pointer-events-none" />

            <div className="relative z-10 max-w-5xl mx-auto p-8 flex-1 w-full flex flex-col min-h-0">
                <header className="flex justify-between items-center mb-10 shrink-0">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3"
                    >
                        <div className="p-2 bg-blue-500/20 rounded-lg backdrop-blur-sm border border-blue-500/30">
                            <UploadCloud className="w-10 h-10 text-blue-400" />
                        </div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                            GW2 Arc Log Uploader
                        </h1>
                    </motion.div>
                    <div className="flex items-center gap-3">
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
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-xs font-medium px-3 py-1 bg-white/5 rounded-full border border-white/10 cursor-pointer hover:bg-white/10 transition-colors"
                            onClick={() => window.electronAPI.checkForUpdates()}
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
                    </div>
                </header>

                {view === 'stats' ? (
                    <StatsView logs={logs} onBack={() => setView('dashboard')} mvpWeights={mvpWeights} disruptionMethod={disruptionMethod} />
                ) : view === 'settings' ? (
                    <SettingsView
                        onBack={() => setView('dashboard')}
                        onEmbedStatSettingsSaved={setEmbedStatSettings}
                        onMvpWeightsSaved={setMvpWeights}
                        onDisruptionMethodSaved={setDisruptionMethod}
                        onOpenWhatsNew={() => setWhatsNewOpen(true)}
                    />
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0 overflow-hidden">
                        <div className="space-y-6 overflow-y-auto pr-2">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl hover:border-white/20 transition-colors"
                            >
                                <h2 className="text-lg font-semibold mb-4 text-gray-200 flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-gray-400" />
                                    Configuration
                                </h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2 block">Log Directory</label>
                                        <div className="flex gap-2 w-full max-w-full">
                                            <div className="flex-1 min-w-0 bg-black/40 border border-white/5 rounded-xl p-2 flex items-center gap-3 hover:border-blue-500/50 transition-colors">
                                                <div className="pl-2 shrink-0">
                                                    <FolderOpen className="w-5 h-5 text-blue-400" />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={logDirectory || ''}
                                                    placeholder="C:\...\arcdps.cbtlogs"
                                                    className="flex-1 bg-transparent border-none text-sm text-gray-300 placeholder-gray-600 focus:ring-0 px-2 min-w-0 w-full"
                                                    onChange={(e) => setLogDirectory(e.target.value)}
                                                    onBlur={(e) => {
                                                        if (e.target.value) {
                                                            window.electronAPI.startWatching(e.target.value);
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && logDirectory) {
                                                            window.electronAPI.startWatching(logDirectory);
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <button
                                                onClick={handleSelectDirectory}
                                                className="shrink-0 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl px-4 flex items-center justify-center transition-colors"
                                                title="Browse..."
                                            >
                                                <FolderOpen className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2 block">Discord Webhook</label>
                                        <div className="flex gap-2">
                                            <div className="flex-1 min-w-0 bg-black/40 border border-white/5 rounded-xl p-2 flex items-center gap-2 hover:border-purple-500/50 transition-colors">
                                                <select
                                                    value={selectedWebhookId || ''}
                                                    onChange={(e) => {
                                                        const id = e.target.value || null;
                                                        setSelectedWebhookId(id);
                                                        handleUpdateSettings({ selectedWebhookId: id });
                                                    }}
                                                    className="flex-1 bg-transparent border-none text-sm text-gray-300 focus:ring-0 cursor-pointer appearance-none"
                                                >
                                                    <option value="" className="bg-gray-900">No webhook selected</option>
                                                    {webhooks.map(w => (
                                                        <option key={w.id} value={w.id} className="bg-gray-900">{w.name}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0 pointer-events-none" />
                                            </div>
                                            <button
                                                onClick={() => setWebhookModalOpen(true)}
                                                className="shrink-0 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl px-3 flex items-center justify-center gap-2 transition-colors"
                                                title="Manage Webhooks"
                                            >
                                                <Settings className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2 block">Notification Type</label>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        setNotificationType('image');
                                                        handleUpdateSettings({ discordNotificationType: 'image' });
                                                    }}
                                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border transition-all ${notificationType === 'image' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'}`}
                                                >
                                                    <ImageIcon className="w-4 h-4" />
                                                    <span className="text-sm font-medium">Image</span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setNotificationType('embed');
                                                        handleUpdateSettings({ discordNotificationType: 'embed' });
                                                    }}
                                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border transition-all ${notificationType === 'embed' ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'}`}
                                                >
                                                    <Layout className="w-4 h-4" />
                                                    <span className="text-sm font-medium">Embed</span>
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setNotificationType('image-beta');
                                                    handleUpdateSettings({ discordNotificationType: 'image-beta' });
                                                }}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border transition-all ${notificationType === 'image-beta' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'}`}
                                            >
                                                <Grid3X3 className="w-4 h-4" />
                                                <span className="text-sm font-medium">Tiled</span>
                                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                                    Beta
                                                </span>
                                            </button>
                                        </div>
                                    </div>
                                </div>


                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="grid grid-cols-2 gap-4"
                            >
                                <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                                    <div className="text-blue-200 text-xs font-medium mb-1 uppercase tracking-wider">Uploads</div>
                                    <div className="text-2xl font-bold text-white">{totalUploads}</div>
                                </div>
                                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                                    <div className="text-gray-400 text-xs font-medium mb-1 uppercase tracking-wider">Success Rate</div>
                                    <div className="text-2xl font-bold text-green-400">{successRate}%</div>
                                </div>
                                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                                    <div className="text-gray-400 text-xs font-medium mb-1 uppercase tracking-wider">Avg Squad</div>
                                    <div className="text-2xl font-bold text-green-400">{avgSquadSize}</div>
                                </div>
                                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                                    <div className="text-gray-400 text-xs font-medium mb-1 uppercase tracking-wider">Avg Enemies</div>
                                    <div className="text-2xl font-bold text-red-400">{avgEnemies}</div>
                                </div>
                            </motion.div>
                        </div>

                        <div className="lg:col-span-2 flex flex-col min-h-0">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className={`bg-white/5 backdrop-blur-xl border ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/10'} rounded-2xl p-6 flex flex-col h-full shadow-2xl transition-all duration-300 relative`}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'copy'; // Explicitly show copy cursor
                                    setIsDragging(true);
                                }}
                                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsDragging(false);
                                    const files = Array.from(e.dataTransfer.files);
                                    const validFiles: string[] = [];
                                    const optimisticLogs: ILogData[] = [];

                                    files.forEach(file => {
                                        // On some systems 'path' is a property of the File object in Electron
                                        const filePath = (file as any).path;
                                        if (filePath && (file.name.endsWith('.evtc') || file.name.endsWith('.zevtc'))) {
                                            validFiles.push(filePath);
                                            // Create optimistic entry
                                            optimisticLogs.push({
                                                id: file.name, // Temporary ID
                                                filePath: filePath,
                                                status: 'pending',
                                                fightName: file.name,
                                                uploadTime: Date.now() / 1000,
                                                permalink: '' // Placeholder
                                            });
                                        }
                                    });

                                    if (validFiles.length > 0) {
                                        // Immediately show these logs in the UI
                                        setLogs(currentLogs => {
                                            const newLogs = [...currentLogs];
                                            optimisticLogs.forEach(optLog => {
                                                if (!newLogs.some(l => l.filePath === optLog.filePath)) {
                                                    newLogs.unshift(optLog);
                                                }
                                            });
                                            return newLogs;
                                        });

                                        window.electronAPI.manualUploadBatch(validFiles);
                                    }
                                }}
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-gray-400" />
                                        Recent Activity
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setFilePickerOpen(true)}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                                            title="Select logs to upload"
                                        >
                                            <FilePlus2 className="w-3.5 h-3.5" />
                                            Add Logs
                                        </button>
                                        <button
                                            onClick={() => {
                                                setLogs([]);
                                                setExpandedLogId(null);
                                                setScreenshotData(null);
                                                canceledLogsRef.current.clear();
                                            }}
                                            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                                            title="Clear all logs"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            Clear Logs
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                                    <AnimatePresence mode='popLayout'>
                                        {logs.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-20">
                                                <UploadCloud className="w-12 h-12 mb-3" />
                                                <p>Drop logs to upload</p>
                                            </div>
                                        ) : (
                                            logs.map((log) => (
                                                <ExpandableLogCard
                                                    key={log.filePath}
                                                    log={log}
                                                    isExpanded={expandedLogId === log.filePath}
                                                    onToggle={() => setExpandedLogId(expandedLogId === log.filePath ? null : log.filePath)}
                                                    onCancel={() => {
                                                        if (!log.filePath) return;
                                                        canceledLogsRef.current.add(log.filePath);
                                                        setLogs((currentLogs) => currentLogs.filter((entry) => entry.filePath !== log.filePath));
                                                        if (expandedLogId === log.filePath) {
                                                            setExpandedLogId(null);
                                                        }
                                                    }}
                                                    embedStatSettings={embedStatSettings}
                                                    disruptionMethod={disruptionMethod}
                                                    useClassIcons={showClassIcons}
                                                />
                                            ))
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                )}
            </div>

            {/* Hidden Screenshot Container */}
            <div className="fixed top-0 left-0 pointer-events-none opacity-0 overflow-hidden z-[-9999]">
                {screenshotData && (screenshotData as any).mode === 'image-beta' ? (
                    <>
                        {embedStatSettings.showSquadSummary && (
                            <ExpandableLogCard
                                log={screenshotData}
                                isExpanded={true}
                                onToggle={() => { }}
                                screenshotMode={true}
                                screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'squad' }}
                                embedStatSettings={embedStatSettings}
                                disruptionMethod={disruptionMethod}
                                useClassIcons={showClassIcons}
                            />
                        )}
                        {embedStatSettings.showEnemySummary && (
                            <ExpandableLogCard
                                log={screenshotData}
                                isExpanded={true}
                                onToggle={() => { }}
                                screenshotMode={true}
                                screenshotSection={{ type: 'tile', tileKind: 'summary', tileId: 'enemy' }}
                                embedStatSettings={embedStatSettings}
                                disruptionMethod={disruptionMethod}
                                useClassIcons={showClassIcons}
                            />
                        )}
                        {embedStatSettings.showIncomingStats && (
                            <>
                                <ExpandableLogCard
                                    log={screenshotData}
                                    isExpanded={true}
                                    onToggle={() => { }}
                                    screenshotMode={true}
                                    screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-attacks' }}
                                    embedStatSettings={embedStatSettings}
                                    disruptionMethod={disruptionMethod}
                                    useClassIcons={showClassIcons}
                                />
                                <ExpandableLogCard
                                    log={screenshotData}
                                    isExpanded={true}
                                    onToggle={() => { }}
                                    screenshotMode={true}
                                    screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-cc' }}
                                    embedStatSettings={embedStatSettings}
                                    disruptionMethod={disruptionMethod}
                                    useClassIcons={showClassIcons}
                                />
                                <ExpandableLogCard
                                    log={screenshotData}
                                    isExpanded={true}
                                    onToggle={() => { }}
                                    screenshotMode={true}
                                    screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-strips' }}
                                    embedStatSettings={embedStatSettings}
                                    disruptionMethod={disruptionMethod}
                                    useClassIcons={showClassIcons}
                                />
                                <ExpandableLogCard
                                    log={screenshotData}
                                    isExpanded={true}
                                    onToggle={() => { }}
                                    screenshotMode={true}
                                    screenshotSection={{ type: 'tile', tileKind: 'incoming', tileId: 'incoming-blank' }}
                                    embedStatSettings={embedStatSettings}
                                    disruptionMethod={disruptionMethod}
                                    useClassIcons={showClassIcons}
                                />
                            </>
                        )}
                        {Array.from({ length: enabledTopListCount }, (_, index) => (
                            <ExpandableLogCard
                                key={`toplist-tile-${index}`}
                                log={screenshotData}
                                isExpanded={true}
                                onToggle={() => { }}
                                screenshotMode={true}
                                screenshotSection={{ type: 'tile', tileKind: 'toplist', tileIndex: index }}
                                embedStatSettings={embedStatSettings}
                                disruptionMethod={disruptionMethod}
                                useClassIcons={showClassIcons}
                            />
                        ))}
                        <ExpandableLogCard
                            log={screenshotData}
                            isExpanded={true}
                            onToggle={() => { }}
                            screenshotMode={true}
                            embedStatSettings={embedStatSettings}
                            disruptionMethod={disruptionMethod}
                            useClassIcons={showClassIcons}
                        />
                    </>
                ) : (
                    screenshotData && (
                        <ExpandableLogCard
                            log={screenshotData}
                            isExpanded={true}
                            onToggle={() => { }}
                            screenshotMode={true}
                            embedStatSettings={embedStatSettings}
                            disruptionMethod={disruptionMethod}
                            useClassIcons={showClassIcons}
                        />
                    )
                )}
            </div>

            <AnimatePresence>
                {filePickerOpen && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="w-full max-w-2xl bg-[#101826]/90 border border-white/10 rounded-2xl shadow-2xl p-6"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <div className="text-xs uppercase tracking-widest text-cyan-200/70">Log Import</div>
                                    <h3 className="text-xl font-semibold text-white">Select Logs to Upload</h3>
                                </div>
                                <button
                                    onClick={() => {
                                        setFilePickerOpen(false);
                                        setFilePickerError(null);
                                        setFilePickerSelected(new Set());
                                    }}
                                    className="p-2 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-white/30"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 relative">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-xs uppercase tracking-widest text-gray-500">Available Logs</div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => loadLogFiles(logDirectory)}
                                                className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                            >
                                                Refresh
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (filePickerSelected.size > 0) {
                                                        setFilePickerSelected(new Set());
                                                        return;
                                                    }
                                                    setSelectSinceOpen((prev) => {
                                                        const next = !prev;
                                                        if (next) {
                                                            const now = new Date();
                                                            setSelectSinceView(new Date(now.getFullYear(), now.getMonth(), 1));
                                                            setSelectSinceDate((current) => current ?? new Date(now.getFullYear(), now.getMonth(), now.getDate()));
                                                            const hour24 = now.getHours();
                                                            const meridiem = hour24 >= 12 ? 'PM' : 'AM';
                                                            const hour12 = hour24 % 12 || 12;
                                                            setSelectSinceHour(hour12);
                                                            setSelectSinceMinute(now.getMinutes());
                                                            setSelectSinceMeridiem(meridiem);
                                                            setSelectSinceMonthOpen(false);
                                                        }
                                                        return next;
                                                    });
                                                }}
                                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filePickerSelected.size > 0
                                                    ? 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                    : 'bg-cyan-600/20 text-cyan-200 border-cyan-500/40 hover:bg-cyan-600/30'
                                                    }`}
                                            >
                                                {filePickerSelected.size > 0 ? 'Clear Selection' : 'Select Since'}
                                            </button>
                                        </div>
                                    </div>
                                    <AnimatePresence>
                                        {selectSinceOpen && filePickerSelected.size === 0 && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                                transition={{ duration: 0.18, ease: 'easeOut' }}
                                                className="absolute z-20 left-4 right-4 top-[56px] rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md shadow-2xl shadow-black/40"
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="text-xs uppercase tracking-widest text-gray-400">Select Since</div>
                                                    <div className="text-[10px] text-gray-500">
                                                        {selectSinceDate
                                                            ? `${selectSinceDate.toLocaleDateString()} • ${selectSinceHour.toString().padStart(2, '0')}:${selectSinceMinute.toString().padStart(2, '0')} ${selectSinceMeridiem}`
                                                            : 'Pick a date'}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
                                                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <button
                                                                onClick={() => setSelectSinceView((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                                                className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                aria-label="Previous month"
                                                            >
                                                                <ChevronLeft className="w-3.5 h-3.5" />
                                                            </button>
                                                            <div className="relative">
                                                                <button
                                                                    onClick={() => setSelectSinceMonthOpen((prev) => !prev)}
                                                                    className="text-sm font-semibold text-gray-200 hover:text-white"
                                                                >
                                                                    {selectSinceView.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                                                                </button>
                                                                <AnimatePresence>
                                                                    {selectSinceMonthOpen && (
                                                                        <motion.div
                                                                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                                                            transition={{ duration: 0.14, ease: 'easeOut' }}
                                                                            className="absolute z-10 mt-2 w-44 rounded-xl border border-white/10 bg-slate-900/90 backdrop-blur-md shadow-2xl p-2"
                                                                        >
                                                                            <div className="flex items-center justify-between mb-2">
                                                                                <button
                                                                                    onClick={() => setSelectSinceView((prev) => new Date(prev.getFullYear() - 1, prev.getMonth(), 1))}
                                                                                    className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                                    aria-label="Previous year"
                                                                                >
                                                                                    <ChevronLeft className="w-3 h-3" />
                                                                                </button>
                                                                                <div className="text-[11px] text-gray-300">
                                                                                    {selectSinceView.getFullYear()}
                                                                                </div>
                                                                                <button
                                                                                    onClick={() => setSelectSinceView((prev) => new Date(prev.getFullYear() + 1, prev.getMonth(), 1))}
                                                                                    className="h-5 w-5 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                                    aria-label="Next year"
                                                                                >
                                                                                    <ChevronRight className="w-3 h-3" />
                                                                                </button>
                                                                            </div>
                                                                            <div className="grid grid-cols-3 gap-1">
                                                                                {Array.from({ length: 12 }, (_, i) => (
                                                                                    <button
                                                                                        key={`month-${i}`}
                                                                                        onClick={() => {
                                                                                            setSelectSinceView((prev) => new Date(prev.getFullYear(), i, 1));
                                                                                            setSelectSinceMonthOpen(false);
                                                                                        }}
                                                                                        className={`px-2 py-1 rounded-full text-[10px] border transition-colors ${selectSinceView.getMonth() === i
                                                                                            ? 'bg-cyan-500/30 text-cyan-100 border-cyan-400/50'
                                                                                            : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                                            }`}
                                                                                    >
                                                                                        {new Date(2000, i, 1).toLocaleString(undefined, { month: 'short' })}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                            <button
                                                                onClick={() => setSelectSinceView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                                                className="h-6 w-6 rounded-full border border-white/10 bg-black/30 text-gray-300 hover:text-white hover:border-white/30 transition-colors focus:outline-none focus:ring-0 flex items-center justify-center"
                                                                aria-label="Next month"
                                                            >
                                                                <ChevronRight className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-500 mb-2">
                                                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day) => (
                                                                <div key={day} className="text-center">{day}</div>
                                                            ))}
                                                        </div>
                                                        {(() => {
                                                            const year = selectSinceView.getFullYear();
                                                            const month = selectSinceView.getMonth();
                                                            const firstDay = new Date(year, month, 1).getDay();
                                                            const daysInMonth = new Date(year, month + 1, 0).getDate();
                                                            const cells = Array.from({ length: firstDay + daysInMonth }, (_, idx) => idx);
                                                            return (
                                                                <div className="grid grid-cols-7 gap-1 text-xs">
                                                                    {cells.map((idx) => {
                                                                        if (idx < firstDay) {
                                                                            return <div key={`pad-${idx}`} />;
                                                                        }
                                                                        const day = idx - firstDay + 1;
                                                                        const isSelected = selectSinceDate
                                                                            && selectSinceDate.getFullYear() === year
                                                                            && selectSinceDate.getMonth() === month
                                                                            && selectSinceDate.getDate() === day;
                                                                        return (
                                                                            <button
                                                                                key={`day-${day}`}
                                                                                onClick={() => setSelectSinceDate(new Date(year, month, day))}
                                                                                className={`h-7 w-7 rounded-full mx-auto flex items-center justify-center transition-colors ${isSelected
                                                                                    ? 'bg-cyan-500/30 text-cyan-100 border border-cyan-400/50'
                                                                                    : 'text-gray-200 hover:bg-white/10'
                                                                                    }`}
                                                                            >
                                                                                {day}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                                                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Time</div>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            <div>
                                                                <div className="text-[10px] text-gray-400 mb-1">Hour</div>
                                                                <div className="h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                                                                    {Array.from({ length: 12 }, (_, i) => i + 1).map((hour) => (
                                                                        <button
                                                                            key={`hour-${hour}`}
                                                                            onClick={() => setSelectSinceHour(hour)}
                                                                            className={`w-full py-1 text-[10px] border-b border-white/5 last:border-0 transition-colors ${selectSinceHour === hour
                                                                                ? 'bg-cyan-500/30 text-cyan-100'
                                                                                : 'text-gray-300 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {hour.toString().padStart(2, '0')}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] text-gray-400 mb-1">Minute</div>
                                                                <div className="h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                                                                    {Array.from({ length: 60 }, (_, i) => i).map((minute) => (
                                                                        <button
                                                                            key={`minute-${minute}`}
                                                                            onClick={() => setSelectSinceMinute(minute)}
                                                                            className={`w-full py-1 text-[10px] border-b border-white/5 last:border-0 transition-colors ${selectSinceMinute === minute
                                                                                ? 'bg-cyan-500/30 text-cyan-100'
                                                                                : 'text-gray-300 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {minute.toString().padStart(2, '0')}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <div className="text-[10px] text-gray-400 mb-1">AM/PM</div>
                                                                <div className="h-32 overflow-y-auto rounded-lg border border-white/10 bg-white/5">
                                                                    {(['AM', 'PM'] as const).map((period) => (
                                                                        <button
                                                                            key={period}
                                                                            onClick={() => setSelectSinceMeridiem(period)}
                                                                            className={`w-full py-2 text-[10px] border-b border-white/5 last:border-0 transition-colors ${selectSinceMeridiem === period
                                                                                ? 'bg-cyan-500/30 text-cyan-100'
                                                                                : 'text-gray-300 hover:text-white'
                                                                                }`}
                                                                        >
                                                                            {period}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            if (!selectSinceDate) return;
                                                            const base = new Date(
                                                                selectSinceDate.getFullYear(),
                                                                selectSinceDate.getMonth(),
                                                                selectSinceDate.getDate()
                                                            );
                                                            let hour24 = selectSinceHour % 12;
                                                            if (selectSinceMeridiem === 'PM') {
                                                                hour24 += 12;
                                                            }
                                                            base.setHours(hour24, selectSinceMinute, 0, 0);
                                                            const sinceMs = base.getTime();
                                                            if (!Number.isFinite(sinceMs)) return;
                                                            const matching = filePickerAvailable.filter((entry) => {
                                                                if (!Number.isFinite(entry.mtimeMs)) return false;
                                                                return entry.mtimeMs >= sinceMs;
                                                            });
                                                            setFilePickerSelected((prev) => {
                                                                const next = new Set(prev);
                                                                matching.forEach((entry) => next.add(entry.path));
                                                                return next;
                                                            });
                                                            setSelectSinceOpen(false);
                                                        }}
                                                        className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-cyan-600/20 text-cyan-200 border-cyan-500/40 hover:bg-cyan-600/30"
                                                    >
                                                        Apply
                                                    </button>
                                                    <button
                                                        onClick={() => setSelectSinceOpen(false)}
                                                        className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    <input
                                        type="search"
                                        value={filePickerFilter}
                                        onChange={(event) => setFilePickerFilter(event.target.value)}
                                        placeholder="Filter logs..."
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                                    />
                                    {filePickerLoading ? (
                                        <div className="text-xs text-gray-500">Loading logs...</div>
                                    ) : filePickerAvailable.length === 0 ? (
                                        <div className="text-xs text-gray-500">No logs found in this folder.</div>
                                    ) : (
                                        <div className="max-h-56 overflow-y-auto space-y-1 pr-1 text-xs text-gray-300">
                                            {filePickerAvailable
                                                .filter((entry) => entry.name.toLowerCase().includes(filePickerFilter.trim().toLowerCase()))
                                                .map((entry, index, filtered) => {
                                                    const timestamp = Number.isFinite(entry.mtimeMs)
                                                        ? new Date(entry.mtimeMs).toLocaleString(undefined, {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: '2-digit',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })
                                                        : null;
                                                    return (
                                                        <div
                                                        key={entry.path}
                                                        className={`flex items-center gap-2 px-2 py-1 rounded-lg border cursor-pointer select-none ${filePickerSelected.has(entry.path)
                                                            ? 'bg-cyan-500/10 border-cyan-400/40 text-cyan-100'
                                                            : 'bg-white/5 border-white/10 text-gray-300 hover:text-white'
                                                            }`}
                                                        onClick={(event) => {
                                                            if (event.shiftKey && lastPickedIndexRef.current !== null) {
                                                                const start = Math.min(lastPickedIndexRef.current, index);
                                                                const end = Math.max(lastPickedIndexRef.current, index);
                                                                setFilePickerSelected((prev) => {
                                                                    const next = new Set(prev);
                                                                    for (let i = start; i <= end; i += 1) {
                                                                        next.add(filtered[i].path);
                                                                    }
                                                                    return next;
                                                                });
                                                            } else {
                                                                setFilePickerSelected((prev) => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(entry.path)) {
                                                                        next.delete(entry.path);
                                                                    } else {
                                                                        next.add(entry.path);
                                                                    }
                                                                    return next;
                                                                });
                                                            }
                                                            lastPickedIndexRef.current = index;
                                                        }}
                                                    >
                                                        <div className="h-3.5 w-3.5 rounded border border-white/20 flex items-center justify-center">
                                                            {filePickerSelected.has(entry.path) && (
                                                                <div className="h-2 w-2 rounded-sm bg-cyan-300" />
                                                            )}
                                                        </div>
                                                        <span className="truncate flex-1">{entry.name}</span>
                                                        {timestamp && (
                                                            <span className="text-[10px] text-gray-500/80 font-medium whitespace-nowrap">
                                                                {timestamp}
                                                            </span>
                                                        )}
                                                    </div>
                                                    );
                                                })}
                                        </div>
                                    )}
                                </div>

                                {filePickerError && (
                                    <div className="text-xs text-rose-300">{filePickerError}</div>
                                )}

                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        onClick={() => {
                                            setFilePickerOpen(false);
                                            setFilePickerError(null);
                                            setFilePickerSelected(new Set());
                                        }}
                                        className="px-4 py-2 rounded-lg text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleAddSelectedFiles}
                                        className="px-4 py-2 rounded-lg text-xs font-semibold border bg-emerald-500/20 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/30"
                                    >
                                        Add to Recent Activity ({filePickerSelected.size})
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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

            {/* Terminal */}
            <Terminal isOpen={showTerminal} onClose={() => setShowTerminal(false)} />
        </div >
    );
}

export default App;
