import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportIndexEntry, ReportPayload } from '../shared/reportTypes';
import { normalizeReportPayload } from '../shared/reportNormalization';
import { StatsView } from './StatsView';

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
    // setDeleteLoading / deleteLoading used in Task 10 delete handler and toolbar
    void setDeleteLoading;
    void deleteLoading;

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
        <div className="flex-1 min-h-0 -mx-8 -mb-2 flex flex-col">
            {/* Tab bar */}
            <div className="flex items-center gap-0 border-b" style={{ borderColor: 'var(--border-default)' }}>
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
            {activeTab === 'list' ? (
                <div className="flex-1 min-h-0 overflow-y-auto px-8 pb-4">
                    {/* Repo bar */}
                    <div className="rounded-[4px] px-4 py-3 mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                         style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
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
                    </div>

                    {detailError && (
                        <div className="rounded-[4px] px-4 py-3 mb-4 text-sm text-red-300"
                             style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
                            {detailError}
                        </div>
                    )}

                    {indexLoading && (
                        <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            Loading reports...
                        </div>
                    )}

                    {!indexLoading && !error && indexEntries.length === 0 && (
                        <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>
                            No reports found.
                        </div>
                    )}

                    {!indexLoading && indexEntries.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {indexEntries.map((entry) => (
                                <button key={entry.id} type="button"
                                    onClick={() => handleCardClick(entry)}
                                    className="text-left rounded-[6px] p-4 transition-colors"
                                    style={{
                                        background: 'var(--bg-card)',
                                        border: `1px solid ${selectedForDelete.has(entry.id) ? 'var(--brand-primary)' : 'var(--border-default)'}`,
                                        opacity: detailLoading === entry.id ? 0.6 : 1
                                    }}>
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
                                            {entry.summary.mapSlices.map((slice, i) => (
                                                <div key={i} style={{ width: `${slice.value}%`, background: slice.color }} />
                                            ))}
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (() => {
                const activeReport = tabs.find((t) => t.id === activeTab);
                return activeReport ? (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        <StatsView
                            logs={[]}
                            onBack={() => setActiveTab('list')}
                            precomputedStats={activeReport.report.stats}
                            statsViewSettings={activeReport.report.stats?.statsViewSettings}
                            embedded
                            dashboardTitle={activeReport.title}
                        />
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex items-center justify-center text-sm"
                         style={{ color: 'var(--text-secondary)' }}>
                        Report not found. It may have been closed.
                    </div>
                );
            })()}
        </div>
    );
}
