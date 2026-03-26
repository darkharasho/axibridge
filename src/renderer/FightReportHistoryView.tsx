import { ChevronDown, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportIndexEntry, ReportPayload } from '../shared/reportTypes';
import { normalizeReportPayload } from '../shared/reportNormalization';
import { StatsView } from './StatsView';
import { StatsNavSidebar } from './stats/StatsNavSidebar';

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
                className="w-full flex items-center justify-between rounded-[4px] pl-3 pr-3 py-2.5 text-sm text-left"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                aria-label="Select GitHub Pages history source"
                aria-expanded={open}
            >
                <span className="truncate">{selected.label}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-secondary)' }} />
            </button>
            {open && (
                <div className="app-dropdown absolute z-50 mt-1 w-full rounded-[4px] py-1 overflow-auto max-h-60" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)', boxShadow: 'var(--shadow-dropdown)' }}>
                    {options.map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => { onSelect(option.key); setOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${option.key === selected.key ? 'font-medium' : ''}`}
                            style={{ color: option.key === selected.key ? 'var(--brand-primary)' : 'var(--text-primary)' }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
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
    const [commanderDropdownOpen, setCommanderDropdownOpen] = useState(false);
    const commanderDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!commanderDropdownOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (commanderDropdownRef.current && !commanderDropdownRef.current.contains(e.target as Node)) setCommanderDropdownOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [commanderDropdownOpen]);

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
        return entries.filter((entry) => {
            const title = (entry.title || '').toLowerCase();
            const dateLabel = (entry.dateLabel || '').toLowerCase();
            const commanders = (entry.commanders || []).join(' ').toLowerCase();
            return title.includes(q) || dateLabel.includes(q) || commanders.includes(q);
        });
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

    if (error) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center">
                <div className="rounded-[4px] px-4 py-3 text-sm text-red-300" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                    {error}
                </div>
            </div>
        );
    }

    if (!selectedOption) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-gray-400">
                Loading report index...
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center gap-0 border-b px-4" style={{ borderColor: 'var(--border-default)' }}>
                <button type="button" onClick={() => setActiveTab('list')}
                    className="px-4 py-2 text-xs"
                    style={{
                        color: activeTab === 'list' ? 'var(--brand-primary)' : 'var(--text-secondary)',
                        borderBottom: activeTab === 'list' ? '2px solid var(--brand-primary)' : '2px solid transparent'
                    }}>
                    Reports
                </button>
                {tabs.map((tab) => (
                    <div key={tab.id} className="flex items-center max-w-[180px]">
                        <button type="button" onClick={() => setActiveTab(tab.id)}
                            className="px-3 py-2 text-xs truncate"
                            style={{
                                color: activeTab === tab.id ? 'var(--brand-primary)' : 'var(--text-secondary)',
                                borderBottom: activeTab === tab.id ? '2px solid var(--brand-primary)' : '2px solid transparent'
                            }}>
                            {tab.title}
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                            className="px-1 text-[10px] opacity-50 hover:opacity-100"
                            style={{ color: 'var(--text-secondary)' }}>
                            ✕
                        </button>
                    </div>
                ))}
            </div>

            {/* Content area */}
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
                        className="rounded-[4px] px-4 py-3 mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
                    >
                        <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)' }}>History Source</div>
                            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Browse your published fight reports.</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <RepoDropdown options={repoOptions} selected={selectedOption} onSelect={setSelectedRepoKey} />
                            <button type="button"
                                onClick={() => { setDeleteMode((v) => !v); setSelectedForDelete(new Set()); }}
                                className="px-3 py-2 rounded-[4px] text-xs"
                                style={{
                                    background: deleteMode ? 'var(--brand-primary)' : 'var(--bg-input)',
                                    color: deleteMode ? '#fff' : 'var(--text-secondary)',
                                    border: '1px solid var(--border-default)'
                                }}>
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
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-secondary)' }} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search by title, commander, or date..."
                                    className="w-full rounded-[4px] pl-8 pr-3 py-2 text-sm outline-none"
                                    style={{
                                        background: 'var(--bg-input)',
                                        border: '1px solid var(--border-default)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            </div>
                            {allCommanders.length > 1 && (
                                <div className="relative shrink-0" ref={commanderDropdownRef}>
                                    <button
                                        type="button"
                                        onClick={() => setCommanderDropdownOpen((v) => !v)}
                                        className="flex items-center gap-1.5 rounded-[4px] px-3 py-2 text-sm whitespace-nowrap"
                                        style={{
                                            background: commanderFilter ? 'color-mix(in srgb, var(--brand-primary) 15%, var(--bg-input))' : 'var(--bg-input)',
                                            border: `1px solid ${commanderFilter ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                                            color: commanderFilter ? 'var(--brand-primary)' : 'var(--text-secondary)',
                                        }}
                                    >
                                        <span className="truncate max-w-[140px]">{commanderFilter || 'Commander'}</span>
                                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${commanderDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {commanderDropdownOpen && (
                                        <div
                                            className="absolute z-50 mt-1 right-0 w-56 rounded-[4px] py-1 overflow-auto max-h-60"
                                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-hover)', boxShadow: 'var(--shadow-dropdown)' }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => { setCommanderFilter(''); setCommanderDropdownOpen(false); }}
                                                className="w-full text-left px-3 py-2 text-sm"
                                                style={{ color: !commanderFilter ? 'var(--brand-primary)' : 'var(--text-primary)' }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
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
                                                    style={{ color: commanderFilter === cmdr ? 'var(--brand-primary)' : 'var(--text-primary)' }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
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
                            className="rounded-[4px] px-4 py-3 mb-4 text-sm text-red-300"
                            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
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
                            style={{ color: 'var(--text-secondary)' }}
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
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {searchQuery.trim() ? 'No reports match your search.' : 'No reports found.'}
                        </motion.div>
                    )}

                    {!indexLoading && filteredEntries.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {filteredEntries.map((entry, i) => (
                                <motion.button
                                    key={entry.id}
                                    type="button"
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.4), ease: 'easeOut' }}
                                    onClick={() => handleCardClick(entry)}
                                    className="text-left rounded-[6px] p-4 transition-colors"
                                    style={{
                                        background: 'var(--bg-card)',
                                        border: `1px solid ${selectedForDelete.has(entry.id) ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                                        opacity: detailLoading === entry.id ? 0.6 : 1
                                    }}
                                    whileHover={{ scale: 1.01, borderColor: 'rgba(255,255,255,0.15)' }}
                                    whileTap={{ scale: 0.99 }}
                                >
                                    {deleteMode && (
                                        <div className="mb-2">
                                            <input type="checkbox" checked={selectedForDelete.has(entry.id)} readOnly className="accent-blue-500" />
                                        </div>
                                    )}
                                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{entry.title}</div>
                                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                                        {entry.dateLabel || `${entry.dateStart} — ${entry.dateEnd}`}
                                    </div>
                                    {entry.commanders?.length > 0 && (
                                        <div className="text-[11px] mt-1" style={{ color: 'var(--brand-primary)' }}>
                                            {entry.commanders.join(', ')}
                                        </div>
                                    )}
                                    {entry.summary && (
                                        <div className="flex gap-4 mt-2 pt-2" style={{ borderTop: '1px solid var(--border-default)' }}>
                                            {entry.summary.avgSquadSize != null && (
                                                <div>
                                                    <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Squad</div>
                                                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>~{Math.round(entry.summary.avgSquadSize)}</div>
                                                </div>
                                            )}
                                            {entry.summary.avgEnemySize != null && (
                                                <div>
                                                    <div className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Enemy</div>
                                                    <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>~{Math.round(entry.summary.avgEnemySize)}</div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {entry.summary?.mapSlices && entry.summary.mapSlices.length > 0 && (
                                        <div className="flex h-1 rounded-full overflow-hidden mt-2">
                                            {entry.summary.mapSlices.map((slice, si) => (
                                                <div key={si} style={{ width: `${slice.value}%`, background: slice.color }} />
                                            ))}
                                        </div>
                                    )}
                                </motion.button>
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
                            className="sticky bottom-0 py-3"
                            style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border-default)' }}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                    {selectedForDelete.size} report{selectedForDelete.size === 1 ? '' : 's'} selected
                                </span>
                                <button type="button" onClick={handleDeleteSelected} disabled={deleteLoading}
                                    className="px-4 py-2 rounded-[4px] text-sm font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">
                                    {deleteLoading ? 'Deleting...' : 'Delete Selected'}
                                </button>
                            </div>
                        </motion.div>
                    )}
                    </AnimatePresence>
                </motion.div>
            ) : (() => {
                const activeReport = tabs.find((t) => t.id === activeTab);
                return activeReport ? (
                    <motion.div
                        key={`detail-${activeTab}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className="flex h-full gap-3 px-4 pt-2 pb-2"
                    >
                        <StatsNavSidebar onSectionVisibilityChange={handleSectionVisibilityChange} />
                        <div className="flex-1 min-h-0 flex flex-col">
                            <StatsView
                                logs={[]}
                                onBack={() => setActiveTab('list')}
                                precomputedStats={activeReport.report.stats}
                                statsViewSettings={activeReport.report.stats?.statsViewSettings}
                                dashboardTitle={activeReport.title}
                                sectionVisibility={sectionVisibility || undefined}
                                embedded
                            />
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="not-found"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className="flex-1 flex items-center justify-center text-sm"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Report not found. It may have been closed.
                    </motion.div>
                );
            })()}
            </div>
        </div>
    );
}
