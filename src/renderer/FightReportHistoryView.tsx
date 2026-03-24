import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportIndexEntry, ReportPayload } from '../shared/reportTypes';
import { normalizeReportPayload } from '../shared/reportNormalization';

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
    // setDeleteLoading used in Task 10 delete handler
    void setDeleteLoading;

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
                <div className="flex-1 min-h-0 flex items-center justify-center text-sm"
                     style={{ color: 'var(--text-secondary)' }}>
                    {indexLoading
                        ? 'Loading reports...'
                        : indexEntries.length === 0
                            ? 'No reports found.'
                            : `${indexEntries.length} report(s) — list panel coming in Task 8`}
                    {detailError && <span className="ml-2 text-red-300">{detailError}</span>}
                    {detailLoading && <span className="ml-2 opacity-0">{detailLoading}</span>}
                    {deleteMode && <span className="ml-2">({selectedForDelete.size} selected)</span>}
                    {deleteLoading && <span className="ml-2">Deleting...</span>}
                    <RepoDropdown options={repoOptions} selected={selectedOption} onSelect={setSelectedRepoKey} />
                    {indexEntries.map((e) => (
                        <button key={e.id} type="button" onClick={() => handleCardClick(e)} className="hidden">{e.title}</button>
                    ))}
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex items-center justify-center text-sm"
                     style={{ color: 'var(--text-secondary)' }}>
                    Detail panel — Task 9
                </div>
            )}
        </div>
    );
}
