import { useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Key, X as CloseIcon, Minimize, BarChart3, Users, Sparkles, Compass, BookOpen, Cloud, Link as LinkIcon, RefreshCw, Plus, Trash2, ExternalLink, Zap, Star, Download, Upload, ChevronDown } from 'lucide-react';
import { IEmbedStatSettings, DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, DEFAULT_EMBED_STATS, DEFAULT_MVP_WEIGHTS, DEFAULT_STATS_VIEW_SETTINGS, IMvpWeights, DisruptionMethod, DEFAULT_DISRUPTION_METHOD, IStatsViewSettings, UiTheme, DEFAULT_UI_THEME } from './global.d';
import { METRICS_SPEC } from '../shared/metricsSettings';
import { BASE_WEB_THEMES, CRT_WEB_THEME, CRT_WEB_THEME_ID, DEFAULT_WEB_THEME_ID, MATTE_WEB_THEME, MATTE_WEB_THEME_ID } from '../shared/webThemes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import metricsSpecMarkdown from '../shared/metrics-spec.md?raw';
import { HowToModal } from './HowToModal';
import { ProofOfWorkModal } from './ui/ProofOfWorkModal';

interface SettingsViewProps {
    onBack: () => void;
    onEmbedStatSettingsSaved?: (settings: IEmbedStatSettings) => void;
    onOpenWhatsNew?: () => void;
    onOpenWalkthrough?: () => void;
    helpUpdatesFocusTrigger?: number;
    onHelpUpdatesFocusConsumed?: (trigger: number) => void;
    onMvpWeightsSaved?: (weights: IMvpWeights) => void;
    onStatsViewSettingsSaved?: (settings: IStatsViewSettings) => void;
    onDisruptionMethodSaved?: (method: DisruptionMethod) => void;
    onUiThemeSaved?: (theme: UiTheme) => void;
    developerSettingsTrigger?: number;
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
                className={`relative w-11 h-6 rounded-md transition-colors border ${enabled ? 'bg-blue-500/30 border-blue-500/40 toggle-track--on' : 'bg-white/5 border-white/10 toggle-track--off'
                    } toggle-track`}
            >
                <div
                    className={`absolute top-1 w-4 h-4 rounded-md bg-white shadow-md transition-transform toggle-knob ${enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                />
            </div>
        </div>
    );
}

// Section component for grouping settings
function SettingsSection({ title, icon: Icon, children, delay = 0, action, sectionId }: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
    delay?: number;
    action?: React.ReactNode;
    sectionId?: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl"
            id={sectionId}
            data-settings-section={sectionId ? 'true' : undefined}
            data-settings-label={sectionId ? title : undefined}
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

export function SettingsView({ onBack, onEmbedStatSettingsSaved, onOpenWhatsNew, onOpenWalkthrough, helpUpdatesFocusTrigger, onHelpUpdatesFocusConsumed, onMvpWeightsSaved, onStatsViewSettingsSaved, onDisruptionMethodSaved, onUiThemeSaved, developerSettingsTrigger }: SettingsViewProps) {
    const [dpsReportToken, setDpsReportToken] = useState<string>('');
    const [closeBehavior, setCloseBehavior] = useState<'minimize' | 'quit'>('minimize');
    const [embedStats, setEmbedStats] = useState<IEmbedStatSettings>(DEFAULT_EMBED_STATS);
    const [splitEnemiesByTeam, setSplitEnemiesByTeam] = useState<boolean>(false);
    const [mvpWeights, setMvpWeights] = useState<IMvpWeights>(DEFAULT_MVP_WEIGHTS);
    const [statsViewSettings, setStatsViewSettings] = useState<IStatsViewSettings>(DEFAULT_STATS_VIEW_SETTINGS);
    const [disruptionMethod, setDisruptionMethod] = useState<DisruptionMethod>(DEFAULT_DISRUPTION_METHOD);
    const [uiTheme, setUiTheme] = useState<UiTheme>(DEFAULT_UI_THEME);
    const [githubRepoName, setGithubRepoName] = useState('');
    const [githubRepoOwner, setGithubRepoOwner] = useState('');
    const [githubToken, setGithubToken] = useState('');
    const [githubWebTheme, setGithubWebTheme] = useState(DEFAULT_WEB_THEME_ID);
    const [githubFavoriteRepos, setGithubFavoriteRepos] = useState<string[]>([]);
    const [githubAuthStatus, setGithubAuthStatus] = useState<'idle' | 'pending' | 'connected' | 'error'>('idle');
    const [githubAuthMessage, setGithubAuthMessage] = useState<string | null>(null);
    const [githubUserCode, setGithubUserCode] = useState<string | null>(null);
    const [githubVerificationUri, setGithubVerificationUri] = useState<string | null>(null);
    const [githubRepos, setGithubRepos] = useState<Array<{ full_name: string; name: string; owner: string }>>([]);
    const [githubOrgs, setGithubOrgs] = useState<Array<{ login: string }>>([]);
    const [githubCreateOwner, setGithubCreateOwner] = useState('');
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
    const [pagesUrlCopied, setPagesUrlCopied] = useState(false);
    const [githubRepoStatusKind, setGithubRepoStatusKind] = useState<'idle' | 'success' | 'error' | 'pending'>('idle');
    const [isSaving, setIsSaving] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [showSaved, setShowSaved] = useState(false);
    const [githubThemeStatus, setGithubThemeStatus] = useState<string | null>(null);
    const [githubThemeStatusKind, setGithubThemeStatusKind] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const [dpsCacheStatus, setDpsCacheStatus] = useState<string | null>(null);
    const [dpsCacheBusy, setDpsCacheBusy] = useState(false);
    const [dpsCacheProgress, setDpsCacheProgress] = useState<number>(0);
    const [dpsCacheProgressLabel, setDpsCacheProgressLabel] = useState<string | null>(null);
    const lastSyncedThemeRef = useRef<string | null>(null);
    const themeSyncInFlightRef = useRef(false);
    const queuedThemeRef = useRef<string | null>(null);
    const buildPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [githubTemplateStatus, setGithubTemplateStatus] = useState<string | null>(null);
    const [githubTemplateStatusKind, setGithubTemplateStatusKind] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const lastEnsuredRepoRef = useRef<string | null>(null);
    const [githubLogoPath, setGithubLogoPath] = useState<string | null>(null);
    const [proofOfWorkOpen, setProofOfWorkOpen] = useState(false);
    const [githubLogoStatus, setGithubLogoStatus] = useState<string | null>(null);
    const [githubLogoStatusKind, setGithubLogoStatusKind] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
    const [settingsTransferStatus, setSettingsTransferStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importPreviewSettings, setImportPreviewSettings] = useState<any | null>(null);
    const [importSelections, setImportSelections] = useState<Record<string, boolean>>({});
    const [howToOpen, setHowToOpen] = useState(false);
    const [devSettingsOpen, setDevSettingsOpen] = useState(false);
    const [settingsNavOpen, setSettingsNavOpen] = useState(false);
    const [metricsSpecSearch, setMetricsSpecSearch] = useState('');
    const [metricsSpecSearchResults, setMetricsSpecSearchResults] = useState<Array<{ index: number; text: string; tag: string; section: string; hitId: number }>>([]);
    const [metricsSpecSearchFocused, setMetricsSpecSearchFocused] = useState(false);
    const [activeMetricsSpecHeadingId, setActiveMetricsSpecHeadingId] = useState('');
    const metricsSpecSearchRef = useRef<HTMLDivElement | null>(null);
    const metricsSpecHighlightRef = useRef<number | null>(null);
    const [activeSettingsSectionId, setActiveSettingsSectionId] = useState('appearance');
    const lastDevSettingsTriggerRef = useRef<number>(developerSettingsTrigger || 0);
    const settingsScrollRef = useRef<HTMLDivElement | null>(null);
    const helpUpdatesRef = useRef<HTMLDivElement | null>(null);
    const lastHelpUpdatesFocusTriggerRef = useRef<number>(0);
    const inferredPagesUrl = githubRepoOwner && githubRepoName
        ? `https://${githubRepoOwner}.github.io/${githubRepoName}`
        : '';
    const selectedGithubRepoKey = githubRepoOwner && githubRepoName
        ? `${githubRepoOwner}/${githubRepoName}`
        : '';
    const lastSavedPagesUrlRef = useRef<string | null>(null);
    const logoSyncInFlightRef = useRef(false);
    const queuedLogoPathRef = useRef<string | null>(null);
    const favoriteRepoSet = useMemo(() => new Set(githubFavoriteRepos), [githubFavoriteRepos]);
    const availableWebThemes = useMemo(() => {
        if (uiTheme === 'crt') return [CRT_WEB_THEME];
        if (uiTheme === 'matte') return [MATTE_WEB_THEME];
        return BASE_WEB_THEMES;
    }, [uiTheme]);
    const orderedThemes = useMemo(() => {
        const active = availableWebThemes.find((theme) => theme.id === githubWebTheme);
        if (!active) return availableWebThemes;
        return [active, ...availableWebThemes.filter((theme) => theme.id !== githubWebTheme)];
    }, [availableWebThemes, githubWebTheme]);
    const isModernLayout = uiTheme === 'modern' || uiTheme === 'matte' || uiTheme === 'kinetic';
    const metricsSpecContentRef = useRef<HTMLDivElement | null>(null);

    const metricsSpecHeadingCountsRef = useRef<Map<string, number>>(new Map());
    const extractHeadingText = (node: React.ReactNode): string => {
        if (typeof node === 'string' || typeof node === 'number') return String(node);
        if (Array.isArray(node)) return node.map(extractHeadingText).join('');
        if (node && typeof node === 'object' && 'props' in node) {
            return extractHeadingText((node as any).props?.children);
        }
        return '';
    };
    const slugifyHeading = (label: string) =>
        label
            .toLowerCase()
            .trim()
            .replace(/\[(.*?)\]\(.*?\)/g, '$1')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');

    const buildHeadingId = (label: string) => {
        const key = slugifyHeading(label || 'section') || 'section';
        const counts = metricsSpecHeadingCountsRef.current;
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next === 1 ? key : `${key}-${next}`;
    };

    const scrollMetricsSpecToMatch = (query: string) => {
        const container = metricsSpecContentRef.current;
        if (!container) return;
        const trimmed = query.trim().toLowerCase();
        if (!trimmed) return;
        const nodes = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3, p, li, code'));
        const match = nodes.find((node) => (node.textContent || '').toLowerCase().includes(trimmed));
        if (!match) return;
        const containerTop = container.getBoundingClientRect().top;
        const targetTop = match.getBoundingClientRect().top;
        const scrollOffset = Math.max(0, targetTop - containerTop + container.scrollTop - 12);
        requestAnimationFrame(() => {
            container.scrollTop = scrollOffset;
        });
    };

    const updateMetricsSpecSearchResults = (query: string) => {
        const container = metricsSpecContentRef.current;
        const trimmed = query.trim().toLowerCase();
        if (!container || trimmed.length < 2) {
            setMetricsSpecSearchResults([]);
            return;
        }
        const nodes = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3, p, li, code'));
        nodes.forEach((node) => node.removeAttribute('data-search-hit'));
        const results: Array<{ index: number; text: string; tag: string; section: string; hitId: number }> = [];
        let hitId = 0;
        nodes.forEach((node, index) => {
            const text = (node.textContent || '').trim();
            if (!text) return;
            if (text.toLowerCase().includes(trimmed)) {
                let section = '';
                for (let i = index; i >= 0; i -= 1) {
                    const candidate = nodes[i];
                    if (candidate && ['H1', 'H2', 'H3'].includes(candidate.tagName)) {
                        section = (candidate.textContent || '').trim();
                        break;
                    }
                }
                node.setAttribute('data-search-hit', String(hitId));
                results.push({ index, text, tag: node.tagName.toLowerCase(), section: section || 'Unlabeled Section', hitId });
                hitId += 1;
            }
        });
        setMetricsSpecSearchResults(results.slice(0, 12));
    };

    const renderHighlightedMatch = (text: string, query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return text;
        const lower = text.toLowerCase();
        const needle = trimmed.toLowerCase();
        const idx = lower.indexOf(needle);
        if (idx === -1) return text;
        const before = text.slice(0, idx);
        const match = text.slice(idx, idx + trimmed.length);
        const after = text.slice(idx + trimmed.length);
        return (
            <>
                {before}
                <mark className="rounded bg-cyan-500/30 px-1 text-cyan-100">{match}</mark>
                {after}
            </>
        );
    };

    const scrollMetricsSpecToNodeIndex = (hitId: number, text?: string) => {
        const container = metricsSpecContentRef.current;
        if (!container) return;
        let node = container.querySelector<HTMLElement>(`[data-search-hit="${hitId}"]`);
        if (!node && text) {
            const normalized = text.trim().replace(/\s+/g, ' ');
            const nodes = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3, p, li, code'));
            node = nodes.find((item) => (item.textContent || '').trim().replace(/\s+/g, ' ') === normalized) || null;
            if (!node) {
                node = nodes.find((item) => (item.textContent || '').toLowerCase().includes(normalized.toLowerCase())) || null;
            }
        }
        if (!node) return;
        requestAnimationFrame(() => {
            const containerRect = container.getBoundingClientRect();
            const nodeRect = node.getBoundingClientRect();
            const scrollOffset = Math.max(0, container.scrollTop + (nodeRect.top - containerRect.top) - 12);
            container.scrollTo({ top: scrollOffset, behavior: 'smooth' });
            node.classList.add('ring-2', 'ring-cyan-400/70', 'bg-cyan-500/10');
            if (metricsSpecHighlightRef.current) {
                window.clearTimeout(metricsSpecHighlightRef.current);
            }
            metricsSpecHighlightRef.current = window.setTimeout(() => {
                node.classList.remove('ring-2', 'ring-cyan-400/70', 'bg-cyan-500/10');
            }, 1600);
        });
    };

    useEffect(() => {
        if (!proofOfWorkOpen) return;
        const handleMouseDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (metricsSpecSearchRef.current?.contains(target)) return;
            setMetricsSpecSearchFocused(false);
            setMetricsSpecSearchResults([]);
        };
        window.addEventListener('mousedown', handleMouseDown);
        return () => window.removeEventListener('mousedown', handleMouseDown);
    }, [proofOfWorkOpen]);

