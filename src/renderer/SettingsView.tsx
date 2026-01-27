import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Key, X as CloseIcon, Minimize, BarChart3, Users, Sparkles, Cloud, Link as LinkIcon, RefreshCw, Plus, Trash2, ExternalLink } from 'lucide-react';
import { IEmbedStatSettings, DEFAULT_EMBED_STATS, DEFAULT_MVP_WEIGHTS, IMvpWeights } from './global.d';
import { DEFAULT_WEB_THEME_ID, WEB_THEMES } from '../shared/webThemes';

interface SettingsViewProps {
    onBack: () => void;
    onEmbedStatSettingsSaved?: (settings: IEmbedStatSettings) => void;
    onOpenWhatsNew?: () => void;
    onMvpWeightsSaved?: (weights: IMvpWeights) => void;
}

// Toggle switch component
function Toggle({ enabled, onChange, label, description }: {
    enabled: boolean;
    onChange: (value: boolean) => void;
    label: string;
    description?: string;
}) {
    return (
        <div
            className="flex items-center justify-between py-3 cursor-pointer group"
            onClick={() => onChange(!enabled)}
        >
            <div className="flex-1">
                <div className="text-sm font-medium text-gray-200 group-hover:text-white transition-colors">
                    {label}
                </div>
                {description && (
                    <div className="text-xs text-gray-500 mt-0.5">{description}</div>
                )}
            </div>
            <div
                className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-500' : 'bg-gray-700'
                    }`}
            >
                <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                />
            </div>
        </div>
    );
}

// Section component for grouping settings
function SettingsSection({ title, icon: Icon, children, delay = 0, action }: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    delay?: number;
    action?: React.ReactNode;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl"
        >
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                        <Icon className="w-5 h-5 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
                </div>
                {action}
            </div>
            {children}
        </motion.div>
    );
}

export function SettingsView({ onBack, onEmbedStatSettingsSaved, onOpenWhatsNew, onMvpWeightsSaved }: SettingsViewProps) {
    const [dpsReportToken, setDpsReportToken] = useState<string>('');
    const [closeBehavior, setCloseBehavior] = useState<'minimize' | 'quit'>('minimize');
    const [embedStats, setEmbedStats] = useState<IEmbedStatSettings>(DEFAULT_EMBED_STATS);
    const [mvpWeights, setMvpWeights] = useState<IMvpWeights>(DEFAULT_MVP_WEIGHTS);
    const [githubRepoName, setGithubRepoName] = useState('');
    const [githubBranch, setGithubBranch] = useState('main');
    const [githubPagesBaseUrl, setGithubPagesBaseUrl] = useState('');
    const [githubToken, setGithubToken] = useState('');
    const [githubWebTheme, setGithubWebTheme] = useState(DEFAULT_WEB_THEME_ID);
    const [githubAuthStatus, setGithubAuthStatus] = useState<'idle' | 'pending' | 'connected' | 'error'>('idle');
    const [githubAuthMessage, setGithubAuthMessage] = useState<string | null>(null);
    const [githubUserCode, setGithubUserCode] = useState<string | null>(null);
    const [githubVerificationUri, setGithubVerificationUri] = useState<string | null>(null);
    const [githubRepos, setGithubRepos] = useState<Array<{ full_name: string; name: string; owner: string }>>([]);
    const [githubRepoSearch, setGithubRepoSearch] = useState('');
    const [githubRepoMode, setGithubRepoMode] = useState<'select' | 'create'>('select');
    const [loadingRepos, setLoadingRepos] = useState(false);
    const [githubRepoError, setGithubRepoError] = useState<string | null>(null);
    const [creatingRepo, setCreatingRepo] = useState(false);
    const [githubRepoStatus, setGithubRepoStatus] = useState<string | null>(null);
    const [githubManageOpen, setGithubManageOpen] = useState(false);
    const [githubReports, setGithubReports] = useState<any[]>([]);
    const [githubReportsLoading, setGithubReportsLoading] = useState(false);
    const [githubReportsError, setGithubReportsError] = useState<string | null>(null);
    const [githubReportsSelected, setGithubReportsSelected] = useState<Set<string>>(new Set());
    const [githubReportsDeleting, setGithubReportsDeleting] = useState(false);
    const [githubReportsStatus, setGithubReportsStatus] = useState<string | null>(null);
    const [githubRepoStatusKind, setGithubRepoStatusKind] = useState<'idle' | 'success' | 'error' | 'pending'>('idle');
    const [isSaving, setIsSaving] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [showSaved, setShowSaved] = useState(false);
    const orderedThemes = useMemo(() => {
        const active = WEB_THEMES.find((theme) => theme.id === githubWebTheme);
        if (!active) return WEB_THEMES;
        return [active, ...WEB_THEMES.filter((theme) => theme.id !== githubWebTheme)];
    }, [githubWebTheme]);

    useEffect(() => {
        const loadSettings = async () => {
            if (!window.electronAPI?.getSettings) {
                setHasLoaded(true);
                return;
            }
            const settings = await window.electronAPI.getSettings();
            setDpsReportToken(settings.dpsReportToken || '');
            setCloseBehavior(settings.closeBehavior || 'minimize');
            setEmbedStats({ ...DEFAULT_EMBED_STATS, ...(settings.embedStatSettings || {}) });
            setMvpWeights({ ...DEFAULT_MVP_WEIGHTS, ...(settings.mvpWeights || {}) });
            setGithubRepoName(settings.githubRepoName || '');
            setGithubBranch(settings.githubBranch || 'main');
            setGithubPagesBaseUrl(settings.githubPagesBaseUrl || '');
            setGithubToken(settings.githubToken || '');
            setGithubWebTheme(settings.githubWebTheme || DEFAULT_WEB_THEME_ID);
            if (settings.githubToken) {
                setGithubAuthStatus('connected');
            }
            setHasLoaded(true);
        };
        loadSettings();
    }, []);

    const saveSettings = () => {
        setIsSaving(true);
        setShowSaved(false);
        window.electronAPI?.saveSettings?.({
            dpsReportToken: dpsReportToken || null,
            closeBehavior,
            embedStatSettings: embedStats,
            mvpWeights: mvpWeights,
            githubRepoName: githubRepoName || null,
            githubBranch: githubBranch || 'main',
            githubPagesBaseUrl: githubPagesBaseUrl || null,
            githubToken: githubToken || null,
            githubWebTheme: githubWebTheme || DEFAULT_WEB_THEME_ID
        });
        onEmbedStatSettingsSaved?.(embedStats);
        onMvpWeightsSaved?.(mvpWeights);

        setTimeout(() => {
            setIsSaving(false);
            setShowSaved(true);
            setTimeout(() => setShowSaved(false), 1200);
        }, 500);
    };

    useEffect(() => {
        if (!hasLoaded) return;
        const timeout = setTimeout(() => {
            saveSettings();
        }, 300);
        return () => clearTimeout(timeout);
    }, [
        dpsReportToken,
        closeBehavior,
        embedStats,
        mvpWeights,
        githubRepoName,
        githubBranch,
        githubPagesBaseUrl,
        githubToken,
        githubWebTheme,
        hasLoaded
    ]);

    useEffect(() => {
        if (!window.electronAPI?.onGithubAuthComplete) return;
        const unsubscribe = window.electronAPI.onGithubAuthComplete((data) => {
            if (data?.success) {
                setGithubToken(data.token || '');
                setGithubAuthStatus('connected');
                setGithubAuthMessage('Connected to GitHub.');
                setTimeout(() => {
                    setGithubUserCode(null);
                    setGithubVerificationUri(null);
                }, 1200);
            } else {
                setGithubAuthStatus('error');
                setGithubAuthMessage(data?.error || 'GitHub authentication failed.');
            }
            setTimeout(() => setGithubAuthMessage(null), 3000);
        });
        return unsubscribe;
    }, []);

    const refreshGithubRepos = async () => {
        if (!window.electronAPI?.getGithubRepos) return;
        setLoadingRepos(true);
        const result = await window.electronAPI.getGithubRepos();
        if (result?.success && result.repos) {
            setGithubRepos(result.repos);
        }
        setLoadingRepos(false);
    };

    const loadGithubReports = async () => {
        if (!window.electronAPI?.getGithubReports) return;
        setGithubReportsLoading(true);
        setGithubReportsError(null);
        setGithubReportsStatus(null);
        try {
            const result = await window.electronAPI.getGithubReports();
            if (result?.success) {
                setGithubReports(Array.isArray(result.reports) ? result.reports : []);
            } else {
                setGithubReportsError(result?.error || 'Failed to load reports.');
            }
        } catch (err: any) {
            setGithubReportsError(err?.message || 'Failed to load reports.');
        } finally {
            setGithubReportsLoading(false);
        }
    };

    const toggleReportSelection = (id: string) => {
        setGithubReportsSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleDeleteSelectedReports = async () => {
        if (!window.electronAPI?.deleteGithubReports) return;
        const ids = Array.from(githubReportsSelected);
        if (ids.length === 0) return;
        const confirmed = window.confirm(`Delete ${ids.length} report${ids.length === 1 ? '' : 's'} from GitHub Pages? This cannot be undone.`);
        if (!confirmed) return;
        setGithubReportsDeleting(true);
        setGithubReportsStatus(null);
        try {
            const result = await window.electronAPI.deleteGithubReports({ ids });
            if (result?.success) {
                setGithubReports((prev) => prev.filter((report) => !ids.includes(report?.id)));
                setGithubReportsSelected(new Set());
                setGithubReportsStatus(`Deleted ${ids.length} report${ids.length === 1 ? '' : 's'}.`);
            } else {
                setGithubReportsError(result?.error || 'Failed to delete reports.');
            }
        } catch (err: any) {
            setGithubReportsError(err?.message || 'Failed to delete reports.');
        } finally {
            setGithubReportsDeleting(false);
        }
    };


    const handleCreateGithubRepo = async () => {
        if (!window.electronAPI?.createGithubRepo) return;
        if (githubAuthStatus !== 'connected') {
            setGithubRepoError('Connect GitHub first.');
            return;
        }
        const error = validateRepoName(githubRepoName);
        if (error) {
            setGithubRepoError(error);
            return;
        }
        setCreatingRepo(true);
        setGithubRepoStatusKind('pending');
        setGithubRepoStatus('Creating repository...');
        const result = await window.electronAPI.createGithubRepo({ name: githubRepoName, branch: githubBranch });
        if (result?.success && result.repo) {
            setGithubRepoError(null);
            setGithubRepoMode('select');
            setGithubPagesBaseUrl(result.repo.pagesUrl || githubPagesBaseUrl);
            await refreshGithubRepos();
            setGithubRepoStatusKind('success');
            setGithubRepoStatus(`Created ${result.repo.full_name}`);
        } else {
            const message = result?.error || 'Failed to create repository.';
            setGithubRepoError(message);
            setGithubRepoStatusKind('error');
            setGithubRepoStatus(message);
        }
        setCreatingRepo(false);
        setTimeout(() => {
            setGithubRepoStatus(null);
            setGithubRepoStatusKind('idle');
        }, 3000);
    };

    useEffect(() => {
        if (githubAuthStatus === 'connected') {
            refreshGithubRepos();
        }
    }, [githubAuthStatus]);

    const validateRepoName = (value: string) => {
        if (!value) return 'Repository name is required.';
        if (!/^[A-Za-z0-9._-]+$/.test(value)) return 'Use letters, numbers, ., _, or - only.';
        if (value.startsWith('.') || value.endsWith('.')) return 'Name cannot start or end with a dot.';
        if (value.endsWith('.git')) return 'Name cannot end with .git.';
        return null;
    };

    const updateEmbedStat = (key: keyof IEmbedStatSettings, value: boolean) => {
        setEmbedStats(prev => ({ ...prev, [key]: value }));
    };

    const updateMaxTopRows = (value: number) => {
        const clamped = Math.min(10, Math.max(1, Math.floor(value)));
        setEmbedStats(prev => ({ ...prev, maxTopListRows: clamped }));
    };

    const updateMvpWeight = (key: keyof IMvpWeights, value: number) => {
        const clamped = Math.min(1, Math.max(0, Math.round(value / 0.05) * 0.05));
        setMvpWeights(prev => ({ ...prev, [key]: clamped }));
    };

    const formatWeight = (value: number) => value.toFixed(2);

    const updateClassDisplay = (value: IEmbedStatSettings['classDisplay']) => {
        setEmbedStats(prev => ({ ...prev, classDisplay: value }));
    };

    const handleGithubConnect = async () => {
        if (!window.electronAPI?.startGithubOAuth) {
            setGithubAuthStatus('error');
            setGithubAuthMessage('GitHub OAuth is unavailable.');
            return;
        }
        setGithubAuthStatus('pending');
        setGithubAuthMessage('Waiting for GitHub authorization...');
        const result = await window.electronAPI.startGithubOAuth();
        if (!result?.success) {
            setGithubAuthStatus('error');
            setGithubAuthMessage(result?.error || 'Failed to start GitHub OAuth.');
            return;
        }
        setGithubUserCode(result.userCode || null);
        setGithubVerificationUri(result.verificationUri || null);
        if (result.verificationUri) {
            window.electronAPI?.openExternal?.(result.verificationUri);
        }
    };

    // Helper to enable/disable all stats in a category
    const setAllTopLists = (enabled: boolean) => {
        setEmbedStats(prev => ({
            ...prev,
            showDamage: enabled,
            showDownContribution: enabled,
            showHealing: enabled,
            showBarrier: enabled,
            showCleanses: enabled,
            showBoonStrips: enabled,
            showCC: enabled,
            showStability: enabled,
            showResurrects: enabled,
            showDistanceToTag: enabled,
            showKills: enabled,
            showDowns: enabled,
            showBreakbarDamage: enabled,
            showDamageTaken: enabled,
            showDeaths: enabled,
            showDodges: enabled,
        }));
    };

    const allTopListsEnabled = embedStats.showDamage && embedStats.showDownContribution &&
        embedStats.showHealing && embedStats.showBarrier && embedStats.showCleanses &&
        embedStats.showBoonStrips && embedStats.showCC && embedStats.showStability &&
        embedStats.showResurrects && embedStats.showDistanceToTag &&
        embedStats.showKills && embedStats.showDowns &&
        embedStats.showBreakbarDamage && embedStats.showDamageTaken &&
        embedStats.showDeaths && embedStats.showDodges;

    return (
        <div className="flex flex-col h-full min-h-0">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-4 mb-6"
            >
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                        Settings
                    </h2>
                </div>
                <AnimatePresence mode="wait">
                    {(isSaving || showSaved) && (
                        <motion.div
                            key={isSaving ? 'saving' : 'saved'}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 12 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="flex items-center gap-2"
                        >
                            <div
                                className={`px-3 py-1 rounded-full text-xs font-semibold border ${isSaving
                                    ? 'bg-green-500/20 text-green-300 border-green-500/40'
                                    : 'bg-white/5 text-gray-400 border-white/10'
                                    }`}
                            >
                                {isSaving ? 'Saving…' : 'Saved'}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {/* DPS Report Token Section */}
                <SettingsSection title="dps.report User Token" icon={Key} delay={0.05}>
                    <p className="text-sm text-gray-400 mb-4">
                        Optional: Add your dps.report user token to associate uploads with your account.
                        You can find your token at{' '}
                        <button
                            onClick={() => window.electronAPI?.openExternal?.('https://dps.report/getUserToken')}
                            className="text-blue-400 hover:text-blue-300 underline transition-colors"
                        >
                            dps.report/getUserToken
                        </button>
                    </p>
                    <input
                        type="text"
                        value={dpsReportToken}
                        onChange={(e) => setDpsReportToken(e.target.value)}
                        placeholder="Enter your dps.report token..."
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-gray-300 placeholder-gray-600 focus:border-blue-500/50 focus:outline-none transition-colors"
                    />
                </SettingsSection>

                {/* GitHub Pages Hosting */}
                <SettingsSection
                    title="GitHub Pages Web Reports"
                    icon={Cloud}
                    delay={0.08}
                    action={githubAuthStatus === 'connected' ? (
                        <button
                            onClick={() => {
                                setGithubManageOpen(true);
                                loadGithubReports();
                            }}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white hover:border-white/30 transition-colors"
                        >
                            Manage
                        </button>
                    ) : null}
                >
                    <p className="text-sm text-gray-400 mb-4">
                        Connect a GitHub OAuth App to publish web reports to GitHub Pages.
                    </p>
                    <div className="text-xs text-gray-500 mb-4">
                        Sign in with GitHub (device flow). We will create a repo and enable Pages automatically if needed.
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                        <div className="md:col-span-2 bg-black/30 border border-white/10 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-xs uppercase tracking-widest text-gray-500">Repository</div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setGithubRepoMode('select')}
                                        className={`px-2 py-1 rounded-full text-[10px] border ${githubRepoMode === 'select'
                                            ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                                            : 'bg-white/5 text-gray-400 border-white/10'
                                            }`}
                                    >
                                        Choose Existing
                                    </button>
                                    <button
                                        onClick={() => setGithubRepoMode('create')}
                                        className={`px-2 py-1 rounded-full text-[10px] border ${githubRepoMode === 'create'
                                            ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                                            : 'bg-white/5 text-gray-400 border-white/10'
                                            }`}
                                    >
                                        Create New
                                    </button>
                                </div>
                            </div>

                            {githubRepoMode === 'select' ? (
                                <>
                                    <div className="flex items-center gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={githubRepoSearch}
                                            onChange={(e) => setGithubRepoSearch(e.target.value)}
                                            placeholder="Search repositories..."
                                            className="flex-1 bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:border-cyan-400/50 focus:outline-none"
                                        />
                                        <button
                                            onClick={refreshGithubRepos}
                                            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300"
                                            title="Refresh repos"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${loadingRepos ? 'animate-spin' : ''}`} />
                                        </button>
                                    </div>
                                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                                        {(githubRepos.length ? githubRepos : [{ full_name: '', name: '', owner: '' }])
                                            .filter((repo) => repo.full_name.toLowerCase().includes(githubRepoSearch.trim().toLowerCase()))
                                            .sort((a, b) => {
                                                if (a.name === githubRepoName) return -1;
                                                if (b.name === githubRepoName) return 1;
                                                return a.full_name.localeCompare(b.full_name);
                                            })
                                            .map((repo, idx) => (
                                                <button
                                                    key={`${repo.full_name}-${idx}`}
                                                    onClick={() => setGithubRepoName(repo.name)}
                                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${githubRepoName === repo.name
                                                        ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                        }`}
                                                >
                                                    {repo.full_name || 'No repos loaded'}
                                                </button>
                                            ))}
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={githubRepoName}
                                        onChange={(e) => {
                                            const next = e.target.value.trim();
                                            setGithubRepoName(next);
                                            setGithubRepoError(validateRepoName(next));
                                        }}
                                        placeholder="New repository name"
                                        className={`flex-1 bg-black/40 border rounded-lg px-3 py-2 text-xs text-gray-300 placeholder-gray-600 focus:outline-none ${githubRepoError ? 'border-rose-500/60 focus:border-rose-500/80' : 'border-white/5 focus:border-cyan-400/50'}`}
                                    />
                                    <div className="text-xs text-gray-500 flex items-center gap-1">
                                        <Plus className="w-4 h-4 text-cyan-300" />
                                    </div>
                                    <button
                                        onClick={handleCreateGithubRepo}
                                        disabled={creatingRepo || !!githubRepoError || githubAuthStatus !== 'connected'}
                                        className="px-3 py-2 rounded-lg text-xs font-semibold border bg-cyan-600/20 text-cyan-200 border-cyan-500/40 disabled:opacity-50"
                                    >
                                        {creatingRepo ? 'Creating...' : 'Create Now'}
                                    </button>
                                </div>
                            )}
                            {githubRepoMode === 'create' && githubRepoError && (
                                <div className="text-xs text-rose-400 mt-2">{githubRepoError}</div>
                            )}
                            {githubRepoMode === 'create' && githubRepoStatus && (
                                <div className={`text-xs mt-2 ${githubRepoStatusKind === 'success'
                                    ? 'text-emerald-300'
                                    : githubRepoStatusKind === 'error'
                                        ? 'text-rose-400'
                                        : 'text-cyan-300'
                                    }`}
                                >
                                    {githubRepoStatus}
                                </div>
                            )}
                        </div>

                        <input
                            type="text"
                            value={githubBranch}
                            onChange={(e) => setGithubBranch(e.target.value)}
                            placeholder="Branch (default: main)"
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-gray-300 placeholder-gray-600 focus:border-cyan-400/50 focus:outline-none transition-colors"
                        />
                        <input
                            type="text"
                            value={githubPagesBaseUrl}
                            onChange={(e) => setGithubPagesBaseUrl(e.target.value)}
                            placeholder="Pages Base URL (auto if empty)"
                            className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-gray-300 placeholder-gray-600 focus:border-cyan-400/50 focus:outline-none transition-colors"
                        />
                    </div>
                    <div className="bg-black/30 border border-white/10 rounded-xl p-4 mb-4">
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Web Theme</div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-56 overflow-y-auto pr-1">
                            {orderedThemes.map((theme) => {
                                const isActive = theme.id === githubWebTheme;
                                return (
                                    <button
                                        key={theme.id}
                                        onClick={() => setGithubWebTheme(theme.id)}
                                        className={`rounded-xl border px-3 py-3 text-left transition-colors ${isActive
                                            ? 'border-cyan-400/60 bg-cyan-500/10'
                                            : 'border-white/10 bg-white/5 hover:border-white/30'
                                            }`}
                                        style={{ boxShadow: isActive ? `0 0 18px rgba(${theme.rgb}, 0.25)` : undefined }}
                                    >
                                        <div
                                            className="w-full h-12 rounded-lg mb-2 border border-white/10"
                                            style={{ backgroundImage: theme.pattern, backgroundColor: '#0f172a' }}
                                        />
                                        <div className="text-xs font-semibold text-gray-200">{theme.label}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                        <button
                            onClick={handleGithubConnect}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
                        >
                            <LinkIcon className="w-4 h-4" />
                            {githubAuthStatus === 'connected' ? 'Re-connect GitHub' : 'Connect GitHub'}
                        </button>
                        <div className={`text-xs px-3 py-1 rounded-full border ${githubAuthStatus === 'connected'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : githubAuthStatus === 'pending'
                                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                                : 'bg-white/5 text-gray-400 border-white/10'
                            }`}
                        >
                            {githubAuthStatus === 'connected' ? 'Connected' : githubAuthStatus === 'pending' ? 'Waiting for OAuth...' : 'Not connected'}
                        </div>
                        <div className="ml-auto">
                            <button
                                onClick={() => {
                                    setGithubToken('');
                                    setGithubAuthStatus('idle');
                                    setGithubAuthMessage('Disconnected from GitHub.');
                                    setGithubRepos([]);
                                    setGithubRepoName('');
                                    setGithubPagesBaseUrl('');
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-semibold border border-white/10 transition-colors"
                            >
                                Disconnect
                            </button>
                        </div>
                        {githubAuthMessage && (
                            <div className="text-xs text-gray-400">{githubAuthMessage}</div>
                        )}
                    </div>
                    {githubUserCode && githubVerificationUri && (
                        <div className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-300 mb-3 animate-[fadeUp_0.6s_ease-out]">
                            <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">Authorize in Browser</div>
                            <div className="flex items-center justify-between gap-3">
                                <div className="font-mono text-lg text-white">{githubUserCode}</div>
                                <button
                                    onClick={() => navigator.clipboard.writeText(githubUserCode)}
                                    className="px-3 py-1 rounded-full text-[10px] border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                >
                                    Copy Code
                                </button>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{githubVerificationUri}</div>
                        </div>
                    )}
                </SettingsSection>

                {/* Discord Embed Stats - Summary Sections */}
                <SettingsSection title="Discord Embed - Summary Sections" icon={Users} delay={0.1}>
                    <p className="text-sm text-gray-400 mb-4">
                        Configure which summary sections appear in Discord embed notifications.
                    </p>
                    <div className="divide-y divide-white/5">
                        <Toggle
                            enabled={embedStats.showSquadSummary}
                            onChange={(v) => updateEmbedStat('showSquadSummary', v)}
                            label="Squad Summary"
                            description="Players, total damage, DPS, downs, and deaths"
                        />
                        <Toggle
                            enabled={embedStats.showEnemySummary}
                            onChange={(v) => updateEmbedStat('showEnemySummary', v)}
                            label="Enemy Summary"
                            description="Enemy count, damage taken, incoming DPS, enemy downs/kills"
                        />
                        <Toggle
                            enabled={embedStats.showIncomingStats}
                            onChange={(v) => updateEmbedStat('showIncomingStats', v)}
                            label="Incoming Stats"
                            description="Attacks, CC, and strips received (with miss/block rates)"
                        />
                    </div>
                </SettingsSection>

                {/* Discord Embed Stats - Top Lists */}
                <SettingsSection title="Discord Embed - Top 10 Lists" icon={BarChart3} delay={0.15}>
                    <p className="text-sm text-gray-400 mb-2">
                        Configure which top 10 player lists appear in Discord embed notifications.
                    </p>
                    <div className="mb-4 pb-4 border-b border-white/10">
                        <label className="text-xs text-gray-500 block mb-2">Max rows per top 10 list</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min={1}
                                max={10}
                                step={1}
                                value={embedStats.maxTopListRows}
                                onChange={(e) => updateMaxTopRows(Number(e.target.value))}
                                className="flex-1 accent-blue-400"
                            />
                            <div className="min-w-8 shrink-0 text-right text-sm text-gray-300 font-mono">
                                {embedStats.maxTopListRows}
                            </div>
                        </div>
                    </div>
                    <div className="mb-4 pb-4 border-b border-white/10">
                        <label className="text-xs text-gray-500 block mb-2">Class display</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                onClick={() => updateClassDisplay('off')}
                                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${embedStats.classDisplay === 'off'
                                    ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                                    : 'bg-black/20 text-gray-400 border-white/10 hover:text-gray-200'
                                    }`}
                            >
                                Off
                            </button>
                            <button
                                onClick={() => updateClassDisplay('short')}
                                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${embedStats.classDisplay === 'short'
                                    ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                                    : 'bg-black/20 text-gray-400 border-white/10 hover:text-gray-200'
                                    }`}
                            >
                                Short name
                            </button>
                            <button
                                onClick={() => updateClassDisplay('emoji')}
                                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${embedStats.classDisplay === 'emoji'
                                    ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                                    : 'bg-black/20 text-gray-400 border-white/10 hover:text-gray-200'
                                    }`}
                            >
                                Emoji
                            </button>
                        </div>
                    </div>
                    <div className="flex justify-end mb-2">
                        <button
                            onClick={() => setAllTopLists(!allTopListsEnabled)}
                            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            {allTopListsEnabled ? 'Disable All' : 'Enable All'}
                        </button>
                    </div>
                    <div className="divide-y divide-white/5">
                        <Toggle
                            enabled={embedStats.showDamage}
                            onChange={(v) => updateEmbedStat('showDamage', v)}
                            label="Damage"
                            description="Total damage dealt by each player"
                        />
                        <Toggle
                            enabled={embedStats.showDownContribution}
                            onChange={(v) => updateEmbedStat('showDownContribution', v)}
                            label="Down Contribution"
                            description="Damage dealt to enemies who went into downstate"
                        />
                        <Toggle
                            enabled={embedStats.showHealing}
                            onChange={(v) => updateEmbedStat('showHealing', v)}
                            label="Healing"
                            description="Outgoing healing to squad members"
                        />
                        <Toggle
                            enabled={embedStats.showBarrier}
                            onChange={(v) => updateEmbedStat('showBarrier', v)}
                            label="Barrier"
                            description="Outgoing barrier to squad members"
                        />
                        <Toggle
                            enabled={embedStats.showCleanses}
                            onChange={(v) => updateEmbedStat('showCleanses', v)}
                            label="Cleanses"
                            description="Conditions cleansed (self and allies)"
                        />
                        <Toggle
                            enabled={embedStats.showBoonStrips}
                            onChange={(v) => updateEmbedStat('showBoonStrips', v)}
                            label="Boon Strips"
                            description="Enemy boons stripped"
                        />
                        <Toggle
                            enabled={embedStats.showCC}
                            onChange={(v) => updateEmbedStat('showCC', v)}
                            label="Crowd Control (CC)"
                            description="Hard CC applied to enemies"
                        />
                        <Toggle
                            enabled={embedStats.showStability}
                            onChange={(v) => updateEmbedStat('showStability', v)}
                            label="Stability"
                            description="Stability boon generation"
                        />
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/10">
                        <p className="text-xs text-gray-500 mb-3">Additional Stats (disabled by default)</p>
                        <div className="divide-y divide-white/5">
                            <Toggle
                                enabled={embedStats.showResurrects}
                                onChange={(v) => updateEmbedStat('showResurrects', v)}
                                label="Resurrects"
                                description="Downed allies revived"
                            />
                            <Toggle
                                enabled={embedStats.showDistanceToTag}
                                onChange={(v) => updateEmbedStat('showDistanceToTag', v)}
                                label="Distance to Tag"
                                description="Average distance to commander (lower is better)"
                            />
                            <Toggle
                                enabled={embedStats.showKills}
                                onChange={(v) => updateEmbedStat('showKills', v)}
                                label="Kills"
                                description="Enemy kill count"
                            />
                            <Toggle
                                enabled={embedStats.showDowns}
                                onChange={(v) => updateEmbedStat('showDowns', v)}
                                label="Downs"
                                description="Enemy down count"
                            />
                            <Toggle
                                enabled={embedStats.showBreakbarDamage}
                                onChange={(v) => updateEmbedStat('showBreakbarDamage', v)}
                                label="Breakbar Damage"
                                description="Breakbar damage dealt to enemies"
                            />
                            <Toggle
                                enabled={embedStats.showDamageTaken}
                                onChange={(v) => updateEmbedStat('showDamageTaken', v)}
                                label="Damage Taken"
                                description="Damage received from enemies"
                            />
                            <Toggle
                                enabled={embedStats.showDeaths}
                                onChange={(v) => updateEmbedStat('showDeaths', v)}
                                label="Deaths"
                                description="Times the player died"
                            />
                            <Toggle
                                enabled={embedStats.showDodges}
                                onChange={(v) => updateEmbedStat('showDodges', v)}
                                label="Dodges"
                                description="Number of dodges performed"
                            />
                        </div>
                    </div>
                </SettingsSection>

                {/* Close Behavior Section */}
                <SettingsSection title="What's New" icon={Sparkles} delay={0.18}>
                    <p className="text-sm text-gray-400 mb-4">
                        Review the latest update notes and feature changes.
                    </p>
                    <button
                        onClick={() => onOpenWhatsNew?.()}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-200 hover:bg-blue-500/20 transition-colors"
                    >
                        <Sparkles className="w-4 h-4" />
                        View What's New
                    </button>
                </SettingsSection>

                {/* Close Behavior Section */}
                <SettingsSection title="MVP Weighting" icon={BarChart3} delay={0.18}>
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-gray-400">
                            Adjust how each stat influences MVP scoring. 0 disables a stat.
                        </p>
                        <button
                            onClick={() => setMvpWeights(DEFAULT_MVP_WEIGHTS)}
                            className="text-xs font-semibold text-blue-300 hover:text-blue-200 transition-colors"
                        >
                            Reset
                        </button>
                    </div>
                    <div className="space-y-2">
                        {([
                            { key: 'downContribution', label: 'Down Contribution' },
                            { key: 'healing', label: 'Healing' },
                            { key: 'cleanses', label: 'Cleanses' },
                            { key: 'strips', label: 'Strips' },
                            { key: 'stability', label: 'Stability' },
                            { key: 'cc', label: 'CC' },
                            { key: 'revives', label: 'Revives' },
                            { key: 'distanceToTag', label: 'Distance to Tag' },
                            { key: 'participation', label: 'Participation' },
                            { key: 'dodging', label: 'Dodging' },
                            { key: 'dps', label: 'DPS' },
                            { key: 'damage', label: 'Damage' }
                        ] as Array<{ key: keyof IMvpWeights; label: string }>).map(item => (
                            <div key={item.key} className="flex items-center gap-3 py-2">
                                <div className="flex-1 text-sm text-gray-200">{item.label}</div>
                                <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={mvpWeights[item.key]}
                                    onChange={(e) => updateMvpWeight(item.key, Number(e.target.value))}
                                    className="flex-1 accent-blue-400"
                                />
                                <div className="w-12 text-right text-xs text-gray-300 font-mono">
                                    {formatWeight(mvpWeights[item.key])}
                                </div>
                            </div>
                        ))}
                    </div>
                </SettingsSection>

                {/* Close Behavior Section */}
                <SettingsSection title="Window Close Behavior" icon={Minimize} delay={0.2}>
                    <p className="text-sm text-gray-400 mb-4">
                        Choose what happens when you click the close button.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setCloseBehavior('minimize')}
                            className={`flex flex-col items-center justify-center gap-3 py-4 rounded-xl border transition-all ${closeBehavior === 'minimize'
                                ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                                : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <Minimize className="w-6 h-6" />
                            <div className="text-center">
                                <div className="text-sm font-medium">Minimize to Tray</div>
                                <div className="text-xs text-gray-500 mt-1">Keep running in background</div>
                            </div>
                        </button>

                        <button
                            onClick={() => setCloseBehavior('quit')}
                            className={`flex flex-col items-center justify-center gap-3 py-4 rounded-xl border transition-all ${closeBehavior === 'quit'
                                ? 'bg-red-500/20 border-red-500/50 text-red-400'
                                : 'bg-black/20 border-white/5 text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            <CloseIcon className="w-6 h-6" />
                            <div className="text-center">
                                <div className="text-sm font-medium">Quit Application</div>
                                <div className="text-xs text-gray-500 mt-1">Fully close the app</div>
                            </div>
                        </button>
                    </div>
                </SettingsSection>

                <div className="h-[12vh] min-h-10 max-h-28" />
                {/* Save Button (hidden with auto-save) */}
            </div>

            <AnimatePresence>
                {githubManageOpen && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="w-full max-w-3xl bg-[#101826]/90 border border-white/10 rounded-2xl shadow-2xl p-6"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <div className="text-xs uppercase tracking-widest text-cyan-200/70">GitHub Pages</div>
                                    <h3 className="text-xl font-semibold text-white">Manage Web Reports</h3>
                                </div>
                                <button
                                    onClick={() => setGithubManageOpen(false)}
                                    className="p-2 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-white/30"
                                >
                                    <CloseIcon className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="flex items-center justify-between mb-3">
                                <div className="text-xs text-gray-400">
                                    {githubReports.length} report{githubReports.length === 1 ? '' : 's'}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={loadGithubReports}
                                        className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                    >
                                        Refresh
                                    </button>
                                    <button
                                        onClick={handleDeleteSelectedReports}
                                        disabled={githubReportsSelected.size === 0 || githubReportsDeleting}
                                        className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-red-500/20 text-red-200 border-red-500/40 disabled:opacity-50"
                                    >
                                        {githubReportsDeleting ? 'Deleting...' : `Delete (${githubReportsSelected.size})`}
                                    </button>
                                </div>
                            </div>

                            {githubReportsError && (
                                <div className="mb-3 text-xs text-rose-300">{githubReportsError}</div>
                            )}
                            {githubReportsStatus && (
                                <div className="mb-3 text-xs text-emerald-300">{githubReportsStatus}</div>
                            )}

                            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2">
                                {githubReportsLoading ? (
                                    <div className="text-sm text-gray-400">Loading reports...</div>
                                ) : githubReports.length === 0 ? (
                                    <div className="text-sm text-gray-400">No reports found.</div>
                                ) : (
                                    githubReports.map((report) => (
                                        <div
                                            key={report.id}
                                            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${githubReportsSelected.has(report.id)
                                                ? 'bg-cyan-500/10 border-cyan-400/40'
                                                : 'bg-white/5 border-white/10'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={githubReportsSelected.has(report.id)}
                                                onChange={() => toggleReportSelection(report.id)}
                                                className="h-4 w-4 accent-cyan-400"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-semibold text-white truncate">
                                                    {report.title || report.id}
                                                </div>
                                                <div className="text-xs text-gray-400 truncate">
                                                    {report.dateLabel || report.dateStart || 'Unknown date'}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => window.electronAPI?.openExternal?.(report.url)}
                                                className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white"
                                                title="Open report"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => toggleReportSelection(report.id)}
                                                className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:text-red-200"
                                                title="Select for deletion"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
