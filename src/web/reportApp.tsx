import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { StatsView } from '../renderer/StatsView';
import { DEFAULT_WEB_THEME, WebTheme } from '../shared/webThemes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import metricsSpecMarkdown from '../shared/metrics-spec.md?raw';
import {
    ShieldCheck,
    CalendarDays,
    Users,
    ExternalLink,
    LayoutDashboard,
    Trophy,
    Swords,
    Activity,
    Map as MapIcon,
    Sparkles,
    HelpingHand,
    HeartPulse,
    Star,
    Skull,
    PanelLeft,
    Zap,
    ArrowLeft,
    ArrowUp,
    X as CloseIcon
} from 'lucide-react';

interface ReportMeta {
    id: string;
    title: string;
    commanders: string[];
    dateStart: string;
    dateEnd: string;
    dateLabel: string;
    generatedAt: string;
    appVersion?: string;
}

interface ReportPayload {
    meta: ReportMeta;
    stats: any;
}

interface ReportIndexEntry {
    id: string;
    title: string;
    commanders: string[];
    dateStart: string;
    dateEnd: string;
    dateLabel: string;
    url: string;
    summary?: {
        borderlandsPct?: number | null;
        mapSlices?: Array<{ name: string; value: number; color: string }>;
        avgSquadSize?: number | null;
        avgEnemySize?: number | null;
    };
}

const glassCard = 'border border-white/10 rounded-2xl shadow-xl backdrop-blur-md';

const formatLocalRange = (start: string, end: string) => {
    try {
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '';
        return `${startDate.toLocaleString()} - ${endDate.toLocaleString()}`;
    } catch {
        return '';
    }
};