    const metricsSpecNav = useMemo(() => {
        const lines = metricsSpecMarkdown.split('\n');
        const counts = new Map<string, number>();
        const items: Array<{ level: number; text: string; id: string }> = [];

        const buildId = (label: string) => {
            const key = slugifyHeading(label || 'section') || 'section';
            const next = (counts.get(key) ?? 0) + 1;
            counts.set(key, next);
            return next === 1 ? key : `${key}-${next}`;
        };

        for (const line of lines) {
            const match = /^(#{1,3})\s+(.*)\s*$/.exec(line);
            if (!match) continue;
            const level = match[1].length;
            const text = match[2].trim();
            if (!text) continue;
            items.push({ level, text, id: buildId(text) });
        }

        return items;
    }, [metricsSpecMarkdown]);

    useEffect(() => {
        if (!proofOfWorkOpen) {
            setActiveMetricsSpecHeadingId('');
            return;
        }
        const container = metricsSpecContentRef.current;
        if (!container) return;
        let raf = 0;

        const syncActiveHeading = () => {
            const headings = Array.from(container.querySelectorAll<HTMLElement>('[data-heading-id]'));
            if (headings.length === 0) return;
            const containerTop = container.getBoundingClientRect().top;
            const activationTop = containerTop + 18;
            const candidates = headings.map((heading, idx) => ({
                index: idx,
                id: heading.dataset.headingId || '',
                top: heading.getBoundingClientRect().top
            }));
            if (candidates.length === 0) return;
            let nextIndex = 0;
            let foundPast = false;
            for (const entry of candidates) {
                if (entry.top <= activationTop) {
                    nextIndex = entry.index;
                    foundPast = true;
                    continue;
                }
                if (!foundPast) {
                    nextIndex = entry.index;
                }
                break;
            }
            const nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
            if (nearBottom) {
                nextIndex = Math.max(0, candidates.length - 1);
            }
            const navMatch = metricsSpecNav[nextIndex];
            const domFallback = candidates[nextIndex]?.id || '';
            const nextId = navMatch?.id || domFallback;
            if (nextId) setActiveMetricsSpecHeadingId(nextId);
        };

        syncActiveHeading();
        const onScroll = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(syncActiveHeading);
        };
        container.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            if (raf) cancelAnimationFrame(raf);
            container.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, [proofOfWorkOpen, metricsSpecNav]);

    useEffect(() => {
        if (uiTheme === 'crt') {
            if (githubWebTheme !== CRT_WEB_THEME_ID) {
                setGithubWebTheme(CRT_WEB_THEME_ID);
            }
            return;
        }
        if (uiTheme === 'matte') {
            if (githubWebTheme !== MATTE_WEB_THEME_ID) {
                setGithubWebTheme(MATTE_WEB_THEME_ID);
            }
            return;
        }
        if (githubWebTheme === CRT_WEB_THEME_ID || githubWebTheme === MATTE_WEB_THEME_ID) {
            setGithubWebTheme(DEFAULT_WEB_THEME_ID);
        }
    }, [uiTheme, githubWebTheme]);

    const applySettingsToState = (settings: any) => {
        setDpsReportToken(settings.dpsReportToken || '');
        setCloseBehavior(settings.closeBehavior || 'minimize');
        setEmbedStats({ ...DEFAULT_EMBED_STATS, ...(settings.embedStatSettings || {}) });
        const discordEnemySplitSettings = { ...DEFAULT_DISCORD_ENEMY_SPLIT_SETTINGS, ...(settings.discordEnemySplitSettings || {}) };
        setSplitEnemiesByTeam(Boolean(settings.discordSplitEnemiesByTeam) || Boolean(discordEnemySplitSettings.image || discordEnemySplitSettings.embed || discordEnemySplitSettings.tiled));
        setMvpWeights({ ...DEFAULT_MVP_WEIGHTS, ...(settings.mvpWeights || {}) });
        setStatsViewSettings({ ...DEFAULT_STATS_VIEW_SETTINGS, ...(settings.statsViewSettings || {}) });
        setUiTheme((settings.uiTheme as UiTheme) || DEFAULT_UI_THEME);
        if (settings.disruptionMethod) {
            setDisruptionMethod(settings.disruptionMethod);
        }
        setGithubRepoOwner(settings.githubRepoOwner || '');
        setGithubCreateOwner('');
        setGithubRepoName(settings.githubRepoName || '');
        setGithubToken(settings.githubToken || '');
        setGithubWebTheme(settings.githubWebTheme || DEFAULT_WEB_THEME_ID);
        setGithubLogoPath(settings.githubLogoPath || null);
        setGithubFavoriteRepos(Array.isArray(settings.githubFavoriteRepos) ? settings.githubFavoriteRepos : []);
        if (settings.githubToken) {
            setGithubAuthStatus('connected');
        }
    };

    useEffect(() => {
        const loadSettings = async () => {
            if (!window.electronAPI?.getSettings) {
                setHasLoaded(true);
                return;
            }
            const settings = await window.electronAPI.getSettings();
            applySettingsToState(settings);
            setHasLoaded(true);
        };
        loadSettings();
    }, []);

    useEffect(() => {
        if (!window.electronAPI?.onClearDpsReportCacheProgress) return;
        const cleanup = window.electronAPI.onClearDpsReportCacheProgress((data: any) => {
            if (typeof data?.progress === 'number') {
                const clamped = Math.max(0, Math.min(100, data.progress));
                setDpsCacheProgress(clamped);
            }
            if (typeof data?.message === 'string' && data.message.length > 0) {
                setDpsCacheProgressLabel(data.message);
            }
        });
        return cleanup;
    }, []);

    useEffect(() => {
        const trigger = developerSettingsTrigger || 0;
        if (trigger > lastDevSettingsTriggerRef.current) {
            setDevSettingsOpen(true);
        }
        lastDevSettingsTriggerRef.current = trigger;
    }, [developerSettingsTrigger]);

    useEffect(() => {
        const trigger = helpUpdatesFocusTrigger || 0;
        if (trigger <= lastHelpUpdatesFocusTriggerRef.current) {
            return;
        }
        lastHelpUpdatesFocusTriggerRef.current = trigger;
        const container = settingsScrollRef.current;
        const section = helpUpdatesRef.current;
        if (!container || !section) {
            return;
        }
        const targetTop = section.offsetTop - 8;
        const top = Math.max(0, targetTop);
        if (typeof container.scrollTo === 'function') {
            container.scrollTo({ top, behavior: 'smooth' });
            onHelpUpdatesFocusConsumed?.(trigger);
            return;
        }
        container.scrollTop = top;
        onHelpUpdatesFocusConsumed?.(trigger);
    }, [helpUpdatesFocusTrigger, onHelpUpdatesFocusConsumed]);

    useEffect(() => {
        const container = settingsScrollRef.current;
        if (!container) return;

        const updateActiveSection = () => {
            const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-settings-section="true"]'));
            if (!sections.length) return;
            const containerTop = container.getBoundingClientRect().top;
            let bestId = sections[0].id;
            let bestOffset = Number.POSITIVE_INFINITY;
            sections.forEach((section) => {
                const offset = Math.abs(section.getBoundingClientRect().top - containerTop);
                if (offset < bestOffset) {
                    bestOffset = offset;
                    bestId = section.id;
                }
            });
            setActiveSettingsSectionId(bestId);
        };

        updateActiveSection();
        container.addEventListener('scroll', updateActiveSection);
        window.addEventListener('resize', updateActiveSection);
        return () => {
            container.removeEventListener('scroll', updateActiveSection);
            window.removeEventListener('resize', updateActiveSection);
        };
    }, []);

