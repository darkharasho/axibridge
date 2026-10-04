import { CSSProperties, MouseEvent as ReactMouseEvent, startTransition, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { StatsView } from '../renderer/StatsView';
import { STATS_TOC_GROUPS } from '../renderer/stats/hooks/useStatsNavigation';
import { resolveSectionTarget } from '../renderer/stats/statsTaxonomy';
import type { ColorPalette, AxiTheme } from '../shared/webThemes';
import { readPaletteFromReport } from './paletteReader';
import { resolveMapAccentFromStats, MAP_ACCENT_CSS_VARS, type MapAccent } from '../shared/mapAccent';
import { applyAxiTheme } from '../shared/applyAxiTheme';
import { publishedByLogin } from '../shared/publishedBy';
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
import { encodeSliceMask, decodeSliceMask } from '../renderer/stats/slice/sliceBitmask';
import { useStatsStore } from '../renderer/stats/statsStore';
import type { SliceSidecar } from '../renderer/stats/slice/sliceTypes';
import { useSliceRecompute } from './hooks/useSliceRecompute';
import { computeIncludedOrdinals } from '../renderer/stats/slice/computeIncludedOrdinals';
import { fetchReportPayload } from '../renderer/stats/utils/fetchParts';
import { UNSUPPORTED_PARTS_VERSION_MESSAGE } from '../shared/chunkedGzip';

/**
 * How long the viewer waits out a GitHub Pages deploy before calling a report
 * missing. The commit lands well before the site serves it — on a repo with a
 * few hundred reports the build regularly takes a couple of minutes — and the
 * link is usually opened the moment the desktop app hands it over.
 */
const DEPLOY_RETRY_ATTEMPTS = 30;
const DEPLOY_RETRY_INTERVAL_MS = 10000;
import { useSliceSidecarLoader } from './hooks/useSliceSidecarLoader';
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


import { planAssetBaseResolution, probeAssetBasePath } from './assetBasePath';
import { FightHero } from './share/FightHero';

const glassCard = 'border axi-edge-rule rounded-2xl shadow-xl backdrop-blur-md glass-card';

// Sections that only mean something across several logs, each degenerate when
// the report holds exactly one fight:
//   data-map                  indexes a report that has one entry
//   fight-breakdown           a sortable table of one row, every column of
//                             which already appears in the header above it
//   fight-diff-mode           would diff a fight against itself
//   map-distribution          a pie chart of a single slice
//   timeline                  a line chart of squad and enemy size over the
//                             session — one point, and the header already
//                             carries that matchup as a bar
//   squad-damage-comparison   a bar per fight of damage out vs in; one pair,
//                             and both totals are KPI tiles in the header
//   squad-comp-fight          a fight-tab strip with one tab, whose panel is
//                             the squad composition the Classes section
//                             already shows in full
const AGGREGATE_ONLY_SECTIONS = [
    'data-map',
    'fight-breakdown',
    'fight-diff-mode',
    'map-distribution',
    'timeline',
    'squad-damage-comparison',
    'squad-comp-fight'
];


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

/**
 * Bypasses ReportApp's own fetch-driven loading (used by the standalone
 * share-link viewer entry, which has already fetched and decoded a report
 * payload from a share pointer's `loc` before ReportApp ever mounts).
 */
export interface ReportAppInjectedSource {
    report: ReportPayload;
}

export function ReportApp({ injectedSource, assetBase }: {
    injectedSource?: ReportAppInjectedSource;
    /**
     * Absolute (or root-relative) directory the static assets are served from.
     * When set it is authoritative and the probe is skipped entirely — see
     * `planAssetBaseResolution`.
     */
    assetBase?: string;
} = {}) {
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
    const [theme, setTheme] = useState<AxiTheme>('default');
    const [mapAccent, setMapAccent] = useState<MapAccent | null>(null);
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
    // Cancels the group scroll-to-top rAF loop (see animateGroupScrollToTop)
    // so its trailing `scrollTo({ top: 0 })` can't stomp on a section jump
    // requested afterwards, from any entry point (sub-nav click, pending
    // scroll effect, or hash navigation).
    const cancelGroupTopScroll = () => {
        if (groupTopScrollRafRef.current !== null) {
            cancelAnimationFrame(groupTopScrollRafRef.current);
            groupTopScrollRafRef.current = null;
        }
    };
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
    // Under the share viewer the page is served at /r/<code>, so both of these
    // resolve straight back to the page you are already on (the Worker's route
    // regex tolerates the trailing slash, and `?view=rollup` just re-serves it
    // in rollup mode with an empty index). There is no report index to go back
    // to at all, so the chrome that links to one is suppressed.
    const showIndexChrome = !injectedSource;
    // An injected source is always exactly one fight — the share viewer is the
    // only caller, and a share pointer addresses a single log. That makes the
    // aggregate framing (averages over N logs, win/loss tallies, a per-fight
    // breakdown table, fight-vs-fight comparison) either degenerate or
    // meaningless here, so the header, the overview tiles and the nav all swap
    // to fight-scoped equivalents.
    const singleFight = !!injectedSource;
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
    const assetBasePlan = useMemo(
        () => planAssetBaseResolution({ assetBase, basePath }),
        [assetBase, basePath, isDevLocalWeb]
    );
    const assetBasePathCandidates = assetBasePlan.candidates;
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

    // The publisher's accent and theme choice, applied the same way the renderer
    // applies them — two data attributes on <html>, nothing else.
    useEffect(() => {
        document.body.classList.add('web-report');
        applyAxiTheme(document.documentElement, { accent: colorPalette, theme });
        // A share link's accent comes from the map it was fought on rather than
        // from the publisher's palette. Inline properties on <body> beat the
        // [data-axi-accent] rule on <html> by proximity, so this overrides the
        // whole language — including upstream's own components — without needing
        // an accent id per map. --axi-accent leads the list for exactly that
        // reason; see MAP_ACCENT_CSS_VARS.
        for (const [cssVar, key] of MAP_ACCENT_CSS_VARS) {
            if (mapAccent) document.body.style.setProperty(cssVar, mapAccent[key]);
            else document.body.style.removeProperty(cssVar);
        }
    }, [colorPalette, theme, mapAccent]);

    useEffect(() => {
        setAssetBasePath(assetBasePathCandidates[0] || '/');
        let isMounted = true;
        // `probeAssetBasePath` performs NO fetches when the plan carries an
        // explicit asset base — under /r/<code> every probe is a guaranteed
        // 404, two of them against the Worker.
        void probeAssetBasePath(assetBasePlan).then((resolved) => {
            if (resolved && isMounted) setAssetBasePath(resolved);
        });
        return () => {
            isMounted = false;
        };
    }, [assetBasePathCandidates, assetBasePlan]);
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
                <mark className="bg-[color:var(--axi-surface-raised-paint)] px-1 axi-ink-plain">{match}</mark>
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
            node.classList.add('ring-2', 'ring-[color:var(--axi-ink-line)]', 'bg-[color:var(--axi-surface-paint)]');
            if (metricsSpecHighlightRef.current) {
                window.clearTimeout(metricsSpecHighlightRef.current);
            }
            metricsSpecHighlightRef.current = window.setTimeout(() => {
                node.classList.remove('ring-2', 'ring-[color:var(--axi-ink-line)]', 'bg-[color:var(--axi-surface-paint)]');
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
    const navGroups = useMemo(() => {
        const groups = STATS_TOC_GROUPS.map((g) => ({ ...g, sectionIds: [...g.sectionIds], items: [...g.items] }));
        if (!singleFight) return groups;
        return groups
            .map((g) => ({
                ...g,
                sectionIds: g.sectionIds.filter((id) => !AGGREGATE_ONLY_SECTIONS.includes(id)),
                items: g.items.filter((item) => !AGGREGATE_ONLY_SECTIONS.includes(item.id))
            }))
            // The Data Map is a whole group of one item, so filtering its items
            // leaves an empty, unclickable nav entry behind.
            .filter((g) => g.items.length > 0);
    }, [singleFight]);
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
        // "Statistics Dashboard" is the desktop app's name for the whole
        // multi-log view. On a share link the fight header already names the
        // subject, so the heading below it only needs to say which category the
        // reader is currently in.
        //
        // StatsHeader already prints that name as the eyebrow above this
        // heading whenever a title is passed, so prefixing it here set the
        // words "Statistics Dashboard" twice, three lines apart. The eyebrow
        // says what the page is; the heading says which part of it you are in.
        () => activeGroupDef?.label || 'Overview',
        [activeGroupDef]
    );
    const excludedFightKeys = useStatsStore((s) => s.excludedFightKeys);
    const mergeFightRoster = useStatsStore((s) => s.mergeFightRoster);

    // The tray reads fightRoster, so the sidecar's frozen publish order becomes
    // the roster — ordinals and tray cards agree by construction.
    const handleSidecarLoaded = useCallback((sidecar: SliceSidecar) => {
        mergeFightRoster(sidecar.fights, sidecar.fights.map((f) => f.id));
    }, [mergeFightRoster]);

    const { sliceState, loadSliceSidecar } = useSliceSidecarLoader({
        url: (report?.stats as any)?.sliceDataUrl,
        settingsHash: (report?.stats as any)?.sliceSettingsHash || null,
        onSidecar: handleSidecarLoaded,
    });

    const includedOrdinals = useMemo(
        () => computeIncludedOrdinals(sliceState.sidecar, excludedFightKeys),
        [sliceState.sidecar, excludedFightKeys],
    );

    // Task 15 review round 2 (R15-6): the viewer has no settings of its own
    // in slice mode, so it must hash/merge from the SAME published values the
    // sidecar was built under, or its settingsHash can never agree with the
    // publisher's. Merging 25 frames and running finalize() costs about what
    // a full aggregation costs, so — unlike Task 18's synchronous useMemo —
    // this now round-trips through the stats worker (Task 20).
    const { stats: slicedStats, computing: sliceComputing, error: sliceError } = useSliceRecompute({
        sidecar: sliceState.sidecar,
        includedOrdinals,
        mvpWeights: (report?.stats as any)?.mvpWeights,
        statsViewSettings: (report?.stats as any)?.statsViewSettings,
        disruptionMethod: (report?.stats as any)?.disruptionMethod,
    });

    const requestedSlice = useMemo(() => (initialSearchParams.get('slice') || '').trim(), [initialSearchParams]);
    const [sliceLinkStatus, setSliceLinkStatus] = useState<string | null>(null);
    const deepLinkApplied = useRef(false);

    // Landing on a slice= URL paints the full report first, then applies the
    // slice once the sidecar resolves — blocking first paint on a multi-megabyte
    // fetch is a worse trade than a brief flash of unsliced numbers.
    useEffect(() => {
        if (!requestedSlice || deepLinkApplied.current || !report) return;
        deepLinkApplied.current = true;
        setSliceLinkStatus('Applying slice…');
        void (async () => {
            const sidecar = await loadSliceSidecar();
            if (!sidecar) { setSliceLinkStatus(null); return; }
            const included = decodeSliceMask(requestedSlice, sidecar.fights.length);
            if (!included) {
                // A stale link degrades to the truth, never to wrong numbers.
                setSliceLinkStatus('This slice link does not match the report — showing all fights.');
                return;
            }
            const includedIds = new Set(included.map((ordinal) => sidecar.fights[ordinal]?.id).filter(Boolean));
            useStatsStore.getState().setFightsExcluded(
                sidecar.fights.filter((f) => !includedIds.has(f.id)).map((f) => f.id),
                true,
            );
            setSliceLinkStatus(null);
        })();
    }, [requestedSlice, report, loadSliceSidecar]);

    const handleCopySliceLink = useCallback(() => {
        const sidecar = sliceState.sidecar;
        if (!sidecar) return;
        const included = sidecar.fights
            .map((fight, ordinal) => ({ fight, ordinal }))
            .filter(({ fight }) => !excludedFightKeys.has(fight.id))
            .map(({ ordinal }) => ordinal);
        const url = new URL(window.location.href);
        // Query, not hash: the hash is the section-anchor channel, and a slice
        // has to survive jumping to a section.
        url.searchParams.set('slice', encodeSliceMask(included, sidecar.fights.length));
        // Only claim success once the write actually resolves. The clipboard API
        // is absent outside a secure context and can reject on a denied
        // permission, and telling someone their link is copied when it is not
        // costs them the slice they just built.
        const written = navigator.clipboard?.writeText(url.toString());
        if (!written) {
            setSliceLinkStatus('Could not copy — copy the address bar URL instead.');
            window.setTimeout(() => setSliceLinkStatus(null), 4000);
            return;
        }
        void written.then(
            () => {
                setSliceLinkStatus('Slice link copied.');
                window.setTimeout(() => setSliceLinkStatus(null), 2000);
            },
            () => {
                setSliceLinkStatus('Could not copy — copy the address bar URL instead.');
                window.setTimeout(() => setSliceLinkStatus(null), 4000);
            },
        );
    }, [sliceState.sidecar, excludedFightKeys]);

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
        // A hash/group change may race with an in-flight group scroll-to-top
        // animation; cancel it so its trailing `scrollTo({ top: 0 })` can't
        // override the pending section scroll below.
        cancelGroupTopScroll();
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
            // Cancel any in-flight group scroll-to-top animation (e.g. from a
            // just-clicked group header) so it can't race the hash-driven
            // section scroll picked up by the pendingScrollIdRef effect below.
            cancelGroupTopScroll();
        };
        syncFromHash();
        window.addEventListener('hashchange', syncFromHash);
        return () => {
            window.removeEventListener('hashchange', syncFromHash);
        };
    }, [navGroups]);
    // All theming resolves from --axi-accent and the axi token set; the two data
    // attributes on <html> are the only switches.
    const defaultLogoColor = 'var(--axi-accent)';
    // `background` shorthand, not `backgroundColor`: under glass `--bg-card`
    // resolves to `--axi-surface`, an alpha gradient, and a plain
    // `background-color: var(--axi-surface)` is invalid at computed-value time
    // — it silently computes to transparent, leaving every card with no fill.
    const glassCardStyle: CSSProperties = {
        background: 'var(--axi-surface-paint)',
        borderColor: 'var(--axi-ink-line)'
    };
    // Sticky table headers need an opaque base, or scrolled rows show straight
    // through. This used to layer the token over a hardcoded dark fallback as a
    // gradient, because --bg-card resolved to --axi-surface, which upstream's glass
    // theme makes an alpha gradient: opaque underneath, tint on top. That also made
    // the tint silently vanish under glass, since a gradient is not a valid colour
    // stop. --bg-card is now flat and opaque in BOTH surface treatments (the glass
    // token block in index.css), so the token alone is the opaque base.
    const rollupTableHeaderStyle: CSSProperties = {
        backgroundColor: 'var(--axi-surface-paint)'
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
            className="fixed z-50 pointer-events-none axi-panel axi-panel--float [--axi-panel-pad:10px_14px] text-xs"
            style={{
                left: professionTooltip.x,
                top: professionTooltip.y,
                backgroundColor: '#0c0f16',
                backgroundImage: 'linear-gradient(var(--axi-surface-paint), var(--axi-surface-paint))'
            }}
        >
            <div className="text-[10px] uppercase tracking-widest axi-ink-dim mb-1.5">Classes Played</div>
            <div className="space-y-1">
                {professionTooltip.entries.map((entry) => (
                    <div key={entry.profession} className="flex items-center justify-between gap-6">
                        <span className="flex items-center gap-2 axi-ink-plain">
                            <span
                                className="axi-diamond"
                                style={{ backgroundColor: getProfessionColor(entry.profession) }}
                            />
                            {entry.profession}
                        </span>
                        <span className="axi-ink-dim">{entry.runs} report{entry.runs === 1 ? '' : 's'}</span>
                    </div>
                ))}
            </div>
        </div>
    );

    useEffect(() => {
        let isMounted = true;
        let retryTimer: number | null = null;

        if (injectedSource) {
            setError(null);
            setIndex([]);
            setRollupData(null);
            setRollupError(null);
            setRollupLoading(false);
            setRollupRequestedCount(0);
            setReportPathHint(null);
            // A share link is accented by the WvW map the fights were on rather
            // than by the publisher's palette (see the mapAccent call below), but
            // it follows the publisher's theme choice like any other report.
            // There is no language to force on any more — axi is the only one.
            const { palette, theme: publishedTheme } = readPaletteFromReport(injectedSource.report.stats);
            setColorPalette(palette);
            setTheme(publishedTheme);
            setMapAccent(resolveMapAccentFromStats(injectedSource.report.stats));
            setReport(injectedSource.report);
            return () => {
                isMounted = false;
            };
        }

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
            const { palette, theme: publishedTheme } = readPaletteFromReport(reportData.stats);
            setColorPalette(palette);
            setTheme(publishedTheme);
        };

        const loadIndex = (suppressError = false) => {
            return fetch(`${basePath}reports/index.json`, { cache: 'no-store' })
                .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
                .then((data) => {
                    if (!isMounted) return;
                    // Support new object format { siteTheme, entries } and legacy plain array.
                    const entries = Array.isArray(data) ? data : (Array.isArray(data?.entries) ? data.entries : []);
                    setIndex(entries);
                    // Apply site-wide palette and theme from index.json
                    if (!Array.isArray(data) && data?.colorPalette) {
                        const { palette, theme: siteTheme } = readPaletteFromReport(data);
                        setColorPalette(palette);
                        setTheme(siteTheme);
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

        const loadReport = () => fetchReportPayload(reportPath)
            .then((data) => {
                if (!isMounted) return;
                const normalized = expandIconIndex(normalizeTopDownContribution(normalizeCommanderDistance(data)));
                setReport(normalized);
                applyPaletteFromReport(normalized);
            })
            .catch((err) => {
                console.warn('[Report] Failed to load report:', err);
                throw err;
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
            // A 404 right after a publish usually means the Pages build has not
            // finished, so the right answer is to wait, not to make the user
            // reload until it works. Keep retrying for a few minutes and say
            // that is what is happening.
            let attempt = 0;
            const attemptLoad = () => {
                loadReport().catch((err) => {
                    if (!isMounted) return;
                    if (err instanceof Error && err.message === UNSUPPORTED_PARTS_VERSION_MESSAGE) {
                        setError(UNSUPPORTED_PARTS_VERSION_MESSAGE);
                        loadIndex();
                        return;
                    }
                    attempt += 1;
                    if (attempt <= DEPLOY_RETRY_ATTEMPTS) {
                        setError(`Report not found yet — waiting for the GitHub Pages deploy (retry ${attempt}/${DEPLOY_RETRY_ATTEMPTS})...`);
                        retryTimer = window.setTimeout(attemptLoad, DEPLOY_RETRY_INTERVAL_MS);
                        return;
                    }
                    setError('Report not found. The GitHub Pages deploy may have failed — check the repository\u2019s Pages settings.');
                    loadIndex();
                });
            };
            attemptLoad();
            return () => {
                isMounted = false;
                if (retryTimer !== null) window.clearTimeout(retryTimer);
            };
        }

        // For the hosted root page, prefer the report index first. This prevents any
        // legacy root-level report.json file from hijacking the site and hiding newer uploads.
        loadIndex(true).catch(() => {
            loadReport().catch((err) => {
                if (!isMounted) return;
                setError(err instanceof Error && err.message === UNSUPPORTED_PARTS_VERSION_MESSAGE
                    ? UNSUPPORTED_PARTS_VERSION_MESSAGE
                    : 'No report data found.');
            });
        });
        return () => {
            isMounted = false;
        };
    }, [basePath, isRollupView, reportId, injectedSource]);

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
                    const payload = await fetchReportPayload(`${basePath}reports/${entry.id}/report.json`);
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
            // A share link's tab title is what lands in a bookmark and in a
            // pasted Discord embed, so it names the fight, not the commander and
            // the two-minute "date range" the aggregate title builds. The Worker
            // already server-renders an equivalent <title> for crawlers that do
            // not run JS (worker/src/og.ts); this keeps the two consistent once
            // the bundle takes over.
            if (singleFight) {
                const fight = (report.stats as { fightBreakdown?: Array<Record<string, unknown>> } | null)?.fightBreakdown?.[0];
                const label = (fight?.fullLabel || fight?.mapName || fight?.map || report.meta.title) as string;
                document.title = `${label} — AxiBridge`;
                return;
            }
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
    }, [isRollupView, report, singleFight]);

    useEffect(() => {
        let isMounted = true;
        fetch(joinAssetPath(assetBasePath, 'logo.json'), { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                // The glyph is the app's current mark; the wordmark it replaced is
                // still the stored path in every report published before the
                // switch, so both count as "no custom logo was set".
                const defaultPath = 'svg/axibridge-glyph.svg';
                const legacyDefaultPath = 'svg/AxiBridge.svg';
                const path = data?.path ? String(data.path) : defaultPath;
                const version = data?.updatedAt ? String(data.updatedAt) : '';
                const urlBase = joinAssetPath(assetBasePath, path);
                const url = version ? `${urlBase}?v=${encodeURIComponent(version)}` : urlBase;
                setLogoUrl(url);
                setLogoIsDefault(!data?.path || path === defaultPath || path === legacyDefaultPath);
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
        cancelGroupTopScroll();
    }, []);

    const legalNoticePane = (
        <div className="axi-well text-[11px] axi-ink-faint">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.35em] axi-ink-dim">Legal Notice</div>
                <div className="flex flex-wrap items-end gap-2">
                    <a
                        href="https://github.com/darkharasho/axibridge"
                        target="_blank"
                        rel="noreferrer"
                        className="axi-pill axi-pill--xs"
                    >
                        GitHub
                    </a>
                    <a
                        href="https://discord.gg/UjzMXMGXEg"
                        target="_blank"
                        rel="noreferrer"
                        className="axi-pill axi-pill--xs"
                    >
                        Discord
                    </a>
                    <a
                        href="#proof-of-work"
                        onClick={(event) => {
                            event.preventDefault();
                            setProofOfWorkOpen(true);
                        }}
                        className="axi-pill axi-pill--xs"
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
                    className="axi-link"
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
                    className="axi-link"
                >
                    LICENSE
                </a>
                {' '}and{' '}
                <a
                    href="https://github.com/darkharasho/axibridge/blob/main/THIRD_PARTY_NOTICES.md"
                    target="_blank"
                    rel="noreferrer"
                    className="axi-link"
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
            {/* `.axi-prose` (on ProofOfWorkModal's content wrapper) owns the
                typography. What survives is only what it cannot know: the heading
                ids the table of contents scrolls to and tracks, and a table wrapper
                carrying nothing but a scroll, because the metrics spec has tables
                wider than this modal.

                The `code` override that used to be here was broken, and adopting
                prose is what fixes it. react-markdown removed the `inline` prop in
                v9; this file tested `inline === true`, which is now never true, so
                every inline code span in the published report rendered through the
                fenced-block branch — no box, no mono, just wrapped text. The two
                other copies of this map in the app tested `inline ?? !className` and
                happened to stay correct, via a fallback written for a prop that no
                longer exists.

                Prose distinguishes the two cases in CSS instead: `code` styles every
                literal, `pre code` unstyles the one inside a block. That is a fact
                the DOM actually carries, so there is no prop to go stale. */}
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    ...Object.fromEntries((['h1', 'h2', 'h3'] as const).map((Tag) => [
                        Tag,
                        ({ children }: { children?: React.ReactNode }) => {
                            const label = extractHeadingText(children);
                            const id = buildMetricsSpecHeadingId(label);
                            return (
                                <Tag id={id} data-heading-id={id} className="scroll-mt-6">
                                    {children}
                                </Tag>
                            );
                        },
                    ])),
                    table: ({ children }) => (
                        <div className="overflow-x-auto">
                            <table>{children}</table>
                        </div>
                    ),
                }}
            >
                {metricsSpecMarkdown}
            </ReactMarkdown>
        </ProofOfWorkModal>
    );

    if (report) {
        // The glyph, not the wordmark: this mark sits in a 40px square, and the
        // wordmark masked into one came out as an unreadable squeeze of itself.
        const axibridgeLogoUrl = joinAssetPath(assetBasePath, 'svg/axibridge-glyph.svg');
        const animateGroupScrollToTop = () => {
            cancelGroupTopScroll();
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
            // Cancel any in-flight group scroll-to-top animation so its trailing
            // `scrollTo({ top: 0 })` can't override the section jump below.
            cancelGroupTopScroll();
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
                className="min-h-screen axi-ink-plain relative overflow-x-hidden"
            >
                <div className={`axi-scrim !z-20 transition-opacity ${isNarrowViewport ? '' : 'hidden'} ${tocOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setTocOpen(false)} />
                <aside
                    className={`fixed z-30 top-0 bottom-0 w-64 max-w-[80vw] transition-transform duration-300 ${isNarrowViewport ? '' : 'hidden'} ${tocOpen ? 'translate-x-0' : '-translate-x-full'}`}
                >
                    <div className="axi-rail axi-rail--flush axi-rail--float h-full" style={{ '--axi-rail-w': '100%', '--axi-rail-pad': '0' } as CSSProperties}>
                        <div className="px-5 pt-6 pb-4 flex items-center justify-between">
                            <div className="text-[11px] uppercase tracking-[0.4em] axi-ink-dim">Contents</div>
                            <button
                                onClick={() => setTocOpen(false)}
                                className="axi-action axi-action--glyph axi-ink-dim"
                                aria-label="Close table of contents"
                            >
                                ×
                            </button>
                        </div>
                        {showIndexChrome && <div className="px-5 pb-4">
                            <a
                                href={themedIndexHref}
                                className="axi-btn axi-btn--primary w-full justify-start gap-3 tracking-[0.35em]"
                            >
                                <span className="h-8 w-8 inline-flex items-center justify-center">
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M19 12H6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                                        <path d="M12 6L6 12L12 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                                Back to Reports
                            </a>
                        </div>}
                        <nav className="axi-scroll-quiet flex-1 min-h-0 px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-2 text-sm overflow-y-auto [overflow-anchor:none]" onWheel={handleNavWheel}>
                            {navGroups.map((group) => {
                                const GroupIcon = group.icon;
                                const isActive = group.id === activeGroup;
                                const isExpanded = !!expandedGroups[group.id];
                                return (
                                    <div key={group.id} className="space-y-1">
                                        <button
                                            onClick={() => handleGroupHeaderClick(group.id)}
                                            aria-current={isActive ? 'page' : undefined}
                                            className="axi-rail__item"
                                        >
                                            <GroupIcon className="axi-icon" />
                                            <span className="whitespace-nowrap min-w-0 truncate">{group.label}</span>
                                            <motion.span
                                                className="ml-auto inline-flex shrink-0"
                                                animate={{ rotate: isExpanded ? 0 : -90 }}
                                                transition={navFastSpring}
                                            >
                                                <ChevronDown className="axi-icon" />
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
                                                    <div className="axi-rail__sub" data-nav-submenu-content>
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
                                                                    aria-current={activeSectionId === item.id ? 'location' : undefined}
                                                                    className="axi-rail__subitem w-full flex items-center gap-2"
                                                                >
                                                                    <ItemIcon className="axi-icon" />
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
                {/* Rendered only on a wide viewport, not merely hidden there. Tailwind's
                    `hidden` and upstream's `.axi-rail { display: flex }` are both one
                    class deep, so which of them wins is decided by stylesheet order —
                    and .axi-rail won, leaving this rail laid out at mobile width with
                    its "Back to Reports" link over the mobile action bar, swallowing
                    the taps meant for it. Not rendering it settles the question. */}
                {!isNarrowViewport && <aside
                    // --float, not just --flush: this rail is pinned to the viewport and the
                    // report scrolls behind it, so the translucent --axi-surface a theme
                    // like glass gives a rail would show the table rows through the nav.
                    className="axi-rail axi-rail--flush axi-rail--float fixed inset-y-0 left-0 z-20 mb-[var(--axi-offset-panel)]"
                    style={{ '--axi-rail-w': '16rem', '--axi-rail-pad': '0' } as CSSProperties}
                >
                    <div className="flex flex-col w-full flex-1 min-h-0">
                        <div className="px-6 pt-6 pb-5">
                            <div className="flex items-center gap-3">
                                <div
                                    className="h-10 w-10 axi-well axi-well--sm [--axi-well-pad:0]"
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
                                    <div><div className="text-[11px] tracking-[0.06em]" style={{ fontFamily: '"Cinzel", serif' }}><span className="axi-ink-plain">Axi</span><span style={{ color: 'var(--axi-accent)' }}>Bridge</span></div><div className="text-[10px] uppercase tracking-[0.3em] axi-ink-dim">Reports</div></div>
                                    <div className="text-sm font-semibold axi-ink-plain">Navigation</div>
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
                                className="axi-action report-nav-search axi-palette__trigger h-[34px]"
                            >
                                {/* The glyph gets its own element so the language can
                                    cap the well with it. See .axi-palette__mark. */}
                                <span className="axi-palette__mark">
                                    <Search className="w-4 h-4" />
                                </span>
                                {/* No ellipsis: the well already reads as a field you
                                    type into, and the panel's own placeholder says the rest. */}
                                <span className="axi-palette__label">Search</span>
                                <kbd className="axi-kbd">Ctrl K</kbd>
                            </button>
                        </div>
                        <nav className="axi-scroll-quiet px-4 space-y-2 text-sm flex-1 min-h-0 overflow-y-auto [overflow-anchor:none]" onWheel={handleNavWheel}>
                            {navGroups.map((group) => {
                                const GroupIcon = group.icon;
                                const isActive = group.id === activeGroup;
                                const isExpanded = !!expandedGroups[group.id];
                                return (
                                    <div key={group.id} className="space-y-1">
                                        <button
                                            onClick={() => handleGroupHeaderClick(group.id)}
                                            aria-current={isActive ? 'page' : undefined}
                                            className="axi-rail__item"
                                        >
                                            <GroupIcon className="axi-icon" />
                                            <span className="whitespace-nowrap min-w-0 truncate">{group.label}</span>
                                            <motion.span
                                                className="ml-auto inline-flex shrink-0"
                                                animate={{ rotate: isExpanded ? 0 : -90 }}
                                                transition={navFastSpring}
                                            >
                                                <ChevronDown className="axi-icon" />
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
                                                    <div className="axi-rail__sub" data-nav-submenu-content>
                                                        {group.items.map((item, index) => {
                                                            const ItemIcon = item.icon;
                                                            return (
                                                                <motion.button
                                                                    key={item.id}
                                                                    initial={{ opacity: 0, x: -8 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    transition={{ ...navFastSpring, delay: index * 0.03 }}
                                                                    onClick={() => handleSubNavClick(group.id, item.id)}
                                                                    aria-current={activeSectionId === item.id ? 'location' : undefined}
                                                                    className="axi-rail__subitem w-full flex items-center gap-2"
                                                                >
                                                                    <ItemIcon className="axi-icon" />
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
                        {showIndexChrome && <div className="mt-auto shrink-0 border-t axi-edge-rule">
                            <a
                                href={themedIndexHref}
                                className="axi-btn axi-btn--primary w-full justify-start gap-3 tracking-[0.35em]"
                            >
                                <span className="h-9 w-9 inline-flex items-center justify-center">
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M19 12H6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                                        <path d="M12 6L6 12L12 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                                Back to Reports
                            </a>
                        </div>}
                    </div>
                </aside>}
                <div className={`max-w-[2150px] mx-1 sm:mx-2 px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 mobile-bottom-pad ${isNarrowViewport ? '' : 'lg:mx-auto lg:pl-[17rem] lg:pr-10'}`}>
                    {singleFight ? (
                        <FightHero meta={report.meta} stats={report.stats} className={glassCard} style={glassCardStyle} />
                    ) : (
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
                                                className="w-16 h-16 sm:w-24 sm:h-24 object-cover mx-auto sm:mx-0"
                                            />
                                        )
                                    )}
                                    <div className="min-w-0">
                                        <div className="report-brand-label"><div className="text-xs tracking-[0.06em]" style={{ fontFamily: '"Cinzel", serif' }}><span className="axi-ink-plain">Axi</span><span style={{ color: 'var(--axi-accent)' }}>Bridge</span></div><div className="text-[10px] uppercase tracking-[0.3em] axi-ink-dim">Log Report</div></div>
                                        <h1 className="text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2 flex-wrap">
                                            <span>{report.meta.title}</span>
                                            {(report.meta as any).guild?.tag && (
                                                <span
                                                    className="axi-chip text-sm"
                                                    style={{ borderColor: 'var(--axi-rule)', color: 'var(--axi-text-dim)' }}
                                                    title={(report.meta as any).guild.name || undefined}
                                                >
                                                    [{(report.meta as any).guild.tag}]{(report.meta as any).guild.name ? ` ${(report.meta as any).guild.name}` : ''}
                                                </span>
                                            )}
                                        </h1>
                                        <div className="text-xs sm:text-sm axi-ink-dim mt-2">{report.meta.dateLabel || formatLocalRange(report.meta.dateStart, report.meta.dateEnd)}</div>
                                    </div>
                                </div>
                                {/* Rendered, not hidden: .axi-pill sets its own display, so a
                                    Tailwind `hidden` on the same element loses the cascade and the
                                    pill shows up at every width (the e2e then found two "Contents"
                                    buttons). An element that should not exist at this width is
                                    not in the tree. */}
                                {isNarrowViewport && !isCompactViewport && <button
                                    onClick={() => setTocOpen(true)}
                                    className="axi-pill axi-pill--xs items-center gap-2"
                                >
                                    <PanelLeft className="w-4 h-4" />
                                    Contents
                                </button>}
                                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:overflow-visible pr-1 sm:pr-2">
                                    <div className="axi-chip inline-flex items-center gap-2 min-w-0 justify-start">
                                        <CalendarDays className="w-4 h-4 shrink-0 text-[color:var(--axi-accent)]" />
                                        {report.meta.dateLabel || 'Log Range'}
                                    </div>
                                    <div className="axi-chip flex items-center gap-2 min-w-0">
                                        <CommanderTagIcon className="w-4 h-4 shrink-0 text-[color:var(--axi-accent)]" />
                                        <span className="truncate">
                                            {report.meta.commanders.length ? report.meta.commanders.join(', ') : 'No Commanders'}
                                        </span>
                                    </div>
                                    <div className="axi-chip flex items-center gap-2 min-w-0">
                                        <ShieldCheck className="w-4 h-4 shrink-0 text-[color:var(--axi-accent)]" />
                                        Report {report.meta.appVersion ? `v${report.meta.appVersion}` : 'build'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className={`${isNarrowViewport && isCompactViewport ? '' : 'hidden'} mb-4`}>
                        <div className="text-[10px] uppercase tracking-widest axi-ink-dim mb-2">Jump to</div>
                        {/* A tab strip that outgrows its room: upstream's .axi-tabs--scroll.
                            The section you are reading is aria-current="page", which is
                            the same claim a tab makes and the same drawing - filled and
                            blocked, the rest transparent until hovered. */}
                        <nav className="mobile-jump-chips axi-tabs axi-tabs--scroll" aria-label="Jump to">
                            {(activeGroupDef?.items || []).map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={`chip-${item.id}`}
                                        type="button"
                                        onClick={() => handleSubNavClick(activeGroupDef?.id || 'overview', item.id)}
                                        aria-current={activeSectionId === item.id ? 'page' : undefined}
                                    >
                                        <Icon className="w-4 h-4 shrink-0" aria-hidden />
                                        {item.label}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                    <div ref={statsWrapperRef} onWheelCapture={handleStatsWheel} className="flex-1 min-w-0">
                        <div id="stats-view-top">
                            {(sliceLinkStatus || sliceError || sliceState.message || sliceComputing) && (
                                <div className="mb-3 axi-well axi-eyebrow">
                                    {sliceLinkStatus || sliceError || sliceState.message || (sliceComputing ? 'Recomputing…' : null)}
                                </div>
                            )}
                            <StatsView
                                logs={[]}
                                onBack={() => { }}
                                mvpWeights={undefined}
                                precomputedStats={slicedStats || report.stats}
                                statsViewSettings={report.stats?.statsViewSettings}
                                embedded
                                sliceEnabled={Boolean((report.stats as any)?.sliceDataUrl)}
                                // The recompute failed or refused, so the numbers
                                // on screen are the full report's. Tell the banner,
                                // so it says so instead of claiming a slice.
                                sliceUnavailable={Boolean(sliceError)}
                                onOpenSliceTray={loadSliceSidecar}
                                onCopySliceLink={handleCopySliceLink}
                                sectionVisibility={sectionVisibilityFn}
                                singleFight={singleFight}
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
                <div className={`fixed bottom-4 left-4 right-4 z-10 mobile-action-bar transition-[opacity,transform] duration-200 ${isNarrowViewport ? '' : 'hidden'} ${tocOpen ? 'opacity-0 translate-y-6 pointer-events-none' : 'opacity-100 translate-y-0'}`} aria-hidden={tocOpen}>
                    {/* Icon-over-label, each item flex-1 min-w-0. A row of four
                        side-by-side icon+label pills needs 387px of the 337px
                        available at 393px wide, and every label is a single
                        unbreakable word (min-content == max-content), so
                        flex-shrink has nothing to give and the last item runs
                        off-screen. Stacking drops the row to ~291px and the
                        flex-1/truncate pair keeps it bounded on narrower phones. */}
                    {/* Upstream's floating toolbar, one row that may not wrap, holding
                        four stacked buttons that each shrink and elide. The bar takes the
                        panel step and the actions inside it the control step, which is
                        why none of the four claims the accent: they are the same size
                        of action. */}
                    <div className="axi-toolbar axi-toolbar--float axi-toolbar--nowrap" style={{ '--axi-toolbar-pad': '8px' } as CSSProperties}>
                        {showIndexChrome && <a
                            href={themedIndexHref}
                            className="axi-btn axi-btn--xs axi-btn--stack flex-1"
                        >
                            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
                            <span>Back</span>
                        </a>}
                        <button type="button" onClick={() => setTocOpen(true)} className="axi-btn axi-btn--xs axi-btn--stack flex-1">
                            <PanelLeft className="w-4 h-4 shrink-0" aria-hidden />
                            <span>Contents</span>
                        </button>
                        <button type="button" onClick={() => searchOpenRef.current?.()} className="axi-btn axi-btn--xs axi-btn--stack flex-1">
                            <Search className="w-4 h-4 shrink-0" aria-hidden />
                            <span>Search</span>
                        </button>
                        <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="axi-btn axi-btn--xs axi-btn--stack flex-1">
                            <ArrowUp className="w-4 h-4 shrink-0" aria-hidden />
                            <span>Top</span>
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
                className="min-h-screen axi-ink-plain relative overflow-x-hidden"
            >
                <div className="max-w-[2150px] mx-auto px-4 pt-4 pb-8 sm:px-6 sm:pt-5 sm:pb-10">
                    <div className="p-4 sm:p-6">
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
                                            className="w-16 h-16 sm:w-24 sm:h-24 object-cover mx-auto sm:mx-0"
                                        />
                                    )
                                )}
                                <div>
                                    <div className="text-sm tracking-[0.06em]" style={{ fontFamily: '"Cinzel", serif' }}><span className="axi-ink-plain">Axi</span><span style={{ color: 'var(--axi-accent)' }}>Bridge</span></div>
                                    <h1 className="text-2xl sm:text-3xl font-bold mt-2">All Reports</h1>
                                    <p className="text-xs sm:text-sm axi-ink-dim mt-1">Combined commander and player stats across every hosted report.</p>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                                <div className="axi-chip inline-flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 shrink-0 text-[color:var(--axi-accent)]" />
                                    {rollupData?.uniqueRaids || 0} Raids
                                </div>
                                {showIndexChrome && <a
                                    href={themedIndexHref}
                                    className="axi-pill axi-pill--xs justify-center"
                                >
                                    <ArrowLeft className="w-4 h-4 shrink-0 text-[color:var(--axi-accent)]" />
                                    Back To Reports
                                </a>}
                            </div>
                        </div>

                        {error && (
                            <div className="mb-6 axi-panel axi-edge-warn axi-ink-warn">
                                <div className="text-sm uppercase tracking-widest axi-ink-warn">Warning</div>
                                <div className="mt-2 text-base font-semibold axi-ink-plain">{error}</div>
                            </div>
                        )}

                        {!error && !index && (
                            <div className={`${glassCard} p-6 axi-ink-dim`} style={glassCardStyle}>Loading reports...</div>
                        )}

                        {!error && index && (
                            <>
                                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
                                    <div className={`${glassCard} p-4`} style={glassCardStyle}>
                                        <div className="text-[11px] uppercase tracking-widest axi-ink-dim">Raids</div>
                                        <div className="mt-2 text-2xl font-semibold axi-ink-plain">{rollupData ? rollupData.uniqueRaids : '—'}</div>
                                    </div>
                                    <div className={`${glassCard} p-4`} style={glassCardStyle}>
                                        <div className="text-[11px] uppercase tracking-widest axi-ink-dim">Commanders</div>
                                        <div className="mt-2 text-2xl font-semibold axi-ink-plain">{rollupData ? rollupData.commanderRows.length : '—'}</div>
                                    </div>
                                    <div className={`${glassCard} p-4`} style={glassCardStyle}>
                                        <div className="text-[11px] uppercase tracking-widest axi-ink-dim">Players</div>
                                        <div className="mt-2 text-2xl font-semibold axi-ink-plain">{rollupData ? rollupData.playerRows.length : '—'}</div>
                                    </div>
                                    <div className={`${glassCard} p-4`} style={glassCardStyle}>
                                        <div className="text-[11px] uppercase tracking-widest axi-ink-dim">Combat Hours</div>
                                        <div className="mt-2 text-2xl font-semibold axi-ink-plain">{rollupData ? formatHoursLabel(rollupData.playerRows.reduce((sum, r) => sum + r.combatTimeMs, 0)) : '—'}</div>
                                    </div>
                                </div>

                                {(rollupLoading || rollupError || (rollupData && (failedRollupReports > 0 || rollupData.raidsSkippedMissingRequiredData > 0))) && (
                                    <div className={`${glassCard} px-4 py-3 mb-6 text-xs sm:text-sm axi-ink-dim`} style={glassCardStyle}>
                                        {rollupLoading && (
                                            <span>Loading {rollupRequestedCount} reports...</span>
                                        )}
                                        {!rollupLoading && rollupError && (
                                            <span className="axi-ink-warn">{rollupError}</span>
                                        )}
                                        {!rollupLoading && rollupData && (failedRollupReports > 0 || rollupData.raidsSkippedMissingRequiredData > 0) && (
                                            <span className="axi-ink-warn">
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
                                                    <div className="text-[11px] uppercase tracking-widest text-[color:var(--axi-ink-line)]">Commanders</div>
                                                    <h2 className="text-lg sm:text-xl font-semibold mt-1">All Commander Runs</h2>
                                                </div>
                                                <div className="text-[11px] uppercase tracking-widest axi-ink-dim">Runs are counted per unique raid</div>
                                            </div>
                                            {rollupData.commanderRows.length === 0 ? (
                                                <div className="text-sm axi-ink-dim">No commander data found yet.</div>
                                            ) : rollupData.noEgoMode ? (
                                                <NoEgoRollup commanderRows={rollupData.commanderRows} playerRows={[]} />
                                            ) : (
                                                <div className="axi-well overflow-hidden" style={{ '--axi-well-pad': '0' } as React.CSSProperties}>
                                                    <div className="border-b axi-edge-rule px-3 py-3 sm:px-4">
                                                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_140px_140px] gap-3">
                                                            <input
                                                                type="search"
                                                                value={commanderSearchTerm}
                                                                onChange={(event) => setCommanderSearchTerm(event.target.value)}
                                                                placeholder="Search commanders, character names, or class..."
                                                                className="axi-input"
                                                            />
                                                            <select
                                                                value={commanderProfessionFilter}
                                                                onChange={(event) => setCommanderProfessionFilter(event.target.value)}
                                                                className="axi-select"
                                                            >
                                                                {commanderProfessionOptions.map((option) => (
                                                                    <option key={option} value={option}>
                                                                        {option === 'all' ? 'All Classes' : option}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <select
                                                                value={commanderMinRunsFilter}
                                                                onChange={(event) => setCommanderMinRunsFilter(event.target.value)}
                                                                className="axi-select"
                                                            >
                                                                <option value="1">Any Raids</option>
                                                                <option value="2">2+ Raids</option>
                                                                <option value="5">5+ Raids</option>
                                                                <option value="10">10+ Raids</option>
                                                            </select>
                                                            <div className="flex items-center justify-start lg:justify-end px-1 text-[11px] uppercase tracking-widest axi-ink-dim">
                                                                Showing {filteredCommanderRows.length} of {rollupData.commanderRows.length}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                                                    <div className="max-h-[32rem] overflow-auto axi-well [--axi-well-pad:0]">
                                                        <table className="w-full min-w-[860px] text-sm">
                                                            <thead className="sticky top-0 text-[11px] uppercase tracking-widest axi-ink-faint z-10" style={rollupTableHeaderStyle}>
                                                                <tr className="border-b axi-edge-rule">
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
                                                                    <tr key={row.account} className="border-b axi-edge-rule align-top hover:bg-[color:var(--axi-surface-raised-paint)]">
                                                                        <td className="py-3 pr-4 pl-4 sm:pl-5">
                                                                            <div className="font-medium axi-ink-plain">{row.account}</div>
                                                                            <div className="text-xs axi-ink-dim mt-1">
                                                                                {row.characterNames.length > 0 ? row.characterNames.join(', ') : 'No character names recorded'}
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-3 pr-4 axi-ink-dim">
                                                                            <span
                                                                                className="cursor-help underline decoration-dotted decoration-white/30 underline-offset-4"
                                                                                onMouseEnter={(event) => showProfessionTooltip(event, row.professionBreakdown)}
                                                                                onMouseLeave={hideProfessionTooltip}
                                                                            >
                                                                                {row.profession || '--'}
                                                                            </span>
                                                                        </td>
                                                                        <td className="py-3 pr-4 text-right axi-ink-plain">{row.runs}</td>
                                                                        <td className="py-3 pr-4 text-right axi-ink-plain">{row.fightsLed}</td>
                                                                        <td className="py-3 pr-4 text-right axi-ink-plain">{formatRatio(row.kdr)}</td>
                                                                        <td className="py-3 pr-4 text-right axi-ink-plain">{row.kills}</td>
                                                                        <td className="py-3 pr-4 text-right axi-ink-plain">{row.commanderDeaths}</td>
                                                                        <td className="py-3 pr-4 text-right axi-ink-plain">{formatRatio(winRate)}%</td>
                                                                        <td className="py-3 pr-4 sm:pr-5 text-right axi-ink-dim">{formatRollupDate(row.lastSeenTs)}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                            {filteredCommanderRows.length === 0 && (
                                                                <tr>
                                                                    <td colSpan={9} className="px-4 py-8 text-center text-sm axi-ink-dim">
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
                                                    <div className="text-[11px] uppercase tracking-widest text-[color:var(--axi-ink-line)]">Players</div>
                                                    <h2 className="text-lg sm:text-xl font-semibold mt-1">Everyone Who Joined</h2>
                                                </div>
                                                <div className="text-[11px] uppercase tracking-widest axi-ink-dim">Last seen is based on the report end time</div>
                                            </div>
                                            {rollupData.playerRows.length === 0 ? (
                                                <div className="text-sm axi-ink-dim">No attendance data found yet.</div>
                                            ) : rollupData.noEgoMode ? (
                                                <NoEgoRollup commanderRows={[]} playerRows={rollupData.playerRows} />
                                            ) : (
                                                <div className="axi-well overflow-hidden" style={{ '--axi-well-pad': '0' } as React.CSSProperties}>
                                                    <div className="border-b axi-edge-rule px-3 py-3 sm:px-4">
                                                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_140px_140px] gap-3">
                                                            <input
                                                                type="search"
                                                                value={playerSearchTerm}
                                                                onChange={(event) => setPlayerSearchTerm(event.target.value)}
                                                                placeholder="Search players, character names, or class..."
                                                                className="axi-input"
                                                            />
                                                            <select
                                                                value={playerProfessionFilter}
                                                                onChange={(event) => setPlayerProfessionFilter(event.target.value)}
                                                                className="axi-select"
                                                            >
                                                                {playerProfessionOptions.map((option) => (
                                                                    <option key={option} value={option}>
                                                                        {option === 'all' ? 'All Classes' : option}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <select
                                                                value={playerMinRunsFilter}
                                                                onChange={(event) => setPlayerMinRunsFilter(event.target.value)}
                                                                className="axi-select"
                                                            >
                                                                <option value="1">Any Raids</option>
                                                                <option value="2">2+ Raids</option>
                                                                <option value="5">5+ Raids</option>
                                                                <option value="10">10+ Raids</option>
                                                            </select>
                                                            <div className="flex items-center justify-start lg:justify-end px-1 text-[11px] uppercase tracking-widest axi-ink-dim">
                                                                Showing {filteredPlayerRows.length} of {rollupData.playerRows.length}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                                                    <div className="max-h-[32rem] overflow-auto axi-well [--axi-well-pad:0]">
                                                        <table className="w-full min-w-[900px] text-sm">
                                                            <thead className="sticky top-0 text-[11px] uppercase tracking-widest axi-ink-faint z-10" style={rollupTableHeaderStyle}>
                                                                <tr className="border-b axi-edge-rule">
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
                                                                <tr key={row.account} className="border-b axi-edge-rule align-top hover:bg-[color:var(--axi-surface-raised-paint)]">
                                                                    <td className="py-3 pr-4 pl-4 sm:pl-5">
                                                                        <div className="font-medium axi-ink-plain">{row.account}</div>
                                                                        {row.characterNames.length > 0 && (
                                                                            <div className="text-xs axi-ink-dim mt-1">{row.characterNames.join(', ')}</div>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-3 pr-4 axi-ink-dim">
                                                                        <span
                                                                            className="cursor-help underline decoration-dotted decoration-white/30 underline-offset-4"
                                                                            onMouseEnter={(event) => showProfessionTooltip(event, row.professionBreakdown)}
                                                                            onMouseLeave={hideProfessionTooltip}
                                                                        >
                                                                            {row.profession || '--'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-3 pr-4 text-right axi-ink-plain">{row.runs}</td>
                                                                    <td className="py-3 pr-4 text-right axi-ink-plain">{formatHoursLabel(row.combatTimeMs)}</td>
                                                                    <td className="py-3 pr-4 text-right axi-ink-plain">{formatHoursLabel(row.squadTimeMs)}</td>
                                                                    <td className="py-3 pr-4 sm:pr-5 text-right axi-ink-dim">{formatRollupDate(row.lastSeenTs)}</td>
                                                                </tr>
                                                            ))}
                                                            {filteredPlayerRows.length === 0 && (
                                                                <tr>
                                                                    <td colSpan={6} className="px-4 py-8 text-center text-sm axi-ink-dim">
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
            className="min-h-screen axi-ink-plain relative overflow-x-hidden"
        >
            <div className="max-w-[2150px] mx-auto px-4 pt-4 pb-8 sm:px-6 sm:pt-5 sm:pb-10">
                <div id="report-list-container" className="p-4 sm:p-6">
                    <div id="report-top" className={`${glassCard} p-5 sm:p-6 mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`} style={glassCardStyle}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 min-h-[56px] text-center sm:text-left">
                            {logoUrl && !logoIsDefault ? (
                                <img
                                    src={logoUrl}
                                    alt="Squad logo"
                                    className="w-20 h-20 sm:w-28 sm:h-28 object-cover mx-auto sm:mx-0 shrink-0"
                                />
                            ) : (
                                <img
                                    src={joinAssetPath(assetBasePath, 'img/AxiBridge-white.png')}
                                    alt="AxiBridge logo"
                                    className="w-20 h-20 sm:w-28 sm:h-28 mx-auto sm:mx-0 shrink-0 object-contain"
                                />
                            )}
                            <div>
                                <div className="text-2xl sm:text-3xl tracking-[0.06em] font-medium" style={{ fontFamily: '"Cinzel", serif' }}><span className="axi-ink-plain">Axi</span><span style={{ color: 'var(--axi-accent)' }}>Bridge</span></div>
                                <div className="text-xs sm:text-sm uppercase tracking-[0.3em] axi-ink-dim mt-1">Reports</div>
                                <p className="text-xs axi-ink-faint mt-1">Select a report to view the full stats dashboard.</p>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                            <div className="axi-chip">
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
                            className="axi-input md:flex-1"
                        />
                        <div className="text-[11px] sm:text-xs axi-ink-dim">
                            Showing <span className="text-[color:var(--axi-accent)]">{filteredIndex.length}</span> of{' '}
                            <span className="text-[color:var(--axi-accent)]">{sortedIndex.length}</span>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-6 axi-panel axi-edge-warn axi-ink-warn">
                            <div className="text-sm uppercase tracking-widest axi-ink-warn">Warning</div>
                            <div className="mt-2 text-base font-semibold axi-ink-plain">{error}</div>
                            {reportPathHint && (
                                <div className="text-xs axi-ink-warn mt-2">
                                    Looking for: <span className="axi-ink-warn">{reportPathHint}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {!error && !index && (
                        <div className={`${glassCard} p-6 axi-ink-dim`} style={glassCardStyle}>Loading reports...</div>
                    )}

                    {showIndexChrome && !error && index && sortedIndex.length > 0 && (
                        <a
                            href={rollupHref}
                            className={`${glassCard} axi-edge-accent mb-4 px-5 py-4 transition-all duration-200 group block overflow-hidden relative hover:-translate-y-0.5`}
                            style={{
                                ...glassCardStyle,
                            }}
                        >
                            <div
                                className="absolute inset-y-0 left-0 w-1.5"
                                style={{ background: 'var(--axi-accent)' }}
                                aria-hidden="true"
                            />
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                                <div className="min-w-0 block text-left pl-1 sm:pl-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="axi-chip gap-1 axi-ink-plain">
                                            <BarChart3 className="w-4 h-4" />
                                            All Reports
                                        </span>
                                        <span className="text-[11px] uppercase tracking-widest axi-ink-faint">Overview</span>
                                    </div>
                                    <div className="text-base sm:text-lg font-semibold mt-2 axi-ink-plain">Combined Stats Across Every Included Report</div>
                                    <div className="text-xs axi-ink-dim mt-1 flex items-center gap-2">
                                        <Users className="w-4 h-4 shrink-0 text-[color:var(--axi-accent)]" />
                                        <span>Cross-report commander totals, roster attendance, and recent participation in one place.</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 sm:mt-0 mt-2 w-full sm:w-auto">
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="text-[10px] uppercase tracking-widest axi-ink-faint">Source Reports</div>
                                        <div className="text-lg axi-ink-plain font-semibold">{sortedIndex.length}</div>
                                        <div className="text-[10px] uppercase tracking-widest text-[color:var(--axi-ink-line)]">Open Summary</div>
                                    </div>
                                    <div className="h-10 w-10 axi-well axi-well--sm [--axi-well-pad:0] inline-flex items-center justify-center">
                                        <ExternalLink className="w-5 h-5 text-[color:var(--axi-accent)] opacity-90" />
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
                                    className={`${glassCard} px-5 py-4 hover:border-[color:var(--axi-ink-line)] transition-colors group`}
                                    style={glassCardStyle}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                                        <div className="min-w-0 block text-left">
                                            <div className="text-[11px] uppercase tracking-widest axi-ink-dim">
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
                                                        className="axi-btn axi-btn--xs shrink-0"
                                                        style={{ borderColor: 'var(--axi-rule)', color: 'var(--axi-text-dim)' }}
                                                        title={`Search reports by ${(entry as any).guild.name || (entry as any).guild.tag}`}
                                                    >
                                                        [{(entry as any).guild.tag}]
                                                    </button>
                                                )}
                                            </div>
                                            <div className="text-xs axi-ink-dim mt-1 flex items-center gap-2">
                                                <Users className="w-4 h-4 shrink-0 text-[color:var(--axi-accent)]" />
                                                <span className="truncate">
                                                    {entry.commanders.length ? entry.commanders.join(', ') : 'No Commanders'}
                                                    {publishedByLogin(entry) && (
                                                        <span className="axi-ink-faint"> · by {publishedByLogin(entry)}</span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 sm:mt-0 mt-2 w-full sm:w-auto">
                                            <div className="flex flex-col items-center gap-1 text-[10px] axi-ink-dim">
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
                                                <div className="text-[10px] uppercase tracking-widest axi-ink-dim">Avg Squad / Enemy</div>
                                                <div className="text-sm axi-ink-plain font-semibold">
                                                    {entry.summary?.avgSquadSize ?? '--'} / {entry.summary?.avgEnemySize ?? '--'}
                                                </div>
                                            </div>
                                            <ExternalLink className="w-5 h-5 text-[color:var(--axi-accent)] opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}

                    {!error && index && sortedIndex.length === 0 && (
                        <div className={`${glassCard} p-6 axi-ink-dim`} style={glassCardStyle}>No reports uploaded yet.</div>
                    )}

                    {!error && index && sortedIndex.length > 0 && filteredIndex.length === 0 && (
                        <div className={`${glassCard} p-6 axi-ink-dim`} style={glassCardStyle}>No reports match your search.</div>
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
