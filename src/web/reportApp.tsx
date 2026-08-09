import { CSSProperties, MouseEvent as ReactMouseEvent, startTransition, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { StatsView } from '../renderer/StatsView';
import { STATS_TOC_GROUPS } from '../renderer/stats/hooks/useStatsNavigation';
import { resolveSectionTarget } from '../renderer/stats/statsTaxonomy';
import { PALETTES, type ColorPalette } from '../shared/webThemes';
import { readPaletteFromReport } from './paletteReader';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import metricsSpecMarkdown from '../shared/metrics-spec.md?raw';
import { AnimatePresence, motion } from 'framer-motion';
import { ProofOfWorkModal } from '../renderer/ui/ProofOfWorkModal';
import { CommanderTagIcon } from '../renderer/ui/CommanderTagIcon';
import { buildRollupData, parseRollupSourcesFile, RollupData, RollupProfessionUsage, RollupCommanderRow, RollupPlayerRow } from './rollup';
import { getProfessionColor } from '../shared/professionUtils';
import { MetricDistributionCard } from '../renderer/stats/components/MetricDistributionCard';
import type { SquadStatPlayer } from '../shared/squadStats';
import type { ReportPayload, ReportIndexEntry } from '../shared/reportTypes';
import { expandIconIndex, normalizeCommanderDistance, normalizeTopDownContribution } from '../shared/reportNormalization';
import {
    ShieldCheck,
    CalendarDays,
    Users,
    ExternalLink,
    PanelLeft,
    ArrowLeft,
    ArrowUp,
    BarChart3,
    ChevronDown,
    Search
} from 'lucide-react';


const glassCard = 'border border-white/10 rounded-2xl shadow-xl backdrop-blur-md glass-card';
const ASSET_BASE_PATH_PROBE_PATHS = ['reports/index.json', 'logo.json'] as const;

const buildReportHref = (baseHref: string, reportId: string): string => {
    const next = new URL(baseHref);
    next.searchParams.set('report', reportId || '');
    return next.toString();
};

const buildRollupHref = (baseHref: string): string => {
    const next = new URL(baseHref);
    next.searchParams.delete('report');
    next.searchParams.set('view', 'rollup');
    return next.toString();
};

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

const formatRollupDate = (timestamp: number) => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return '--';
    try {
        return new Date(timestamp).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return '--';
    }
};

const formatHoursLabel = (durationMs: number) => {
    const hours = Math.max(0, Number(durationMs || 0)) / (60 * 60 * 1000);
    if (!Number.isFinite(hours) || hours <= 0) return '--';
    if (hours >= 100) return `${Math.round(hours)}h`;
    return `${hours.toFixed(1)}h`;
};

const formatRatio = (value: number) => {
    if (!Number.isFinite(value)) return '--';
    return value.toFixed(value >= 10 ? 1 : 2);
};

type TocHeading = {
    level: number;
    text: string;
    id: string;
};

const slugifyHeadingText = (label: string) =>
    label
        .toLowerCase()
        .trim()
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