    // Optimized: Removed manual wheel listener that was causing severe scroll lag and conflicts with overlay elements (Terminal)
    // The container uses standard CSS overflow-y-auto which handles scrolling natively and efficiently.

    const handleExportSettings = async () => {
        setSettingsTransferStatus(null);
        if (!window.electronAPI?.exportSettings) {
            setSettingsTransferStatus({ kind: 'error', message: 'Export is only available in the desktop app.' });
            return;
        }
        const result = await window.electronAPI.exportSettings();
        if (!result || result.canceled) return;
        if (result.success) {
            setSettingsTransferStatus({ kind: 'success', message: 'Settings exported.' });
        } else {
            setSettingsTransferStatus({ kind: 'error', message: result.error || 'Export failed.' });
        }
    };

    const handleImportSettings = async () => {
        setSettingsTransferStatus(null);
        if (!window.electronAPI?.selectSettingsFile) {
            setSettingsTransferStatus({ kind: 'error', message: 'Import is only available in the desktop app.' });
            return;
        }
        const result = await window.electronAPI.selectSettingsFile();
        if (!result || result.canceled) return;
        if (!result.success || !result.settings) {
            setSettingsTransferStatus({ kind: 'error', message: result.error || 'Import failed.' });
            return;
        }
        const selections: Record<string, boolean> = {};
        const allowedKeys = new Set(importSettingMeta.map((item) => item.key));
        Object.keys(result.settings).forEach((key) => {
            if (allowedKeys.has(key)) selections[key] = true;
        });
        setImportSelections(selections);
        setImportPreviewSettings(result.settings);
        setImportModalOpen(true);
    };

    const getCurrentSettingsSnapshot = () => ({
        dpsReportToken,
        closeBehavior,
        embedStatSettings: embedStats,
        discordEnemySplitSettings: {
            image: splitEnemiesByTeam,
            embed: splitEnemiesByTeam,
            tiled: splitEnemiesByTeam
        },
        discordSplitEnemiesByTeam: splitEnemiesByTeam,
        mvpWeights,
        statsViewSettings,
        disruptionMethod,
        uiTheme,
        githubRepoOwner,
        githubRepoName,
        githubToken,
        githubWebTheme,
        githubLogoPath,
        githubFavoriteRepos
    });

    const confirmImportSettings = async () => {
        if (!importPreviewSettings) return;
        const patch: Record<string, any> = {};
        Object.entries(importSelections).forEach(([key, enabled]) => {
            if (!enabled) return;
            if (importPreviewSettings[key] !== undefined) {
                patch[key] = importPreviewSettings[key];
            }
        });
        if (Object.keys(patch).length === 0) {
            setSettingsTransferStatus({ kind: 'error', message: 'No settings selected.' });
            return;
        }
        window.electronAPI?.saveSettings?.(patch);
        const merged = {
            ...getCurrentSettingsSnapshot(),
            ...patch
        };
        applySettingsToState(merged);
        setImportModalOpen(false);
        setImportPreviewSettings(null);
        setSettingsTransferStatus({ kind: 'success', message: 'Settings imported.' });
    };

    const handleEnsureGithubTemplate = async () => {
        if (!window.electronAPI?.ensureGithubTemplate) return;
        setGithubTemplateStatusKind('pending');
        setGithubTemplateStatus('Ensuring web template...');
        const result = await window.electronAPI.ensureGithubTemplate();
        if (result?.success) {
            setGithubTemplateStatusKind('success');
            setGithubTemplateStatus(result.updated ? 'Template updated.' : 'Template already up to date.');
        } else {
            setGithubTemplateStatusKind('error');
            setGithubTemplateStatus(result?.error || 'Template update failed.');
        }
    };

    const handleClearDpsCache = async () => {
        if (!window.electronAPI?.clearDpsReportCache || dpsCacheBusy) return;
        setDpsCacheBusy(true);
        setDpsCacheStatus(null);
        setDpsCacheProgress(0);
        setDpsCacheProgressLabel('Preparing cache cleanup…');
        try {
            const result = await window.electronAPI.clearDpsReportCache();
            if (result?.success) {
                const count = result.clearedEntries ?? 0;
                setDpsCacheProgress(100);
                setDpsCacheProgressLabel('Cache cleared.');
                setDpsCacheStatus(`Cleared ${count} cached ${count === 1 ? 'log' : 'logs'}.`);
            } else {
                setDpsCacheStatus(result?.error || 'Failed to clear cache.');
            }
        } catch (err: any) {
            setDpsCacheStatus(err?.message || 'Failed to clear cache.');
        } finally {
            setDpsCacheBusy(false);
        }
    };