const formatReportTitle = (start: string) => {
    const date = new Date(start);
    if (Number.isNaN(date.getTime())) return 'Raid';
    const dateLabel = `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
    const dayName = date.toLocaleDateString(undefined, { weekday: 'long' });
    const hour = date.getHours();
    let period = 'Night';
    if (hour >= 5 && hour < 12) period = 'Morning';
    else if (hour >= 12 && hour < 17) period = 'Afternoon';
    else if (hour >= 17 && hour < 21) period = 'Evening';
    return `${dateLabel} - ${dayName} ${period} Raid`;
};

const MapDonut = ({ slices }: { slices: Array<{ value: number; color: string }> }) => {
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const total = slices.reduce((sum, slice) => sum + (slice.value || 0), 0);
    let offset = 0;
    return (
        <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r={radius} stroke="rgba(255,255,255,0.35)" strokeWidth="6" fill="none" />
            {slices.map((slice, index) => {
                const value = slice.value || 0;
                const segment = total > 0 ? (value / total) * circumference : 0;
                const dasharray = `${segment} ${circumference - segment}`;
                const dashoffset = circumference - offset;
                offset += segment;
                return (
                    <circle
                        key={`${index}-${slice.color}`}
                        cx="24"
                        cy="24"
                        r={radius}
                        stroke={slice.color}
                        strokeWidth="6"
                        fill="none"
                        strokeLinecap="butt"
                        strokeDasharray={dasharray}
                        strokeDashoffset={dashoffset}
                        transform="rotate(-90 24 24)"
                    />
                );
            })}
        </svg>
    );
};

const BorderlandsPie = ({ value }: { value: number | null | undefined }) => {
    const pct = typeof value === 'number' ? Math.min(Math.max(value, 0), 1) : null;
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = pct === null ? circumference : circumference - pct * circumference;
    return (
        <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r={radius} stroke="rgba(255,255,255,0.35)" strokeWidth="6" fill="none" />
            <circle
                cx="24"
                cy="24"
                r={radius}
                stroke="rgba(16,185,129,0.9)"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 24 24)"
            />
            <text x="24" y="27" textAnchor="middle" fontSize="10" fill="#e2e8f0">
                {pct === null ? '--' : `${Math.round(pct * 100)}%`}
            </text>
        </svg>
    );
};

export function ReportApp() {
    const [report, setReport] = useState<ReportPayload | null>(null);
    const [index, setIndex] = useState<ReportIndexEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reportPathHint, setReportPathHint] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [theme, setTheme] = useState<WebTheme | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [logoIsDefault, setLogoIsDefault] = useState(false);
    const [tocOpen, setTocOpen] = useState(false);
    const [uiTheme, setUiTheme] = useState<'classic' | 'modern'>('classic');
    const [proofOfWorkOpen, setProofOfWorkOpen] = useState(false);
    const basePath = useMemo(() => {
        let pathName = window.location.pathname || '/';
        if (pathName.endsWith('/index.html')) {
            pathName = pathName.slice(0, -'/index.html'.length);
        }
        if (pathName.includes('/reports/')) {
            pathName = pathName.replace(/\/reports\/[^/]+\/?$/, '');
        }
        if (!pathName.endsWith('/')) {
            pathName = `${pathName}/`;
        }
        return pathName;
    }, []);
    const resolvedTheme = theme ?? DEFAULT_WEB_THEME;
    const accentRgb = resolvedTheme.rgb;
    const accentVars = {
        '--accent': `rgb(${accentRgb})`,
        '--accent-rgb': accentRgb,
        '--accent-soft': `rgba(${accentRgb}, 0.32)`,
        '--accent-strong': `rgba(${accentRgb}, 0.95)`,
        '--accent-border': `rgba(${accentRgb}, 0.4)`,
        '--accent-glow': `rgba(${accentRgb}, 0.18)`,
        '--accent-glow-soft': `rgba(${accentRgb}, 0.08)`
    } as CSSProperties;
    const isModernUi = uiTheme === 'modern';
    const reportBackgroundImage = resolvedTheme.pattern
        ? (isModernUi
            ? `linear-gradient(180deg, rgba(14, 18, 26, 0.72), rgba(18, 24, 34, 0.78)), ${resolvedTheme.pattern}`
            : resolvedTheme.pattern)
        : undefined;
    const glassCardStyle: CSSProperties = {
        backgroundImage: isModernUi
            ? 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.2), rgba(var(--accent-rgb), 0.06) 70%)'
            : 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.26), rgba(var(--accent-rgb), 0.08) 70%)'
    };

    useEffect(() => {
        let isMounted = true;
        const params = new URLSearchParams(window.location.search);
        const reportId = params.get('report') || window.location.pathname.match(/\/reports\/([^/]+)\/?$/)?.[1] || null;
        const reportPath = reportId ? `${basePath}reports/${reportId}/report.json` : `${basePath}report.json`;
        if (reportId) {
            setReportPathHint(reportPath);
        }

        const normalizeCommanderDistance = (payload: ReportPayload) => {
            const commanders = new Set((payload?.meta?.commanders || []).map((name) => String(name)));
            if (commanders.size === 0) return payload;
            const stats: any = payload.stats;
            if (stats?.leaderboards?.closestToTag) {
                stats.leaderboards.closestToTag = stats.leaderboards.closestToTag.map((entry: any) => {
                    if (commanders.has(String(entry?.account))) {
                        return { ...entry, value: 0 };
                    }
                    return entry;
                });
            }
            if (stats?.closestToTag?.player && commanders.has(String(stats.closestToTag.player))) {
                stats.closestToTag = { ...stats.closestToTag, value: 0 };
            }
            return payload;
        };

        fetch(reportPath, { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                const normalized = normalizeCommanderDistance(data);
                setReport(normalized);
                const themeChoice = normalized?.stats?.uiTheme;
                if (themeChoice === 'modern' || themeChoice === 'classic') {
                    setUiTheme(themeChoice);
                }
            })
            .catch(() => {
                if (reportId) {
                    if (!isMounted) return;
                    setError('Report not found yet. It may still be deploying.');
                }
                fetch(`${basePath}reports/index.json`, { cache: 'no-store' })
                    .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
                    .then((data) => {
                        if (!isMounted) return;
                        setIndex(Array.isArray(data) ? data : []);
                        setUiTheme('classic');
                    })
                    .catch(() => {
                        if (!isMounted) return;
                        setError('No report data found.');
                });
            });
        return () => {
            isMounted = false;
        };
    }, [basePath]);

    useEffect(() => {
        if (report) {
            const dateLabel = report.meta.dateLabel || formatLocalRange(report.meta.dateStart, report.meta.dateEnd);
            document.title = dateLabel
                ? `ArcBridge — ${report.meta.title} — ${dateLabel}`
                : `ArcBridge — ${report.meta.title}`;
            return;
        }
        document.title = 'ArcBridge Reports';
    }, [report]);

    useEffect(() => {
        const body = document.body;
        body.classList.add('web-report');
        body.classList.remove('theme-classic', 'theme-modern');
        body.classList.add(uiTheme === 'modern' ? 'theme-modern' : 'theme-classic');
    }, [uiTheme]);

    useEffect(() => {
        let isMounted = true;
        fetch(`${basePath}theme.json`, { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                setTheme(data);
            })
            .catch(() => {
                if (!isMounted) return;
                setTheme(null);
            });
        return () => {
            isMounted = false;
        };
    }, [basePath]);

    useEffect(() => {
        let isMounted = true;
        fetch(`${basePath}ui-theme.json`, { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                const themeChoice = data?.theme;
                if (themeChoice === 'modern' || themeChoice === 'classic') {
                    setUiTheme(themeChoice);
                }
            })
            .catch(() => {
                if (!isMounted) return;
                setUiTheme('classic');
            });
        return () => {
            isMounted = false;
        };
    }, [basePath]);

    useEffect(() => {
        let isMounted = true;
        fetch(`${basePath}logo.json`, { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                const defaultPath = 'img/ArcBridge.svg';
                const path = data?.path ? String(data.path) : defaultPath;
                const version = data?.updatedAt ? String(data.updatedAt) : '';
                const urlBase = `${basePath}${path}`.replace(/\/{2,}/g, '/');
                const url = version ? `${urlBase}?v=${encodeURIComponent(version)}` : urlBase;
                setLogoUrl(url);
                setLogoIsDefault(!data?.path || path === defaultPath);
            })
            .catch(() => {
                if (!isMounted) return;
                setLogoUrl(null);
                setLogoIsDefault(false);
            });
        return () => {
            isMounted = false;
        };
    }, [basePath]);

    const sortedIndex = useMemo(() => {
        if (!index) return [];
        return [...index].sort((a, b) => {
            const aTime = new Date(a.dateEnd || a.dateStart).getTime();
            const bTime = new Date(b.dateEnd || b.dateStart).getTime();
            return bTime - aTime;
        });
    }, [index]);

    const filteredIndex = useMemo(() => {
        if (!sortedIndex.length) return [];
        const term = searchTerm.trim().toLowerCase();
        if (!term) return sortedIndex;
        return sortedIndex.filter((entry) => {
            const commanders = entry.commanders?.join(' ') || '';
            const haystack = `${entry.title} ${commanders} ${entry.dateLabel}`.toLowerCase();
            return haystack.includes(term);
        });
    }, [sortedIndex, searchTerm]);

    const legalNoticePane = (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-gray-400">
            <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-gray-200">Legal Notice</div>
                <div className="flex items-center gap-2">
                    <a
                        href="https://github.com/darkharasho/ArcBridge"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                    >
                        GitHub
                    </a>
                    <a
                        href="https://discord.gg/UjzMXMGXEg"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border bg-white/5 text-gray-300 border-white/10 hover:text-white"
                    >
                        Discord
                    </a>
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
                <a
                    href="https://www.arena.net/en/legal/content-terms-of-use"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                >
                    Content Terms of Use
                </a>
                . I do not own or profit from this work in any way. Assets were obtained from asset packs distributed by Arenanet.
                The official statement from the Content Terms of Use:
            </p>
            <p className="mt-2">
                © ArenaNet LLC. All rights reserved. NCSOFT, ArenaNet, Guild Wars, Guild Wars 2, GW2, Guild Wars 2: Heart of Thorns,
                Guild Wars 2: Path of Fire, Guild Wars 2: End of Dragons, and Guild Wars 2: Secrets of the Obscure and all associated logos,
                designs, and composite marks are trademarks or registered trademarks of NCSOFT Corporation.
            </p>
            <p className="mt-2">
                See the{' '}
                <a
                    href="https://github.com/darkharasho/ArcBridge/blob/main/LICENSE"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                >
                    LICENSE
                </a>
                {' '}and{' '}
                <a
                    href="https://github.com/darkharasho/ArcBridge/blob/main/THIRD_PARTY_NOTICES.md"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                >
                    THIRD_PARTY_NOTICES.md
                </a>
                {' '}files for full terms and upstream attributions.
            </p>
        </div>
    );

    const proofOfWorkModal = proofOfWorkOpen && (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
            onClick={(event) => event.target === event.currentTarget && setProofOfWorkOpen(false)}
        >
            <div className="w-full max-w-4xl bg-[#101826]/90 border border-white/10 rounded-2xl shadow-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="text-lg font-bold text-white">Proof of Work</div>
                        <div className="text-xs text-gray-400">Metrics Specification</div>
                    </div>
                    <button
                        onClick={() => setProofOfWorkOpen(false)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                        aria-label="Close proof of work"
                    >
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="max-h-[65vh] overflow-y-auto pr-2">
                    <div className="space-y-4 text-sm text-gray-200">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                h1: ({ children }) => <h1 className="text-2xl font-bold text-white">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-xl font-semibold text-white">{children}</h2>,
                                h3: ({ children }) => <h3 className="text-lg font-semibold text-white">{children}</h3>,
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
                                    <a
                                        className="text-blue-300 hover:text-blue-200 underline underline-offset-2"
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {children}
                                    </a>
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
                    </div>
                </div>
            </div>
        </div>
    );

    if (report) {
        const arcbridgeLogoUrl = `${basePath}img/ArcBridge.svg`.replace(/\/{2,}/g, '/');
        const tocItems = [
            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
            { id: 'top-players', label: 'Top Players', icon: Trophy },
            { id: 'top-skills-outgoing', label: 'Top Skills', icon: Swords },
            { id: 'timeline', label: 'Squad vs Enemy', icon: Activity },
            { id: 'map-distribution', label: 'Map Distribution', icon: MapIcon },
            { id: 'boon-output', label: 'Boon Output', icon: Sparkles },
            { id: 'offense-detailed', label: 'Offense Detailed', icon: Swords },
            { id: 'conditions-outgoing', label: 'Conditions', icon: Skull },
            { id: 'defense-detailed', label: 'Defense Detailed', icon: ShieldCheck },
            { id: 'support-detailed', label: 'Support Detailed', icon: HelpingHand },
            { id: 'healing-stats', label: 'Healing Stats', icon: HeartPulse },
            { id: 'special-buffs', label: 'Special Buffs', icon: Star },
            { id: 'skill-usage', label: 'Skill Usage', icon: Zap },
            { id: 'apm-stats', label: 'APM Breakdown', icon: Activity }
        ];
        const handleTocClick = (id: string) => {
            const el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                if (history.replaceState) {
                    history.replaceState(null, '', `#${id}`);
                }
            } else {
                window.location.hash = id;
            }
        };
        return (
            <div
                className="min-h-screen text-white relative overflow-x-hidden"
                style={{
                    backgroundColor: isModernUi ? '#0f141c' : '#0f172a',
                    backgroundImage: reportBackgroundImage,
                    ...accentVars
                }}
            >
                <div className="absolute inset-0 pointer-events-none">
                    <div
                        className="absolute -top-32 -right-24 h-80 w-80 rounded-full blur-[140px]"
                        style={{ backgroundColor: 'var(--accent-glow)' }}
                    />
                    <div
                        className="absolute top-40 -left-20 h-72 w-72 rounded-full blur-[120px]"
                        style={{ backgroundColor: 'var(--accent-glow-soft)' }}
                    />
                    <div
                        className="absolute bottom-10 right-10 h-64 w-64 rounded-full blur-[120px]"
                        style={{ backgroundColor: 'var(--accent-glow-soft)' }}
                    />
                </div>
                <div className={`fixed inset-0 z-20 bg-black/40 backdrop-blur-sm transition-opacity lg:hidden ${tocOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setTocOpen(false)} />
                <aside
                    className={`fixed z-30 top-0 bottom-0 w-64 max-w-[80vw] transition-transform duration-300 lg:hidden ${tocOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <div className="h-full bg-white/5 border-r border-white/10 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] flex flex-col">
                        <div className="px-5 pt-6 pb-4 flex items-center justify-between">
                            <div className="text-[11px] uppercase tracking-[0.4em] text-gray-400">Contents</div>
                            <button
                                onClick={() => setTocOpen(false)}
                                className="text-gray-400 hover:text-white transition-colors"
                                aria-label="Close table of contents"
                            >
                                ×
                            </button>
                        </div>
                        <nav className="px-3 pb-6 space-y-1.5 text-sm overflow-y-auto">
                            {tocItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            handleTocClick(item.id);
                                            setTocOpen(false);
                                        }}
                                        className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-gray-200 border border-transparent hover:border-white/10 hover:bg-white/10 transition-colors"
                                    >
                                        <Icon className="w-4 h-4 text-[color:var(--accent)]" />
                                        {item.label}
                                    </button>
                                );
                            })}
                        </nav>
                        <div className="mt-auto px-5 py-4 text-xs text-gray-500">
                            Scroll the report and tap a section to jump.
                        </div>
                    </div>
                </aside>
                <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 border-r border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] z-20">
                    <div className="flex flex-col w-full">
                        <div className="px-6 pt-6 pb-5">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="h-10 w-10 rounded-2xl bg-white/10 border border-white/20"
                                        style={{
                                            backgroundColor: 'var(--accent)',
                                            maskImage: `url(${arcbridgeLogoUrl})`,
                                            WebkitMaskImage: `url(${arcbridgeLogoUrl})`,
                                            maskRepeat: 'no-repeat',
                                            WebkitMaskRepeat: 'no-repeat',
                                            maskPosition: 'center',
                                            WebkitMaskPosition: 'center',
                                            maskSize: '65%',
                                            WebkitMaskSize: '65%'
                                        }}
                                        aria-label="ArcBridge logo"
                                    />
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.4em] text-gray-400">ArcBridge Reports</div>
                                        <div className="text-sm font-semibold text-white">Navigation</div>
                                    </div>
                                </div>
                        </div>
                        <nav className="px-4 space-y-1.5 text-sm flex-1 overflow-y-auto">
                            {tocItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => handleTocClick(item.id)}
                                        className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-200 border border-transparent hover:border-white/10 hover:bg-white/10 transition-colors"
                                    >
                                        <Icon className="w-4 h-4 text-[color:var(--accent)]" />
                                        {item.label}
                                    </button>
                                );
                            })}
                        </nav>
                        <div className="px-6 py-5 text-xs text-gray-500 border-t border-white/10">
                            Scroll to explore the report sections.
                        </div>
                    </div>
                </aside>
                <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 sm:py-6 lg:pl-64 lg:pr-10 mobile-bottom-pad">
                    <div className={`${glassCard} p-5 sm:p-6 mb-6`} style={glassCardStyle}>
                        <div className="mb-4 hidden sm:block">
                            <a
                                href="./"
                                className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[color:var(--accent)] hover:text-[color:var(--accent-strong)] transition-colors"
                            >
                                <span className="text-[color:var(--accent-strong)]">←</span> Back to Reports
                            </a>
                        </div>
                        <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 text-center sm:text-left">
                                {logoUrl && (
                                    logoIsDefault ? (
                                        <div
                                            className="w-16 h-16 sm:w-24 sm:h-24 mx-auto sm:mx-0"
                                            style={{
                                                backgroundColor: 'var(--accent)',
                                                maskImage: `url(${logoUrl})`,
                                                WebkitMaskImage: `url(${logoUrl})`,
                                                maskRepeat: 'no-repeat',
                                                WebkitMaskRepeat: 'no-repeat',
                                                maskPosition: 'center',
                                                WebkitMaskPosition: 'center',
                                                maskSize: 'contain',
                                                WebkitMaskSize: 'contain'
                                            }}
                                            aria-label="ArcBridge logo"
                                        />
                                    ) : (
                                        <img
                                            src={logoUrl}
                                            alt="Squad logo"
                                            className="w-16 h-16 sm:w-24 sm:h-24 rounded-lg object-cover mx-auto sm:mx-0"
                                        />
                                    )
                                )}
                                <div className="min-w-0">
                                    <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--accent-soft)]">ArcBridge Log Report</div>
                                    <h1 className="text-2xl sm:text-3xl font-bold mt-1">{report.meta.title}</h1>
                                    <div className="text-xs sm:text-sm text-gray-400 mt-2">{report.meta.dateLabel || formatLocalRange(report.meta.dateStart, report.meta.dateEnd)}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setTocOpen(true)}
                                className="hidden sm:flex lg:hidden px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs uppercase tracking-widest text-gray-300 hover:border-white/30 transition-colors items-center gap-2"
                            >
                                <PanelLeft className="w-4 h-4" />
                                Contents
                            </button>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:overflow-visible pr-1 sm:pr-2">
                                <div className="col-span-2 sm:col-span-1 w-full px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 flex items-center gap-2 min-w-0 justify-center sm:justify-start">
                                    <CalendarDays className="w-4 h-4 text-[color:var(--accent)]" />
                                    {report.meta.dateLabel || 'Log Range'}
                                </div>
                                <div className="col-span-2 sm:col-span-1 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 flex items-center gap-2 min-w-0">
                                    <Users className="w-4 h-4 text-[color:var(--accent)]" />
                                    <span className="truncate">
                                        {report.meta.commanders.length ? report.meta.commanders.join(', ') : 'No Commanders'}
                                    </span>
                                </div>
                                <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 flex items-center gap-2 min-w-0">
                                    <ShieldCheck className="w-4 h-4 text-[color:var(--accent)]" />
                                    Report {report.meta.appVersion ? `v${report.meta.appVersion}` : 'build'}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="sm:hidden mb-4">
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Jump to</div>
                        <div className="flex gap-2 overflow-x-auto pr-2 pb-1 snap-x snap-mandatory">
                            {tocItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={`chip-${item.id}`}
                                        onClick={() => handleTocClick(item.id)}
                                        className="group flex items-center gap-2 px-3 py-2 rounded-full text-[10px] uppercase tracking-widest text-gray-200 whitespace-nowrap border border-white/15 bg-gradient-to-br from-white/10 via-white/5 to-transparent shadow-[0_10px_25px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--accent-border)] hover:shadow-[0_18px_35px_rgba(0,0,0,0.45)] active:translate-y-0 active:scale-[0.98] snap-start"
                                    >
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 border border-white/10 group-hover:border-[color:var(--accent-border)] group-hover:bg-[color:var(--accent-glow)] transition-colors">
                                            <Icon className="w-3 h-3 text-[color:var(--accent)]" />
                                        </span>
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <StatsView logs={[]} onBack={() => {}} mvpWeights={undefined} precomputedStats={report.stats} statsViewSettings={report.stats?.statsViewSettings} embedded />
                    </div>
                    <div className="mt-10">
                        {legalNoticePane}
                    </div>
                </div>
                <div className="fixed bottom-4 left-4 right-4 z-30 sm:hidden mobile-action-bar">
                    <div className="flex items-center justify-between gap-2 rounded-2xl bg-slate-950/70 border border-white/15 backdrop-blur-xl px-3 py-2 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                        <a
                            href="./"
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                        >
                            <ArrowLeft className="w-4 h-4 text-[color:var(--accent)]" />
                            Back
                        </a>
                        <button
                            onClick={() => setTocOpen(true)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                        >
                            <PanelLeft className="w-4 h-4 text-[color:var(--accent)]" />
                            Contents
                        </button>
                        <button
                            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                        >
                            <ArrowUp className="w-4 h-4 text-[color:var(--accent)]" />
                            Top
                        </button>
                    </div>
                </div>
                {proofOfWorkModal}
            </div>
        );
    }

    return (
        <div
            className="min-h-screen text-white relative overflow-x-hidden"
            style={{
                backgroundColor: isModernUi ? '#0f141c' : '#0f172a',
                backgroundImage: reportBackgroundImage,
                ...accentVars
            }}
        >
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute -top-32 -right-24 h-80 w-80 rounded-full blur-[140px]"
                    style={{ backgroundColor: 'var(--accent-glow)' }}
                />
                <div
                    className="absolute top-40 -left-20 h-72 w-72 rounded-full blur-[120px]"
                    style={{ backgroundColor: 'var(--accent-glow-soft)' }}
                />
                <div
                    className="absolute bottom-10 right-10 h-64 w-64 rounded-full blur-[120px]"
                    style={{ backgroundColor: 'var(--accent-glow-soft)' }}
                />
            </div>
            <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 sm:py-10">
                <div id="report-list-container" className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-6">
                    <div className={`${glassCard} p-5 sm:p-6 mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`} style={glassCardStyle}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-h-[56px] text-center sm:text-left">
                            {logoUrl && (
                                logoIsDefault ? (
                                    <div
                                        className="w-16 h-16 sm:w-24 sm:h-24 mx-auto sm:mx-0"
                                        style={{
                                            backgroundColor: 'var(--accent)',
                                            maskImage: `url(${logoUrl})`,
                                            WebkitMaskImage: `url(${logoUrl})`,
                                            maskRepeat: 'no-repeat',
                                            WebkitMaskRepeat: 'no-repeat',
                                            maskPosition: 'center',
                                            WebkitMaskPosition: 'center',
                                            maskSize: 'contain',
                                            WebkitMaskSize: 'contain'
                                        }}
                                        aria-label="ArcBridge logo"
                                    />
                                ) : (
                                    <img
                                        src={logoUrl}
                                        alt="Squad logo"
                                        className="w-16 h-16 sm:w-24 sm:h-24 rounded-lg object-cover mx-auto sm:mx-0"
                                    />
                                )
                            )}
                            <div>
                                <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--accent-soft)]">ArcBridge</div>
                                <h1 className="text-2xl sm:text-3xl font-bold mt-2">Command Reports</h1>
                                <p className="text-xs sm:text-sm text-gray-400 mt-1">Select a report to view the full stats dashboard.</p>
                            </div>
                        </div>
                    <div className="flex items-center gap-3">
                        <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300">
                            {filteredIndex.length} Reports
                        </div>
                    </div>
                    </div>

                    <div className={`${glassCard} px-4 py-3 mb-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between`} style={glassCardStyle}>
                        <input
                            type="search"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Search reports, commanders, or date..."
                            className="w-full md:flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]"
                        />
                        <div className="text-[11px] sm:text-xs text-gray-400">
                            Showing <span className="text-[color:var(--accent)]">{filteredIndex.length}</span> of{' '}
                            <span className="text-[color:var(--accent)]">{sortedIndex.length}</span>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-6 py-5 text-amber-100 shadow-xl backdrop-blur-md" style={glassCardStyle}>
                            <div className="text-sm uppercase tracking-widest text-amber-200/70">Warning</div>
                            <div className="mt-2 text-base font-semibold text-white">{error}</div>
                            {reportPathHint && (
                                <div className="text-xs text-amber-100/80 mt-2">
                                    Looking for: <span className="text-amber-50">{reportPathHint}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {!error && !index && (
                        <div className={`${glassCard} p-6 text-gray-300`} style={glassCardStyle}>Loading reports...</div>
                    )}

                    {filteredIndex.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {filteredIndex.map((entry) => (
                                <a
                                    key={entry.id}
                                    href={entry.url}
                                    className={`${glassCard} px-5 py-4 hover:border-[color:var(--accent-border)] transition-colors group`}
                                    style={glassCardStyle}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                                        <div className="min-w-0 block text-left">
                                            <div className="text-[11px] uppercase tracking-widest text-gray-400">
                                                {entry.dateLabel}
                                            </div>
                                            <div className="text-base sm:text-lg font-semibold mt-1 truncate">
                                                {formatReportTitle(entry.dateStart)}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                                                <Users className="w-4 h-4 text-[color:var(--accent)]" />
                                                <span className="truncate">
                                                    {entry.commanders.length ? entry.commanders.join(', ') : 'No Commanders'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 sm:mt-0 mt-2 w-full sm:w-auto">
                                            <div className="flex flex-col items-center gap-1 text-[10px] text-gray-400">
                                                {entry.summary?.mapSlices && entry.summary.mapSlices.length > 0 ? (
                                                    <>
                                                        <MapDonut slices={entry.summary.mapSlices} />
                                                        <span className="uppercase tracking-widest">Maps</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <BorderlandsPie value={entry.summary?.borderlandsPct} />
                                                        <span className="uppercase tracking-widest">Borderlands</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="text-[10px] uppercase tracking-widest text-gray-400">Avg Squad / Enemy</div>
                                                <div className="text-sm text-white font-semibold">
                                                    {entry.summary?.avgSquadSize ?? '--'} / {entry.summary?.avgEnemySize ?? '--'}
                                                </div>
                                            </div>
                                            <ExternalLink className="w-5 h-5 text-[color:var(--accent)] opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}

                    {!error && index && sortedIndex.length === 0 && (
                        <div className={`${glassCard} p-6 text-gray-300`} style={glassCardStyle}>No reports uploaded yet.</div>
                    )}

                    {!error && index && sortedIndex.length > 0 && filteredIndex.length === 0 && (
                        <div className={`${glassCard} p-6 text-gray-300`} style={glassCardStyle}>No reports match your search.</div>
                    )}
                </div>
                <div className="mt-8">
                    {legalNoticePane}
                </div>
            </div>
            {proofOfWorkModal}
        </div>
    );
}
