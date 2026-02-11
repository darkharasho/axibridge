import { CSSProperties, useEffect, useMemo, useState, useRef } from 'react';
import { StatsView } from '../renderer/StatsView';
import { DEFAULT_WEB_THEME, MATTE_WEB_THEME_ID, WebTheme, WEB_THEMES } from '../shared/webThemes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import metricsSpecMarkdown from '../shared/metrics-spec.md?raw';
import { ProofOfWorkModal } from '../renderer/ui/ProofOfWorkModal';
import { Gw2BoonIcon } from '../renderer/ui/Gw2BoonIcon';
import { Gw2SigilIcon } from '../renderer/ui/Gw2SigilIcon';
import {
    ShieldCheck,
    Shield,
    ShieldAlert,
    CalendarDays,
    Users,
    ExternalLink,
    LayoutDashboard,
    Trophy,
    Swords,
    Activity,
    Map as MapIcon,
    Sparkles,
    Plus,
    HeartPulse,
    Star,
    Skull,
    PanelLeft,
    Zap,
    ArrowLeft,
    ArrowUp,
    ListTree,
    Keyboard
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

type UiThemeChoice = 'classic' | 'modern' | 'crt' | 'matte';

const glassCard = 'border border-white/10 rounded-2xl shadow-xl backdrop-blur-md glass-card';
const WEB_THEME_OVERRIDE_COOKIE = 'arcbridge_web_theme_override';
const DEFAULT_THEME_SELECT_VALUE = '__default__';

const readCookieValue = (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    if (!match) return null;
    try {
        return decodeURIComponent(match[1]);
    } catch {
        return match[1];
    }
};

const writeCookieValue = (name: string, value: string, days = 365) => {
    if (typeof document === 'undefined') return;
    const maxAge = Math.max(0, Math.floor(days * 24 * 60 * 60));
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
};

const clearCookieValue = (name: string) => {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
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
    const [uiTheme, setUiTheme] = useState<UiThemeChoice>('classic');
    const [defaultUiTheme, setDefaultUiTheme] = useState<UiThemeChoice>('classic');
    const [defaultThemeId, setDefaultThemeId] = useState<string>(DEFAULT_WEB_THEME.id);
    const [themeIdOverride, setThemeIdOverride] = useState<string | null>(null);
    const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
    const [proofOfWorkOpen, setProofOfWorkOpen] = useState(false);
    const [activeProofOfWorkHeadingId, setActiveProofOfWorkHeadingId] = useState('');
    const [metricsSpecSearch, setMetricsSpecSearch] = useState('');
    const [metricsSpecSearchResults, setMetricsSpecSearchResults] = useState<Array<{ index: number; text: string; section: string; hitId: number }>>([]);
    const [metricsSpecSearchFocused, setMetricsSpecSearchFocused] = useState(false);
    const [activeGroup, setActiveGroup] = useState('overview');
    const statsWrapperRef = useRef<HTMLDivElement | null>(null);
    const metricsSpecContentRef = useRef<HTMLDivElement | null>(null);
    const metricsSpecSearchRef = useRef<HTMLDivElement | null>(null);
    const themeDropdownRef = useRef<HTMLDivElement | null>(null);
    const metricsSpecHighlightRef = useRef<number | null>(null);
    const metricsSpecHeadingCountsRef = useRef<Map<string, number>>(new Map());
    const pendingScrollIdRef = useRef<string | null>(null);
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
    const isDevLocalWeb = useMemo(() => {
        const isLocalhost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.host);
        return isLocalhost && window.location.pathname.startsWith('/web/');
    }, []);
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
        const persisted = readCookieValue(WEB_THEME_OVERRIDE_COOKIE);
        if (!persisted) return;
        try {
            const parsed = JSON.parse(persisted);
            const themeId = typeof parsed?.themeId === 'string' ? parsed.themeId : null;
            if (themeId && WEB_THEMES.some((entry) => entry.id === themeId)) {
                setThemeIdOverride(themeId);
            }
        } catch {
            // Ignore invalid cookie payload.
        }
    }, []);

    useEffect(() => {
        const effectiveThemeId = themeIdOverride || defaultThemeId;
        const matchedTheme = WEB_THEMES.find((entry) => entry.id === effectiveThemeId) || DEFAULT_WEB_THEME;
        setTheme(matchedTheme);
    }, [themeIdOverride, defaultThemeId]);

    useEffect(() => {
        if (!themeIdOverride) {
            setUiTheme(defaultUiTheme);
            return;
        }
        if (themeIdOverride === MATTE_WEB_THEME_ID) {
            setUiTheme('matte');
            return;
        }
        if (themeIdOverride === 'CRT') {
            setUiTheme('crt');
            return;
        }
        setUiTheme('classic');
    }, [themeIdOverride, defaultUiTheme]);

    useEffect(() => {
        setAssetBasePath(assetBasePathCandidates[0] || '/');
        let isMounted = true;
        const resolve = async () => {
            for (const candidate of assetBasePathCandidates) {
                try {
                    const response = await fetch(joinAssetPath(candidate, 'ui-theme.json'), { cache: 'no-store' });
                    if (response.ok) {
                        if (isMounted) setAssetBasePath(candidate);
                        return;
                    }
                } catch {
                    // Try next candidate.
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
            container.scrollTop = scrollOffset;
            node.classList.add('ring-2', 'ring-cyan-400/70', 'bg-cyan-500/10');
            if (metricsSpecHighlightRef.current) {
                window.clearTimeout(metricsSpecHighlightRef.current);
            }
            metricsSpecHighlightRef.current = window.setTimeout(() => {
                node.classList.remove('ring-2', 'ring-cyan-400/70', 'bg-cyan-500/10');
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

    const navGroups = useMemo(() => ([
        {
            id: 'overview',
            label: 'Overview',
            icon: LayoutDashboard,
            sectionIds: [
                'overview',
                'kdr',
                'fight-breakdown',
                'top-players',
                'top-skills-outgoing',
                'top-skills-incoming',
                'timeline',
                'map-distribution',
                'squad-composition'
            ],
            items: [
                { id: 'kdr', label: 'KDR', icon: Trophy },
                { id: 'fight-breakdown', label: 'Fight Breakdown', icon: Swords },
                { id: 'top-players', label: 'Top Players', icon: Trophy },
                { id: 'top-skills-outgoing', label: 'Top Skills', icon: Swords },
                { id: 'squad-composition', label: 'Squad Composition', icon: Users },
                { id: 'timeline', label: 'Squad vs Enemy Size', icon: Users },
                { id: 'map-distribution', label: 'Map Distribution', icon: MapIcon }
            ]
        },
        {
            id: 'offense',
            label: 'Offensive Stats',
            icon: Swords,
            sectionIds: ['offense-detailed', 'player-breakdown', 'spike-damage', 'conditions-outgoing'],
            items: [
                { id: 'offense-detailed', label: 'Offense Detailed', icon: Swords },
                { id: 'player-breakdown', label: 'Player Breakdown', icon: ListTree },
                { id: 'spike-damage', label: 'Spike Damage', icon: Zap },
                { id: 'conditions-outgoing', label: 'Conditions', icon: Skull }
            ]
        },
        {
            id: 'defense',
            label: 'Defensive Stats',
            icon: Shield,
            sectionIds: ['defense-detailed', 'incoming-strike-damage', 'defense-mitigation', 'boon-output', 'support-detailed', 'healing-stats'],
            items: [
                { id: 'defense-detailed', label: 'Defense Detailed', icon: Shield },
                { id: 'incoming-strike-damage', label: 'Incoming Strike Damage', icon: Zap },
                { id: 'defense-mitigation', label: 'Damage Mitigation', icon: ShieldAlert },
                { id: 'boon-output', label: 'Boon Output', icon: Gw2BoonIcon },
                { id: 'support-detailed', label: 'Support Detailed', icon: Plus },
                { id: 'healing-stats', label: 'Healing Stats', icon: HeartPulse }
            ]
        },
        {
            id: 'other',
            label: 'Other Metrics',
            icon: Sparkles,
            sectionIds: ['special-buffs', 'sigil-relic-uptime', 'skill-usage', 'apm-stats'],
            items: [
                { id: 'special-buffs', label: 'Special Buffs', icon: Star },
                { id: 'sigil-relic-uptime', label: 'Sigil/Relic Uptime', icon: Gw2SigilIcon },
                { id: 'skill-usage', label: 'Skill Usage', icon: Keyboard },
                { id: 'apm-stats', label: 'APM Breakdown', icon: Activity }
            ]
        }
    ]), []);
    const activeGroupDef = useMemo(
        () => navGroups.find((group) => group.id === activeGroup) || navGroups[0],
        [navGroups, activeGroup]
    );
    const activeSectionIds = useMemo(() => {
        const baseIds = (activeGroupDef as any)?.sectionIds || (activeGroupDef?.items || []).map((item) => item.id);
        const ids = baseIds.map((id: string) => (id === 'kdr' ? 'overview' : id));
        return new Set(ids);
    }, [activeGroupDef]);
    const scrollToSection = (id: string) => {
        const targetId = id === 'kdr' ? 'overview' : id;
        const resolvedId = targetId === 'overview' ? 'report-top' : targetId;
        const el = document.getElementById(resolvedId);
        if (!el) return false;
        const isVisible = el.getAttribute('data-section-visible') !== 'false';
        if (!isVisible) return false;
        if (!el.offsetParent) return false;
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) return false;
        let extraOffset = 0;
        if (resolvedId === 'stats-view-top') {
            const reportTop = document.getElementById('report-top');
            if (reportTop) {
                extraOffset = reportTop.getBoundingClientRect().height + 12;
            }
        }
        const targetTop = rect.top + window.scrollY - 12 - extraOffset;
        window.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
        if (history.replaceState) {
            history.replaceState(null, '', `#${resolvedId}`);
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
    const isMatteUi = uiTheme === 'matte';
    const resolvedTheme = theme ?? DEFAULT_WEB_THEME;
    const accentRgb = resolvedTheme.rgb;
    const defaultLogoColor = isMatteUi ? '#d8e1eb' : 'var(--accent)';
    const accentVars = {
        '--accent': `rgb(${accentRgb})`,
        '--accent-rgb': accentRgb,
        '--accent-soft': `rgba(${accentRgb}, 0.32)`,
        '--accent-strong': `rgba(${accentRgb}, 0.95)`,
        '--accent-border': `rgba(${accentRgb}, 0.4)`,
        '--accent-glow': `rgba(${accentRgb}, 0.18)`,
        '--accent-glow-soft': `rgba(${accentRgb}, 0.08)`
    } as CSSProperties;
    const isModernUi = uiTheme === 'modern' || uiTheme === 'matte';
    const reportBackgroundImage = resolvedTheme.pattern
        ? (isMatteUi
            ? undefined
            : isModernUi
                ? `linear-gradient(180deg, rgba(14, 18, 26, 0.72), rgba(18, 24, 34, 0.78)), ${resolvedTheme.pattern}`
                : resolvedTheme.pattern)
        : undefined;
    const glassCardStyle: CSSProperties = isMatteUi
        ? { backgroundImage: 'none', backgroundColor: 'var(--bg-card)' }
        : {
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

        const normalizeTopDownContribution = (payload: ReportPayload) => {
            const stats: any = payload?.stats;
            if (!stats || typeof stats !== 'object') return payload;
            const rows = Array.isArray(stats?.leaderboards?.downContrib) ? stats.leaderboards.downContrib : [];
            if (!rows.length) return payload;
            const sorted = rows
                .map((row: any) => ({ ...row, value: Number(row?.value ?? 0) }))
                .filter((row: any) => Number.isFinite(row.value))
                .sort((a: any, b: any) => (b.value - a.value) || String(a?.account || '').localeCompare(String(b?.account || '')));
            const top = sorted[0];
            if (!top) return payload;
            stats.maxDownContrib = {
                ...(stats.maxDownContrib || {}),
                value: Number(top.value || 0),
                player: String(top.account || stats.maxDownContrib?.player || '-'),
                count: Number(top.count || stats.maxDownContrib?.count || 0),
                profession: String(top.profession || stats.maxDownContrib?.profession || 'Unknown'),
                professionList: Array.isArray(top.professionList) ? top.professionList : (stats.maxDownContrib?.professionList || [])
            };
            return payload;
        };

        fetch(reportPath, { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                const normalized = normalizeTopDownContribution(normalizeCommanderDistance(data));
                setReport(normalized);
                const themeChoice = normalized?.stats?.uiTheme;
                if (themeChoice === 'modern' || themeChoice === 'classic' || themeChoice === 'crt' || themeChoice === 'matte') {
                    setDefaultUiTheme(themeChoice);
                } else if (normalized?.stats?.webThemeId === MATTE_WEB_THEME_ID) {
                    setDefaultUiTheme('matte');
                }
                if (typeof normalized?.stats?.webThemeId === 'string' && normalized.stats.webThemeId) {
                    setDefaultThemeId(normalized.stats.webThemeId);
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
        const requestedThemeId = report?.stats?.webThemeId;
        if (typeof requestedThemeId === 'string' && requestedThemeId) {
            setDefaultThemeId(requestedThemeId);
        }
    }, [report]);

    useEffect(() => {
        const body = document.body;
        body.classList.add('web-report');
        body.classList.remove('theme-classic', 'theme-modern', 'theme-crt', 'theme-matte');
        if (isMatteUi) body.classList.add('theme-matte');
        else if (uiTheme === 'modern') body.classList.add('theme-modern');
        else if (uiTheme === 'crt') body.classList.add('theme-crt');
        else body.classList.add('theme-classic');
    }, [uiTheme, isMatteUi]);

    useEffect(() => {
        if (isDevLocalWeb && report?.stats?.webThemeId) return;
        let isMounted = true;
        fetch(joinAssetPath(assetBasePath, 'theme.json'), { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                if (typeof data?.id === 'string' && data.id) {
                    setDefaultThemeId(data.id);
                }
            })
            .catch(() => {
                if (!isMounted) return;
            });
        return () => {
            isMounted = false;
        };
    }, [assetBasePath, isDevLocalWeb, report]);

    useEffect(() => {
        const reportThemeId = report?.stats?.webThemeId;
        const reportUiTheme = report?.stats?.uiTheme;
        const hasReportUiTheme = reportUiTheme === 'modern' || reportUiTheme === 'classic' || reportUiTheme === 'crt' || reportUiTheme === 'matte';
        const reportUiThemeLooksStale = (
            (reportThemeId === MATTE_WEB_THEME_ID && reportUiTheme !== 'matte')
            || (reportThemeId === 'CRT' && reportUiTheme !== 'crt')
        );
        if (hasReportUiTheme && !reportUiThemeLooksStale) {
            return;
        }
        let isMounted = true;
        fetch(joinAssetPath(assetBasePath, 'ui-theme.json'), { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                const themeChoice = data?.theme;
                if (themeChoice === 'modern' || themeChoice === 'classic' || themeChoice === 'crt' || themeChoice === 'matte') {
                    setDefaultUiTheme(themeChoice);
                }
            })
            .catch(() => {
                if (!isMounted) return;
                // Do not force classic on failure; keep existing theme (e.g. from report)
            });
        return () => {
            isMounted = false;
        };
    }, [assetBasePath, report]);

    useEffect(() => {
        let isMounted = true;
        fetch(joinAssetPath(assetBasePath, 'logo.json'), { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                const defaultPath = 'img/ArcBridge.svg';
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
            const haystack = `${entry.title} ${commanders} ${entry.dateLabel}`.toLowerCase();
            return haystack.includes(term);
        });
    }, [sortedIndex, searchTerm]);

    const persistOverridesCookie = (nextThemeIdOverride: string | null) => {
        if (!nextThemeIdOverride) {
            clearCookieValue(WEB_THEME_OVERRIDE_COOKIE);
            return;
        }
        writeCookieValue(WEB_THEME_OVERRIDE_COOKIE, JSON.stringify({
            themeId: nextThemeIdOverride
        }));
    };

    const selectThemeOverride = (value: string) => {
        const nextThemeIdOverride = value === DEFAULT_THEME_SELECT_VALUE ? null : value;
        if (nextThemeIdOverride && !WEB_THEMES.some((entry) => entry.id === nextThemeIdOverride)) return;
        setThemeIdOverride(nextThemeIdOverride);
        persistOverridesCookie(nextThemeIdOverride);
        setThemeDropdownOpen(false);
    };

    useEffect(() => {
        const onWindowPointerDown = (event: MouseEvent) => {
            if (!themeDropdownRef.current) return;
            if (themeDropdownRef.current.contains(event.target as Node)) return;
            setThemeDropdownOpen(false);
        };
        const onWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setThemeDropdownOpen(false);
        };
        window.addEventListener('mousedown', onWindowPointerDown);
        window.addEventListener('keydown', onWindowKeyDown);
        return () => {
            window.removeEventListener('mousedown', onWindowPointerDown);
            window.removeEventListener('keydown', onWindowKeyDown);
        };
    }, []);

    const activeThemeLabel = useMemo(() => {
        if (!themeIdOverride) return 'Default';
        const active = WEB_THEMES.find((entry) => entry.id === themeIdOverride);
        return active?.label || 'Default';
    }, [themeIdOverride]);

    const themeSelectControl = (
        <div className="relative flex items-center gap-2" ref={themeDropdownRef}>
            <div className="text-[9px] uppercase tracking-widest text-gray-400 whitespace-nowrap">Theme</div>
            <button
                type="button"
                onClick={() => setThemeDropdownOpen((value) => !value)}
                className="w-[152px] inline-flex items-center justify-between gap-2 rounded-full border px-3 py-1 text-[9px] uppercase tracking-widest text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]"
                style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--accent-border)'
                }}
            >
                <span className="truncate text-left">{activeThemeLabel}</span>
                <span className={`transition-transform ${themeDropdownOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {themeDropdownOpen && (
                <div
                    className="absolute right-0 bottom-[calc(100%+6px)] z-20 w-[240px] overflow-y-auto rounded-xl border shadow-2xl backdrop-blur-xl"
                    style={{
                        maxHeight: '240px',
                        backgroundColor: 'color-mix(in srgb, var(--bg-card) 92%, black)',
                        borderColor: 'var(--accent-border)'
                    }}
                >
                    <button
                        type="button"
                        onClick={() => selectThemeOverride(DEFAULT_THEME_SELECT_VALUE)}
                        className="w-full px-3 py-2 text-left text-[10px] uppercase tracking-[0.2em] text-gray-200 hover:bg-white/10 transition-colors"
                    >
                        Default
                    </button>
                    {WEB_THEMES.map((entry) => (
                        <button
                            key={entry.id}
                            type="button"
                            onClick={() => selectThemeOverride(entry.id)}
                            className={`w-full px-3 py-2 text-left text-[10px] uppercase tracking-[0.2em] transition-colors hover:bg-white/10 ${themeIdOverride === entry.id ? 'text-[color:var(--accent)]' : 'text-gray-200'}`}
                        >
                            {entry.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    const legalNoticePane = (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] text-gray-500">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">Legal Notice</div>
                <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[160px]">
                        {themeSelectControl}
                    </div>
                    <a
                        href="https://github.com/darkharasho/ArcBridge"
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
                ArcBridge is free software by harasho: you can redistribute it and/or modify it under the terms
                of the GNU General Public License v3.0 only. This program comes with ABSOLUTELY NO WARRANTY.
            </p>
            <p className="mt-2">
                Class Icons, artwork, and skill icons are created and owned by Arenanet as detailed in their{' '}
                <a
                    href="https://www.arena.net/en/legal/content-terms-of-use"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-300/80 hover:text-blue-200 underline underline-offset-2"
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
                    className="text-blue-300/80 hover:text-blue-200 underline underline-offset-2"
                >
                    LICENSE
                </a>
                {' '}and{' '}
                <a
                    href="https://github.com/darkharasho/ArcBridge/blob/main/THIRD_PARTY_NOTICES.md"
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-300/80 hover:text-blue-200 underline underline-offset-2"
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
                        const { inline, children } = props;
                        const isInline = inline === true;
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
    );

    if (report) {
        const arcbridgeLogoUrl = joinAssetPath(assetBasePath, 'img/ArcBridge.svg');
        const handleGroupSelect = (groupId: string) => {
            pendingScrollIdRef.current = null;
            setActiveGroup(groupId);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        const handleSubNavClick = (groupId: string, id: string) => {
            const isSameGroup = groupId === activeGroup;
            if (!isSameGroup) {
                pendingScrollIdRef.current = id;
                setActiveGroup(groupId);
                window.scrollTo({ top: 0, behavior: 'auto' });
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
        return (
            <div
                className="min-h-screen text-white relative overflow-x-hidden"
                style={{
                    backgroundColor: isMatteUi ? 'var(--bg-base)' : (isModernUi ? '#0f141c' : '#0f172a'),
                    backgroundImage: isMatteUi ? 'none' : reportBackgroundImage,
                    ...accentVars
                }}
            >
                {!isMatteUi && (
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
                )}
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
                        <div className="px-5 pb-4">
                            <a
                                href="./"
                                className="w-full inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[color:var(--accent-glow)] text-[10px] uppercase tracking-[0.35em] text-gray-100 transition-colors hover:bg-[color:var(--accent-border)]"
                            >
                                <span className="h-8 w-8 rounded-full border border-[color:var(--accent-border)] inline-flex items-center justify-center text-[color:var(--accent-strong)]">
                                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M19 12H6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                                        <path d="M12 6L6 12L12 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                                Back to Reports
                            </a>
                        </div>
                        <nav className="px-3 pb-6 space-y-3 text-sm overflow-y-auto" onWheel={handleNavWheel}>
                            {navGroups.map((group) => {
                                const GroupIcon = group.icon;
                                const isActive = group.id === activeGroup;
                                return (
                                    <div key={group.id} className="space-y-2">
                                        <button
                                            onClick={() => handleGroupSelect(group.id)}
                                            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${isActive
                                                ? 'bg-white/10 text-white border-white/20'
                                                : 'text-gray-300 border-transparent hover:border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            <GroupIcon className="w-4 h-4 text-[color:var(--accent)]" />
                                            <span className="text-[11px] uppercase tracking-[0.35em]">{group.label}</span>
                                        </button>
                                        <div className="space-y-1 pl-2">
                                            {group.items.map((item) => {
                                                const ItemIcon = item.icon;
                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => {
                                                            handleSubNavClick(group.id, item.id);
                                                            setTocOpen(false);
                                                        }}
                                                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-gray-200 border border-transparent hover:border-white/10 hover:bg-white/10 transition-colors"
                                                    >
                                                        <ItemIcon className="w-3.5 h-3.5 text-[color:var(--accent)]" />
                                                        {item.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </nav>
                    </div>
                </aside>
                <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 border-r border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] z-20">
                    <div className="flex flex-col w-full">
                        <div className="px-6 pt-6 pb-5">
                            <div className="flex items-center gap-3">
                                <div
                                    className="h-10 w-10 rounded-2xl border border-white/20"
                                    style={{
                                        backgroundColor: defaultLogoColor,
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
                        <nav className="px-4 space-y-4 text-sm flex-1 overflow-y-auto" onWheel={handleNavWheel}>
                            {navGroups.map((group) => {
                                const GroupIcon = group.icon;
                                const isActive = group.id === activeGroup;
                                return (
                                    <div key={group.id} className="space-y-2">
                                        <button
                                            onClick={() => handleGroupSelect(group.id)}
                                            className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${isActive
                                                ? 'bg-white/10 text-white border-white/20'
                                                : 'text-gray-300 border-transparent hover:border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            <GroupIcon className="w-4 h-4 text-[color:var(--accent)]" />
                                            <span className="text-[11px] uppercase tracking-[0.35em]">{group.label}</span>
                                        </button>
                                        <div className="space-y-1 pl-2">
                                            {group.items.map((item) => {
                                                const ItemIcon = item.icon;
                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => handleSubNavClick(group.id, item.id)}
                                                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-gray-200 border border-transparent hover:border-white/10 hover:bg-white/10 transition-colors"
                                                    >
                                                        <ItemIcon className="w-3.5 h-3.5 text-[color:var(--accent)]" />
                                                        {item.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </nav>
                        <div className="border-t border-white/10">
                            <a
                                href="./"
                                className="w-full inline-flex items-center gap-3 px-6 py-4 bg-[color:var(--accent-glow)] text-[10px] uppercase tracking-[0.35em] text-gray-100 transition-colors hover:bg-[color:var(--accent-border)]"
                            >
                                <span className="h-9 w-9 rounded-full border border-[color:var(--accent-border)] inline-flex items-center justify-center text-[color:var(--accent-strong)]">
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
                <div className="max-w-[1600px] mx-1 sm:mx-2 lg:mx-auto px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 lg:pl-[17rem] lg:pr-10 mobile-bottom-pad">
                    <div className={`${glassCard} p-5 sm:p-6 mb-6 mx-1 sm:mx-1 lg:mx-0`} style={glassCardStyle}>
                        <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 text-center sm:text-left">
                                {logoUrl && (
                                    logoIsDefault ? (
                                        <div
                                            className="w-16 h-16 sm:w-24 sm:h-24 mx-auto sm:mx-0"
                                            style={{
                                                backgroundColor: defaultLogoColor,
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
                                <div className="col-span-2 sm:col-span-1 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 inline-flex items-center gap-2 min-w-0 justify-start">
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
                            {(activeGroupDef?.items || []).map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={`chip-${item.id}`}
                                        onClick={() => handleSubNavClick(activeGroupDef?.id || 'overview', item.id)}
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
                    <div ref={statsWrapperRef} onWheelCapture={handleStatsWheel} className="flex-1 min-w-0">
                        <div id="stats-view-top">
                            <StatsView
                                logs={[]}
                                onBack={() => { }}
                                mvpWeights={undefined}
                                precomputedStats={report.stats}
                                statsViewSettings={report.stats?.statsViewSettings}
                                embedded
                                uiTheme={uiTheme}
                                sectionVisibility={(id) => activeSectionIds.has(id)}
                                dashboardTitle={`Statistics Dashboard - ${activeGroupDef?.label || 'Overview'}`}
                            />
                        </div>
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
                backgroundColor: isMatteUi ? 'var(--bg-base)' : (isModernUi ? '#0f141c' : '#0f172a'),
                backgroundImage: isMatteUi ? 'none' : reportBackgroundImage,
                ...accentVars
            }}
        >
            {!isMatteUi && (
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
            )}
            <div className="max-w-[1600px] mx-auto px-4 pt-4 pb-8 sm:px-6 sm:pt-5 sm:pb-10">
                <div id="report-list-container" className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-6">
                    <div id="report-top" className={`${glassCard} p-5 sm:p-6 mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`} style={glassCardStyle}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-h-[56px] text-center sm:text-left">
                            {logoUrl && (
                                logoIsDefault ? (
                                    <div
                                        className="w-16 h-16 sm:w-24 sm:h-24 mx-auto sm:mx-0"
                                        style={{
                                            backgroundColor: defaultLogoColor,
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