    const toggleImportSelection = (key: string) => {
        setImportSelections((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const settingsSections = [
        { id: 'appearance', label: 'Appearance' },
        { id: 'dps-token', label: 'dps.report Token' },
        { id: 'github-pages', label: 'GitHub Pages' },
        { id: 'embed-summary', label: 'Embed Summary' },
        { id: 'embed-top', label: 'Embed Top Stats' },
        { id: 'help-updates', label: 'Help & Updates' },
        { id: 'dashboard-stats', label: 'Dashboard Stats' },
        { id: 'mvp-weighting', label: 'MVP Weighting' },
        { id: 'close-behavior', label: 'Close Behavior' },
        { id: 'export-import', label: 'Export / Import' },
        { id: 'legal', label: 'Legal' }
    ];

    const scrollToSettingsSection = (id: string) => {
        const container = settingsScrollRef.current;
        if (!container) return;
        const section = container.querySelector<HTMLElement>(`#${id}`);
        if (!section) return;
        const containerRect = container.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();
        const top = Math.max(0, sectionRect.top - containerRect.top + container.scrollTop - 8);
        container.scrollTo({ top, behavior: 'smooth' });
    };

    const stepSettingsSection = (direction: -1 | 1) => {
        const index = settingsSections.findIndex((section) => section.id === activeSettingsSectionId);
        if (index === -1) return;
        const nextIndex = Math.min(settingsSections.length - 1, Math.max(0, index + direction));
        const next = settingsSections[nextIndex];
        if (next) {
            scrollToSettingsSection(next.id);
        }
    };

    const importSettingMeta: Array<{ key: string; label: string; description: string; section: string }> = [
        { key: 'logDirectory', label: 'Log Directory', description: 'Path to the ArcDPS log folder.', section: 'Logs & Uploads' },
        { key: 'dpsReportToken', label: 'dps.report Token', description: 'User token for uploads.', section: 'Logs & Uploads' },
        { key: 'discordNotificationType', label: 'Discord Post Type', description: 'Image vs embed post format.', section: 'Discord' },
        { key: 'discordEnemySplitSettings', label: 'Discord Team Split', description: 'Split enemy sections by Team ID.', section: 'Discord' },
        { key: 'discordSplitEnemiesByTeam', label: 'Split Enemies by Team', description: 'Single toggle for all Discord notification types.', section: 'Discord' },
        { key: 'discordWebhookUrl', label: 'Discord Webhook URL', description: 'Legacy single webhook URL.', section: 'Discord' },
        { key: 'webhooks', label: 'Webhook List', description: 'Saved webhook entries.', section: 'Discord' },
        { key: 'selectedWebhookId', label: 'Selected Webhook', description: 'Active webhook entry.', section: 'Discord' },
        { key: 'closeBehavior', label: 'Close Behavior', description: 'Minimize vs quit on close.', section: 'App' },
        { key: 'uiTheme', label: 'UI Theme', description: 'Classic, Modern Slate, Matte Slate, Kinetic, or CRT Hacker theme.', section: 'App' },
        { key: 'embedStatSettings', label: 'Embed Stat Toggles', description: 'Discord embed sections and lists.', section: 'Stats' },
        { key: 'mvpWeights', label: 'MVP Weights', description: 'Score weighting for MVP.', section: 'Stats' },
        { key: 'statsViewSettings', label: 'Stats View Settings', description: 'Dashboard stats configuration.', section: 'Stats' },
        { key: 'disruptionMethod', label: 'CC/Strip Method', description: 'Count, duration, or tiered.', section: 'Stats' },
        { key: 'githubRepoOwner', label: 'GitHub Owner', description: 'GitHub Pages owner/org.', section: 'GitHub' },
        { key: 'githubRepoName', label: 'GitHub Repo', description: 'GitHub Pages repository.', section: 'GitHub' },
        { key: 'githubBranch', label: 'GitHub Branch', description: 'Branch for web uploads.', section: 'GitHub' },
        { key: 'githubPagesBaseUrl', label: 'GitHub Pages URL', description: 'Base URL for hosted reports.', section: 'GitHub' },
        { key: 'githubToken', label: 'GitHub Token', description: 'Token used for uploads.', section: 'GitHub' },
        { key: 'githubWebTheme', label: 'Web Theme', description: 'Theme for hosted reports.', section: 'GitHub' },
        { key: 'githubLogoPath', label: 'Web Logo', description: 'Logo path used for reports.', section: 'GitHub' },
        { key: 'githubFavoriteRepos', label: 'Favorite Repos', description: 'Pinned repos list.', section: 'GitHub' }
    ];

    const saveSettings = () => {
        setIsSaving(true);
        setShowSaved(false);
        window.electronAPI?.saveSettings?.({
            dpsReportToken: dpsReportToken || null,
            closeBehavior,
            embedStatSettings: embedStats,
            discordEnemySplitSettings: {
                image: splitEnemiesByTeam,
                embed: splitEnemiesByTeam,
                tiled: splitEnemiesByTeam
            },
            discordSplitEnemiesByTeam: splitEnemiesByTeam,
            mvpWeights: mvpWeights,
            statsViewSettings: statsViewSettings,
            disruptionMethod: disruptionMethod,
            uiTheme,
            githubRepoName: githubRepoName || null,
            githubRepoOwner: githubRepoOwner || null,
            githubToken: githubToken || null,
            githubWebTheme: githubWebTheme || DEFAULT_WEB_THEME_ID,
            githubLogoPath: githubLogoPath || null,
            githubFavoriteRepos
        });
        onEmbedStatSettingsSaved?.(embedStats);
        onMvpWeightsSaved?.(mvpWeights);
        onStatsViewSettingsSaved?.(statsViewSettings);
        onDisruptionMethodSaved?.(disruptionMethod);
        onUiThemeSaved?.(uiTheme);

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
        splitEnemiesByTeam,
        mvpWeights,
        statsViewSettings,
        disruptionMethod,
        uiTheme,
        githubRepoName,
        githubRepoOwner,
        githubToken,
        githubWebTheme,
        githubLogoPath,
        githubFavoriteRepos,
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
        try {
            const [reposResult, orgsResult] = await Promise.all([
                window.electronAPI.getGithubRepos(),
                window.electronAPI.getGithubOrgs ? window.electronAPI.getGithubOrgs() : Promise.resolve(null)
            ]);
            if (reposResult?.success && reposResult.repos) {
                setGithubRepos(reposResult.repos);
            }
            const nextOrgs = orgsResult?.success && Array.isArray(orgsResult.orgs) ? orgsResult.orgs : [];
            setGithubOrgs(nextOrgs);
            setGithubCreateOwner((prev) => {
                if (prev && nextOrgs.some((org) => org.login === prev)) return prev;
                if (githubRepoOwner && nextOrgs.some((org) => org.login === githubRepoOwner)) return githubRepoOwner;
                return '';
            });
        } finally {
            setLoadingRepos(false);
        }
    };

    const toggleFavoriteRepo = (fullName: string) => {
        setGithubFavoriteRepos((prev) => (
            prev.includes(fullName)
                ? prev.filter((name) => name !== fullName)
                : [...prev, fullName]
        ));
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
        const result = await window.electronAPI.createGithubRepo({
            name: githubRepoName,
            branch: 'main',
            owner: githubCreateOwner || undefined
        });
        const createdRepo = result?.repo;
        if (result?.success && createdRepo) {
            setGithubRepoError(null);
            setGithubRepoMode('select');
            setGithubRepoOwner(createdRepo.owner || '');
            setGithubCreateOwner(githubOrgs.some((org) => org.login === createdRepo.owner) ? createdRepo.owner : '');
            // Pages URL inferred from repo settings; no manual override.
            await refreshGithubRepos();
            setGithubRepoStatusKind('success');
            setGithubRepoStatus(`Created ${createdRepo.full_name}`);
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

    const handleCopyPagesUrl = async () => {
        if (!inferredPagesUrl) return;
        try {
            await navigator.clipboard.writeText(inferredPagesUrl);
            setPagesUrlCopied(true);
            setTimeout(() => setPagesUrlCopied(false), 2000);
        } catch {
            setPagesUrlCopied(false);
        }
    };

    useEffect(() => {
        if (githubAuthStatus === 'connected') {
            refreshGithubRepos();
        }
    }, [githubAuthStatus]);

    useEffect(() => {
        if (!hasLoaded) return;
        if (!inferredPagesUrl) return;
        if (!window.electronAPI?.saveSettings) return;
        if (lastSavedPagesUrlRef.current === inferredPagesUrl) return;
        lastSavedPagesUrlRef.current = inferredPagesUrl;
        window.electronAPI.saveSettings({ githubPagesBaseUrl: inferredPagesUrl });
    }, [inferredPagesUrl, hasLoaded]);

    useEffect(() => {
        if (!hasLoaded) return;
        if (githubAuthStatus !== 'connected') return;
        if (!githubRepoName || !githubRepoOwner || !githubToken) return;
        if (!window.electronAPI?.ensureGithubTemplate) return;
        const repoKey = `${githubRepoOwner}/${githubRepoName}`;
        if (lastEnsuredRepoRef.current === repoKey) return;
        lastEnsuredRepoRef.current = repoKey;
        const timeout = setTimeout(async () => {
            setGithubTemplateStatusKind('pending');
            setGithubTemplateStatus('Checking web template in this repo...');
            const result = await window.electronAPI.ensureGithubTemplate();
            if (result?.success) {
                setGithubTemplateStatusKind('success');
                setGithubTemplateStatus(result.updated ? 'Base web template added to the repo.' : 'Base web template already present.');
            } else {
                setGithubTemplateStatusKind('error');
                setGithubTemplateStatus(result?.error || 'Failed to ensure web template.');
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [githubRepoName, githubRepoOwner, githubToken, githubAuthStatus, hasLoaded]);

    useEffect(() => {
        if (!window.electronAPI?.onGithubThemeStatus) return;
        const unsubscribe = window.electronAPI.onGithubThemeStatus((payload) => {
            const stage = payload?.stage || '';
            const stageLower = stage.toLowerCase();
            if (stageLower.includes('error')) {
                setGithubThemeStatusKind('error');
                setGithubThemeStatus(payload?.message || stage || null);
                return;
            }
            if (stageLower.includes('complete')) {
                setGithubThemeStatusKind('pending');
                setGithubThemeStatus('Commit pushed. Waiting for Pages build...');
                return;
            }
            setGithubThemeStatusKind('pending');
            setGithubThemeStatus(payload?.message || stage || null);
        });
        return () => {
            unsubscribe?.();
        };
    }, []);

    useEffect(() => {
        return () => {
            if (buildPollRef.current) {
                clearTimeout(buildPollRef.current);
            }
        };
    }, []);

    const pollGithubBuildStatus = async (startedAt: number) => {
        if (!window.electronAPI?.getGithubPagesBuildStatus) return;
        let attempts = 0;
        const poll = async () => {
            attempts += 1;
            const statusResp = await window.electronAPI.getGithubPagesBuildStatus();
            if (!statusResp?.success) {
                setGithubThemeStatusKind('pending');
                setGithubThemeStatus('Theme updated. Waiting for Pages build...');
            } else {
                const status = String(statusResp.status || '').toLowerCase();
                const updatedAt = statusResp.updatedAt ? Date.parse(statusResp.updatedAt) : null;
                const isFresh = updatedAt !== null && updatedAt >= startedAt;
                if ((status === 'built' || status === 'success') && isFresh) {
                    setGithubThemeStatusKind('success');
                    setGithubThemeStatus('Theme live on GitHub Pages.');
                    return;
                }
                if (status === 'errored' || status === 'error' || status === 'failed') {
                    setGithubThemeStatusKind('error');
                    setGithubThemeStatus(statusResp.errorMessage || 'Pages build failed.');
                    return;
                }
                setGithubThemeStatusKind('pending');
                setGithubThemeStatus(isFresh ? 'GitHub Pages is building the theme...' : 'Waiting for new Pages build to start...');
            }
            if (attempts < 10) {
                buildPollRef.current = setTimeout(poll, 6000);
            }
        };
        if (buildPollRef.current) {
            clearTimeout(buildPollRef.current);
        }
        poll();
    };

    const runThemeSync = async (themeId: string) => {
        if (!window.electronAPI?.applyGithubTheme) return;
        themeSyncInFlightRef.current = true;
        setGithubThemeStatusKind('pending');
        setGithubThemeStatus('Updating GitHub Pages theme. This can take a minute...');
        const startedAt = Date.now();
        const result = await window.electronAPI.applyGithubTheme({ themeId });
        if (result?.success) {
            lastSyncedThemeRef.current = themeId;
            await pollGithubBuildStatus(startedAt);
        } else {
            setGithubThemeStatusKind('error');
            setGithubThemeStatus(result?.error || 'Theme update failed.');
        }
        themeSyncInFlightRef.current = false;
        if (queuedThemeRef.current && queuedThemeRef.current !== lastSyncedThemeRef.current) {
            const nextTheme = queuedThemeRef.current;
            queuedThemeRef.current = null;
            runThemeSync(nextTheme);
        }
    };

    useEffect(() => {
        if (!hasLoaded) return;
        if (!githubWebTheme) return;
        if (lastSyncedThemeRef.current === null) {
            lastSyncedThemeRef.current = githubWebTheme;
            return;
        }
        if (githubWebTheme === lastSyncedThemeRef.current) return;
        if (githubAuthStatus !== 'connected') return;
        if (!githubRepoName || !githubToken) return;
        if (themeSyncInFlightRef.current) {
            queuedThemeRef.current = githubWebTheme;
            setGithubThemeStatusKind('pending');
            setGithubThemeStatus('Theme change queued. Will publish after current update.');
            return;
        }
        const timeout = setTimeout(() => {
            runThemeSync(githubWebTheme);
        }, 400);
        return () => clearTimeout(timeout);
    }, [githubWebTheme, githubAuthStatus, githubRepoName, githubToken, hasLoaded]);

    const runLogoSync = async (logoPath: string) => {
        if (!window.electronAPI?.applyGithubLogo) return;
        logoSyncInFlightRef.current = true;
        setGithubLogoStatusKind('pending');
        setGithubLogoStatus('Uploading logo to GitHub Pages...');
        const result = await window.electronAPI.applyGithubLogo({ logoPath });
        if (result?.success) {
            setGithubLogoStatusKind('success');
            setGithubLogoStatus('Logo updated on GitHub Pages.');
        } else {
            setGithubLogoStatusKind('error');
            setGithubLogoStatus(result?.error || 'Failed to update logo.');
        }
        logoSyncInFlightRef.current = false;
        if (queuedLogoPathRef.current && queuedLogoPathRef.current !== logoPath) {
            const next = queuedLogoPathRef.current;
            queuedLogoPathRef.current = null;
            runLogoSync(next);
        }
    };

    useEffect(() => {
        if (!hasLoaded) return;
        if (!githubLogoPath) return;
        if (githubAuthStatus !== 'connected') return;
        if (!githubRepoName || !githubToken) return;
        if (!window.electronAPI?.applyGithubLogo) return;
        if (logoSyncInFlightRef.current) {
            queuedLogoPathRef.current = githubLogoPath;
            setGithubLogoStatusKind('pending');
            setGithubLogoStatus('Logo change queued...');
            return;
        }
        const timeout = setTimeout(() => {
            runLogoSync(githubLogoPath);
        }, 400);
        return () => clearTimeout(timeout);
    }, [githubLogoPath, githubAuthStatus, githubRepoName, githubToken, hasLoaded]);

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

    const updateStatsViewSetting = (key: keyof IStatsViewSettings, value: boolean) => {
        setStatsViewSettings(prev => ({ ...prev, [key]: value }));
    };

    const updateStatsViewSettingValue = <K extends keyof IStatsViewSettings>(key: K, value: IStatsViewSettings[K]) => {
        setStatsViewSettings(prev => ({ ...prev, [key]: value }));
    };

    const updateTopStatsMode = (mode: IStatsViewSettings['topStatsMode']) => {
        setStatsViewSettings(prev => ({ ...prev, topStatsMode: mode }));
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

    metricsSpecHeadingCountsRef.current = new Map();

    return (
        <div className="settings-view flex flex-col h-full min-h-0">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-4 mb-6"
            >
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="settings-back-button p-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="settings-title text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                        Settings
                    </h2>
                </div>
                <div className="flex items-center gap-3">
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
                    <button
                        type="button"
                        onClick={() => window.electronAPI?.openExternal?.('https://discord.gg/UjzMXMGXEg')}
                        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Support Discord
                    </button>
                </div>
            </motion.div>

            <div className={isModernLayout ? 'flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4' : 'flex flex-col flex-1 min-h-0'}>
                {isModernLayout && (
                    <aside className="hidden lg:flex flex-col gap-3 min-h-0">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                            <div className="text-[11px] uppercase tracking-[0.25em] text-gray-500 mb-2">Quick Actions</div>
                            <button
                                onClick={onBack}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-gray-200 hover:bg-white/10 transition-colors"
                            >
                                <span>Back to Dashboard</span>
                                <ArrowLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => scrollToSettingsSection('appearance')}
                                className="mt-2 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-gray-200 hover:bg-white/10 transition-colors"
                            >
                                <span>Jump to Top</span>
                                <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                            </button>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 flex-1 min-h-0">
                            <div className="text-[11px] uppercase tracking-[0.25em] text-gray-500 mb-2">Sections</div>
                            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
                                {settingsSections.map((item, index) => {
                                    const isActive = item.id === activeSettingsSectionId;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => scrollToSettingsSection(item.id)}
                                            className={`settings-nav-item w-full text-left flex items-center gap-2 py-1 min-w-0 overflow-hidden ${isActive
                                                ? 'text-white'
                                                : 'text-gray-400'
                                                }`}
                                        >
                                            <span className="flex items-center justify-center w-5 text-[10px] tabular-nums text-gray-500">
                                                {index + 1}
                                            </span>
                                            <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </aside>
                )}
                <div ref={settingsScrollRef} className={`${isModernLayout ? 'min-h-0 overflow-y-auto pr-2 space-y-4' : 'flex-1 min-h-0 overflow-y-auto pr-2 space-y-4'}`}>
                    <SettingsSection title="Appearance" icon={Sparkles} delay={0.02} sectionId="appearance">
                        <p className="text-sm text-gray-400 mb-4">
                            Switch between Classic, Modern Slate, Matte Slate, Kinetic, or CRT Hacker.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => setUiTheme('classic')}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${uiTheme === 'classic'
                                    ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white hover:border-white/30'
                                    }`}
                            >
                                Classic (Default)
                            </button>
                            <button
                                type="button"
                                onClick={() => setUiTheme('modern')}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${uiTheme === 'modern'
                                    ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white hover:border-white/30'
                                    }`}
                            >
                                Modern Slate
                            </button>
                            <button
                                type="button"
                                onClick={() => setUiTheme('matte')}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${uiTheme === 'matte'
                                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50'
                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white hover:border-white/30'
                                    }`}
                            >
                                Matte Slate
                            </button>
                            <button
                                type="button"
                                onClick={() => setUiTheme('kinetic')}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${uiTheme === 'kinetic'
                                    ? 'bg-teal-500/20 text-teal-200 border-teal-400/50'
                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white hover:border-white/30'
                                    }`}
                            >
                                Kinetic
                            </button>
                            <button
                                type="button"
                                onClick={() => setUiTheme('crt')}
                                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${uiTheme === 'crt'
                                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/60'
                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white hover:border-white/30'
                                    }`}
                            >
                                CRT Hacker
                            </button>
                        </div>
                    </SettingsSection>
                    {/* DPS Report Token Section */}
                    <SettingsSection title="dps.report User Token" icon={Key} delay={0.05} sectionId="dps-token">
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
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                                onClick={handleClearDpsCache}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-semibold border border-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={dpsCacheBusy}
                            >
                                <Trash2 className="w-4 h-4" />
                                {dpsCacheBusy ? 'Clearing cache…' : 'Clear dps.report cache'}
                            </button>
                            <div className="text-xs text-gray-500">
                                Removes cached dps.report results stored locally (does not delete your log files).
                            </div>
                            {dpsCacheStatus && (
                                <div className="text-xs text-gray-400">{dpsCacheStatus}</div>
                            )}
                            {dpsCacheBusy && (
                                <div className="w-full max-w-sm">
                                    <div className="text-[11px] text-gray-400 mb-1">{dpsCacheProgressLabel || 'Clearing cache…'}</div>
                                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                        <div
                                            className="h-full bg-amber-400 transition-all duration-150"
                                            style={{ width: `${dpsCacheProgress}%` }}
                                        />
                                    </div>
                                    <div className="text-[11px] text-gray-500 mt-1">{Math.round(dpsCacheProgress)}%</div>
                                </div>
                            )}
                        </div>
                    </SettingsSection>

                    {/* GitHub Pages Hosting */}
                    <SettingsSection
                        title="GitHub Pages Web Reports"
                        icon={Cloud}
                        delay={0.08}
                        sectionId="github-pages"
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
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <button
                                onClick={handleGithubConnect}
                                className="github-connect-btn flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold transition-colors"
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
                            <div className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-300 mb-4 animate-[fadeUp_0.6s_ease-out]">
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
                                                    const aFav = favoriteRepoSet.has(a.full_name);
                                                    const bFav = favoriteRepoSet.has(b.full_name);
                                                    if (aFav !== bFav) return aFav ? -1 : 1;
                                                    if (a.full_name === selectedGithubRepoKey) return -1;
                                                    if (b.full_name === selectedGithubRepoKey) return 1;
                                                    return a.full_name.localeCompare(b.full_name);
                                                })
                                                .map((repo, idx) => {
                                                    const isFavorite = favoriteRepoSet.has(repo.full_name);
                                                    return (
                                                        <div
                                                            key={`${repo.full_name}-${idx}`}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => {
                                                                setGithubRepoName(repo.name);
                                                                setGithubRepoOwner(repo.owner || '');
                                                                setGithubCreateOwner(githubOrgs.some((org) => org.login === repo.owner) ? repo.owner : '');
                                                            }}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter' || event.key === ' ') {
                                                                    event.preventDefault();
                                                                    setGithubRepoName(repo.name);
                                                                    setGithubRepoOwner(repo.owner || '');
                                                                    setGithubCreateOwner(githubOrgs.some((org) => org.login === repo.owner) ? repo.owner : '');
                                                                }
                                                            }}
                                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center justify-between gap-2 cursor-pointer ${selectedGithubRepoKey === repo.full_name
                                                                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                }`}
                                                        >
                                                            <span className="truncate">{repo.full_name || 'No repos loaded'}</span>
                                                            {repo.full_name ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(event) => {
                                                                        event.stopPropagation();
                                                                        toggleFavoriteRepo(repo.full_name);
                                                                    }}
                                                                    className={`p-1 rounded-md transition-colors ${isFavorite ? 'text-amber-300' : 'text-gray-500 hover:text-gray-200'}`}
                                                                    title={isFavorite ? 'Remove favorite' : 'Favorite repo'}
                                                                >
                                                                    <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-300' : 'fill-transparent'}`} />
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        {githubOrgs.length > 0 && (
                                            <div className="relative w-52 shrink-0">
                                                <select
                                                    value={githubCreateOwner}
                                                    onChange={(event) => setGithubCreateOwner(event.target.value)}
                                                    className="w-full h-full appearance-none bg-black/50 border border-white/10 rounded-lg pl-3 pr-8 py-2 text-xs text-gray-200 focus:outline-none focus:border-cyan-400/50"
                                                    aria-label="Repository owner"
                                                >
                                                    <option value="">Personal account</option>
                                                    {githubOrgs.map((org) => (
                                                        <option key={org.login} value={org.login}>{org.login}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="w-3.5 h-3.5 text-gray-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                                            </div>
                                        )}
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
                                {githubRepoMode === 'select' && githubTemplateStatus && (
                                    <div className={`text-xs mt-2 ${githubTemplateStatusKind === 'success'
                                        ? 'text-emerald-300'
                                        : githubTemplateStatusKind === 'error'
                                            ? 'text-rose-400'
                                            : 'text-cyan-300'
                                        }`}
                                    >
                                        {githubTemplateStatus}
                                    </div>
                                )}
                                <div className="github-pages-url-card bg-black/40 border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3 mt-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">GitHub Pages URL</div>
                                        <input
                                            type="text"
                                            value={inferredPagesUrl || 'Connect GitHub and select a repo'}
                                            readOnly
                                            className="github-pages-url-value w-full bg-transparent text-sm text-gray-200 focus:outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={handleCopyPagesUrl}
                                        disabled={!inferredPagesUrl}
                                        className="github-pages-url-copy px-3 py-2 rounded-lg text-xs font-semibold border bg-white/5 text-gray-200 border-white/10 hover:border-white/30 disabled:opacity-50"
                                    >
                                        {pagesUrlCopied ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                            </div>

                        </div>
                        <div className="bg-black/30 border border-white/10 rounded-xl p-4 mb-4">
                            <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Web Theme</div>
                            <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${githubThemeStatusKind === 'success'
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                                : githubThemeStatusKind === 'error'
                                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                                    : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                                }`}
                            >
                                {githubThemeStatus || 'Theme changes publish automatically to GitHub Pages.'}
                            </div>
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
                                                style={{ backgroundImage: theme.pattern, backgroundColor: '#10141b' }}
                                            />
                                            <div className="text-xs font-semibold text-gray-200">{theme.label}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="bg-black/30 border border-white/10 rounded-xl p-4 mb-4">
                            <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Logo</div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={async () => {
                                        if (!window.electronAPI?.selectGithubLogo) return;
                                        const path = await window.electronAPI.selectGithubLogo();
                                        if (path) {
                                            setGithubLogoPath(path);
                                        }
                                    }}
                                    className="px-3 py-2 rounded-lg text-xs font-semibold border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                >
                                    {githubLogoPath ? 'Replace Logo' : 'Choose Logo'}
                                </button>
                                {githubLogoPath && (
                                    <button
                                        onClick={() => setGithubLogoPath(null)}
                                        className="px-3 py-2 rounded-lg text-xs font-semibold border bg-white/5 text-gray-400 border-white/10 hover:text-white"
                                    >
                                        Remove
                                    </button>
                                )}
                                <div className="text-xs text-gray-500 truncate">
                                    {githubLogoPath ? githubLogoPath.split(/[\\/]/).pop() : 'No logo selected'}
                                </div>
                            </div>
                            {githubLogoStatus && (
                                <div className={`mt-3 text-xs ${githubLogoStatusKind === 'success'
                                    ? 'text-emerald-300'
                                    : githubLogoStatusKind === 'error'
                                        ? 'text-rose-300'
                                        : 'text-cyan-300'
                                    }`}
                                >
                                    {githubLogoStatus}
                                </div>
                            )}
                        </div>
                    </SettingsSection>

                    {/* Discord Embed Stats - Summary Sections */}
                    <SettingsSection title="Discord Embed - Summary Sections" icon={Users} delay={0.1} sectionId="embed-summary">
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
                                enabled={embedStats.showClassSummary}
                                onChange={(v) => updateEmbedStat('showClassSummary', v)}
                                label="Class Summary"
                                description="Squad and enemy class breakdowns"
                            />
                            <Toggle
                                enabled={embedStats.showIncomingStats}
                                onChange={(v) => updateEmbedStat('showIncomingStats', v)}
                                label="Incoming Stats"
                                description="Attacks, CC, and strips received (with miss/block rates)"
                            />
                            <Toggle
                                enabled={splitEnemiesByTeam}
                                onChange={(v) => {
                                    setSplitEnemiesByTeam(v);
                                    window.electronAPI?.saveSettings?.({
                                        discordEnemySplitSettings: {
                                            image: v,
                                            embed: v,
                                            tiled: v
                                        },
                                        discordSplitEnemiesByTeam: v
                                    });
                                }}
                                label="Split Enemies by Team"
                                description="Use Team ID sections for enemy summary/class breakdown in image, embed, and tiled posts"
                            />
                        </div>
                    </SettingsSection>

                    {/* Discord Embed Stats - Top Lists */}
                    <SettingsSection title="Discord Embed - Top Stats Lists" icon={BarChart3} delay={0.15} sectionId="embed-top">
                        <p className="text-sm text-gray-400 mb-2">
                            Configure which top stat player lists appear in Discord embed notifications.
                        </p>
                        <div className="mb-4 pb-4 border-b border-white/10">
                            <label className="text-xs text-gray-500 block mb-2">Max rows per top stat list</label>
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

                    <div ref={helpUpdatesRef}>
                        <SettingsSection title="Help & Updates" icon={Sparkles} delay={0.18} sectionId="help-updates">
                            <p className="text-sm text-gray-400 mb-4">
                                Review release notes, reopen onboarding, or browse the complete feature guide.
                            </p>
                            <div className="space-y-2">
                                <button
                                    onClick={() => setHowToOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                                >
                                    <BookOpen className="w-4 h-4" />
                                    How To
                                </button>
                                <button
                                    onClick={() => onOpenWalkthrough?.()}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-medium text-gray-200 hover:bg-white/10 transition-colors"
                                >
                                    <Compass className="w-4 h-4" />
                                    Open Walkthrough
                                </button>
                                <button
                                    onClick={() => onOpenWhatsNew?.()}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-200 hover:bg-blue-500/20 transition-colors"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    View What's New
                                </button>
                            </div>
                        </SettingsSection>
                    </div>

                    <SettingsSection title="Dashboard - Top Stats & MVP" icon={BarChart3} delay={0.18} sectionId="dashboard-stats">
                        <p className="text-sm text-gray-400 mb-4">
                            Control the calculation and display of the top stats cards and MVP highlights.
                        </p>
                        <div className="divide-y divide-white/5">
                            <Toggle
                                enabled={statsViewSettings.showTopStats}
                                onChange={(v) => updateStatsViewSetting('showTopStats', v)}
                                label="Show Top Stats Section"
                                description="Top players cards and leader breakdowns"
                            />
                            <Toggle
                                enabled={statsViewSettings.showMvp}
                                onChange={(v) => updateStatsViewSetting('showMvp', v)}
                                label="Calculate MVP"
                                description="MVP scoring + squad/silver/bronze highlights"
                            />
                            <Toggle
                                enabled={statsViewSettings.roundCountStats}
                                onChange={(v) => updateStatsViewSetting('roundCountStats', v)}
                                label="Round count stats to whole numbers"
                                description="Percent-based stats keep decimals"
                            />
                            <div className="py-3">
                                <div className="text-sm font-medium text-gray-200 mb-2">Top Stats Calculation</div>
                                <div className="flex gap-2">
                                    {([
                                        { id: 'total', label: 'Total' },
                                        { id: 'perSecond', label: 'Per Second' }
                                    ] as const).map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => updateTopStatsMode(option.id)}
                                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${statsViewSettings.topStatsMode === option.id
                                                ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                                                : 'bg-white/5 text-gray-400 border-white/10 hover:text-gray-200'
                                                }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">Applies to Top Stats cards and breakdown.</div>
                            </div>
                            <div className="py-3 border-t border-white/5">
                                <div className="text-sm font-medium text-gray-200 mb-2">Top Skills Source</div>
                                <div className="text-xs text-gray-500 mb-3">
                                    Pick which damage bucket ranks skills.
                                </div>
                                <div className="grid gap-3">
                                    {([
                                        {
                                            id: 'target',
                                            label: 'Target Damage',
                                            summary: 'Enemy-attributed damage (matches log combiner).',
                                            implications: [
                                                'Best for cross-tool comparisons.',
                                                'Excludes unassigned damage.'
                                            ]
                                        },
                                        {
                                            id: 'total',
                                            label: 'All Damage',
                                            summary: 'All recorded damage events.',
                                            implications: [
                                                'Includes non-target damage.',
                                                'Can exceed enemy totals.'
                                            ]
                                        }
                                    ] as const).map((option) => {
                                        const isActive = statsViewSettings.topSkillDamageSource === option.id;
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => updateStatsViewSettingValue('topSkillDamageSource', option.id)}
                                                className={`text-left rounded-xl border px-4 py-3 transition-colors ${isActive
                                                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-100'
                                                    : 'bg-black/20 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="text-sm font-semibold">{option.label}</div>
                                                    <div className={`text-xs font-semibold ${isActive ? 'text-blue-200' : 'text-gray-500'}`}>
                                                        {isActive ? 'Selected' : 'Select'}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-gray-400 mt-1">{option.summary}</div>
                                                <ul className="mt-2 space-y-1 text-xs text-gray-500">
                                                    {option.implications.map((item, idx) => (
                                                        <li key={`${option.id}-${idx}`}>• {item}</li>
                                                    ))}
                                                </ul>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="py-3 border-t border-white/5">
                                <div className="text-sm font-medium text-gray-200 mb-2">Top Skills Metric</div>
                                <div className="text-xs text-gray-500 mb-3">
                                    Choose how skills are ranked.
                                </div>
                                <div className="grid gap-3">
                                    {([
                                        {
                                            id: 'damage',
                                            label: 'All Damage',
                                            summary: 'Ranks by total damage dealt.',
                                            implications: [
                                                'Standard damage leaderboard.',
                                                'Best for raw output.'
                                            ]
                                        },
                                        {
                                            id: 'downContribution',
                                            label: 'Down Contribution',
                                            summary: 'Ranks by down contribution damage.',
                                            implications: [
                                                'Highlights finishing pressure.',
                                                'Matches down contribution totals.'
                                            ]
                                        }
                                    ] as const).map((option) => {
                                        const isActive = statsViewSettings.topSkillsMetric === option.id;
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => updateStatsViewSettingValue('topSkillsMetric', option.id)}
                                                className={`text-left rounded-xl border px-4 py-3 transition-colors ${isActive
                                                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-100'
                                                    : 'bg-black/20 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="text-sm font-semibold">{option.label}</div>
                                                    <div className={`text-xs font-semibold ${isActive ? 'text-blue-200' : 'text-gray-500'}`}>
                                                        {isActive ? 'Selected' : 'Select'}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-gray-400 mt-1">{option.summary}</div>
                                                <ul className="mt-2 space-y-1 text-xs text-gray-500">
                                                    {option.implications.map((item, idx) => (
                                                        <li key={`${option.id}-${idx}`}>• {item}</li>
                                                    ))}
                                                </ul>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="py-4 border-t border-white/10">
                                <div className="flex items-center gap-2 text-sm font-medium text-gray-200 mb-2">
                                    <Zap className="w-4 h-4 text-blue-300" />
                                    CC/Strip Methodology
                                </div>
                                <div className="text-xs text-gray-500 mb-3">
                                    Choose how crowd control and strip totals are calculated across the app.
                                </div>
                                <div className="grid gap-3">
                                    {Object.entries(METRICS_SPEC.methods).map(([key, method]) => {
                                        const isActive = disruptionMethod === key;
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => setDisruptionMethod(key as DisruptionMethod)}
                                                className={`text-left rounded-xl border px-4 py-3 transition-colors ${isActive
                                                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-100'
                                                    : 'bg-black/20 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="text-sm font-semibold">{method.label}</div>
                                                    <div className={`text-xs font-semibold ${isActive ? 'text-blue-200' : 'text-gray-500'}`}>
                                                        {isActive ? 'Selected' : 'Select'}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-gray-400 mt-1">{method.summary}</div>
                                                <ul className="mt-2 space-y-1 text-xs text-gray-500">
                                                    {method.implications.map((item, idx) => (
                                                        <li key={`${key}-${idx}`}>• {item}</li>
                                                    ))}
                                                </ul>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </SettingsSection>

                    {/* Close Behavior Section */}
                    <SettingsSection title="MVP Weighting" icon={BarChart3} delay={0.18} sectionId="mvp-weighting">
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
                    <SettingsSection title="Window Close Behavior" icon={Minimize} delay={0.2} sectionId="close-behavior">
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

                    <SettingsSection title="Export / Import Settings" icon={Download} delay={0.2} sectionId="export-import">
                        <p className="text-sm text-gray-400 mb-4">
                            Save your current configuration to a file or import it on another machine.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={handleExportSettings}
                                className="flex items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-200 hover:bg-blue-500/20 transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                Export Settings
                            </button>
                            <button
                                type="button"
                                onClick={handleImportSettings}
                                className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                            >
                                <Upload className="w-4 h-4" />
                                Import Settings
                            </button>
                        </div>
                        {settingsTransferStatus && (
                            <div className={`mt-3 text-xs ${settingsTransferStatus.kind === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
                                {settingsTransferStatus.message}
                            </div>
                        )}
                    </SettingsSection>

                    <div id="legal" data-settings-section="true" data-settings-label="Legal" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-gray-400">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-semibold text-gray-200">Legal Notice</div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => window.electronAPI?.openExternal?.('https://github.com/darkharasho/ArcBridge')}
                                    className="px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                >
                                    GitHub
                                </button>
                                <button
                                    type="button"
                                    onClick={() => window.electronAPI?.openExternal?.('https://discord.gg/UjzMXMGXEg')}
                                    className="px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                >
                                    Discord
                                </button>
                                <button
                                    onClick={() => setProofOfWorkOpen(true)}
                                    className="px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                                >
                                    Proof of Work
                                </button>
                            </div>
                        </div>
                        <p>
                            ArcBridge is free software by harasho: you can redistribute it and/or modify it under the terms
                            of the GNU General Public License v3.0 only. This program comes with ABSOLUTELY NO WARRANTY.
                        </p>
                        <p className="mt-2">
                            Class Icons, artwork, and skill icons are created and owned by Arenanet as detailed in their{' '}
                            <button
                                type="button"
                                onClick={() => window.electronAPI?.openExternal?.('https://www.arena.net/en/legal/content-terms-of-use')}
                                className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                            >
                                Content Terms of Use
                            </button>
                            . I do not own or profit from this work in any way. Assets were obtained from asset packs distributed by Arenanet.
                            The official statement from the Content Terms of Use:
                        </p>
                        <p className="mt-2">
                            © ArenaNet LLC. All rights reserved. NCSOFT, ArenaNet, Guild Wars, Guild Wars 2, GW2, Heart of Thorns, Path of Fire, End of Dragons, Secrets of the Obscure, Janthir Wilds, Visions of Eternity, and all associated logos, designs, and composite marks are trademarks or registered trademarks of NCSOFT Corporation. All other trademarks are the property of their respective owners.
                        </p>
                        <p className="mt-2">
                            See the{' '}
                            <button
                                type="button"
                                onClick={() => window.electronAPI?.openExternal?.('https://github.com/darkharasho/ArcBridge/blob/main/LICENSE')}
                                className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                            >
                                LICENSE
                            </button>
                            {' '}and{' '}
                            <button
                                type="button"
                                onClick={() => window.electronAPI?.openExternal?.('https://github.com/darkharasho/ArcBridge/blob/main/THIRD_PARTY_NOTICES.md')}
                                className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                            >
                                THIRD_PARTY_NOTICES.md
                            </button>
                            {' '}files for full terms and upstream attributions.
                        </p>
                    </div>

                    <div className="h-[12vh] min-h-10 max-h-28" />
                    {/* Save Button (hidden with auto-save) */}
                </div>
            </div>

            <div className={`fixed bottom-4 left-4 right-4 z-40 ${isModernLayout ? 'lg:hidden' : ''}`}>
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/25 bg-white/5 backdrop-blur-2xl px-3 py-1.5 shadow-[0_24px_65px_rgba(0,0,0,0.55)]">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                    >
                        Back
                    </button>
                    <button
                        onClick={() => setSettingsNavOpen((open) => !open)}
                        className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                    >
                        <span className="truncate max-w-[160px]">
                            {settingsSections.find((item) => item.id === activeSettingsSectionId)?.label || 'Settings'}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-[color:var(--accent)] transition-transform ${settingsNavOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                        onClick={() => stepSettingsSection(1)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                    >
                        Next
                        <ChevronDown className="w-4 h-4 -rotate-90 text-[color:var(--accent)]" />
                    </button>
                </div>
            </div>
            {settingsNavOpen && (
                <div
                    className={`app-modal-overlay fixed inset-0 z-50 flex items-center justify-center px-4 ${isModernLayout ? 'lg:hidden' : ''}`}
                    onClick={(event) => {
                        if (event.target === event.currentTarget) {
                            setSettingsNavOpen(false);
                        }
                    }}
                >
                    <div className="app-modal-card w-full max-w-sm max-h-[85vh] rounded-2xl p-4 border border-white/20 bg-white/5 shadow-[0_22px_60px_rgba(0,0,0,0.55)] backdrop-blur-2xl flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-[11px] uppercase tracking-[0.3em] text-gray-400">Jump to</div>
                            <button
                                onClick={() => setSettingsNavOpen(false)}
                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                                aria-label="Close navigation"
                            >
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2 pb-4">
                            {settingsSections.map((item) => {
                                const isActive = item.id === activeSettingsSectionId;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            scrollToSettingsSection(item.id);
                                            setSettingsNavOpen(false);
                                        }}
                                        className={`settings-nav-item w-full text-left flex items-center gap-2 py-1 min-w-0 overflow-hidden ${isActive
                                            ? 'text-white'
                                            : 'text-gray-400'
                                            }`}
                                    >
                                        <span className="flex items-center justify-center w-5 text-[10px] tabular-nums text-gray-500">
                                            {settingsSections.findIndex((section) => section.id === item.id) + 1}
                                        </span>
                                        <span className="flex-1 min-w-0 text-[13px] font-medium truncate">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <AnimatePresence>
                {importModalOpen && (
                    <motion.div
                        className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="app-modal-card w-full max-w-3xl bg-[#161c24]/95 border border-white/10 rounded-2xl shadow-2xl"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                        >
                            <div className="px-6 pt-6 pb-4 border-b border-white/10">
                                <div className="text-xs uppercase tracking-widest text-cyan-200/70">Import Settings</div>
                                <h3 className="text-xl font-semibold text-white">Choose what to import</h3>
                                <p className="text-sm text-gray-400 mt-2">
                                    All items are selected by default. Toggle any setting you want to skip.
                                </p>
                            </div>
                            <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-1">
                                {(() => {
                                    const items = importSettingMeta.filter((item) =>
                                        importPreviewSettings && Object.prototype.hasOwnProperty.call(importPreviewSettings, item.key)
                                    );
                                    const sections = Array.from(new Set(items.map((item) => item.section)));
                                    return sections.map((section) => (
                                        <div key={section} className="pt-2">
                                            <div className="text-[11px] uppercase tracking-widest text-gray-500 mb-2">{section}</div>
                                            <div className="divide-y divide-white/5 rounded-xl border border-white/5 bg-white/5 px-3">
                                                {items
                                                    .filter((item) => item.section === section)
                                                    .map((item) => (
                                                        <Toggle
                                                            key={item.key}
                                                            enabled={Boolean(importSelections[item.key])}
                                                            onChange={() => toggleImportSelection(item.key)}
                                                            label={item.label}
                                                            description={item.description}
                                                        />
                                                    ))}
                                            </div>
                                        </div>
                                    ));
                                })()}
                                {importPreviewSettings && Object.keys(importPreviewSettings).length === 0 && (
                                    <div className="text-sm text-gray-500 italic py-6 text-center">No settings found in file.</div>
                                )}
                            </div>
                            <div className="sticky bottom-0 px-6 py-4 border-t border-white/10 bg-[#161c24] flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setImportModalOpen(false);
                                        setImportPreviewSettings(null);
                                    }}
                                    className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmImportSettings}
                                    className="px-4 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30 transition-colors"
                                >
                                    Import
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {devSettingsOpen && (
                    <motion.div
                        className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="app-modal-card w-full max-w-xl bg-[#161c24]/95 border border-white/10 rounded-2xl shadow-2xl"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                        >
                            <div className="px-6 pt-6 pb-4 border-b border-white/10 flex items-center justify-between">
                                <div>
                                    <div className="text-xs uppercase tracking-widest text-amber-200/70">Developer Settings</div>
                                    <h3 className="text-xl font-semibold text-white">Hidden Tools</h3>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDevSettingsOpen(false)}
                                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                                    aria-label="Close Developer Settings"
                                >
                                    <CloseIcon className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="px-6 py-5 space-y-3">
                                <p className="text-sm text-gray-400">
                                    Troubleshooting and one-off maintenance actions.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleEnsureGithubTemplate}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200 hover:bg-amber-500/20 transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Ensure GitHub Template
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClearDpsCache}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-200 hover:bg-rose-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={dpsCacheBusy}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    {dpsCacheBusy ? 'Clearing dps.report cache…' : 'Clear dps.report cache'}
                                </button>
                                {(dpsCacheBusy || dpsCacheStatus) && (
                                    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                                        {dpsCacheBusy && (
                                            <>
                                                <div className="text-xs text-gray-300 mb-1">{dpsCacheProgressLabel || 'Clearing cache…'}</div>
                                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                    <div
                                                        className="h-full bg-rose-400 transition-all duration-150"
                                                        style={{ width: `${dpsCacheProgress}%` }}
                                                    />
                                                </div>
                                                <div className="text-[11px] text-gray-500 mt-1">{Math.round(dpsCacheProgress)}%</div>
                                            </>
                                        )}
                                        {dpsCacheStatus && (
                                            <div className={`text-xs ${dpsCacheStatus.toLowerCase().includes('failed') ? 'text-rose-300' : 'text-emerald-300'}`}>
                                                {dpsCacheStatus}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {githubTemplateStatus && (
                                    <div className={`text-xs ${githubTemplateStatusKind === 'success'
                                        ? 'text-emerald-300'
                                        : githubTemplateStatusKind === 'error'
                                            ? 'text-rose-400'
                                            : 'text-amber-300'
                                        }`}
                                    >
                                        {githubTemplateStatus}
                                    </div>
                                )}
                            </div>
                            <div className="px-6 pb-5 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setDevSettingsOpen(false)}
                                    className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {githubManageOpen && (
                    <motion.div
                        className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.div
                            className="app-modal-card web-reports-modal w-full max-w-3xl bg-[#161c24]/95 border border-white/10 rounded-2xl shadow-2xl p-6"
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
                                            className={`web-report-item flex items-center gap-3 rounded-xl border px-4 py-3 ${githubReportsSelected.has(report.id)
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

            <ProofOfWorkModal
                isOpen={proofOfWorkOpen}
                onClose={() => setProofOfWorkOpen(false)}
                searchValue={metricsSpecSearch}
                searchFocused={metricsSpecSearchFocused}
                searchResults={metricsSpecSearchResults}
                onSearchChange={(value) => {
                    setMetricsSpecSearch(value);
                    updateMetricsSpecSearchResults(value);
                    if (value.trim().length >= 2) scrollMetricsSpecToMatch(value);
                }}
                onSearchFocus={() => {
                    setMetricsSpecSearchFocused(true);
                    updateMetricsSpecSearchResults(metricsSpecSearch);
                }}
                onSearchBlur={(nextTarget) => {
                    if (nextTarget && metricsSpecSearchRef.current?.contains(nextTarget)) return;
                    setMetricsSpecSearchFocused(false);
                }}
                onSearchEnter={() => scrollMetricsSpecToMatch(metricsSpecSearch)}
                onSearchResultMouseDown={(result) => {
                    setMetricsSpecSearchFocused(true);
                    scrollMetricsSpecToNodeIndex(result.hitId, result.text);
                }}
                renderHighlightedMatch={renderHighlightedMatch}
                searchRef={metricsSpecSearchRef}
                tocItems={metricsSpecNav}
                activeTocId={activeMetricsSpecHeadingId}
                onTocClick={(item) => {
                    const container = metricsSpecContentRef.current;
                    if (!container) return;
                    let target = container.querySelector<HTMLElement>(`[data-heading-id="${item.id}"]`);
                    if (!target) {
                        const key = slugifyHeading(item.text);
                        target = container.querySelector<HTMLElement>(`[data-heading-key="${key}"]`);
                    }
                    if (!target) {
                        const normalized = item.text.trim().replace(/\s+/g, ' ');
                        const headings = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3'));
                        target = headings.find((node) => (node.textContent || '').trim().replace(/\s+/g, ' ') === normalized) || null;
                    }
                    if (!target) return;
                    const containerTop = container.getBoundingClientRect().top;
                    const targetTop = target.getBoundingClientRect().top;
                    const scrollOffset = Math.max(0, targetTop - containerTop + container.scrollTop - 12);
                    requestAnimationFrame(() => {
                        container.scrollTop = scrollOffset;
                    });
                    setActiveMetricsSpecHeadingId(item.id);
                }}
                contentRef={metricsSpecContentRef}
            >
                {(() => {
                    // Keep heading ids deterministic on every render so TOC active state stays in sync.
                    metricsSpecHeadingCountsRef.current = new Map();
                    return null;
                })()}
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                                                    h1: ({ children }) => {
                                                        const label = extractHeadingText(children);
                                                        const id = buildHeadingId(label);
                                                        return (
                                                            <h1
                                                                id={id}
                                                                data-heading-id={id}
                                                                data-heading-key={slugifyHeading(label)}
                                                                className="text-2xl font-bold text-white scroll-mt-6"
                                                            >
                                                                {children}
                                                            </h1>
                                                        );
                                                    },
                                                    h2: ({ children }) => {
                                                        const label = extractHeadingText(children);
                                                        const id = buildHeadingId(label);
                                                        return (
                                                            <h2
                                                                id={id}
                                                                data-heading-id={id}
                                                                data-heading-key={slugifyHeading(label)}
                                                                className="text-xl font-semibold text-white scroll-mt-6"
                                                            >
                                                                {children}
                                                            </h2>
                                                        );
                                                    },
                                                    h3: ({ children }) => {
                                                        const label = extractHeadingText(children);
                                                        const id = buildHeadingId(label);
                                                        return (
                                                            <h3
                                                                id={id}
                                                                data-heading-id={id}
                                                                data-heading-key={slugifyHeading(label)}
                                                                className="text-lg font-semibold text-white scroll-mt-6"
                                                            >
                                                                {children}
                                                            </h3>
                                                        );
                                                    },
                                                    p: ({ children }) => <p className="leading-6 text-gray-200">{children}</p>,
                                                    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-gray-200">{children}</ul>,
                                                    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-gray-200">{children}</ol>,
                                                    li: ({ children }) => <li className="leading-6">{children}</li>,
                                                    blockquote: ({ children }) => (
                                                        <blockquote className="border-l-2 border-blue-400/40 pl-4 text-gray-300 italic">
                                                            {children}
                                                        </blockquote>
                                                    ),
                                                    a: ({ href, children }) => (
                                                        <button
                                                            className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                                                            onClick={() => href && window.electronAPI.openExternal(href)}
                                                        >
                                                            {children}
                                                        </button>
                                                    ),
                                                    table: ({ children }) => (
                                                        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30">
                                                            <table className="w-full border-collapse text-left text-sm">
                                                                {children}
                                                            </table>
                                                        </div>
                                                    ),
                                                    th: ({ children }) => (
                                                        <th className="border-b border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-wide text-gray-300">
                                                            {children}
                                                        </th>
                                                    ),
                                                    td: ({ children }) => (
                                                        <td className="border-b border-white/10 px-3 py-2 text-gray-200">
                                                            {children}
                                                        </td>
                                                    ),
                                                    pre: ({ children }) => (
                                                        <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-blue-100">
                                                            {children}
                                                        </pre>
                                                    ),
                                                    code: (props: any) => {
                                                        const { inline, className, children } = props;
                                                        const isInline = inline ?? !className;
                                                        return isInline ? (
                                                            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-blue-200">
                                                                {children}
                                                            </code>
                                                        ) : (
                                                            <code className="whitespace-pre-wrap text-blue-100">
                                                                {children}
                                                            </code>
                                                        );
                                                    }
                    }}
                >
                    {metricsSpecMarkdown}
                </ReactMarkdown>
            </ProofOfWorkModal>

            <HowToModal isOpen={howToOpen} onClose={() => setHowToOpen(false)} />
        </div>
    );
}
