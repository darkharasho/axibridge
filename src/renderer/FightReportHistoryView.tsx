import { Copy, MoreHorizontal, Search, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ParticleHover } from './particles';
import type { ReportIndexEntry, ReportPayload } from '../shared/reportTypes';
import { normalizeReportPayload } from '../shared/reportNormalization';
import { StatsView } from './StatsView';
import { CategoryBar } from './stats/CategoryBar';
import { useStatsStore } from './stats/statsStore';

type HistoryRepoOption = {
    key: string;
    label: string;
    indexUrl: string;
};

const resolveReportsIndexUrl = (settings: any): string | null => {
    const explicitBase = typeof settings?.githubPagesBaseUrl === 'string'
        ? settings.githubPagesBaseUrl.trim()
        : '';
    if (explicitBase) {
        return explicitBase.replace(/\/$/, '');
    }
    const owner = typeof settings?.githubRepoOwner === 'string'
        ? settings.githubRepoOwner.trim()
        : '';
    const repo = typeof settings?.githubRepoName === 'string'
        ? settings.githubRepoName.trim()
        : '';
    if (!owner || !repo) return null;
    return `https://${owner}.github.io/${repo}`;
};

export const matchesReportSearch = (entry: ReportIndexEntry, q: string): boolean => {
    const title = (entry.title || '').toLowerCase();
    const dateLabel = (entry.dateLabel || '').toLowerCase();
    const commanders = (entry.commanders || []).join(' ').toLowerCase();
    const guild = `${entry.guild?.name || ''} ${entry.guild?.tag || ''}`.toLowerCase();
    return title.includes(q) || dateLabel.includes(q) || commanders.includes(q) || guild.includes(q);
};

const parseRepoFullName = (fullName: string): { owner: string; repo: string } | null => {
    const [owner, ...repoParts] = fullName.split('/');
    const repo = repoParts.join('/').trim();
    if (!owner?.trim() || !repo) return null;
    return { owner: owner.trim(), repo };
};

const buildRepoOptions = (settings: any): HistoryRepoOption[] => {
    const defaultBaseUrl = resolveReportsIndexUrl(settings);
    const defaultOwner = typeof settings?.githubRepoOwner === 'string'
        ? settings.githubRepoOwner.trim()
        : '';
    const defaultRepo = typeof settings?.githubRepoName === 'string'
        ? settings.githubRepoName.trim()
        : '';
    const defaultFullName = defaultOwner && defaultRepo
        ? `${defaultOwner}/${defaultRepo}`
        : '';
    const seen = new Set<string>();
    const options: HistoryRepoOption[] = [];

    const pushOption = (fullName: string, label: string, explicitBaseUrl?: string | null) => {
        const repo = parseRepoFullName(fullName);
        if (!repo || seen.has(fullName)) return;
        const baseUrl = explicitBaseUrl?.trim() || `https://${repo.owner}.github.io/${repo.repo}`;
        seen.add(fullName);
        options.push({
            key: fullName,
            label,
            indexUrl: baseUrl
        });
    };

    if (defaultFullName && defaultBaseUrl) {
        pushOption(defaultFullName, `${defaultFullName} (Default)`, defaultBaseUrl);
    }

    const favorites: string[] = Array.isArray(settings?.githubFavoriteRepos)
        ? settings.githubFavoriteRepos.filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];

    favorites.forEach((fullName) => {
        pushOption(fullName.trim(), fullName.trim());
    });

    return options;
};

