import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, UploadCloud, FileText, Settings, Minus, Square, X, Image as ImageIcon, Layout, RefreshCw, Trophy, ChevronDown } from 'lucide-react';
import { toPng } from 'html-to-image';
import { ExpandableLogCard } from './ExpandableLogCard';
import { StatsView } from './StatsView';
import { WebhookModal, Webhook } from './WebhookModal';

function App() {
    const [logDirectory, setLogDirectory] = useState<string | null>(null);
    const [notificationType, setNotificationType] = useState<'image' | 'embed'>('image');
    const [logs, setLogs] = useState<ILogData[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    const [screenshotData, setScreenshotData] = useState<ILogData | null>(null);

    // Updater State
    const [updateStatus, setUpdateStatus] = useState<string>('');
    const [updateProgress, setUpdateProgress] = useState<any>(null);
    const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
    const [updateDownloaded, setUpdateDownloaded] = useState<boolean>(false);

    // View State
    const [view, setView] = useState<'dashboard' | 'stats'>('dashboard');

    // App Version
    const [appVersion, setAppVersion] = useState<string>('...');

    // Webhook Management
    const [webhooks, setWebhooks] = useState<Webhook[]>([]);
    const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
    const [webhookModalOpen, setWebhookModalOpen] = useState(false);

    // Persistence removed


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

            // Load app version
            const version = await window.electronAPI.getAppVersion();
            setAppVersion(version);
        };
        loadSettings();

        // Listen for status updates during upload process
        const cleanupStatus = window.electronAPI.onUploadStatus((data: ILogData) => {
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
            console.log("Screenshot requested for:", data.id);
            setScreenshotData(data);

            // Wait for render
            setTimeout(async () => {
                const node = document.getElementById(`log-screenshot-${data.id || data.filePath}`);
                if (node) {
                    try {
                        const dataUrl = await toPng(node, {
                            backgroundColor: '#0f172a', // Match bg-slate-900
                            quality: 0.95,
                            pixelRatio: 2 // High quality
                        });

                        // Convert dataUrl to Uint8Array
                        const resp = await fetch(dataUrl);
                        const blob = await resp.blob();
                        const arrayBuffer = await blob.arrayBuffer();
                        const buffer = new Uint8Array(arrayBuffer);

                        window.electronAPI.sendScreenshot(data.id, buffer);
                        setScreenshotData(null); // Cleanup
                    } catch (err) {
                        console.error("Screenshot failed:", err);
                        setScreenshotData(null);
                    }
                } else {
                    console.error("Screenshot node not found");
                    setScreenshotData(null);
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
        const cleanupMessage = window.electronAPI.onUpdateMessage((message) => setUpdateStatus(message));
        const cleanupAvailable = window.electronAPI.onUpdateAvailable(() => {
            setUpdateAvailable(true);
            setUpdateStatus('Update available. Downloading...');
        });
        const cleanupNotAvailable = window.electronAPI.onUpdateNotAvailable(() => {
            setUpdateStatus('App is up to date.');
            setTimeout(() => setUpdateStatus(''), 5000);
        });
        const cleanupError = window.electronAPI.onUpdateError((err) => {
            setUpdateStatus('Error: ' + (err.message || err));
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

    const handleUpdateSettings = (updates: any) => {
        window.electronAPI.saveSettings(updates);
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
                            {(updateAvailable || updateDownloaded) && (
                                <motion.div
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
                            )}
                        </AnimatePresence>
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="text-xs font-medium px-3 py-1 bg-white/5 rounded-full border border-white/10"
                        >
                            v{appVersion}
                        </motion.div>
                        <button
                            onClick={() => setView(view === 'dashboard' ? 'stats' : 'dashboard')}
                            className={`p-2 rounded-xl transition-all ${view === 'stats' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'}`}
                            title="View Stats"
                        >
                            <Trophy className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                {view === 'stats' ? (
                    <StatsView logs={logs} onBack={() => setView('dashboard')} />
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
                                    <div className="text-2xl font-bold text-gray-200">{avgSquadSize}</div>
                                </div>
                                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                                    <div className="text-gray-400 text-xs font-medium mb-1 uppercase tracking-wider">Avg Enemies</div>
                                    <div className="text-2xl font-bold text-gray-200">{avgEnemies}</div>
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
                                                status: 'uploading',
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
                                <h2 className="text-lg font-semibold mb-6 text-gray-200 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-gray-400" />
                                    Recent Activity
                                </h2>

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
            <div className="fixed top-[-9999px] left-[-9999px] pointer-events-none opacity-0 overflow-hidden">
                {screenshotData && (
                    <ExpandableLogCard
                        log={screenshotData}
                        isExpanded={true}
                        onToggle={() => { }}
                        screenshotMode={true}
                    />
                )}
            </div>

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
        </div >
    );
}

export default App;