const MapDonut = ({ slices }: { slices: Array<{ value: number; color: string }> }) => {
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const total = slices.reduce((sum, slice) => sum + (slice.value || 0), 0);
    let offset = 0;

    return (
        <svg className="report-mini-donut" width="48" height="48" viewBox="0 0 48 48">
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
        <svg className="report-mini-donut" width="48" height="48" viewBox="0 0 48 48">
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

// ── No Ego Rollup ──────────────────────────────────────────────────────────────
// Exported for unit tests. Renders MetricDistributionCard grids instead of
// ranked tables when noEgoMode is true.
export interface NoEgoRollupProps {
    commanderRows: RollupCommanderRow[];
    playerRows: RollupPlayerRow[];
}

export function NoEgoRollup({ commanderRows, playerRows }: NoEgoRollupProps) {
    const fmtInt = (n: number) => Math.round(n).toString();
    const fmtDecimal1 = (n: number) => n.toFixed(1);
    const fmtDecimal2 = (n: number) => n.toFixed(2);

    const commanderCards: Array<{
        title: string;
        players: SquadStatPlayer[];
        higherIsBetter: boolean;
        formatValue: (n: number) => string;
        unit?: string;
    }> = [
        {
            title: 'Raids Led',
            players: commanderRows.map((r) => ({ account: r.account, value: r.runs, profession: r.profession })),
            higherIsBetter: true,
            formatValue: fmtInt,
        },
        {
            title: 'Fights Led',
            players: commanderRows.map((r) => ({ account: r.account, value: r.fightsLed, profession: r.profession })),
            higherIsBetter: true,
            formatValue: fmtInt,
        },
        {
            title: 'Kills',
            players: commanderRows.map((r) => ({ account: r.account, value: r.kills, profession: r.profession })),
            higherIsBetter: true,
            formatValue: fmtInt,
        },
        {
            title: 'Commander Deaths',
            players: commanderRows.map((r) => ({ account: r.account, value: r.commanderDeaths, profession: r.profession })),
            higherIsBetter: false,
            formatValue: fmtInt,
        },
        {
            title: 'KDR',
            players: commanderRows.map((r) => ({ account: r.account, value: r.kdr, profession: r.profession })),
            higherIsBetter: true,
            formatValue: fmtDecimal2,
        },
    ];

    const playerCards: Array<{
        title: string;
        players: SquadStatPlayer[];
        higherIsBetter: boolean;
        formatValue: (n: number) => string;
        unit?: string;
    }> = [
        {
            title: 'Raids Attended',
            players: playerRows.map((r) => ({ account: r.account, value: r.runs, profession: r.profession })),
            higherIsBetter: true,
            formatValue: fmtInt,
        },
        {
            title: 'Combat Time',
            players: playerRows.map((r) => ({ account: r.account, value: r.combatTimeMs / 60000, profession: r.profession })),
            higherIsBetter: true,
            formatValue: fmtDecimal1,
            unit: 'min',
        },
    ];

    return (
        <>
            {commanderRows.length > 0 && (
                <div
                    data-testid="rollup-no-ego-commanders"
                    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                >
                    {commanderCards.map((card) => (
                        <MetricDistributionCard
                            key={card.title}
                            title={card.title}
                            accentColor="#fb923c"
                            higherIsBetter={card.higherIsBetter}
                            players={card.players}
                            formatValue={card.formatValue}
                            unit={card.unit}
                        />
                    ))}
                </div>
            )}
            {playerRows.length > 0 && (
                <div
                    data-testid="rollup-no-ego-players"
                    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                >
                    {playerCards.map((card) => (
                        <MetricDistributionCard
                            key={card.title}
                            title={card.title}
                            accentColor="#34d399"
                            higherIsBetter={card.higherIsBetter}
                            players={card.players}
                            formatValue={card.formatValue}
                            unit={card.unit}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

export function ReportApp() {
    const initialSearchParams = useMemo(() => new URLSearchParams(window.location.search), []);
    const [report, setReport] = useState<ReportPayload | null>(null);
    const [index, setIndex] = useState<ReportIndexEntry[] | null>(null);
    const [rollupData, setRollupData] = useState<RollupData | null>(null);
    const [rollupLoading, setRollupLoading] = useState(false);
    const [rollupError, setRollupError] = useState<string | null>(null);
    const [rollupRequestedCount, setRollupRequestedCount] = useState(0);
    const [commanderSearchTerm, setCommanderSearchTerm] = useState('');
    const [playerSearchTerm, setPlayerSearchTerm] = useState('');
    const [commanderProfessionFilter, setCommanderProfessionFilter] = useState('all');
    const [playerProfessionFilter, setPlayerProfessionFilter] = useState('all');
    const [commanderMinRunsFilter, setCommanderMinRunsFilter] = useState('1');
    const [playerMinRunsFilter, setPlayerMinRunsFilter] = useState('1');
    const [professionTooltip, setProfessionTooltip] = useState<{
        x: number;
        y: number;
        entries: RollupProfessionUsage[];
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reportPathHint, setReportPathHint] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [colorPalette, setColorPalette] = useState<ColorPalette>('electric-blue');
    const [glassSurfaces, setGlassSurfaces] = useState(false);
    const [glassmorphic, setGlassmorphic] = useState(false);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [logoIsDefault, setLogoIsDefault] = useState(false);
    const [tocOpen, setTocOpen] = useState(false);
    const requestedView = useMemo(() => (initialSearchParams.get('view') || '').trim().toLowerCase(), [initialSearchParams]);
    const reportId = useMemo(
        () => initialSearchParams.get('report') || window.location.pathname.match(/\/reports\/([^/]+)\/?$/)?.[1] || null,
        [initialSearchParams]
    );
    const isRollupView = useMemo(() => !reportId && requestedView === 'rollup', [reportId, requestedView]);
    const [proofOfWorkOpen, setProofOfWorkOpen] = useState(false);
    const [activeProofOfWorkHeadingId, setActiveProofOfWorkHeadingId] = useState('');
    const [metricsSpecSearch, setMetricsSpecSearch] = useState('');
    const [metricsSpecSearchResults, setMetricsSpecSearchResults] = useState<Array<{ index: number; text: string; section: string; hitId: number }>>([]);
    const [metricsSpecSearchFocused, setMetricsSpecSearchFocused] = useState(false);
    const [activeGroup, setActiveGroup] = useState('overview');
    const [activeSectionId, setActiveSectionId] = useState<string>('overview');
    const [viewportWidth, setViewportWidth] = useState<number>(() => {
        if (typeof window === 'undefined') return 1280;
        return Math.max(0, Math.round(window.visualViewport?.width || window.innerWidth || 1280));
    });
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        overview: true
    });
    const statsWrapperRef = useRef<HTMLDivElement | null>(null);
    const metricsSpecContentRef = useRef<HTMLDivElement | null>(null);
    const metricsSpecSearchRef = useRef<HTMLDivElement | null>(null);
    const searchOpenRef = useRef<(() => void) | null>(null);
    const metricsSpecHighlightRef = useRef<number | null>(null);
    const metricsSpecHeadingCountsRef = useRef<Map<string, number>>(new Map());
    const pendingScrollIdRef = useRef<string | null>(null);
    const groupTopScrollRafRef = useRef<number | null>(null);
    const basePath = useMemo(() => {
        let pathName = window.location.pathname || '/';
        const isLocalhost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.host);
        if (pathName.endsWith('/index.html')) {
            pathName = pathName.slice(0, -'/index.html'.length);
        }
        if (pathName.includes('/reports/')) {
            pathName = pathName.replace(/\/reports\/[^/]+\/?$/, '');
        }
        // In dev mock reports we open `/web/web/index.html`, but report/theme payloads
        // live under `/web/*`; collapse the duplicated segment for fetch paths.
        if (isLocalhost) {
            pathName = pathName.replace(/^\/web\/web(?=\/|$)/, '/web');
        }
        if (!pathName.endsWith('/')) {
            pathName = `${pathName}/`;
        }
        return pathName;
    }, []);
    const baseHref = useMemo(() => new URL(basePath, window.location.origin).toString(), [basePath]);
    const themedIndexHref = baseHref;
    const rollupHref = useMemo(
        () => buildRollupHref(baseHref),
        [baseHref]
    );
    const isDevLocalWeb = useMemo(() => {
        const isLocalhost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.host);
        return isLocalhost && window.location.pathname.startsWith('/web/');
    }, []);
    const isNarrowViewport = viewportWidth < 1024;
    const isCompactViewport = viewportWidth < 640;
    const assetBasePathCandidates = useMemo(() => {
        const primary = basePath;
        const candidates = [primary, './', '/'];
        const deduped: string[] = [];
        candidates.forEach((value) => {
            let normalized = value || '/';
            if (normalized !== './' && !normalized.endsWith('/')) {
                normalized = `${normalized}/`;
            }
            if (!deduped.includes(normalized)) {
                deduped.push(normalized);
            }
        });
        return deduped;
    }, [basePath, isDevLocalWeb]);
    const [assetBasePath, setAssetBasePath] = useState<string>(assetBasePathCandidates[0] || '/');
    const extractHeadingText = (node: React.ReactNode): string => {
        if (typeof node === 'string' || typeof node === 'number') return String(node);
        if (Array.isArray(node)) return node.map(extractHeadingText).join('');
        if (node && typeof node === 'object' && 'props' in node) {
            return extractHeadingText((node as any).props?.children);
        }
        return '';
    };
    const buildMetricsSpecHeadingId = (label: string) => {
        const key = slugifyHeadingText(label || 'section') || 'section';
        const counts = metricsSpecHeadingCountsRef.current;
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next === 1 ? key : `${key}-${next}`;
    };
    const metricsSpecNav = useMemo(() => {
        const lines = metricsSpecMarkdown.split('\n');
        const counts = new Map<string, number>();
        const items: TocHeading[] = [];

        const buildId = (label: string) => {
            const key = slugifyHeadingText(label || 'section') || 'section';
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
    const joinAssetPath = (base: string, relative: string) => {
        const normalizedBase = base === './'
            ? './'
            : (base.endsWith('/') ? base : `${base}/`);
        const normalizedRelative = String(relative || '').replace(/^\/+/, '');
        return `${normalizedBase}${normalizedRelative}`;
    };

    useEffect(() => {
        const updateViewportWidth = () => {
            const width = Math.max(0, Math.round(window.visualViewport?.width || window.innerWidth || 1280));
            setViewportWidth(width);
        };
        updateViewportWidth();
        window.addEventListener('resize', updateViewportWidth, { passive: true });
        window.visualViewport?.addEventListener('resize', updateViewportWidth);
        return () => {
            window.removeEventListener('resize', updateViewportWidth);
            window.visualViewport?.removeEventListener('resize', updateViewportWidth);
        };
    }, []);

    useEffect(() => {
        if (!isNarrowViewport) setTocOpen(false);
    }, [isNarrowViewport]);

    // Apply palette and glass body classes so CSS variables drive all theming.
    useEffect(() => {
        const body = document.body;
        body.classList.add('web-report');
        for (const id of Object.keys(PALETTES)) body.classList.remove(`palette-${id}`);
        if (colorPalette !== 'electric-blue') {
            body.classList.add(`palette-${colorPalette}`);
        }
        body.classList.toggle('glass-surfaces', glassSurfaces);
        body.classList.toggle('glassmorphic', glassmorphic);
    }, [colorPalette, glassSurfaces, glassmorphic]);

    useEffect(() => {
        setAssetBasePath(assetBasePathCandidates[0] || '/');
        let isMounted = true;
        const resolve = async () => {
            for (const candidate of assetBasePathCandidates) {
                for (const probePath of ASSET_BASE_PATH_PROBE_PATHS) {
                    try {
                        const response = await fetch(joinAssetPath(candidate, probePath), { cache: 'no-store' });
                        if (response.ok) {
                            if (isMounted) setAssetBasePath(candidate);
                            return;
                        }
                    } catch {
                        // Try next probe path or candidate.
                    }
                }
            }
        };
        void resolve();
        return () => {
            isMounted = false;
        };
    }, [assetBasePathCandidates]);
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
                <mark className="rounded bg-[color:var(--accent-bg-strong)] px-1 text-white">{match}</mark>
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
            container.scrollTop = scrollOffset;
            node.classList.add('ring-2', 'ring-[color:var(--accent-border)]', 'bg-[color:var(--accent-bg)]');
            if (metricsSpecHighlightRef.current) {
                window.clearTimeout(metricsSpecHighlightRef.current);
            }
            metricsSpecHighlightRef.current = window.setTimeout(() => {
                node.classList.remove('ring-2', 'ring-[color:var(--accent-border)]', 'bg-[color:var(--accent-bg)]');
            }, 1600);
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
        const results: Array<{ index: number; text: string; section: string; hitId: number }> = [];
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
                results.push({ index, text, section: section || 'Unlabeled Section', hitId });
                hitId += 1;
            }
        });
        setMetricsSpecSearchResults(results.slice(0, 12));
    };

    useEffect(() => {
        if (!proofOfWorkOpen) return;
        setActiveProofOfWorkHeadingId(metricsSpecNav[0]?.id || '');
        const handleMouseDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (metricsSpecSearchRef.current?.contains(target)) return;
            setMetricsSpecSearchFocused(false);
            setMetricsSpecSearchResults([]);
        };
        window.addEventListener('mousedown', handleMouseDown);
        return () => {
            window.removeEventListener('mousedown', handleMouseDown);
        };
    }, [proofOfWorkOpen, metricsSpecNav]);

    useEffect(() => {
        if (!proofOfWorkOpen) {
            setActiveProofOfWorkHeadingId('');
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
            const candidates = headings
                .map((heading, idx) => ({
                    index: idx,
                    id: heading.dataset.headingId || heading.id || '',
                    top: heading.getBoundingClientRect().top
                }))
                .filter((entry) => !!entry.id);
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
            if (nextId) setActiveProofOfWorkHeadingId(nextId);
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

    // Derived from the shared taxonomy (Task 1/5) instead of a hand-duplicated
    // literal — the web report picks up the same 10 categories as the desktop
    // and History nav automatically. Historical web-only anchors ('kdr',
    // 'report-top', old group ids) are handled by resolveSectionTarget below.
    const navGroups = useMemo(() => STATS_TOC_GROUPS.map((g) => ({ ...g, sectionIds: [...g.sectionIds], items: [...g.items] })), []);
    const activeGroupDef = useMemo(
        // Fallback targets Overview explicitly — navGroups[0] is now the Data Map
        // category, which must never become the accidental landing group.
        () => navGroups.find((group) => group.id === activeGroup)
            || navGroups.find((group) => group.id === 'overview')
            || navGroups[0],
        [navGroups, activeGroup]
    );
    // Stable sectionVisibility — only recreated when activeGroup changes (via startTransition)
    const activeSectionIdSet = useMemo(() => {
        const baseIds = (activeGroupDef as any)?.sectionIds || (activeGroupDef?.items || []).map((item: any) => item.id);
        return new Set(baseIds.map((id: string) => (id === 'kdr' ? 'overview' : id)));
    }, [activeGroupDef]);
    const sectionVisibilityFn = useCallback(
        (id: string) => activeSectionIdSet.has(id),
        [activeSectionIdSet]
    );
    const dashboardTitleText = useMemo(
        () => `Statistics Dashboard - ${activeGroupDef?.label || 'Overview'}`,
        [activeGroupDef]
    );
    const scrollToSection = (id: string) => {
        if (id === 'report-top') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (history.replaceState) {
                history.replaceState(null, '', '#report-top');
            }
            return true;
        }
        // No 'kdr' remap here: the legacy 'kdr' alias is resolved to the real
        // 'overview' section id by resolveSectionTarget before it ever reaches this
        // function (every caller supplies either a resolved target.sectionId, the
        // 'report-top' sentinel handled above, or a taxonomy section id from the nav).
        const el = document.getElementById(id);
        if (!el) return false;
        const isVisible = el.getAttribute('data-section-visible') !== 'false';
        if (!isVisible) return false;
        if (!el.offsetParent) return false;
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) return false;
        let extraOffset = 0;
        if (id === 'stats-view-top') {
            const reportTop = document.getElementById('report-top');
            if (reportTop) {
                extraOffset = reportTop.getBoundingClientRect().height + 12;
            }
        }
        const targetTop = rect.top + window.scrollY - 12 - extraOffset;
        window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
        if (history.replaceState) {
            history.replaceState(null, '', `#${id}`);
        }
        return true;
    };
    const scrollToSectionSafe = (id: string, attempts = 0) => {
        if (scrollToSection(id)) return;
        if (attempts >= 12) return;
        window.setTimeout(() => {
            requestAnimationFrame(() => scrollToSectionSafe(id, attempts + 1));
        }, 40);
    };

    useEffect(() => {
        if (!report) return;
        // Warm up submenu measurements so first accordion open is as smooth as subsequent opens.
        const raf = requestAnimationFrame(() => {
            const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-nav-submenu-content]'));
            nodes.forEach((node) => {
                void node.scrollHeight;
            });
        });
        return () => cancelAnimationFrame(raf);
    }, [report]);

    useEffect(() => {
        const pendingId = pendingScrollIdRef.current;
        if (!pendingId) return;
        let attempts = 0;
        const tick = () => {
            if (scrollToSection(pendingId)) {
                pendingScrollIdRef.current = null;
                return;
            }
            attempts += 1;
            if (attempts >= 20) {
                pendingScrollIdRef.current = null;
                return;
            }
            window.setTimeout(() => requestAnimationFrame(tick), 40);
        };
        requestAnimationFrame(tick);
    }, [activeGroup]);

    useEffect(() => {
        const syncFromHash = () => {
            const raw = (window.location.hash || '').replace(/^#/, '').trim();
            if (!raw) return;
            // Shared resolver (Task 1): understands every real section id, every
            // category id, and the legacy aliases ('kdr', 'report-top', old group
            // ids like 'commanders'/'squad-stats'/'roster'/'other'/'map').
            const target = resolveSectionTarget(raw);
            if (!target) return;
            setActiveGroup(target.categoryId);
            setExpandedGroups(() => {
                const next: Record<string, boolean> = {};
                navGroups.forEach((group) => {
                    next[group.id] = group.id === target.categoryId;
                });
                return next;
            });
            setActiveSectionId(target.sectionId);
            // 'report-top' means "scroll the page to the very top", which
            // scrollToSection special-cases — keep that literal sentinel instead
            // of resolving it to the overview section id.
            pendingScrollIdRef.current = (raw.toLowerCase().replace(/^#/, '') === 'report-top') ? 'report-top' : target.sectionId;
        };
        syncFromHash();
        window.addEventListener('hashchange', syncFromHash);
        return () => {
            window.removeEventListener('hashchange', syncFromHash);
        };
    }, [navGroups]);
    // All theming is now driven by CSS variables set by palette/glass body classes.
    const defaultLogoColor = 'var(--brand-primary)';
    const glassCardStyle: CSSProperties = {
        backgroundImage: 'none',
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-default)'
    };
    // Sticky table headers need an opaque base: --bg-card is a translucent glass
    // tint in glass/glassmorphic modes, so layer it over a solid dark fallback to
    // keep scrolled rows from showing through.
    const rollupTableHeaderStyle: CSSProperties = {
        backgroundColor: '#0c0f16',
        backgroundImage: 'linear-gradient(var(--bg-card), var(--bg-card))'
    };
    const showProfessionTooltip = (event: ReactMouseEvent<HTMLElement>, entries?: RollupProfessionUsage[]) => {
        if (!entries || entries.length === 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setProfessionTooltip({
            x: Math.min(rect.left, window.innerWidth - 240),
            y: rect.bottom + 6,
            entries
        });
    };
    const hideProfessionTooltip = () => setProfessionTooltip(null);
    const professionTooltipPane = professionTooltip && (
        <div
            className="fixed z-50 pointer-events-none rounded-xl border border-white/10 px-3.5 py-2.5 text-xs shadow-2xl"
            style={{
                left: professionTooltip.x,
                top: professionTooltip.y,
                backgroundColor: '#0c0f16',
                backgroundImage: 'linear-gradient(var(--bg-card), var(--bg-card))'
            }}
        >
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1.5">Classes Played</div>
            <div className="space-y-1">
                {professionTooltip.entries.map((entry) => (
                    <div key={entry.profession} className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-2 text-white">
                            <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: getProfessionColor(entry.profession) }}
                            />
                            {entry.profession}
                        </span>
                        <span className="text-gray-400">{entry.runs} report{entry.runs === 1 ? '' : 's'}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    useEffect(() => {
        let isMounted = true;
        const reportPath = reportId ? `${basePath}reports/${reportId}/report.json` : `${basePath}report.json`;
        setError(null);
        setReport(null);
        setIndex(null);
        setRollupData(null);
        setRollupError(null);
        setRollupLoading(false);
        setRollupRequestedCount(0);
        setReportPathHint(reportId ? reportPath : null);

        const applyPaletteFromReport = (reportData: ReportPayload) => {
            const { palette, glass, glassmorphic: gm } = readPaletteFromReport(reportData.stats);
            setColorPalette(palette);
            setGlassSurfaces(glass);
            setGlassmorphic(gm);
        };

        const loadIndex = (suppressError = false) => {
            return fetch(`${basePath}reports/index.json`, { cache: 'no-store' })
                .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
                .then((data) => {
                    if (!isMounted) return;
                    // Support new object format { siteTheme, entries } and legacy plain array.
                    const entries = Array.isArray(data) ? data : (Array.isArray(data?.entries) ? data.entries : []);
                    setIndex(entries);
                    // Apply site-wide palette and glass from index.json
                    if (!Array.isArray(data) && data?.colorPalette) {
                        const { palette, glass, glassmorphic: gm } = readPaletteFromReport(data);
                        setColorPalette(palette);
                        setGlassSurfaces(glass);
                        setGlassmorphic(gm);
                    }
                })
                .catch(() => {
                    if (!isMounted) return;
                    if (!suppressError) {
                        setError('No report data found.');
                    }
                    throw new Error('index-missing');
                });
        };

        const loadReport = () => fetch(reportPath, { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                const normalized = expandIconIndex(normalizeTopDownContribution(normalizeCommanderDistance(data)));
                setReport(normalized);
                applyPaletteFromReport(normalized);
            });

        if (isRollupView) {
            loadIndex();
            return () => {
                isMounted = false;
            };
        }

        if (reportId) {
            // Fetch index.json in parallel with the report for the report listing.
            fetch(`${basePath}reports/index.json`, { cache: 'no-store' })
                .then((resp) => (resp.ok ? resp.json() : null))
                .then((data) => {
                    if (!isMounted || !data) return;
                    const entries = Array.isArray(data) ? data : (Array.isArray(data?.entries) ? data.entries : []);
                    setIndex(entries);
                })
                .catch(() => {});
            loadReport().catch(() => {
                if (reportId) {
                    if (!isMounted) return;
                    setError('Report not found yet. It may still be deploying.');
                }
                loadIndex();
            });
            return () => {
                isMounted = false;
            };
        }

        // For the hosted root page, prefer the report index first. This prevents any
        // legacy root-level report.json file from hijacking the site and hiding newer uploads.
        loadIndex(true).catch(() => {
            loadReport().catch(() => {
                if (!isMounted) return;
                setError('No report data found.');
            });
        });
        return () => {
            isMounted = false;
        };
    }, [basePath, isRollupView, reportId]);

    useEffect(() => {
        if (!isRollupView || !index) {
            setRollupLoading(false);
            setRollupError(null);
            setRollupData(null);
            setRollupRequestedCount(0);
            return;
        }
        if (index.length === 0) {
            setRollupLoading(false);
            setRollupError(null);
            setRollupData(buildRollupData([]));
            setRollupRequestedCount(0);
            return;
        }

        let isMounted = true;
        setRollupLoading(true);
        setRollupError(null);
        setRollupRequestedCount(index.length);

        const fetchReportPayloads = async (entries: Array<{ id: string }>) => {
            const loadedReports: ReportPayload[] = [];
            await Promise.all(entries.map(async (entry) => {
                try {
                    const response = await fetch(`${basePath}reports/${entry.id}/report.json`, { cache: 'no-store' });
                    if (!response.ok) return;
                    const payload = await response.json();
                    if (!isMounted) return;
                    loadedReports.push(payload);
                } catch {
                    // Skip individual reports so one broken payload does not kill the rollup.
                }
            }));
            return loadedReports;
        };

        const loadRollup = async () => {
            // Preferred path: a single small precomputed file published by the app
            // (reports/rollup.json) instead of downloading every report.json.
            try {
                const response = await fetch(`${basePath}reports/rollup.json`, { cache: 'no-store' });
                if (response.ok) {
                    const parsed = parseRollupSourcesFile(await response.json());
                    if (parsed && isMounted) {
                        const coveredIds = new Set(
                            parsed.sources.map((source) => String(source?.meta?.id || '').trim()).filter(Boolean)
                        );
                        const missingEntries = index.filter((entry) => entry?.id && !coveredIds.has(String(entry.id)));
                        if (missingEntries.length === 0) {
                            // Rebuild from the (tiny) sources rather than trusting the
                            // precomputed aggregate, so rollup.json files published by
                            // older app versions still get newly added fields.
                            setRollupData(buildRollupData(parsed.sources));
                            setRollupLoading(false);
                            return;
                        }
                        // Reports published before rollup.json existed: fetch only those
                        // and merge with the precomputed sources.
                        const legacyReports = await fetchReportPayloads(missingEntries);
                        if (!isMounted) return;
                        setRollupData(buildRollupData([...parsed.sources, ...legacyReports]));
                        setRollupLoading(false);
                        return;
                    }
                }
            } catch {
                // Fall through to the legacy fetch-everything path.
            }

            const loadedReports = await fetchReportPayloads(index);
            if (!isMounted) return;
            const nextRollup = buildRollupData(loadedReports);
            setRollupData(nextRollup);
            setRollupLoading(false);
            if (loadedReports.length === 0) {
                setRollupError('Unable to load any report payloads for All Reports.');
            }
        };

        void loadRollup();
        return () => {
            isMounted = false;
        };
    }, [basePath, index, isRollupView]);

    useEffect(() => {
        if (report) {
            const dateLabel = report.meta.dateLabel || formatLocalRange(report.meta.dateStart, report.meta.dateEnd);
            document.title = dateLabel
                ? `AxiBridge — ${report.meta.title} — ${dateLabel}`
                : `AxiBridge — ${report.meta.title}`;
            return;
        }
        if (isRollupView) {
            document.title = 'AxiBridge — All Reports';
            return;
        }
        document.title = 'AxiBridge Reports';
    }, [isRollupView, report]);

    useEffect(() => {
        let isMounted = true;
        fetch(joinAssetPath(assetBasePath, 'logo.json'), { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                const defaultPath = 'svg/AxiBridge.svg';
                const path = data?.path ? String(data.path) : defaultPath;
                const version = data?.updatedAt ? String(data.updatedAt) : '';
                const urlBase = joinAssetPath(assetBasePath, path);
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
    }, [assetBasePath]);

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
            const guild = `${(entry as any).guild?.name || ''} ${(entry as any).guild?.tag || ''}`;
            const haystack = `${entry.title} ${commanders} ${entry.dateLabel} ${guild}`.toLowerCase();
            return haystack.includes(term);
        });
    }, [sortedIndex, searchTerm]);
    const failedRollupReports = useMemo(() => {
        const loaded = rollupData?.sourceReports || 0;
        return Math.max(0, rollupRequestedCount - loaded);
    }, [rollupData, rollupRequestedCount]);
    const commanderProfessionOptions = useMemo(() => {
        const values = new Set<string>();
        (rollupData?.commanderRows || []).forEach((row) => {
            const profession = String(row.profession || '').trim();
            if (profession) values.add(profession);
        });
        return ['all', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
    }, [rollupData]);
    const playerProfessionOptions = useMemo(() => {
        const values = new Set<string>();
        (rollupData?.playerRows || []).forEach((row) => {
            const profession = String(row.profession || '').trim();
            if (profession) values.add(profession);
        });
        return ['all', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
    }, [rollupData]);
    const filteredCommanderRows = useMemo(() => {
        const minRuns = Math.max(1, Number(commanderMinRunsFilter || 1));
        const needle = commanderSearchTerm.trim().toLowerCase();
        return (rollupData?.commanderRows || []).filter((row) => {
            if (row.runs < minRuns) return false;
            if (commanderProfessionFilter !== 'all' && row.profession !== commanderProfessionFilter) return false;
            if (!needle) return true;
            const haystack = `${row.account} ${row.profession} ${row.characterNames.join(' ')}`.toLowerCase();
            return haystack.includes(needle);
        });
    }, [commanderMinRunsFilter, commanderProfessionFilter, commanderSearchTerm, rollupData]);
    const filteredPlayerRows = useMemo(() => {
        const minRuns = Math.max(1, Number(playerMinRunsFilter || 1));
        const needle = playerSearchTerm.trim().toLowerCase();
        return (rollupData?.playerRows || []).filter((row) => {
            if (row.runs < minRuns) return false;
            if (playerProfessionFilter !== 'all' && row.profession !== playerProfessionFilter) return false;
            if (!needle) return true;
            const haystack = `${row.account} ${row.profession} ${row.characterNames.join(' ')}`.toLowerCase();
            return haystack.includes(needle);
        });
    }, [playerMinRunsFilter, playerProfessionFilter, playerSearchTerm, rollupData]);

    useEffect(() => {
        if (commanderProfessionFilter === 'all') return;
        if (commanderProfessionOptions.includes(commanderProfessionFilter)) return;
        setCommanderProfessionFilter('all');
    }, [commanderProfessionFilter, commanderProfessionOptions]);

    useEffect(() => {
        if (playerProfessionFilter === 'all') return;
        if (playerProfessionOptions.includes(playerProfessionFilter)) return;
        setPlayerProfessionFilter('all');
    }, [playerProfessionFilter, playerProfessionOptions]);

    useEffect(() => () => {
        if (groupTopScrollRafRef.current !== null) {
            cancelAnimationFrame(groupTopScrollRafRef.current);
            groupTopScrollRafRef.current = null;
        }
    }, []);

    const legalNoticePane = (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] text-gray-500">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">Legal Notice</div>
                <div className="flex flex-wrap items-end gap-2">
                    <a
                        href="https://github.com/darkharasho/axibridge"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest border bg-white/5 text-gray-400 border-white/10 hover:text-white"
                    >
                        GitHub
                    </a>
                    <a
                        href="https://discord.gg/UjzMXMGXEg"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest border bg-white/5 text-gray-400 border-white/10 hover:text-white"
                    >
                        Discord
                    </a>
                    <a
                        href="#proof-of-work"
                        onClick={(event) => {
                            event.preventDefault();
                            setProofOfWorkOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest border bg-white/5 text-gray-400 border-white/10 hover:text-white"
                    >
                        Proof of Work
                    </a>
                </div>
            </div>
            <p>
                AxiBridge is free software by harasho: you can redistribute it and/or modify it under the terms
                of the GNU General Public License v3.0 only. This program comes with ABSOLUTELY NO WARRANTY.
            </p>
            <p className="mt-2">
                Class Icons, artwork, and skill icons are created and owned by Arenanet as detailed in their{' '}
                <a
                    href="https://www.arena.net/en/legal/content-terms-of-use"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--brand-primary)] hover:text-white underline underline-offset-2"
                >
                    Content Terms of Use
                </a>
                . I do not own or profit from this work in any way. Assets were obtained from asset packs distributed by Arenanet.
                The official statement from the Content Terms of Use:
            </p>
            <p className="mt-2">
                © ArenaNet LLC. All rights reserved. NCSOFT, ArenaNet, Guild Wars, Guild Wars 2, GW2, Heart of Thorns, Path of Fire, End of Dragons, Secrets of the Obscure, Janthir Wilds, Visions of Eternity, and all associated logos, designs, and composite marks are trademarks or registered trademarks of NCSOFT Corporation. All other trademarks are the property of their respective owners.
            </p>
            <p className="mt-2">
                See the{' '}
                <a
                    href="https://github.com/darkharasho/axibridge/blob/main/LICENSE"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--brand-primary)] hover:text-white underline underline-offset-2"
                >
                    LICENSE
                </a>
                {' '}and{' '}
                <a
                    href="https://github.com/darkharasho/axibridge/blob/main/THIRD_PARTY_NOTICES.md"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--brand-primary)] hover:text-white underline underline-offset-2"
                >
                    THIRD_PARTY_NOTICES.md
                </a>
                {' '}files for full terms and upstream attributions.
            </p>
        </div>
    );

    const proofOfWorkModal = (
        <ProofOfWorkModal
            isOpen={proofOfWorkOpen}
            onClose={() => setProofOfWorkOpen(false)}
            searchValue={metricsSpecSearch}
            searchFocused={metricsSpecSearchFocused}
            searchResults={metricsSpecSearchResults}
            onSearchChange={(value) => {
                setMetricsSpecSearch(value);
                requestAnimationFrame(() => updateMetricsSpecSearchResults(value));
            }}
            onSearchFocus={() => {
                setMetricsSpecSearchFocused(true);
                requestAnimationFrame(() => updateMetricsSpecSearchResults(metricsSpecSearch));
            }}
            onSearchBlur={(nextTarget) => {
                if (nextTarget && metricsSpecSearchRef.current?.contains(nextTarget)) return;
                setMetricsSpecSearchFocused(false);
            }}
            onSearchEnter={() => {
                if (metricsSpecSearchResults.length > 0) {
                    scrollMetricsSpecToNodeIndex(metricsSpecSearchResults[0].hitId, metricsSpecSearchResults[0].text);
                }
            }}
            onSearchResultMouseDown={(result) => {
                setMetricsSpecSearchFocused(true);
                scrollMetricsSpecToNodeIndex(result.hitId, result.text);
            }}
            renderHighlightedMatch={renderHighlightedMatch}
            searchRef={metricsSpecSearchRef}
            tocItems={metricsSpecNav}
            activeTocId={activeProofOfWorkHeadingId}
            onTocClick={(item) => {
                const container = metricsSpecContentRef.current;
                if (!container) return;
                let target = container.querySelector<HTMLElement>(`[data-heading-id="${item.id}"]`);
                if (!target) {
                    const normalized = item.text.trim().replace(/\s+/g, ' ');
                    const headings = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3'));
                    target = headings.find((node) => (node.textContent || '').trim().replace(/\s+/g, ' ') === normalized) || null;
                }
                if (!target) return;
                setActiveProofOfWorkHeadingId(item.id);
                requestAnimationFrame(() => {
                    const containerRect = container.getBoundingClientRect();
                    const targetRect = target.getBoundingClientRect();
                    const scrollOffset = container.scrollTop + (targetRect.top - containerRect.top) - 12;
                    container.scrollTop = Math.max(0, scrollOffset);
                });
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
                        const id = buildMetricsSpecHeadingId(label);
                        return <h1 id={id} data-heading-id={id} className="text-2xl font-bold text-white scroll-mt-6">{children}</h1>;
                    },
                    h2: ({ children }) => {
                        const label = extractHeadingText(children);
                        const id = buildMetricsSpecHeadingId(label);
                        return <h2 id={id} data-heading-id={id} className="text-xl font-semibold text-white scroll-mt-6">{children}</h2>;
                    },
                    h3: ({ children }) => {
                        const label = extractHeadingText(children);
                        const id = buildMetricsSpecHeadingId(label);
                        return <h3 id={id} data-heading-id={id} className="text-lg font-semibold text-white scroll-mt-6">{children}</h3>;
                    },
                    p: ({ children }) => <p className="leading-6 text-gray-200">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 text-gray-200">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 text-gray-200">{children}</ol>,
                    li: ({ children }) => <li className="leading-6">{children}</li>,
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-[color:var(--accent-border)] pl-4 text-gray-300 italic">
                            {children}
                        </blockquote>
                    ),
                    a: ({ href, children }) => (
                        <a
                            className="text-[color:var(--brand-primary)] hover:text-white underline underline-offset-2"
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
                        <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-gray-200">
                            {children}
                        </pre>
                    ),
                    code: (props: any) => {
                        const { inline, children } = props;
                        const isInline = inline === true;
                        return isInline ? (
                            <code className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-[color:var(--brand-primary)]">
                                {children}
                            </code>
                        ) : (
                            <code className="whitespace-pre-wrap text-gray-200">
                                {children}
                            </code>
                        );
                    }
                }}
            >
                {metricsSpecMarkdown}
            </ReactMarkdown>
        </ProofOfWorkModal>
    );

    if (report) {
        const axibridgeLogoUrl = joinAssetPath(assetBasePath, 'svg/AxiBridge.svg');
        const animateGroupScrollToTop = () => {
            if (groupTopScrollRafRef.current !== null) {
                cancelAnimationFrame(groupTopScrollRafRef.current);
                groupTopScrollRafRef.current = null;
            }
            const startTop = window.scrollY || window.pageYOffset || 0;
            if (startTop <= 1) {
                window.scrollTo({ top: 0, behavior: 'auto' });
                return;
            }
            const durationMs = 320;
            const startAt = performance.now();
            const step = (now: number) => {
                const elapsed = now - startAt;
                const t = Math.min(1, elapsed / durationMs);
                const eased = 1 - Math.pow(1 - t, 3);
                const nextTop = Math.max(0, Math.round(startTop * (1 - eased)));
                window.scrollTo({ top: nextTop, behavior: 'auto' });
                if (t < 1) {
                    groupTopScrollRafRef.current = requestAnimationFrame(step);
                } else {
                    groupTopScrollRafRef.current = null;
                    window.scrollTo({ top: 0, behavior: 'auto' });
                }
            };
            groupTopScrollRafRef.current = requestAnimationFrame(step);
        };
        const expandOnlyGroup = (groupId: string) => {
            setExpandedGroups(() => {
                const next: Record<string, boolean> = {};
                navGroups.forEach((group) => {
                    next[group.id] = group.id === groupId;
                });
                return next;
            });
        };
        const handleGroupSelect = (groupId: string) => {
            pendingScrollIdRef.current = null;
            setActiveGroup(groupId);
            const group = navGroups.find((entry) => entry.id === groupId);
            setActiveSectionId(group?.items?.[0]?.id || 'overview');
            animateGroupScrollToTop();
        };
        const handleGroupHeaderClick = (groupId: string) => {
            const isExpanded = !!expandedGroups[groupId];
            if (!isExpanded) {
                expandOnlyGroup(groupId);
                handleGroupSelect(groupId);
                return;
            }
            if (groupId !== activeGroup) {
                handleGroupSelect(groupId);
                return;
            }
            setExpandedGroups((prev) => ({ ...prev, [groupId]: false }));
        };
        const handleSubNavClick = (groupId: string, id: string) => {
            if (!expandedGroups[groupId]) {
                expandOnlyGroup(groupId);
            }
            setActiveSectionId(id);
            const isSameGroup = groupId === activeGroup;
            if (!isSameGroup) {
                pendingScrollIdRef.current = id;
                setActiveGroup(groupId);
                requestAnimationFrame(() => scrollToSectionSafe(id));
            }
            if (isSameGroup) {
                requestAnimationFrame(() => scrollToSectionSafe(id));
            }
        };
        const handleNavWheel = (event: React.WheelEvent<HTMLElement>) => {
            const nav = event.currentTarget;
            const canScroll = nav.scrollHeight > nav.clientHeight;
            if (!canScroll) {
                window.scrollBy({ top: event.deltaY, behavior: 'auto' });
                event.preventDefault();
                return;
            }
            const atTop = nav.scrollTop <= 0;
            const atBottom = nav.scrollTop + nav.clientHeight >= nav.scrollHeight - 1;
            if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) {
                window.scrollBy({ top: event.deltaY, behavior: 'auto' });
                event.preventDefault();
            }
        };
        const handleStatsWheel = (event: React.WheelEvent<HTMLDivElement>) => {
            const wrapper = statsWrapperRef.current;
            if (!wrapper) return;
            const target = event.target as HTMLElement | null;
            if (!target || !wrapper.contains(target)) return;
            let node: HTMLElement | null = target;
            while (node && node !== wrapper) {
                const style = window.getComputedStyle(node);
                const overflowY = style.overflowY;
                const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1;
                if (isScrollable) {
                    const atTop = node.scrollTop <= 0;
                    const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
                    if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
                        window.scrollBy({ top: event.deltaY, behavior: 'auto' });
                        event.preventDefault();
                    }
                    return;
                }
                node = node.parentElement;
            }
        };
        const navSpring = { type: 'spring' as const, stiffness: 200, damping: 28, mass: 0.8 };
        const navFastSpring = { type: 'spring' as const, stiffness: 300, damping: 30 };
        return (
            <div
                className="min-h-screen text-white relative overflow-x-hidden"
                style={{
                    backgroundColor: 'var(--bg-base)'
                }}
            >
                <div className="fixed inset-0 pointer-events-none">
                    <div
                        className="absolute rounded-full"
                        style={{ backgroundColor: 'var(--glow-primary)', width: 'clamp(320px, 30vw, 800px)', height: 'clamp(320px, 30vw, 800px)', filter: 'blur(clamp(140px, 12vw, 320px))', top: '-5%', right: '5%' }}
                    />
                    <div
                        className="absolute rounded-full"
                        style={{ backgroundColor: 'var(--glow-secondary)', width: 'clamp(288px, 28vw, 750px)', height: 'clamp(288px, 28vw, 750px)', filter: 'blur(clamp(120px, 11vw, 300px))', top: '30%', left: '2%' }}
                    />
                    <div
                        className="absolute rounded-full"
                        style={{ backgroundColor: 'var(--glow-secondary)', width: 'clamp(256px, 25vw, 700px)', height: 'clamp(256px, 25vw, 700px)', filter: 'blur(clamp(120px, 11vw, 300px))', bottom: '5%', right: '15%' }}
                    />
                </div>
                <div className={`fixed inset-0 z-20 bg-black/40 backdrop-blur-sm transition-opacity ${isNarrowViewport ? '' : 'hidden'} ${tocOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setTocOpen(false)} />
                <aside
                    className={`fixed z-30 top-0 bottom-0 w-64 max-w-[80vw] transition-transform duration-300 ${isNarrowViewport ? '' : 'hidden'} ${tocOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <div className="report-nav-sidebar h-full bg-black/20 border-r border-white/10 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] flex flex-col">
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
                        <div className="px-5 pb-4">
                            <a
                                href={themedIndexHref}
                                className="report-back-link w-full inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[color:var(--accent-bg)] text-[10px] uppercase tracking-[0.35em] text-gray-100 transition-colors hover:bg-[color:var(--accent-border)]"
                            >
                                <span className="h-8 w-8 rounded-full border border-[color:var(--accent-border)] inline-flex items-center justify-center text-[color:var(--brand-primary)]">
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M19 12H6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                                        <path d="M12 6L6 12L12 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                                Back to Reports
                            </a>
                        </div>
                        <nav className="px-3 pb-6 space-y-2 text-sm overflow-y-auto [overflow-anchor:none]" onWheel={handleNavWheel}>
                            {navGroups.map((group) => {
                                const GroupIcon = group.icon;
                                const isActive = group.id === activeGroup;
                                const isExpanded = !!expandedGroups[group.id];
                                return (
                                    <div key={group.id} className="space-y-1">
                                        <button
                                            onClick={() => handleGroupHeaderClick(group.id)}
                                            className={`report-nav-group-btn w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${isActive
                                                ? 'bg-white/10 text-white border-white/20'
                                                : 'text-gray-300 border-transparent hover:border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            <GroupIcon className="report-nav-group-icon w-5 h-5 shrink-0 text-[color:var(--brand-primary)]" />
                                            <span className="report-nav-group-label text-[11px] uppercase tracking-[0.22em] whitespace-nowrap min-w-0 truncate">{group.label}</span>
                                            <motion.span
                                                className="report-nav-chevron ml-auto inline-flex shrink-0"
                                                animate={{ rotate: isExpanded ? 0 : -90 }}
                                                transition={navFastSpring}
                                            >
                                                <ChevronDown className="w-4 h-4 text-gray-300" />
                                            </motion.span>
                                        </button>
                                        <AnimatePresence initial={false}>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={navSpring}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="report-nav-submenu space-y-1 pl-2 pt-1" data-nav-submenu-content>
                                                        {group.items.map((item, index) => {
                                                            const ItemIcon = item.icon;
                                                            return (
                                                                <motion.button
                                                                    key={item.id}
                                                                    initial={{ opacity: 0, x: -8 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    transition={{ ...navFastSpring, delay: index * 0.03 }}
                                                                    onClick={() => {
                                                                        handleSubNavClick(group.id, item.id);
                                                                        setTocOpen(false);
                                                                    }}
                                                                    className={`report-nav-item-btn w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] border transition-colors ${activeSectionId === item.id ? 'text-white border-white/20 bg-white/10' : 'text-gray-200 border-transparent hover:border-white/10 hover:bg-white/10'}`}
                                                                >
                                                                    <ItemIcon className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                                                                    {item.label}
                                                                </motion.button>
                                                            );
                                                        })}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </nav>
                    </div>
                </aside>
                <aside className={`report-nav-sidebar fixed inset-y-0 left-0 w-64 border-r border-white/10 bg-black/20 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] z-20 ${isNarrowViewport ? 'hidden' : 'flex'}`}>
                    <div className="flex flex-col w-full">
                        <div className="px-6 pt-6 pb-5">
                            <div className="flex items-center gap-3">
                                <div
                                    className="h-10 w-10 rounded-2xl border border-white/20"
                                    style={{
                                        backgroundColor: defaultLogoColor,
                                        maskImage: `url("${axibridgeLogoUrl}")`,
                                        WebkitMaskImage: `url("${axibridgeLogoUrl}")`,
                                        maskRepeat: 'no-repeat',
                                        WebkitMaskRepeat: 'no-repeat',
                                        maskPosition: 'center',
                                        WebkitMaskPosition: 'center',
                                        maskSize: '65%',
                                        WebkitMaskSize: '65%',
                                        maskMode: 'alpha'
                                    }}
                                    aria-label="AxiBridge logo"
                                />
                                <div>
                                    <div><div className="text-[11px] tracking-[0.06em]" style={{ fontFamily: '"Cinzel", serif' }}><span className="text-white">Axi</span><span style={{ color: 'var(--brand-primary)' }}>Bridge</span></div><div className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Reports</div></div>
                                    <div className="text-sm font-semibold text-white">Navigation</div>
                                </div>
                            </div>
                        </div>
                        {/* Search lives with the report's navigation, not the page header —
                            it opens the same palette as Ctrl+K. Styled as a field, not a pill. */}
                        <div className="px-4 pb-3">
                            <button
                                onClick={() => searchOpenRef.current?.()}
                                title="Search (Ctrl+K)"
                                aria-label="Search report"
                                className="report-nav-search w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:border-white/30 hover:text-gray-200 transition-colors text-left"
                            >
                                <Search className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                                <span className="text-sm min-w-0 truncate">Search…</span>
                                <kbd className="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded-md border border-white/10 bg-white/5 text-gray-500 font-sans tracking-wide">Ctrl K</kbd>
                            </button>
                        </div>
                        <nav className="px-4 space-y-2 text-sm flex-1 overflow-y-auto [overflow-anchor:none]" onWheel={handleNavWheel}>
                            {navGroups.map((group) => {
                                const GroupIcon = group.icon;
                                const isActive = group.id === activeGroup;
                                const isExpanded = !!expandedGroups[group.id];
                                return (
                                    <div key={group.id} className="space-y-1">
                                        <button
                                            onClick={() => handleGroupHeaderClick(group.id)}
                                            className={`report-nav-group-btn w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${isActive
                                                ? 'bg-white/10 text-white border-white/20'
                                                : 'text-gray-300 border-transparent hover:border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            <GroupIcon className="report-nav-group-icon w-5 h-5 shrink-0 text-[color:var(--brand-primary)]" />
                                            <span className="report-nav-group-label text-[11px] uppercase tracking-[0.22em] whitespace-nowrap min-w-0 truncate">{group.label}</span>
                                            <motion.span
                                                className="report-nav-chevron ml-auto inline-flex shrink-0"
                                                animate={{ rotate: isExpanded ? 0 : -90 }}
                                                transition={navFastSpring}
                                            >
                                                <ChevronDown className="w-4 h-4 text-gray-300" />
                                            </motion.span>
                                        </button>
                                        <AnimatePresence initial={false}>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={navSpring}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="report-nav-submenu space-y-1 pl-2 pt-1" data-nav-submenu-content>
                                                        {group.items.map((item, index) => {
                                                            const ItemIcon = item.icon;
                                                            return (
                                                                <motion.button
                                                                    key={item.id}
                                                                    initial={{ opacity: 0, x: -8 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    transition={{ ...navFastSpring, delay: index * 0.03 }}
                                                                    onClick={() => handleSubNavClick(group.id, item.id)}
                                                                    className={`report-nav-item-btn w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] border transition-colors ${activeSectionId === item.id ? 'text-white border-white/20 bg-white/10' : 'text-gray-200 border-transparent hover:border-white/10 hover:bg-white/10'}`}
                                                                >
                                                                    <ItemIcon className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                                                                    {item.label}
                                                                </motion.button>
                                                            );
                                                        })}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </nav>
                        <div className="border-t border-white/10">
                            <a
                                href={themedIndexHref}
                                className="report-back-link w-full inline-flex items-center gap-3 px-6 py-4 bg-[color:var(--accent-bg)] text-[10px] uppercase tracking-[0.35em] text-gray-100 transition-colors hover:bg-[color:var(--accent-border)]"
                            >
                                <span className="h-9 w-9 rounded-full border border-[color:var(--accent-border)] inline-flex items-center justify-center text-[color:var(--brand-primary)]">
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M19 12H6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                                        <path d="M12 6L6 12L12 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                                Back to Reports
                            </a>
                        </div>
                    </div>
                </aside>
                <div className={`max-w-[2150px] mx-1 sm:mx-2 px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 mobile-bottom-pad ${isNarrowViewport ? '' : 'lg:mx-auto lg:pl-[17rem] lg:pr-10'}`}>
                    <div className={`${glassCard} p-5 sm:p-6 mb-6 mx-1 sm:mx-1 lg:mx-0`} style={glassCardStyle}>
                        <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 text-center sm:text-left">
                                {logoUrl && (
                                    logoIsDefault ? (
                                        <div
                                            className="w-16 h-16 sm:w-24 sm:h-24 mx-auto sm:mx-0"
                                            style={{
                                                backgroundColor: defaultLogoColor,
                                                maskImage: `url("${logoUrl}")`,
                                                WebkitMaskImage: `url("${logoUrl}")`,
                                                maskRepeat: 'no-repeat',
                                                WebkitMaskRepeat: 'no-repeat',
                                                maskPosition: 'center',
                                                WebkitMaskPosition: 'center',
                                                maskSize: 'contain',
                                                WebkitMaskSize: 'contain',
                                                maskMode: 'alpha'
                                            }}
                                            aria-label="AxiBridge logo"
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
                                    <div className="report-brand-label"><div className="text-xs tracking-[0.06em]" style={{ fontFamily: '"Cinzel", serif' }}><span className="text-white">Axi</span><span style={{ color: 'var(--brand-primary)' }}>Bridge</span></div><div className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Log Report</div></div>
                                    <h1 className="text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2 flex-wrap">
                                        <span>{report.meta.title}</span>
                                        {(report.meta as any).guild?.tag && (
                                            <span
                                                className="inline-flex items-center rounded-[4px] border px-2 py-0.5 text-sm font-semibold tracking-wide"
                                                style={{ borderColor: 'var(--border-hover)', color: 'var(--text-secondary)' }}
                                                title={(report.meta as any).guild.name || undefined}
                                            >
                                                [{(report.meta as any).guild.tag}]{(report.meta as any).guild.name ? ` ${(report.meta as any).guild.name}` : ''}
                                            </span>
                                        )}
                                    </h1>
                                    <div className="text-xs sm:text-sm text-gray-400 mt-2">{report.meta.dateLabel || formatLocalRange(report.meta.dateStart, report.meta.dateEnd)}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => setTocOpen(true)}
                                className={`${isNarrowViewport && !isCompactViewport ? 'flex' : 'hidden'} px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs uppercase tracking-widest text-gray-300 hover:border-white/30 transition-colors items-center gap-2`}
                            >
                                <PanelLeft className="w-4 h-4" />
                                Contents
                            </button>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:overflow-visible pr-1 sm:pr-2">
                                <div className="col-span-2 sm:col-span-1 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 inline-flex items-center gap-2 min-w-0 justify-start">
                                    <CalendarDays className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                                    {report.meta.dateLabel || 'Log Range'}
                                </div>
                                <div className="col-span-2 sm:col-span-1 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 flex items-center gap-2 min-w-0">
                                    <CommanderTagIcon className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                                    <span className="truncate">
                                        {report.meta.commanders.length ? report.meta.commanders.join(', ') : 'No Commanders'}
                                    </span>
                                </div>
                                <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 flex items-center gap-2 min-w-0">
                                    <ShieldCheck className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                                    Report {report.meta.appVersion ? `v${report.meta.appVersion}` : 'build'}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className={`${isNarrowViewport && isCompactViewport ? '' : 'hidden'} mb-4`}>
                        <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Jump to</div>
                        <div className="flex gap-2 overflow-x-auto pr-2 pb-1 snap-x snap-mandatory">
                            {(activeGroupDef?.items || []).map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={`chip-${item.id}`}
                                        onClick={() => handleSubNavClick(activeGroupDef?.id || 'overview', item.id)}
                                        className={`group flex items-center gap-2 px-3 py-2 rounded-full text-[10px] uppercase tracking-widest whitespace-nowrap border bg-gradient-to-br shadow-[0_10px_25px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-200 active:translate-y-0 active:scale-[0.98] snap-start ${activeSectionId === item.id ? 'text-white border-[color:var(--accent-border)] from-[color:var(--accent-bg)] via-white/10 to-transparent' : 'text-gray-200 border-white/15 from-white/10 via-white/5 to-transparent hover:-translate-y-0.5 hover:border-[color:var(--accent-border)] hover:shadow-[0_18px_35px_rgba(0,0,0,0.45)]'}`}
                                    >
                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 border border-white/10 group-hover:border-[color:var(--accent-border)] group-hover:bg-[color:var(--accent-bg)] transition-colors">
                                            <Icon className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                                        </span>
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div ref={statsWrapperRef} onWheelCapture={handleStatsWheel} className="flex-1 min-w-0">
                        <div id="stats-view-top">
                            <StatsView
                                logs={[]}
                                onBack={() => { }}
                                mvpWeights={undefined}
                                precomputedStats={report.stats}
                                statsViewSettings={report.stats?.statsViewSettings}
                                embedded
                                sectionVisibility={sectionVisibilityFn}
                                dashboardTitle={dashboardTitleText}
                                onRequestCategory={(categoryId) => startTransition(() => setActiveGroup(categoryId))}
                                onSearchAvailable={(open) => { searchOpenRef.current = open; }}
                            />
                        </div>
                    </div>
                    <div className="mt-10">
                        {legalNoticePane}
                    </div>
                </div>
                <div className={`fixed bottom-4 left-4 right-4 z-30 mobile-action-bar ${isNarrowViewport ? '' : 'hidden'}`}>
                    {/* Icon-over-label, each item flex-1 min-w-0. A row of four
                        side-by-side icon+label pills needs 387px of the 337px
                        available at 393px wide, and every label is a single
                        unbreakable word (min-content == max-content), so
                        flex-shrink has nothing to give and the last item runs
                        off-screen. Stacking drops the row to ~291px and the
                        flex-1/truncate pair keeps it bounded on narrower phones. */}
                    <div className="flex items-stretch gap-1.5 rounded-2xl bg-slate-950/70 border border-white/15 backdrop-blur-xl px-3 py-2 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                        <a
                            href={themedIndexHref}
                            className="flex flex-1 min-w-0 flex-col items-center justify-center gap-1 px-1.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                        >
                            <ArrowLeft className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                            <span className="max-w-full truncate">Back</span>
                        </a>
                        <button
                            onClick={() => setTocOpen(true)}
                            className="flex flex-1 min-w-0 flex-col items-center justify-center gap-1 px-1.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                        >
                            <PanelLeft className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                            <span className="max-w-full truncate">Contents</span>
                        </button>
                        <button
                            onClick={() => searchOpenRef.current?.()}
                            className="flex flex-1 min-w-0 flex-col items-center justify-center gap-1 px-1.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                        >
                            <Search className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                            <span className="max-w-full truncate">Search</span>
                        </button>
                        <button
                            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                            className="flex flex-1 min-w-0 flex-col items-center justify-center gap-1 px-1.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-200"
                        >
                            <ArrowUp className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                            <span className="max-w-full truncate">Top</span>
                        </button>
                    </div>
                </div>
                {proofOfWorkModal}
            </div>
        );
    }

    if (isRollupView) {
        return (
            <div
                className="min-h-screen text-white relative overflow-x-hidden"
                style={{
                    backgroundColor: 'var(--bg-base)'
                }}
            >
                <div className="fixed inset-0 pointer-events-none">
                    <div
                        className="absolute rounded-full"
                        style={{ backgroundColor: 'var(--glow-primary)', width: 'clamp(320px, 30vw, 800px)', height: 'clamp(320px, 30vw, 800px)', filter: 'blur(clamp(140px, 12vw, 320px))', top: '-5%', right: '5%' }}
                    />
                    <div
                        className="absolute rounded-full"
                        style={{ backgroundColor: 'var(--glow-secondary)', width: 'clamp(288px, 28vw, 750px)', height: 'clamp(288px, 28vw, 750px)', filter: 'blur(clamp(120px, 11vw, 300px))', top: '30%', left: '2%' }}
                    />
                    <div
                        className="absolute rounded-full"
                        style={{ backgroundColor: 'var(--glow-secondary)', width: 'clamp(256px, 25vw, 700px)', height: 'clamp(256px, 25vw, 700px)', filter: 'blur(clamp(120px, 11vw, 300px))', bottom: '5%', right: '15%' }}
                    />
                </div>
                <div className="max-w-[2150px] mx-auto px-4 pt-4 pb-8 sm:px-6 sm:pt-5 sm:pb-10">
                    <div className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-6">
                        <div className={`${glassCard} p-5 sm:p-6 mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`} style={glassCardStyle}>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-h-[56px] text-center sm:text-left">
                                {logoUrl && (
                                    logoIsDefault ? (
                                        <div
                                            className="w-16 h-16 sm:w-24 sm:h-24 mx-auto sm:mx-0"
                                            style={{
                                                backgroundColor: defaultLogoColor,
                                                maskImage: `url("${logoUrl}")`,
                                                WebkitMaskImage: `url("${logoUrl}")`,
                                                maskRepeat: 'no-repeat',
                                                WebkitMaskRepeat: 'no-repeat',
                                                maskPosition: 'center',
                                                WebkitMaskPosition: 'center',
                                                maskSize: 'contain',
                                                WebkitMaskSize: 'contain',
                                                maskMode: 'alpha'
                                            }}
                                            aria-label="AxiBridge logo"
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
                                    <div className="text-sm tracking-[0.06em]" style={{ fontFamily: '"Cinzel", serif' }}><span className="text-white">Axi</span><span style={{ color: 'var(--brand-primary)' }}>Bridge</span></div>
                                    <h1 className="text-2xl sm:text-3xl font-bold mt-2">All Reports</h1>
                                    <p className="text-xs sm:text-sm text-gray-400 mt-1">Combined commander and player stats across every hosted report.</p>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                                <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 inline-flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                                    {rollupData?.uniqueRaids || 0} Raids
                                </div>
                                <a
                                    href={themedIndexHref}
                                    className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 inline-flex items-center justify-center gap-2 hover:border-[color:var(--accent-border)] transition-colors"
                                >
                                    <ArrowLeft className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                                    Back To Reports
                                </a>
                            </div>
                        </div>

                        {error && (
                            <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-6 py-5 text-amber-100 shadow-xl backdrop-blur-md" style={glassCardStyle}>
                                <div className="text-sm uppercase tracking-widest text-amber-200/70">Warning</div>
                                <div className="mt-2 text-base font-semibold text-white">{error}</div>
                            </div>
                        )}

                        {!error && !index && (
                            <div className={`${glassCard} p-6 text-gray-300`} style={glassCardStyle}>Loading reports...</div>
                        )}

                        {!error && index && (
                            <>
                                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
                                    <div className={`${glassCard} p-4`} style={glassCardStyle}>
                                        <div className="text-[11px] uppercase tracking-widest text-gray-400">Raids</div>
                                        <div className="mt-2 text-2xl font-semibold text-white">{rollupData ? rollupData.uniqueRaids : '—'}</div>
                                    </div>
                                    <div className={`${glassCard} p-4`} style={glassCardStyle}>
                                        <div className="text-[11px] uppercase tracking-widest text-gray-400">Commanders</div>
                                        <div className="mt-2 text-2xl font-semibold text-white">{rollupData ? rollupData.commanderRows.length : '—'}</div>
                                    </div>
                                    <div className={`${glassCard} p-4`} style={glassCardStyle}>
                                        <div className="text-[11px] uppercase tracking-widest text-gray-400">Players</div>
                                        <div className="mt-2 text-2xl font-semibold text-white">{rollupData ? rollupData.playerRows.length : '—'}</div>
                                    </div>
                                    <div className={`${glassCard} p-4`} style={glassCardStyle}>
                                        <div className="text-[11px] uppercase tracking-widest text-gray-400">Combat Hours</div>
                                        <div className="mt-2 text-2xl font-semibold text-white">{rollupData ? formatHoursLabel(rollupData.playerRows.reduce((sum, r) => sum + r.combatTimeMs, 0)) : '—'}</div>
                                    </div>
                                </div>

                                {(rollupLoading || rollupError || (rollupData && (failedRollupReports > 0 || rollupData.raidsSkippedMissingRequiredData > 0))) && (
                                    <div className={`${glassCard} px-4 py-3 mb-6 text-xs sm:text-sm text-gray-300`} style={glassCardStyle}>
                                        {rollupLoading && (
                                            <span>Loading {rollupRequestedCount} reports...</span>
                                        )}
                                        {!rollupLoading && rollupError && (
                                            <span className="text-amber-200">{rollupError}</span>
                                        )}
                                        {!rollupLoading && rollupData && (failedRollupReports > 0 || rollupData.raidsSkippedMissingRequiredData > 0) && (
                                            <span className="text-amber-200/80">
                                                {failedRollupReports > 0 ? `${failedRollupReports} report${failedRollupReports === 1 ? '' : 's'} could not be loaded. ` : ''}
                                                {rollupData.raidsSkippedMissingRequiredData > 0 ? `${rollupData.raidsSkippedMissingRequiredData} raid window${rollupData.raidsSkippedMissingRequiredData === 1 ? '' : 's'} had incomplete data and ${rollupData.raidsSkippedMissingRequiredData === 1 ? 'was' : 'were'} excluded.` : ''}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {!rollupLoading && rollupData && (
                                    <div className="flex flex-col gap-6">
                                        <div className={`${glassCard} p-4 sm:p-5`} style={glassCardStyle}>
                                            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
                                                <div>
                                                    <div className="text-[11px] uppercase tracking-widest text-[color:var(--accent-border)]">Commanders</div>
                                                    <h2 className="text-lg sm:text-xl font-semibold mt-1">All Commander Runs</h2>
                                                </div>
                                                <div className="text-[11px] uppercase tracking-widest text-gray-400">Runs are counted per unique raid</div>
                                            </div>
                                            {rollupData.commanderRows.length === 0 ? (
                                                <div className="text-sm text-gray-400">No commander data found yet.</div>
                                            ) : rollupData.noEgoMode ? (
                                                <NoEgoRollup commanderRows={rollupData.commanderRows} playerRows={[]} />
                                            ) : (
                                                <div className="rounded-2xl border border-white/5 bg-black/25 overflow-hidden">
                                                    <div className="border-b border-white/5 px-3 py-3 sm:px-4">
                                                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_140px_140px] gap-3">
                                                            <input
                                                                type="search"
                                                                value={commanderSearchTerm}
                                                                onChange={(event) => setCommanderSearchTerm(event.target.value)}
                                                                placeholder="Search commanders, character names, or class..."
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-border)]"
                                                            />
                                                            <select
                                                                value={commanderProfessionFilter}
                                                                onChange={(event) => setCommanderProfessionFilter(event.target.value)}
                                                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-border)]"
                                                            >
                                                                {commanderProfessionOptions.map((option) => (
                                                                    <option key={option} value={option} className="bg-slate-900 text-white">
                                                                        {option === 'all' ? 'All Classes' : option}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <select
                                                                value={commanderMinRunsFilter}
                                                                onChange={(event) => setCommanderMinRunsFilter(event.target.value)}
                                                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-border)]"
                                                            >
                                                                <option value="1" className="bg-slate-900 text-white">Any Raids</option>
                                                                <option value="2" className="bg-slate-900 text-white">2+ Raids</option>
                                                                <option value="5" className="bg-slate-900 text-white">5+ Raids</option>
                                                                <option value="10" className="bg-slate-900 text-white">10+ Raids</option>
                                                            </select>
                                                            <div className="flex items-center justify-start lg:justify-end px-1 text-[11px] uppercase tracking-widest text-gray-400">
                                                                Showing {filteredCommanderRows.length} of {rollupData.commanderRows.length}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                                                    <div className="max-h-[32rem] overflow-auto rounded-xl border border-white/5">
                                                        <table className="w-full min-w-[860px] text-sm">
                                                            <thead className="sticky top-0 text-[11px] uppercase tracking-widest text-white/85 z-10" style={rollupTableHeaderStyle}>
                                                                <tr className="border-b border-white/10">
                                                                <th className="text-left py-3 pr-4 pl-4 sm:pl-5 font-medium">Commander</th>
                                                                <th className="text-left py-3 pr-4 font-medium">Class</th>
                                                                <th className="text-right py-3 pr-4 font-medium">Runs</th>
                                                                <th className="text-right py-3 pr-4 font-medium">Fights</th>
                                                                <th className="text-right py-3 pr-4 font-medium">KDR</th>
                                                                <th className="text-right py-3 pr-4 font-medium">Kills</th>
                                                                <th className="text-right py-3 pr-4 font-medium">Deaths</th>
                                                                <th className="text-right py-3 pr-4 font-medium">Win %</th>
                                                                <th className="text-right py-3 pr-4 sm:pr-5 font-medium">Last Run</th>
                                                            </tr>
                                                        </thead>
                                                            <tbody>
                                                            {filteredCommanderRows.map((row) => {
                                                                const totalFights = row.wins + row.losses;
                                                                const winRate = totalFights > 0 ? (row.wins / totalFights) * 100 : 0;
                                                                return (
                                                                    <tr key={row.account} className="border-b border-white/5 align-top hover:bg-white/[0.03]">
                                                                        <td className="py-3 pr-4 pl-4 sm:pl-5">
                                                                            <div className="font-medium text-white">{row.account}</div>
                                                                            <div className="text-xs text-gray-400 mt-1">
                                                                                {row.characterNames.length > 0 ? row.characterNames.join(', ') : 'No character names recorded'}
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-3 pr-4 text-gray-300">
                                                                            <span
                                                                                className="cursor-help underline decoration-dotted decoration-white/30 underline-offset-4"
                                                                                onMouseEnter={(event) => showProfessionTooltip(event, row.professionBreakdown)}
                                                                                onMouseLeave={hideProfessionTooltip}
                                                                            >
                                                                                {row.profession || '--'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="py-3 pr-4 text-right text-white">{row.runs}</td>
                                                                        <td className="py-3 pr-4 text-right text-white">{row.fightsLed}</td>
                                                                        <td className="py-3 pr-4 text-right text-white">{formatRatio(row.kdr)}</td>
                                                                        <td className="py-3 pr-4 text-right text-white">{row.kills}</td>
                                                                        <td className="py-3 pr-4 text-right text-white">{row.commanderDeaths}</td>
                                                                        <td className="py-3 pr-4 text-right text-white">{formatRatio(winRate)}%</td>
                                                                        <td className="py-3 pr-4 sm:pr-5 text-right text-gray-300">{formatRollupDate(row.lastSeenTs)}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                            {filteredCommanderRows.length === 0 && (
                                                                <tr>
                                                                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                                                                        No commanders match the current filters.
                                                                    </td>
                                                                </tr>
                                                            )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className={`${glassCard} p-4 sm:p-5`} style={glassCardStyle}>
                                            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
                                                <div>
                                                    <div className="text-[11px] uppercase tracking-widest text-[color:var(--accent-border)]">Players</div>
                                                    <h2 className="text-lg sm:text-xl font-semibold mt-1">Everyone Who Joined</h2>
                                                </div>
                                                <div className="text-[11px] uppercase tracking-widest text-gray-400">Last seen is based on the report end time</div>
                                            </div>
                                            {rollupData.playerRows.length === 0 ? (
                                                <div className="text-sm text-gray-400">No attendance data found yet.</div>
                                            ) : rollupData.noEgoMode ? (
                                                <NoEgoRollup commanderRows={[]} playerRows={rollupData.playerRows} />
                                            ) : (
                                                <div className="rounded-2xl border border-white/5 bg-black/25 overflow-hidden">
                                                    <div className="border-b border-white/5 px-3 py-3 sm:px-4">
                                                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_140px_140px] gap-3">
                                                            <input
                                                                type="search"
                                                                value={playerSearchTerm}
                                                                onChange={(event) => setPlayerSearchTerm(event.target.value)}
                                                                placeholder="Search players, character names, or class..."
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-border)]"
                                                            />
                                                            <select
                                                                value={playerProfessionFilter}
                                                                onChange={(event) => setPlayerProfessionFilter(event.target.value)}
                                                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-border)]"
                                                            >
                                                                {playerProfessionOptions.map((option) => (
                                                                    <option key={option} value={option} className="bg-slate-900 text-white">
                                                                        {option === 'all' ? 'All Classes' : option}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <select
                                                                value={playerMinRunsFilter}
                                                                onChange={(event) => setPlayerMinRunsFilter(event.target.value)}
                                                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-border)]"
                                                            >
                                                                <option value="1" className="bg-slate-900 text-white">Any Raids</option>
                                                                <option value="2" className="bg-slate-900 text-white">2+ Raids</option>
                                                                <option value="5" className="bg-slate-900 text-white">5+ Raids</option>
                                                                <option value="10" className="bg-slate-900 text-white">10+ Raids</option>
                                                            </select>
                                                            <div className="flex items-center justify-start lg:justify-end px-1 text-[11px] uppercase tracking-widest text-gray-400">
                                                                Showing {filteredPlayerRows.length} of {rollupData.playerRows.length}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                                                    <div className="max-h-[32rem] overflow-auto rounded-xl border border-white/5">
                                                        <table className="w-full min-w-[900px] text-sm">
                                                            <thead className="sticky top-0 text-[11px] uppercase tracking-widest text-white/85 z-10" style={rollupTableHeaderStyle}>
                                                                <tr className="border-b border-white/10">
                                                                <th className="text-left py-3 pr-4 pl-4 sm:pl-5 font-medium">Player</th>
                                                                <th className="text-left py-3 pr-4 font-medium">Main Class</th>
                                                                <th className="text-right py-3 pr-4 font-medium">Runs</th>
                                                                <th className="text-right py-3 pr-4 font-medium">Combat Time</th>
                                                                <th className="text-right py-3 pr-4 font-medium">Squad Span</th>
                                                                <th className="text-right py-3 pr-4 sm:pr-5 font-medium">Last Raid</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {filteredPlayerRows.map((row) => (
                                                                <tr key={row.account} className="border-b border-white/5 align-top hover:bg-white/[0.03]">
                                                                    <td className="py-3 pr-4 pl-4 sm:pl-5">
                                                                        <div className="font-medium text-white">{row.account}</div>
                                                                        {row.characterNames.length > 0 && (
                                                                            <div className="text-xs text-gray-400 mt-1">{row.characterNames.join(', ')}</div>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-3 pr-4 text-gray-300">
                                                                        <span
                                                                            className="cursor-help underline decoration-dotted decoration-white/30 underline-offset-4"
                                                                            onMouseEnter={(event) => showProfessionTooltip(event, row.professionBreakdown)}
                                                                            onMouseLeave={hideProfessionTooltip}
                                                                        >
                                                                            {row.profession || '--'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-3 pr-4 text-right text-white">{row.runs}</td>
                                                                    <td className="py-3 pr-4 text-right text-white">{formatHoursLabel(row.combatTimeMs)}</td>
                                                                    <td className="py-3 pr-4 text-right text-white">{formatHoursLabel(row.squadTimeMs)}</td>
                                                                    <td className="py-3 pr-4 sm:pr-5 text-right text-gray-300">{formatRollupDate(row.lastSeenTs)}</td>
                                                                </tr>
                                                            ))}
                                                            {filteredPlayerRows.length === 0 && (
                                                                <tr>
                                                                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                                                                        No players match the current filters.
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div className="mt-8">
                        {legalNoticePane}
                    </div>
                </div>
                {professionTooltipPane}
                {proofOfWorkModal}
            </div>
        );
    }

    return (
        <div
            className="min-h-screen text-white relative overflow-x-hidden"
            style={{
                backgroundColor: 'var(--bg-base)'
            }}
        >
            <div className="fixed inset-0 pointer-events-none">
                <div
                    className="absolute rounded-full"
                    style={{ backgroundColor: 'var(--glow-primary)', width: 'clamp(320px, 28vw, 700px)', height: 'clamp(320px, 28vw, 700px)', filter: 'blur(clamp(140px, 10vw, 280px))', top: '-8rem', right: '-6rem' }}
                />
                <div
                    className="absolute rounded-full"
                    style={{ backgroundColor: 'var(--glow-secondary)', width: 'clamp(288px, 25vw, 640px)', height: 'clamp(288px, 25vw, 640px)', filter: 'blur(clamp(120px, 9vw, 260px))', top: '10rem', left: '-5rem' }}
                />
                <div
                    className="absolute rounded-full"
                    style={{ backgroundColor: 'var(--glow-secondary)', width: 'clamp(256px, 22vw, 580px)', height: 'clamp(256px, 22vw, 580px)', filter: 'blur(clamp(120px, 9vw, 260px))', bottom: '2.5rem', right: '2.5rem' }}
                />
            </div>
            <div className="max-w-[2150px] mx-auto px-4 pt-4 pb-8 sm:px-6 sm:pt-5 sm:pb-10">
                <div id="report-list-container" className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-6">
                    <div id="report-top" className={`${glassCard} p-5 sm:p-6 mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`} style={glassCardStyle}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 min-h-[56px] text-center sm:text-left">
                            {logoUrl && !logoIsDefault ? (
                                <img
                                    src={logoUrl}
                                    alt="Squad logo"
                                    className="w-20 h-20 sm:w-28 sm:h-28 rounded-lg object-cover mx-auto sm:mx-0 shrink-0"
                                />
                            ) : (
                                <img
                                    src={joinAssetPath(assetBasePath, 'img/AxiBridge-white.png')}
                                    alt="AxiBridge logo"
                                    className="w-20 h-20 sm:w-28 sm:h-28 mx-auto sm:mx-0 shrink-0 object-contain"
                                />
                            )}
                            <div>
                                <div className="text-2xl sm:text-3xl tracking-[0.06em] font-medium" style={{ fontFamily: '"Cinzel", serif' }}><span className="text-white">Axi</span><span style={{ color: 'var(--brand-primary)' }}>Bridge</span></div>
                                <div className="text-xs sm:text-sm uppercase tracking-[0.3em] text-gray-400 mt-1">Reports</div>
                                <p className="text-xs text-gray-500 mt-1">Select a report to view the full stats dashboard.</p>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
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
                            className="w-full md:flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-border)]"
                        />
                        <div className="text-[11px] sm:text-xs text-gray-400">
                            Showing <span className="text-[color:var(--brand-primary)]">{filteredIndex.length}</span> of{' '}
                            <span className="text-[color:var(--brand-primary)]">{sortedIndex.length}</span>
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

                    {!error && index && sortedIndex.length > 0 && (
                        <a
                            href={rollupHref}
                            className={`${glassCard} mb-4 px-5 py-4 transition-all duration-200 group block overflow-hidden relative hover:-translate-y-0.5`}
                            style={{
                                ...glassCardStyle,
                                borderColor: 'rgba(var(--accent-rgb), 0.55)',
                                backgroundImage: `linear-gradient(135deg, rgba(var(--accent-rgb), 0.28), rgba(var(--accent-rgb), 0.1) 52%, rgba(255,255,255,0.02) 100%)`,
                                boxShadow: '0 22px 50px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255,255,255,0.05)'
                            }}
                        >
                            <div
                                className="absolute inset-y-0 left-0 w-1.5"
                                style={{ background: 'linear-gradient(180deg, rgba(var(--accent-rgb), 0.95), rgba(var(--accent-rgb), 0.35))' }}
                                aria-hidden="true"
                            />
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                                <div className="min-w-0 block text-left pl-1 sm:pl-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                                            <BarChart3 className="w-4 h-4" />
                                            All Reports
                                        </span>
                                        <span className="text-[11px] uppercase tracking-widest text-white/60">Overview</span>
                                    </div>
                                    <div className="text-base sm:text-lg font-semibold mt-2 text-white">Combined Stats Across Every Included Report</div>
                                    <div className="text-xs text-gray-300 mt-1 flex items-center gap-2">
                                        <Users className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
                                        <span>Cross-report commander totals, roster attendance, and recent participation in one place.</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 sm:mt-0 mt-2 w-full sm:w-auto">
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="text-[10px] uppercase tracking-widest text-white/60">Source Reports</div>
                                        <div className="text-lg text-white font-semibold">{sortedIndex.length}</div>
                                        <div className="text-[10px] uppercase tracking-widest text-[color:var(--accent-border)]">Open Summary</div>
                                    </div>
                                    <div className="h-10 w-10 rounded-full border border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] inline-flex items-center justify-center">
                                        <ExternalLink className="w-5 h-5 text-[color:var(--brand-primary)] opacity-90" />
                                    </div>
                                </div>
                            </div>
                        </a>
                    )}

                    {filteredIndex.length > 0 && (
                        <div className="flex flex-col gap-3">
                            {filteredIndex.map((entry) => (
                                <a
                                    key={entry.id}
                                    href={buildReportHref(baseHref, entry.id)}
                                    className={`${glassCard} px-5 py-4 hover:border-[color:var(--accent-border)] transition-colors group`}
                                    style={glassCardStyle}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                                        <div className="min-w-0 block text-left">
                                            <div className="text-[11px] uppercase tracking-widest text-gray-400">
                                                {entry.dateLabel}
                                            </div>
                                            <div className="text-base sm:text-lg font-semibold mt-1 truncate flex items-center gap-2">
                                                <span className="truncate">{formatReportTitle(entry.dateStart)}</span>
                                                {(entry as any).guild?.tag && (
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            setSearchTerm((entry as any).guild.tag);
                                                        }}
                                                        className="shrink-0 inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide hover:border-[color:var(--accent-border)] transition-colors"
                                                        style={{ borderColor: 'var(--border-hover)', color: 'var(--text-secondary)' }}
                                                        title={`Search reports by ${(entry as any).guild.name || (entry as any).guild.tag}`}
                                                    >
                                                        [{(entry as any).guild.tag}]
                                                    </button>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                                                <Users className="w-4 h-4 shrink-0 text-[color:var(--brand-primary)]" />
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
                                            <ExternalLink className="w-5 h-5 text-[color:var(--brand-primary)] opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
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
