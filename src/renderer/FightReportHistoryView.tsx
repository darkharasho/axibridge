import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';

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

export function FightReportHistoryView() {
    const [repoOptions, setRepoOptions] = useState<HistoryRepoOption[]>([]);
    const [selectedRepoKey, setSelectedRepoKey] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

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

    const selectedOption = repoOptions.find((option) => option.key === selectedRepoKey) || repoOptions[0] || null;

    if (error) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center">
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-red-300">
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
            <div className="px-8 pb-3">
                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/65">History Source</div>
                        <div className="text-xs text-gray-400">Switch between your default and starred GitHub Pages sites.</div>
                    </div>
                    <div className="relative w-full md:w-80 shrink-0">
                        <select
                            value={selectedOption.key}
                            onChange={(event) => setSelectedRepoKey(event.target.value)}
                            className="w-full appearance-none bg-black/50 border border-white/10 rounded-xl pl-3 pr-9 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-cyan-400/50"
                            aria-label="Select GitHub Pages history source"
                        >
                            {repoOptions.map((option) => (
                                <option key={option.key} value={option.key}>{option.label}</option>
                            ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-gray-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
                    </div>
                </div>
            </div>
            <div className="flex-1 min-h-0">
                <iframe
                    title="Fight report index"
                    src={selectedOption.indexUrl}
                    className="w-full h-full border-0"
                    referrerPolicy="no-referrer"
                />
            </div>
        </div>
    );
}