function RepoDropdown({ options, selected, onSelect }: { options: HistoryRepoOption[]; selected: HistoryRepoOption; onSelect: (key: string) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [open]);

    return (
        <div className="relative w-full md:w-80 shrink-0" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="axi-picker__btn justify-between"
                aria-label="Select GitHub Pages history source"
                aria-expanded={open}
            >
                <span className="truncate">{selected.label}</span>
            </button>
            {open && (
                <div className="app-dropdown axi-panel axi-panel--tile axi-panel--float absolute z-50 mt-1 w-full overflow-auto max-h-60 [--axi-panel-pad:4px_0]">
                    {options.map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => { onSelect(option.key); setOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${option.key === selected.key ? 'font-medium' : ''}`}
                            style={{ color: option.key === selected.key ? 'var(--axi-accent)' : 'var(--axi-text)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--axi-surface-raised-paint)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

type HistoryTab = { id: string; title: string; report: ReportPayload };

export function FightReportHistoryView() {
    const MAX_OPEN_TABS = 5;
    const [repoOptions, setRepoOptions] = useState<HistoryRepoOption[]>([]);
    const [selectedRepoKey, setSelectedRepoKey] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [indexEntries, setIndexEntries] = useState<ReportIndexEntry[]>([]);
    const [indexLoading, setIndexLoading] = useState(false);
    const [tabs, setTabs] = useState<HistoryTab[]>([]);
    const [activeTab, setActiveTab] = useState<string>('list');
    const [detailLoading, setDetailLoading] = useState<string | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [deleteMode, setDeleteMode] = useState(false);
    const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [commanderFilter, setCommanderFilter] = useState<string>('');
    const [sectionVisibility, setSectionVisibility] = useState<((id: string) => boolean) | null>(null);
    const handleSectionVisibilityChange = useCallback((fn: (id: string) => boolean) => {
        setSectionVisibility(() => fn);
    }, []);
    // Search-palette jump target for the embedded StatsView below. Routes through the
    // same store CategoryBar reads, so the bar's active-category highlight (and
    // the sectionVisibility it pushes down) follow a palette-driven category switch.
    const handleRequestCategory = useCallback((categoryId: string) => {
        useStatsStore.getState().setActiveCategory(categoryId);
    }, []);
    const [commanderDropdownOpen, setCommanderDropdownOpen] = useState(false);
    const commanderDropdownRef = useRef<HTMLDivElement>(null);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        if (!commanderDropdownOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (commanderDropdownRef.current && !commanderDropdownRef.current.contains(e.target as Node)) setCommanderDropdownOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [commanderDropdownOpen]);

    useEffect(() => {
        if (!menuOpenId) return;
        const handler = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('[data-card-menu]')) setMenuOpenId(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpenId]);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                if (!window.electronAPI?.getSettings) {
                    if (mounted) setError('Settings API is unavailable in this build.');
                    return;
                }
                const settings = await window.electronAPI.getSettings();
                if (!mounted) return;
                const options = buildRepoOptions(settings);
                if (!options.length) {
                    setError('GitHub Pages is not configured. Set your GitHub repository in Settings first.');
                    setRepoOptions([]);
                    setSelectedRepoKey('');
                    return;
                }
                setRepoOptions(options);
                setSelectedRepoKey((current) => (
                    current && options.some((option) => option.key === current)
                        ? current
                        : options[0]?.key || ''
                ));
                setError(null);
            } catch (err: any) {
                if (!mounted) return;
                setError(err?.message || 'Unable to load GitHub Pages settings.');
                setRepoOptions([]);
                setSelectedRepoKey('');
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const selectedOption = repoOptions.find((o) => o.key === selectedRepoKey) || repoOptions[0] || null;
    const selectedRepo = selectedOption ? parseRepoFullName(selectedOption.key) : null;
    const defaultRepo = repoOptions[0] ? parseRepoFullName(repoOptions[0].key) : null;
    const isOverride = !!(selectedRepo && defaultRepo && selectedOption?.key !== repoOptions[0]?.key);

    const allCommanders = useMemo(() => {
        const set = new Set<string>();
        for (const entry of indexEntries) {
            for (const c of entry.commanders || []) {
                if (c) set.add(c);
            }
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [indexEntries]);

    const filteredEntries = useMemo(() => {
        let entries = indexEntries;
        if (commanderFilter) {
            entries = entries.filter((entry) => (entry.commanders || []).includes(commanderFilter));
        }
        const q = searchQuery.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter((entry) => matchesReportSearch(entry, q));
    }, [indexEntries, searchQuery, commanderFilter]);

    const fetchIndex = useCallback(async () => {
        if (!selectedRepo) return;
        setIndexLoading(true);
        setIndexEntries([]);
        setError(null);
        try {
            const payload = isOverride ? { owner: selectedRepo.owner, repo: selectedRepo.repo } : undefined;
            const result = await window.electronAPI.getGithubReports(payload);
            if (result?.success) {
                setIndexEntries(Array.isArray(result.reports) ? result.reports : []);
            } else {
                setError(result?.error || 'Failed to load reports.');
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to load reports.');
        } finally {
            setIndexLoading(false);
        }
    }, [selectedRepoKey, isOverride, selectedRepo?.owner, selectedRepo?.repo]);

    useEffect(() => {
        if (!selectedRepoKey) return;
        setTabs([]);
        setActiveTab('list');
        setDeleteMode(false);
        setSelectedForDelete(new Set());
        setSearchQuery('');
        setCommanderFilter('');
        fetchIndex();
    }, [selectedRepoKey, fetchIndex]);

    const closeTab = (tabId: string) => {
        setTabs((prev) => prev.filter((t) => t.id !== tabId));
        setActiveTab((prev) => prev === tabId ? 'list' : prev);
    };

    const openReportTab = (report: ReportPayload) => {
        const id = report.meta.id;
        const existing = tabs.find((t) => t.id === id);
        if (existing) {
            setActiveTab(id);
            return;
        }
        setTabs((prev) => {
            const next = [...prev, { id, title: report.meta.title || report.meta.dateLabel || id, report }];
            if (next.length > MAX_OPEN_TABS) next.shift();
            return next;
        });
        setActiveTab(id);
    };

    const handleCardClick = async (entry: ReportIndexEntry) => {
        if (deleteMode) {
            setSelectedForDelete((prev) => {
                const next = new Set(prev);
                next.has(entry.id) ? next.delete(entry.id) : next.add(entry.id);
                return next;
            });
            return;
        }
        if (tabs.find((t) => t.id === entry.id)) {
            setActiveTab(entry.id);
            return;
        }
        setDetailLoading(entry.id);
        setDetailError(null);
        try {
            const payload: any = { reportId: entry.id };
            if (isOverride && selectedRepo) {
                payload.owner = selectedRepo.owner;
                payload.repo = selectedRepo.repo;
            }
            const result = await window.electronAPI.getGithubReportDetail(payload);
            if (result?.success && result.report) {
                const normalized = normalizeReportPayload(result.report);
                openReportTab(normalized);
            } else {
                setDetailError(result?.error || 'Failed to load report.');
            }
        } catch (err: any) {
            setDetailError(err?.message || 'Failed to load report.');
        } finally {
            setDetailLoading(null);
        }
    };

    const allFilteredSelected = filteredEntries.length > 0
        && filteredEntries.every((entry) => selectedForDelete.has(entry.id));

    const handleToggleSelectAll = () => {
        setSelectedForDelete((prev) => {
            if (allFilteredSelected) {
                const next = new Set(prev);
                filteredEntries.forEach((entry) => next.delete(entry.id));
                return next;
            }
            const next = new Set(prev);
            filteredEntries.forEach((entry) => next.add(entry.id));
            return next;
        });
    };

    const handleDeleteSelected = async () => {
        const ids = Array.from(selectedForDelete);
        if (ids.length === 0) return;
        const confirmed = window.confirm(
            `Delete ${ids.length} report${ids.length === 1 ? '' : 's'} from GitHub? This cannot be undone.`
        );
        if (!confirmed) return;
        setDeleteLoading(true);
        try {
            const payload: any = { ids };
            if (isOverride && selectedRepo) {
                payload.owner = selectedRepo.owner;
                payload.repo = selectedRepo.repo;
            }
            const result = await window.electronAPI.deleteGithubReports(payload);
            if (result?.success) {
                setTabs((prev) => prev.filter((t) => !ids.includes(t.id)));
                setActiveTab((prev) => ids.includes(prev) ? 'list' : prev);
                setSelectedForDelete(new Set());
                setDeleteMode(false);
                await fetchIndex();
            } else {
                setDetailError(result?.error || 'Failed to delete reports.');
            }
        } catch (err: any) {
            setDetailError(err?.message || 'Failed to delete reports.');
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleDeleteOne = async (entry: ReportIndexEntry) => {
        setMenuOpenId(null);
        const confirmed = window.confirm(
            `Delete "${entry.title}" from GitHub? This cannot be undone.`
        );
        if (!confirmed) return;
        setDeleteLoading(true);
        try {
            const payload: any = { ids: [entry.id] };
            if (isOverride && selectedRepo) {
                payload.owner = selectedRepo.owner;
                payload.repo = selectedRepo.repo;
            }
            const result = await window.electronAPI.deleteGithubReports(payload);
            if (result?.success) {
                setTabs((prev) => prev.filter((t) => t.id !== entry.id));
                setActiveTab((prev) => prev === entry.id ? 'list' : prev);
                await fetchIndex();
            } else {
                setDetailError(result?.error || 'Failed to delete report.');
            }
        } catch (err: any) {
            setDetailError(err?.message || 'Failed to delete report.');
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleCopyLink = (entry: ReportIndexEntry) => {
        setMenuOpenId(null);
        if (entry.url) {
            navigator.clipboard.writeText(entry.url);
            setCopiedId(entry.id);
            setTimeout(() => setCopiedId((prev) => (prev === entry.id ? null : prev)), 1500);
        }
    };

    if (error) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center">
                <div className="axi-well axi-well--sm text-sm axi-ink-danger axi-edge-danger">
                    {error}
                </div>
            </div>
        );
    }

    if (!selectedOption) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center text-sm axi-ink-dim">
                Loading report index...
            </div>
        );
    }

    return (
        <div className="history-view flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Tab bar. Upstream's strip: an open report is a closable tab, so
                each one pairs its label with an .axi-tabs__close, and the tab
                you are reading is filled rather than underlined - the language
                has one way to say "this one is on" and the fill is it. */}
            <div className="history-tabs border-b border-b-[length:var(--axi-border-control)] axi-edge-line bg-[color:var(--axi-ground)] px-4 pt-1.5">
                <nav className="axi-tabs items-center">
                    <button type="button" onClick={() => setActiveTab('list')}
                        aria-current={activeTab === 'list' ? 'page' : undefined}>
                        Reports
                    </button>
                    {tabs.map((tab) => (
                        <span key={tab.id} className="axi-tabs__tab max-w-[180px]">
                            <button type="button" onClick={() => setActiveTab(tab.id)}
                                aria-current={activeTab === tab.id ? 'page' : undefined}>
                                {tab.title}
                            </button>
                            <button type="button" className="axi-tabs__close"
                                aria-label={`Close ${tab.title}`}
                                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}>
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </nav>
            </div>

            {/* Content area */}
            {activeTab !== 'list' ? (() => {
                const activeReport = tabs.find((t) => t.id === activeTab);
                return activeReport ? (
                    <div className="flex-1 min-h-0 flex gap-3 px-4 pt-2 pb-2">
                        <CategoryBar onSectionVisibilityChange={handleSectionVisibilityChange} />
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            <StatsView
                                logs={[]}
                                onBack={() => setActiveTab('list')}
                                precomputedStats={activeReport.report.stats}
                                statsViewSettings={activeReport.report.stats?.statsViewSettings}
                                dashboardTitle={activeReport.title}
                                sectionVisibility={sectionVisibility || undefined}
                                onRequestCategory={handleRequestCategory}
                                embedded
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex items-center justify-center text-sm" style={{ color: 'var(--axi-text-dim)' }}>
                        Report not found. It may have been closed.
                    </div>
                );
            })() : (
            <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === 'list' ? (
                <motion.div
                    key="list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="px-4 pb-4"
                >
                    {/* Repo bar */}
                    <motion.div
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="history-source-bar axi-panel [--axi-panel-pad:12px_16px] mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                    >
                        <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--axi-text-dim)' }}>History Source</div>
                            <div className="text-xs" style={{ color: 'var(--axi-text-dim)' }}>Browse your published fight reports.</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <RepoDropdown options={repoOptions} selected={selectedOption} onSelect={setSelectedRepoKey} />
                            {deleteMode && filteredEntries.length > 0 && (
                                <button type="button"
                                    onClick={handleToggleSelectAll}
                                    aria-pressed={allFilteredSelected}
                                    className="axi-pill axi-pill--sm">
                                    {allFilteredSelected ? 'Deselect All' : `Select All (${filteredEntries.length})`}
                                </button>
                            )}
                            <button type="button"
                                onClick={() => { setDeleteMode((v) => !v); setSelectedForDelete(new Set()); }}
                                aria-pressed={deleteMode}
                                className="axi-pill axi-pill--sm">
                                {deleteMode ? 'Cancel' : 'Manage'}
                            </button>
                        </div>
                    </motion.div>

                    {/* Search + Commander filter */}
                    {!indexLoading && indexEntries.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.25, delay: 0.1 }}
                            className="mb-3 flex gap-2"
                        >
                            <div className="axi-search flex-1">
                                <Search className="axi-search__icon w-3.5 h-3.5" aria-hidden="true" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search by title, commander, or date..."
                                    className="axi-input"
                                />
                            </div>
                            {allCommanders.length > 1 && (
                                <div className="relative shrink-0" ref={commanderDropdownRef}>
                                    <button
                                        type="button"
                                        onClick={() => setCommanderDropdownOpen((v) => !v)}
                                        aria-expanded={commanderDropdownOpen}
                                        /* A filter that is set is a thing you picked, and the accent
                                           edge is the ink layer's word for that on a control that is
                                           not a panel. */
                                        className={`axi-picker__btn justify-between ${commanderFilter ? 'axi-edge-accent' : ''}`}
                                    >
                                        <span className="truncate max-w-[140px]">{commanderFilter || 'Commander'}</span>
                                    </button>
                                    {commanderDropdownOpen && (
                                        <div
                                            className="app-dropdown axi-panel axi-panel--tile axi-panel--float absolute z-50 mt-1 right-0 w-56 overflow-auto max-h-60 [--axi-panel-pad:4px_0]"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => { setCommanderFilter(''); setCommanderDropdownOpen(false); }}
                                                className="w-full text-left px-3 py-2 text-sm"
                                                style={{ color: !commanderFilter ? 'var(--axi-accent)' : 'var(--axi-text)' }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--axi-surface-raised-paint)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                All Commanders
                                            </button>
                                            {allCommanders.map((cmdr) => (
                                                <button
                                                    key={cmdr}
                                                    type="button"
                                                    onClick={() => { setCommanderFilter(cmdr); setCommanderDropdownOpen(false); }}
                                                    className={`w-full text-left px-3 py-2 text-sm ${commanderFilter === cmdr ? 'font-medium' : ''}`}
                                                    style={{ color: commanderFilter === cmdr ? 'var(--axi-accent)' : 'var(--axi-text)' }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--axi-surface-raised-paint)')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    {cmdr}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {detailError && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2 }}
                            className="axi-well axi-well--sm axi-edge-danger mb-4 text-sm axi-ink-danger"
                        >
                            {detailError}
                        </motion.div>
                    )}

                    {indexLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3, delay: 0.1 }}
                            className="flex items-center justify-center py-12 text-sm"
                            style={{ color: 'var(--axi-text-dim)' }}
                        >
                            Loading reports...
                        </motion.div>
                    )}

                    {!indexLoading && !error && filteredEntries.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.3 }}
                            className="flex items-center justify-center py-12 text-sm"
                            style={{ color: 'var(--axi-text-dim)' }}
                        >
                            {searchQuery.trim() ? 'No reports match your search.' : 'No reports found.'}
                        </motion.div>
                    )}

                    {!indexLoading && filteredEntries.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {filteredEntries.map((entry, i) => (
                                <motion.div
                                    key={entry.id}
                                    role="button"
                                    tabIndex={0}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.4), ease: 'easeOut' }}
                                    onClick={() => handleCardClick(entry)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(entry); } }}
                                    /* A report is a page's worth of content, so these stay at the
                                       panel step rather than becoming tiles: the chrome above them -
                                       the source bar, the search field, the filter - is at the control
                                       step, and that gap is what makes the cards read as the thing you
                                       are meant to click. Being marked for deletion is a thing you
                                       picked: the panel says so from aria-pressed, which is also the
                                       first time assistive tech has been told. */
                                    aria-pressed={deleteMode ? selectedForDelete.has(entry.id) : undefined}
                                    className="history-card relative text-left cursor-pointer axi-panel [--axi-panel-pad:16px]"
                                    style={{ opacity: detailLoading === entry.id ? 0.6 : 1 }}
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                >
                                    {/* 3-dot menu */}
                                    {!deleteMode && (
                                        <div
                                            data-card-menu
                                            className="absolute top-2 right-2"
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => e.stopPropagation()}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setMenuOpenId((prev) => prev === entry.id ? null : entry.id)}
                                                className={`axi-btn axi-btn--icon w-6 h-6 justify-center ${menuOpenId === entry.id ? 'axi-ink-plain' : 'axi-ink-faint'}`}
                                                aria-label="Report options"
                                                aria-expanded={menuOpenId === entry.id}
                                            >
                                                <MoreHorizontal className="w-3.5 h-3.5" />
                                            </button>
                                            {menuOpenId === entry.id && (
                                                <div
                                                    className="app-dropdown axi-panel axi-panel--tile axi-panel--float absolute right-0 top-full mt-1 w-36 z-50 [--axi-panel-pad:4px_0]"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyLink(entry)}
                                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors"
                                                        style={{ color: copiedId === entry.id ? 'var(--axi-ok)' : 'var(--axi-text)' }}
                                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--axi-surface-raised-paint)')}
                                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        <Copy className="w-3 h-3 shrink-0" />
                                                        {copiedId === entry.id ? 'Copied!' : 'Copy link'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteOne(entry)}
                                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left transition-colors"
                                                        style={{ color: 'var(--axi-danger)' }}
                                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--axi-surface-raised-paint)')}
                                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        <Trash2 className="w-3 h-3 shrink-0" />
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {deleteMode && (
                                        <div className="mb-2">
                                            <input type="checkbox" checked={selectedForDelete.has(entry.id)} readOnly className="axi-check" style={{ '--axi-check-size': '18px' } as CSSProperties} />
                                        </div>
                                    )}
                                    <div className="text-sm font-semibold pr-6 flex items-center gap-2" style={{ color: 'var(--axi-text)' }}>
                                        <span className="truncate">{entry.title}</span>
                                        {entry.guild?.tag && (
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setSearchQuery(entry.guild?.tag || '');
                                                }}
                                                className="axi-btn axi-btn--xs shrink-0"
                                                style={{ borderColor: 'var(--axi-rule)', color: 'var(--axi-text-dim)' }}
                                                title={`Search reports by ${entry.guild?.name || entry.guild?.tag}`}
                                            >
                                                [{entry.guild.tag}]
                                            </button>
                                        )}
                                    </div>
                                    <div className="text-[11px] mt-1" style={{ color: 'var(--axi-text-dim)' }}>
                                        {entry.dateLabel || `${entry.dateStart} — ${entry.dateEnd}`}
                                    </div>
                                    {entry.commanders?.length > 0 && (
                                        <div className="text-[11px] mt-1" style={{ color: 'var(--axi-accent)' }}>
                                            {entry.commanders.join(', ')}
                                        </div>
                                    )}
                                    {entry.summary && (
                                        <div className="flex gap-4 mt-2 pt-2" style={{ borderTop: 'var(--axi-border-control) solid var(--axi-ink-line)' }}>
                                            {entry.summary.avgSquadSize != null && (
                                                <div>
                                                    <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--axi-text-dim)' }}>Squad</div>
                                                    <div className="text-sm font-semibold" style={{ color: 'var(--axi-text)' }}>~{Math.round(entry.summary.avgSquadSize)}</div>
                                                </div>
                                            )}
                                            {entry.summary.avgEnemySize != null && (
                                                <div>
                                                    <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--axi-text-dim)' }}>Enemy</div>
                                                    <div className="text-sm font-semibold" style={{ color: 'var(--axi-text)' }}>~{Math.round(entry.summary.avgEnemySize)}</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {entry.summary?.mapSlices && entry.summary.mapSlices.length > 0 && (
                                        <div className="history-card__slices axi-meter mt-2" style={{ '--axi-meter-h': '8px' } as CSSProperties}>
                                            {entry.summary.mapSlices.map((slice, si) => (
                                                <div key={si} className="axi-meter__fill" style={{ '--axi-meter-v': `${slice.value}%`, '--axi-series': slice.color } as CSSProperties} />
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    )}

                    <AnimatePresence>
                    {deleteMode && selectedForDelete.size > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            // The other dock, on the other edge: this bar IS
                            // the bottom of the report list, so its border
                            // faces up at the cards scrolling under it.
                            // `-mx-4` is what makes it flush - it cancels the
                            // page gutter so the bar runs to the container's
                            // edges - and the padding it used to write inline
                            // (px-4 py-3) is exactly --axi-dock-pad's default,
                            // so it is not restated here.
                            className="axi-dock axi-dock--end sticky bottom-0 -mx-4"
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm" style={{ color: 'var(--axi-text-dim)' }}>
                                    {selectedForDelete.size} report{selectedForDelete.size === 1 ? '' : 's'} selected
                                </span>
                                <ParticleHover className="rounded-[var(--axi-radius-sm)]" color="#ef4444">
                                    <button type="button" onClick={handleDeleteSelected} disabled={deleteLoading}
                                        className="axi-btn axi-ink-danger axi-edge-danger">
                                        {deleteLoading ? 'Deleting...' : 'Delete Selected'}
                                    </button>
                                </ParticleHover>
                            </div>
                        </motion.div>
                    )}
                    </AnimatePresence>
                </motion.div>
            ) : null}
            </div>
            )}
        </div>
    );
}
