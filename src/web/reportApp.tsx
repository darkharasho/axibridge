import { CSSProperties, useEffect, useMemo, useState, useRef } from 'react';
import { StatsView } from '../renderer/StatsView';
import { CRT_WEB_THEME_ID, DEFAULT_WEB_THEME, KINETIC_DARK_WEB_THEME_ID, KINETIC_SLATE_WEB_THEME_ID, KINETIC_WEB_THEME_ID, MATTE_WEB_THEME_ID, WebTheme, WEB_THEMES } from '../shared/webThemes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import metricsSpecMarkdown from '../shared/metrics-spec.md?raw';
import { motion } from 'framer-motion';
import { ProofOfWorkModal } from '../renderer/ui/ProofOfWorkModal';
import { SupportPlusIcon } from '../renderer/ui/SupportPlusIcon';
import { OffenseSwordIcon } from '../renderer/ui/OffenseSwordIcon';
import { CommanderTagIcon } from '../renderer/ui/CommanderTagIcon';
import { Gw2ApmIcon } from '../renderer/ui/Gw2ApmIcon';
import { Gw2AegisIcon } from '../renderer/ui/Gw2AegisIcon';
import { Gw2BoonIcon } from '../renderer/ui/Gw2BoonIcon';
import { Gw2DamMitIcon } from '../renderer/ui/Gw2DamMitIcon';
import { Gw2FuryIcon } from '../renderer/ui/Gw2FuryIcon';
import { Gw2SigilIcon } from '../renderer/ui/Gw2SigilIcon';
import { buildRollupData, RollupData } from './rollup';
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
    Map as MapIcon,
    Sparkles,
    HeartPulse,
    Waves,
    Star,
    Skull,
    PanelLeft,
    Zap,
    ArrowLeft,
    ArrowUp,
    ArrowBigUp,
    Clock3,
    FileText,
    ListTree,
    BarChart3,
    Keyboard,
    Route,
    Target,
    ChevronDown,
    GitCompareArrows
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

type UiThemeChoice = 'classic' | 'modern' | 'crt' | 'matte' | 'kinetic';
type KineticWebFontChoice = 'default' | 'original';
type KineticThemeVariantChoice = 'light' | 'midnight' | 'slate';

const glassCard = 'border border-white/10 rounded-2xl shadow-xl backdrop-blur-md glass-card';
const WEB_THEME_OVERRIDE_COOKIE = 'arcbridge_web_theme_override';
const KINETIC_WEB_FONT_OVERRIDE_COOKIE = 'arcbridge_web_kinetic_font_override';
const DEFAULT_THEME_SELECT_VALUE = '__default__';
const WEB_REPORT_THEME_STYLESHEET_ID = 'arcbridge-web-report-theme-stylesheet';
const ASSET_BASE_PATH_PROBE_PATHS = ['reports/index.json', 'logo.json'] as const;

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

const getWebReportThemeStylesheetHref = (uiTheme: UiThemeChoice): string => {
    const file = uiTheme === 'modern'
        ? 'modern'
        : uiTheme === 'crt'
            ? 'crt'
            : uiTheme === 'matte'
                ? 'matte'
                : uiTheme === 'kinetic'
                    ? 'kinetic'
                    : 'classic';
    return `./web-report-themes/${file}.css`;
};

const ensureWebReportThemeStylesheet = (uiTheme: UiThemeChoice) => {
    if (typeof document === 'undefined') return;
    const href = getWebReportThemeStylesheetHref(uiTheme);
    const head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    let link = document.getElementById(WEB_REPORT_THEME_STYLESHEET_ID) as HTMLLinkElement | null;
    if (!link) {
        link = document.createElement('link');
        link.id = WEB_REPORT_THEME_STYLESHEET_ID;
        link.rel = 'stylesheet';
        head.appendChild(link);
    }
    const absoluteHref = new URL(href, window.location.href).toString();
    if (link.href !== absoluteHref) {
        link.href = href;
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

const normalizeKineticThemeVariant = (value: unknown): KineticThemeVariantChoice => {
    if (value === 'midnight' || value === 'slate') return value;
    return 'light';
};

const getKineticThemeIdForVariant = (value: unknown): string => {
    const normalized = normalizeKineticThemeVariant(value);
    if (normalized === 'midnight') return KINETIC_DARK_WEB_THEME_ID;
    if (normalized === 'slate') return KINETIC_SLATE_WEB_THEME_ID;
    return KINETIC_WEB_THEME_ID;
};

const inferKineticThemeVariantFromThemeId = (value: unknown): KineticThemeVariantChoice => {
    if (value === KINETIC_DARK_WEB_THEME_ID) return 'midnight';
    if (value === KINETIC_SLATE_WEB_THEME_ID) return 'slate';
    return 'light';
};

const withThemeIdParam = (url: string, themeId: string): string => {
    if (!url || !themeId) return url;
    try {
        const parsed = new URL(url, window.location.origin);
        parsed.searchParams.set('themeId', themeId);
        if (/^https?:\/\//i.test(url)) {
            return parsed.toString();
        }
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}themeId=${encodeURIComponent(themeId)}`;
    }
};

const buildReportHref = (baseHref: string, reportId: string, themeId: string | null): string => {
    const next = new URL(baseHref);
    next.searchParams.set('report', reportId || '');
    if (themeId) {
        next.searchParams.set('themeId', themeId);
    }
    return next.toString();
};

const buildRollupHref = (baseHref: string, themeId: string | null): string => {
    const next = new URL(baseHref);
    next.searchParams.delete('report');
    next.searchParams.set('view', 'rollup');
    if (themeId) {
        next.searchParams.set('themeId', themeId);
    }
    return next.toString();
};

const isValidThemeOverrideId = (themeId: string): boolean => {
    if (!themeId) return false;
    if (themeId === CRT_WEB_THEME_ID) return true;
    return WEB_THEMES.some((entry) => entry.id === themeId);
};

const readThemeOverrideFromRuntime = (): string | null => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('themeId') || params.get('theme');
    if (fromQuery && isValidThemeOverrideId(fromQuery)) {
        return fromQuery;
    }
    // Check cookie for persisted viewer preference (lower priority than query param).
    const persisted = readCookieValue(WEB_THEME_OVERRIDE_COOKIE);
    if (persisted) {
        try {
            const parsed = JSON.parse(persisted);
            const themeId = typeof parsed?.themeId === 'string' ? parsed.themeId.trim() : null;
            if (themeId && isValidThemeOverrideId(themeId)) {
                return themeId;
            }
        } catch {
            // Ignore malformed cookie.
        }
    }
    return null;
};

const resolveUiThemeFromOverride = (themeIdOverride: string | null, fallback: UiThemeChoice): UiThemeChoice => {
    if (!themeIdOverride) return fallback;
    if (themeIdOverride === MATTE_WEB_THEME_ID) return 'matte';
    if (themeIdOverride === KINETIC_WEB_THEME_ID || themeIdOverride === KINETIC_DARK_WEB_THEME_ID || themeIdOverride === KINETIC_SLATE_WEB_THEME_ID) return 'kinetic';
    if (themeIdOverride === CRT_WEB_THEME_ID) return 'crt';
    // Base palette overrides (Arcane, Cobalt, etc.) fully switch to the classic structure.
    return 'classic';
};

const readStoredThemeId = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized ? normalized : null;
};

const readReportThemeId = (stats: any): string | null => {
    // For kinetic themes always derive the full theme ID from the variant field.
    // paletteId may be the generic 'KineticPaper' (light) in older or mis-synced
    // reports where githubWebTheme was stored before the variant-specific IDs existed.
    if (stats?.reportTheme?.ui === 'kinetic') {
        return getKineticThemeIdForVariant(stats?.reportTheme?.variant);
    }
    return readStoredThemeId(stats?.reportTheme?.paletteId)
        || readStoredThemeId(stats?.reportTheme?.themeId)
        || readStoredThemeId(stats?.webThemeId)
        || null;
};

const readReportUiTheme = (stats: any): UiThemeChoice | null => {
    const explicit = stats?.reportTheme?.ui;
    if (explicit === 'modern' || explicit === 'classic' || explicit === 'crt' || explicit === 'matte' || explicit === 'kinetic') {
        return explicit;
    }
    const legacy = stats?.uiTheme;
    if (legacy === 'modern' || legacy === 'classic' || legacy === 'crt' || legacy === 'matte' || legacy === 'kinetic') {
        return legacy;
    }
    const themeId = readReportThemeId(stats);
    if (themeId === MATTE_WEB_THEME_ID) return 'matte';
    if (themeId === KINETIC_WEB_THEME_ID || themeId === KINETIC_DARK_WEB_THEME_ID || themeId === KINETIC_SLATE_WEB_THEME_ID) return 'kinetic';
    if (themeId === CRT_WEB_THEME_ID) return 'crt';
    return null;
};

const isLegacyKineticReport = (stats: any): boolean => (
    readReportUiTheme(stats) === 'kinetic'
    && !readReportThemeId(stats)
);

const parseSiteTheme = (data: unknown): { ui: UiThemeChoice; paletteId: string; kineticFont: KineticWebFontChoice; kineticVariant: KineticThemeVariantChoice } | null => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const payload = data as any;
    const ui = payload?.siteTheme?.ui;
    const paletteId = payload?.siteTheme?.paletteId;
    if ((ui === 'classic' || ui === 'modern' || ui === 'crt' || ui === 'matte' || ui === 'kinetic')
        && paletteId && typeof paletteId === 'string') {
        const kineticFont: KineticWebFontChoice = payload?.siteTheme?.kineticFont === 'original' ? 'original' : 'default';
        const kineticVariant = normalizeKineticThemeVariant(payload?.siteTheme?.kineticVariant ?? inferKineticThemeVariantFromThemeId(paletteId));
        return { ui, paletteId, kineticFont, kineticVariant };
    }
    return null;
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

const scaleRgb = (rgb: string, factor: number) => {
    const parts = String(rgb || '')
        .split(',')
        .map((value) => Math.max(0, Math.min(255, Math.round(Number(value.trim()) * factor))));
    if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
        return 'rgb(24, 32, 48)';
    }
    return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
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

export function ReportApp() {
    const initialThemeOverride = readThemeOverrideFromRuntime();
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
    const [error, setError] = useState<string | null>(null);
    const [reportPathHint, setReportPathHint] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [theme, setTheme] = useState<WebTheme>(() =>
        (initialThemeOverride ? WEB_THEMES.find((e) => e.id === initialThemeOverride) : null) ?? DEFAULT_WEB_THEME
    );
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [logoIsDefault, setLogoIsDefault] = useState(false);
    const [tocOpen, setTocOpen] = useState(false);
    const [uiTheme, setUiTheme] = useState<UiThemeChoice>(() => resolveUiThemeFromOverride(initialThemeOverride, 'classic'));
    const [defaultUiTheme, setDefaultUiTheme] = useState<UiThemeChoice>('classic');
    const [defaultThemeId, setDefaultThemeId] = useState<string>(DEFAULT_WEB_THEME.id);
    const [siteTheme, setSiteTheme] = useState<{ ui: UiThemeChoice; paletteId: string; kineticFont: KineticWebFontChoice; kineticVariant: KineticThemeVariantChoice } | null>(null);
    const [themeIdOverride, setThemeIdOverride] = useState<string | null>(initialThemeOverride);
    const requestedView = useMemo(() => (initialSearchParams.get('view') || '').trim().toLowerCase(), [initialSearchParams]);
    const reportId = useMemo(
        () => initialSearchParams.get('report') || window.location.pathname.match(/\/reports\/([^/]+)\/?$/)?.[1] || null,
        [initialSearchParams]
    );
    const isRollupView = useMemo(() => !reportId && requestedView === 'rollup', [reportId, requestedView]);
    const queryThemeId = useMemo(() => {
        const requested = initialSearchParams.get('themeId') || initialSearchParams.get('theme');
        if (!requested) return null;
        return isValidThemeOverrideId(requested) ? requested : null;
    }, [initialSearchParams]);
    const [kineticFontChoice, setKineticFontChoice] = useState<KineticWebFontChoice>('default');
    const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
    const [kineticFontDropdownOpen, setKineticFontDropdownOpen] = useState(false);
    const [proofOfWorkOpen, setProofOfWorkOpen] = useState(false);
    const [activeProofOfWorkHeadingId, setActiveProofOfWorkHeadingId] = useState('');
    const [metricsSpecSearch, setMetricsSpecSearch] = useState('');
    const [metricsSpecSearchResults, setMetricsSpecSearchResults] = useState<Array<{ index: number; text: string; section: string; hitId: number }>>([]);
    const [metricsSpecSearchFocused, setMetricsSpecSearchFocused] = useState(false);
    const [activeGroup, setActiveGroup] = useState('overview');
    const [activeSectionId, setActiveSectionId] = useState<string>('kdr');
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
        overview: true,
        roster: false,
        offense: false,
        defense: false,
        other: false
    });
    const statsWrapperRef = useRef<HTMLDivElement | null>(null);
    const metricsSpecContentRef = useRef<HTMLDivElement | null>(null);
    const metricsSpecSearchRef = useRef<HTMLDivElement | null>(null);
    const themeDropdownRef = useRef<HTMLDivElement | null>(null);
    const kineticFontDropdownRef = useRef<HTMLDivElement | null>(null);
    const metricsSpecHighlightRef = useRef<number | null>(null);
    const metricsSpecHeadingCountsRef = useRef<Map<string, number>>(new Map());
    const siteThemeRef = useRef<{ ui: UiThemeChoice; paletteId: string } | null>(null);
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
    const themedIndexHref = useMemo(
        () => (queryThemeId ? withThemeIdParam(baseHref, queryThemeId) : baseHref),
        [queryThemeId, baseHref]
    );
    const rollupHref = useMemo(
        () => buildRollupHref(baseHref, queryThemeId),
        [baseHref, queryThemeId]
    );
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
        const persisted = readCookieValue(KINETIC_WEB_FONT_OVERRIDE_COOKIE);
        if (persisted === 'original' || persisted === 'default') {
            setKineticFontChoice(persisted);
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
        setUiTheme(resolveUiThemeFromOverride(themeIdOverride, defaultUiTheme));
    }, [themeIdOverride, defaultUiTheme]);

    // Apply the site-wide theme from index.json so all pages stay visually consistent.
    // The structural UI (kinetic, classic, etc.) always follows the site theme.
    // Palette defaults only apply when the viewer has no personal override (cookie/URL).
    // Kinetic font follows the site setting unless the viewer has a cookie preference.
    useEffect(() => {
        if (!siteTheme) return;
        siteThemeRef.current = siteTheme;
        setDefaultUiTheme(siteTheme.ui);
        if (!themeIdOverride) {
            // For kinetic site themes, derive the correct variant-specific ID from kineticVariant.
            // paletteId may be 'KineticPaper' (light) in legacy index.json files even when the
            // actual configured variant is midnight or slate.
            const resolvedPaletteId = siteTheme.ui === 'kinetic'
                ? getKineticThemeIdForVariant(siteTheme.kineticVariant)
                : siteTheme.paletteId;
            setDefaultThemeId(resolvedPaletteId);
        }
        const cookieFont = readCookieValue(KINETIC_WEB_FONT_OVERRIDE_COOKIE);
        if (!cookieFont) {
            setKineticFontChoice(siteTheme.kineticFont);
        }
    }, [siteTheme, themeIdOverride]);

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
                { id: 'top-skills-outgoing', label: 'Top Skills', icon: ArrowBigUp },
                { id: 'squad-composition', label: 'Classes', icon: Users },
                { id: 'timeline', label: 'Squad vs Enemy Size', icon: Users },
                { id: 'map-distribution', label: 'Map Distribution', icon: MapIcon }
            ]
        },
        {
            id: 'commanders',
            label: 'Commander Stats',
            icon: CommanderTagIcon,
            sectionIds: ['commander-stats', 'commander-push-timing', 'commander-target-conversion', 'commander-tag-movement', 'commander-tag-death-response'],
            items: [
                { id: 'commander-stats', label: 'Commander Stats', icon: CommanderTagIcon },
                { id: 'commander-push-timing', label: 'Push Timing', icon: Clock3 },
                { id: 'commander-target-conversion', label: 'Target Conversion', icon: Target },
                { id: 'commander-tag-movement', label: 'Tag Movement', icon: Route },
                { id: 'commander-tag-death-response', label: 'Tag Death Response', icon: Skull }
            ]
        },
        {
            id: 'roster',
            label: 'Roster Intel',
            icon: FileText,
            sectionIds: ['attendance-ledger', 'squad-comp-fight', 'fight-comp'],
            items: [
                { id: 'attendance-ledger', label: 'Attendance', icon: FileText },
                { id: 'squad-comp-fight', label: 'Squad Comp', icon: Users },
                { id: 'fight-comp', label: 'Fight Comp', icon: Swords }
            ]
        },
        {
            id: 'offense',
            label: 'Offensive Stats',
            icon: Swords,
            sectionIds: ['offense-detailed', 'player-breakdown', 'damage-breakdown', 'spike-damage', 'conditions-outgoing'],
            items: [
                { id: 'offense-detailed', label: 'Offense Detailed', icon: OffenseSwordIcon },
                { id: 'player-breakdown', label: 'Player Breakdown', icon: ListTree },
                { id: 'damage-breakdown', label: 'Damage Breakdown', icon: BarChart3 },
                { id: 'spike-damage', label: 'Spike Damage', icon: Zap },
                { id: 'conditions-outgoing', label: 'Conditions', icon: Skull }
            ]
        },
        {
            id: 'defense',
            label: 'Defensive Stats',
            icon: Shield,
            sectionIds: ['defense-detailed', 'incoming-strike-damage', 'defense-mitigation', 'boon-output', 'boon-timeline', 'boon-uptime', 'support-detailed', 'healing-stats', 'heal-effectiveness'],
            items: [
                { id: 'defense-detailed', label: 'Defense Detailed', icon: Shield },
                { id: 'incoming-strike-damage', label: 'Incoming Strike Damage', icon: ShieldAlert },
                { id: 'defense-mitigation', label: 'Damage Mitigation', icon: Gw2DamMitIcon },
                { id: 'boon-output', label: 'Boon Output', icon: Gw2BoonIcon },
                { id: 'boon-timeline', label: 'Boon Timeline', icon: Gw2AegisIcon },
                { id: 'boon-uptime', label: 'Boon Uptime', icon: Gw2FuryIcon },
                { id: 'support-detailed', label: 'Support Detailed', icon: SupportPlusIcon },
                { id: 'healing-stats', label: 'Healing Stats', icon: HeartPulse },
                { id: 'heal-effectiveness', label: 'Heal Effectiveness', icon: Waves }
            ]
        },
        {
            id: 'other',
            label: 'Other Metrics',
            icon: Sparkles,
            sectionIds: ['fight-diff-mode', 'special-buffs', 'sigil-relic-uptime', 'skill-usage', 'apm-stats'],
            items: [
                { id: 'fight-diff-mode', label: 'Fight Comparison', icon: GitCompareArrows },
                { id: 'special-buffs', label: 'Special Buffs', icon: Star },
                { id: 'sigil-relic-uptime', label: 'Sigil/Relic Uptime', icon: Gw2SigilIcon },
                { id: 'skill-usage', label: 'Skill Usage', icon: Keyboard },
                { id: 'apm-stats', label: 'APM Breakdown', icon: Gw2ApmIcon }
            ]
        }
    ]), []);
    const navGroupByAnchor = useMemo(() => {
        const map = new Map<string, string>();
        navGroups.forEach((group) => {
            map.set(group.id.toLowerCase(), group.id);
            (group.sectionIds || []).forEach((id) => map.set(String(id).toLowerCase(), group.id));
            (group.items || []).forEach((item) => map.set(String(item.id).toLowerCase(), group.id));
        });
        map.set('report-top', 'overview');
        map.set('overview', 'overview');
        map.set('kdr', 'overview');
        return map;
    }, [navGroups]);
    const activeGroupDef = useMemo(
        () => navGroups.find((group) => group.id === activeGroup) || navGroups[0],
        [navGroups, activeGroup]
    );
    const isKineticUi = uiTheme === 'kinetic';
    const activeSectionIds = useMemo(() => {
        const baseIds = (activeGroupDef as any)?.sectionIds || (activeGroupDef?.items || []).map((item) => item.id);
        const ids = baseIds.map((id: string) => (id === 'kdr' ? 'overview' : id));
        return new Set(ids);
    }, [activeGroupDef]);
    const scrollToSection = (id: string) => {
        if (id === 'report-top') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (history.replaceState) {
                history.replaceState(null, '', '#report-top');
            }
            return true;
        }
        const targetId = id === 'kdr' ? 'overview' : id;
        const resolvedId = (targetId === 'overview' && id !== 'kdr') ? 'report-top' : targetId;
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
            let anchor = raw;
            try {
                anchor = decodeURIComponent(raw);
            } catch {
                anchor = raw;
            }
            const normalizedAnchor = anchor.toLowerCase();
            const nextGroup = navGroupByAnchor.get(normalizedAnchor);
            if (!nextGroup) return;
            setActiveGroup(nextGroup);
            setExpandedGroups(() => {
                const next: Record<string, boolean> = {};
                navGroups.forEach((group) => {
                    next[group.id] = group.id === nextGroup;
                });
                return next;
            });
            if (normalizedAnchor === 'report-top') {
                setActiveSectionId('kdr');
            } else {
                const matchedGroup = navGroups.find((group) => group.id.toLowerCase() === normalizedAnchor);
                setActiveSectionId(matchedGroup?.items?.[0]?.id || normalizedAnchor);
            }
            pendingScrollIdRef.current = normalizedAnchor === 'report-top'
                ? 'kdr'
                : normalizedAnchor;
        };
        syncFromHash();
        window.addEventListener('hashchange', syncFromHash);
        return () => {
            window.removeEventListener('hashchange', syncFromHash);
        };
    }, [navGroupByAnchor, navGroups]);
    const isMatteUi = uiTheme === 'matte';
    const resolvedTheme = theme;
    // Use the kinetic override ID directly when an explicit kinetic variant is selected,
    // otherwise fall back to defaultThemeId so the site/report's dark or slate variant is
    // preserved (e.g. no-override on a kinetic-midnight site stays midnight).
    const kineticVariantSourceId = (themeIdOverride === KINETIC_WEB_THEME_ID
        || themeIdOverride === KINETIC_DARK_WEB_THEME_ID
        || themeIdOverride === KINETIC_SLATE_WEB_THEME_ID)
        ? themeIdOverride
        : defaultThemeId;
    const kineticVariant = isKineticUi ? inferKineticThemeVariantFromThemeId(kineticVariantSourceId) : 'light';
    const isKineticDarkTheme = isKineticUi && kineticVariant !== 'light';
    const isKineticSlateTheme = isKineticUi && kineticVariant === 'slate';
    const accentRgb = isKineticUi ? (isKineticSlateTheme ? '181, 188, 201' : (isKineticDarkTheme ? '142, 155, 214' : '90, 80, 68')) : resolvedTheme.rgb;
    const defaultLogoColor = isMatteUi ? '#d8e1eb' : (isKineticUi ? (isKineticSlateTheme ? '#ece1cd' : (isKineticDarkTheme ? '#f0d8a9' : '#24211d')) : 'var(--accent)');
    const accentVars = {
        '--accent': `rgb(${accentRgb})`,
        '--accent-rgb': accentRgb,
        '--accent-soft': `rgba(${accentRgb}, ${isKineticUi ? (isKineticDarkTheme ? '0.22' : '0.18') : '0.32'})`,
        '--accent-strong': `rgba(${accentRgb}, ${isKineticUi ? (isKineticDarkTheme ? '0.86' : '0.78') : '0.95'})`,
        '--accent-border': `rgba(${accentRgb}, ${isKineticUi ? (isKineticDarkTheme ? '0.32' : '0.22') : '0.4'})`,
        '--accent-glow': `rgba(${accentRgb}, ${isKineticUi ? (isKineticDarkTheme ? '0.14' : '0.08') : '0.18'})`,
        '--accent-glow-soft': `rgba(${accentRgb}, ${isKineticUi ? (isKineticDarkTheme ? '0.08' : '0.04') : '0.08'})`
    } as CSSProperties;
    const isModernUi = uiTheme === 'modern' || uiTheme === 'matte' || uiTheme === 'kinetic';
    const reportBackgroundImage = resolvedTheme.pattern
        ? (isMatteUi
            ? undefined
            : isKineticUi
                ? undefined
            : isModernUi
                ? `linear-gradient(180deg, rgba(14, 18, 26, 0.72), rgba(18, 24, 34, 0.78)), ${resolvedTheme.pattern}`
                : resolvedTheme.pattern)
        : undefined;
    const glassCardStyle: CSSProperties = isKineticUi
        ? {
            backgroundImage: 'none',
            backgroundColor: isKineticSlateTheme ? 'rgba(78, 85, 95, 0.84)' : (isKineticDarkTheme ? 'rgba(57, 64, 93, 0.9)' : 'rgba(220, 210, 196, 0.95)'),
            borderColor: isKineticSlateTheme ? 'rgba(223, 228, 238, 0.22)' : (isKineticDarkTheme ? 'rgba(164, 177, 228, 0.28)' : 'rgba(78, 67, 56, 0.18)')
        }
        : isMatteUi
        ? { backgroundImage: 'none', backgroundColor: 'var(--bg-card)' }
        : {
            backgroundImage: isModernUi
                ? 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.2), rgba(var(--accent-rgb), 0.06) 70%)'
                : 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.26), rgba(var(--accent-rgb), 0.08) 70%)'
        };
    const rollupTableHeaderStyle: CSSProperties = isKineticUi
        ? { backgroundColor: isKineticSlateTheme ? '#4e555f' : (isKineticDarkTheme ? '#39405d' : '#c9bead') }
        : isMatteUi
        ? { backgroundColor: 'var(--bg-card)' }
        : { backgroundColor: scaleRgb(accentRgb, isModernUi ? 0.42 : 0.34) };

    useEffect(() => {
        let isMounted = true;
        const reportPath = reportId ? `${basePath}reports/${reportId}/report.json` : `${basePath}report.json`;
        setError(null);
        setReport(null);
        setIndex(null);
        setSiteTheme(null);
        siteThemeRef.current = null;
        setRollupData(null);
        setRollupError(null);
        setRollupLoading(false);
        setRollupRequestedCount(0);
        setReportPathHint(reportId ? reportPath : null);

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

        const applyThemeDefaults = (normalized: ReportPayload) => {
            // Skip if a site-wide theme is already loaded — site theme takes priority.
            if (themeIdOverride || siteThemeRef.current) return;
            const themeChoice = readReportUiTheme(normalized?.stats);
            if (themeChoice) {
                setDefaultUiTheme(themeChoice);
            }
            const storedThemeId = readReportThemeId(normalized?.stats);
            if (storedThemeId) {
                setDefaultThemeId(storedThemeId);
            } else if (isLegacyKineticReport(normalized?.stats)) {
                setDefaultThemeId(KINETIC_DARK_WEB_THEME_ID);
            }
        };

        const loadIndex = (suppressError = false) => {
            return fetch(`${basePath}reports/index.json`, { cache: 'no-store' })
                .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
                .then((data) => {
                    if (!isMounted) return;
                    // Support new object format { siteTheme, entries } and legacy plain array.
                    const entries = Array.isArray(data) ? data : (Array.isArray(data?.entries) ? data.entries : []);
                    setIndex(entries);
                    const st = parseSiteTheme(data);
                    if (st) setSiteTheme(st);
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
                const normalized = normalizeTopDownContribution(normalizeCommanderDistance(data));
                setReport(normalized);
                applyThemeDefaults(normalized);
            });

        if (isRollupView) {
            loadIndex();
            return () => {
                isMounted = false;
            };
        }

        if (reportId) {
            // Fetch index.json in parallel with the report to pick up the site-wide theme.
            // This ensures individual report pages use the same theme as the rest of the site.
            fetch(`${basePath}reports/index.json`, { cache: 'no-store' })
                .then((resp) => (resp.ok ? resp.json() : null))
                .then((data) => {
                    if (!isMounted || !data) return;
                    const st = parseSiteTheme(data);
                    if (st) setSiteTheme(st);
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
    }, [basePath, isRollupView, reportId, themeIdOverride]);

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

        const loadRollup = async () => {
            const loadedReports: ReportPayload[] = [];
            await Promise.all(index.map(async (entry) => {
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
                ? `ArcBridge — ${report.meta.title} — ${dateLabel}`
                : `ArcBridge — ${report.meta.title}`;
            return;
        }
        if (isRollupView) {
            document.title = 'ArcBridge — All Reports';
            return;
        }
        document.title = 'ArcBridge Reports';
    }, [isRollupView, report]);

    useEffect(() => {
        // Skip if a viewer override or site-wide theme is already active.
        // siteThemeRef guards against overriding the site palette with a stale per-report value
        // when index.json resolves before report.json (race on individual report pages).
        if (themeIdOverride || siteThemeRef.current) return;
        const requestedThemeId = readReportThemeId(report?.stats);
        if (requestedThemeId) {
            setDefaultThemeId(requestedThemeId);
            return;
        }
        if (isLegacyKineticReport(report?.stats)) {
            setDefaultThemeId(KINETIC_DARK_WEB_THEME_ID);
        }
    }, [report, themeIdOverride]);

    useEffect(() => {
        const body = document.body;
        body.classList.add('web-report');
        body.classList.remove('theme-classic', 'theme-modern', 'theme-crt', 'theme-matte', 'theme-kinetic', 'theme-kinetic-dark', 'theme-kinetic-slate', 'theme-kinetic-font-original');
        if (isMatteUi) body.classList.add('theme-matte');
        else if (uiTheme === 'modern') body.classList.add('theme-modern');
        else if (uiTheme === 'crt') body.classList.add('theme-crt');
        else if (uiTheme === 'kinetic') {
            body.classList.add('theme-kinetic');
            if (isKineticDarkTheme) body.classList.add('theme-kinetic-dark');
            if (isKineticSlateTheme) body.classList.add('theme-kinetic-slate');
            if (kineticFontChoice === 'original') body.classList.add('theme-kinetic-font-original');
        }
        else body.classList.add('theme-classic');
    }, [uiTheme, isMatteUi, isKineticDarkTheme, isKineticSlateTheme, kineticFontChoice]);

    useEffect(() => {
        ensureWebReportThemeStylesheet(uiTheme);
    }, [uiTheme]);

    useEffect(() => {
        let isMounted = true;
        fetch(joinAssetPath(assetBasePath, 'logo.json'), { cache: 'no-store' })
            .then((resp) => (resp.ok ? resp.json() : Promise.reject()))
            .then((data) => {
                if (!isMounted) return;
                const defaultPath = 'svg/ArcBridge.svg';
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

    const selectKineticFontChoice = (value: KineticWebFontChoice) => {
        setKineticFontChoice(value);
        writeCookieValue(KINETIC_WEB_FONT_OVERRIDE_COOKIE, value);
        setKineticFontDropdownOpen(false);
    };

    useEffect(() => {
        const onWindowPointerDown = (event: MouseEvent) => {
            if (!themeDropdownRef.current) return;
            const target = event.target as Node;
            if (themeDropdownRef.current.contains(target)) return;
            if (kineticFontDropdownRef.current && kineticFontDropdownRef.current.contains(target)) return;
            setThemeDropdownOpen(false);
            setKineticFontDropdownOpen(false);
        };
        const onWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setThemeDropdownOpen(false);
                setKineticFontDropdownOpen(false);
            }
        };
        window.addEventListener('mousedown', onWindowPointerDown);
        window.addEventListener('keydown', onWindowKeyDown);
        return () => {
            window.removeEventListener('mousedown', onWindowPointerDown);
            window.removeEventListener('keydown', onWindowKeyDown);
        };
    }, []);
    useEffect(() => () => {
        if (groupTopScrollRafRef.current !== null) {
            cancelAnimationFrame(groupTopScrollRafRef.current);
            groupTopScrollRafRef.current = null;
        }
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

    const kineticFontSelectControl = isKineticUi ? (
        <div className="relative flex items-center gap-2" ref={kineticFontDropdownRef}>
            <div className="text-[9px] uppercase tracking-widest text-gray-400 whitespace-nowrap">Font</div>
            <button
                type="button"
                onClick={() => setKineticFontDropdownOpen((value) => !value)}
                className="w-[152px] inline-flex items-center justify-between gap-2 rounded-full border px-3 py-1 text-[9px] uppercase tracking-widest text-white transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]"
                style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--accent-border)'
                }}
            >
                <span className="truncate text-left">{kineticFontChoice === 'original' ? 'Original App' : 'Kinetic Default'}</span>
                <span className={`transition-transform ${kineticFontDropdownOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {kineticFontDropdownOpen && (
                <div
                    className="absolute right-0 bottom-[calc(100%+6px)] z-20 w-[240px] overflow-y-auto rounded-xl border shadow-2xl backdrop-blur-xl"
                    style={{
                        maxHeight: '180px',
                        backgroundColor: 'color-mix(in srgb, var(--bg-card) 92%, black)',
                        borderColor: 'var(--accent-border)'
                    }}
                >
                    <button
                        type="button"
                        onClick={() => selectKineticFontChoice('default')}
                        className={`w-full px-3 py-2 text-left text-[10px] uppercase tracking-[0.2em] transition-colors hover:bg-white/10 ${kineticFontChoice === 'default' ? 'text-[color:var(--accent)]' : 'text-gray-200'}`}
                    >
                        Kinetic Default
                    </button>
                    <button
                        type="button"
                        onClick={() => selectKineticFontChoice('original')}
                        className={`w-full px-3 py-2 text-left text-[10px] uppercase tracking-[0.2em] transition-colors hover:bg-white/10 ${kineticFontChoice === 'original' ? 'text-[color:var(--accent)]' : 'text-gray-200'}`}
                    >
                        Original App
                    </button>
                </div>
            )}
        </div>
    ) : null;

    const legalNoticePane = (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] text-gray-500">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">Legal Notice</div>
                <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[160px]">
                        {themeSelectControl}
                    </div>
                    {kineticFontSelectControl && (
                        <div className="min-w-[160px]">
                            {kineticFontSelectControl}
                        </div>
                    )}
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
                © ArenaNet LLC. All rights reserved. NCSOFT, ArenaNet, Guild Wars, Guild Wars 2, GW2, Heart of Thorns, Path of Fire, End of Dragons, Secrets of the Obscure, Janthir Wilds, Visions of Eternity, and all associated logos, designs, and composite marks are trademarks or registered trademarks of NCSOFT Corporation. All other trademarks are the property of their respective owners.
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
        const arcbridgeLogoUrl = joinAssetPath(assetBasePath, 'svg/ArcBridge.svg');
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
            setActiveSectionId(group?.items?.[0]?.id || 'kdr');
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
        const navTimingForCount = (itemCount: number) => {
            const delta = Math.max(0, 6 - itemCount);
            return {
                accordionDuration: 0.5 + (delta * 0.07),
                itemDuration: 0.34 + (delta * 0.035),
                stagger: 0.05 + (delta * 0.01),
                delayChildren: 0.06 + (delta * 0.015)
            };
        };
        const navItemsMotionForCount = (itemCount: number) => {
            const timing = navTimingForCount(itemCount);
            return {
                open: {
                    transition: { staggerChildren: timing.stagger, delayChildren: timing.delayChildren }
                },
                closed: {
                    transition: { staggerChildren: Math.max(0.02, timing.stagger * 0.7), staggerDirection: -1 as const }
                }
            };
        };
        const navItemMotion = {
            open: { opacity: 1, y: 0 },
            closed: { opacity: 0, y: -2 }
        };
        return (
            <div
                className="min-h-screen text-white relative overflow-x-hidden"
                style={{
                    backgroundColor: isMatteUi ? 'var(--bg-base)' : (isKineticUi ? (isKineticSlateTheme ? '#353a41' : (isKineticDarkTheme ? '#2b3048' : '#d8d1c5')) : (isModernUi ? '#0f141c' : '#0f172a')),
                    backgroundImage: isMatteUi ? 'none' : reportBackgroundImage,
                    ...accentVars
                }}
            >
                {!isMatteUi && !isKineticUi && (
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
                    <div className="report-nav-sidebar h-full bg-white/5 border-r border-white/10 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] flex flex-col">
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
                                className="report-back-link w-full inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[color:var(--accent-glow)] text-[10px] uppercase tracking-[0.35em] text-gray-100 transition-colors hover:bg-[color:var(--accent-border)]"
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
                        <nav className="px-3 pb-6 space-y-2 text-sm overflow-y-auto [overflow-anchor:none]" onWheel={handleNavWheel}>
                            {navGroups.map((group) => {
                                const GroupIcon = group.icon;
                                const isActive = group.id === activeGroup;
                                const isExpanded = !!expandedGroups[group.id];
                                const navTiming = navTimingForCount(group.items.length);
                                const navItemsMotion = navItemsMotionForCount(group.items.length);
                                return (
                                    <motion.div
                                        key={group.id}
                                        layout="position"
                                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                        className="space-y-1"
                                    >
                                        <button
                                            onClick={() => handleGroupHeaderClick(group.id)}
                                            className={`report-nav-group-btn w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${isActive
                                                ? 'bg-white/10 text-white border-white/20'
                                                : 'text-gray-300 border-transparent hover:border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            <GroupIcon className="report-nav-group-icon w-4 h-4 text-[color:var(--accent)]" />
                                            <span className="report-nav-group-label text-[11px] uppercase tracking-[0.22em] whitespace-nowrap min-w-0 truncate">{group.label}</span>
                                            <motion.span
                                                className="report-nav-chevron ml-auto inline-flex shrink-0"
                                                animate={{ rotate: isExpanded ? 0 : -90 }}
                                                transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.86 }}
                                            >
                                                <ChevronDown className="w-4 h-4 text-gray-300" />
                                            </motion.span>
                                        </button>
                                        <motion.div
                                            key={`${group.id}-submenu-mobile`}
                                            initial={false}
                                            animate={isExpanded ? 'open' : 'closed'}
                                            variants={{
                                                open: { height: 'auto', opacity: 1 },
                                                closed: { height: 0, opacity: 0 }
                                            }}
                                            transition={{ duration: navTiming.accordionDuration, ease: [0.2, 0.9, 0.25, 1] }}
                                            className="overflow-hidden will-change-[height,opacity]"
                                        >
                                            <motion.div
                                                variants={navItemsMotion}
                                                initial={false}
                                                animate={isExpanded ? 'open' : 'closed'}
                                                className="report-nav-submenu space-y-1 pl-2 pt-1"
                                                data-nav-submenu-content
                                            >
                                                {group.items.map((item) => {
                                                    const ItemIcon = item.icon;
                                                    return (
                                                        <motion.button
                                                            key={item.id}
                                                            variants={navItemMotion}
                                                            transition={{ duration: navTiming.itemDuration, ease: [0.2, 0.9, 0.25, 1] }}
                                                            onClick={() => {
                                                                handleSubNavClick(group.id, item.id);
                                                                setTocOpen(false);
                                                            }}
                                                            className={`report-nav-item-btn w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] border transition-colors transform-gpu ${activeSectionId === item.id ? 'text-white border-white/20 bg-white/10' : 'text-gray-200 border-transparent hover:border-white/10 hover:bg-white/10'}`}
                                                        >
                                                            <ItemIcon className="w-3.5 h-3.5 text-[color:var(--accent)]" />
                                                            {item.label}
                                                        </motion.button>
                                                    );
                                                })}
                                            </motion.div>
                                        </motion.div>
                                    </motion.div>
                                );
                            })}
                        </nav>
                    </div>
                </aside>
                <aside className="report-nav-sidebar hidden lg:flex fixed inset-y-0 left-0 w-64 border-r border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] z-20">
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
                        <nav className="px-4 space-y-2 text-sm flex-1 overflow-y-auto [overflow-anchor:none]" onWheel={handleNavWheel}>
                            {navGroups.map((group) => {
                                const GroupIcon = group.icon;
                                const isActive = group.id === activeGroup;
                                const isExpanded = !!expandedGroups[group.id];
                                const navTiming = navTimingForCount(group.items.length);
                                const navItemsMotion = navItemsMotionForCount(group.items.length);
                                return (
                                    <motion.div
                                        key={group.id}
                                        layout="position"
                                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                        className="space-y-1"
                                    >
                                        <button
                                            onClick={() => handleGroupHeaderClick(group.id)}
                                            className={`report-nav-group-btn w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${isActive
                                                ? 'bg-white/10 text-white border-white/20'
                                                : 'text-gray-300 border-transparent hover:border-white/10 hover:bg-white/10'
                                                }`}
                                        >
                                            <GroupIcon className="report-nav-group-icon w-4 h-4 text-[color:var(--accent)]" />
                                            <span className="report-nav-group-label text-[11px] uppercase tracking-[0.22em] whitespace-nowrap min-w-0 truncate">{group.label}</span>
                                            <motion.span
                                                className="report-nav-chevron ml-auto inline-flex shrink-0"
                                                animate={{ rotate: isExpanded ? 0 : -90 }}
                                                transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.86 }}
                                            >
                                                <ChevronDown className="w-4 h-4 text-gray-300" />
                                            </motion.span>
                                        </button>
                                        <motion.div
                                            key={`${group.id}-submenu-desktop`}
                                            initial={false}
                                            animate={isExpanded ? 'open' : 'closed'}
                                            variants={{
                                                open: { height: 'auto', opacity: 1 },
                                                closed: { height: 0, opacity: 0 }
                                            }}
                                            transition={{ duration: navTiming.accordionDuration, ease: [0.2, 0.9, 0.25, 1] }}
                                            className="overflow-hidden will-change-[height,opacity]"
                                        >
                                            <motion.div
                                                variants={navItemsMotion}
                                                initial={false}
                                                animate={isExpanded ? 'open' : 'closed'}
                                                className="report-nav-submenu space-y-1 pl-2 pt-1"
                                                data-nav-submenu-content
                                            >
                                                {group.items.map((item) => {
                                                    const ItemIcon = item.icon;
                                                    return (
                                                        <motion.button
                                                            key={item.id}
                                                            variants={navItemMotion}
                                                            transition={{ duration: navTiming.itemDuration, ease: [0.2, 0.9, 0.25, 1] }}
                                                            onClick={() => handleSubNavClick(group.id, item.id)}
                                                            className={`report-nav-item-btn w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] border transition-colors transform-gpu ${activeSectionId === item.id ? 'text-white border-white/20 bg-white/10' : 'text-gray-200 border-transparent hover:border-white/10 hover:bg-white/10'}`}
                                                        >
                                                            <ItemIcon className="w-3.5 h-3.5 text-[color:var(--accent)]" />
                                                            {item.label}
                                                        </motion.button>
                                                    );
                                                })}
                                            </motion.div>
                                        </motion.div>
                                    </motion.div>
                                );
                            })}
                        </nav>
                        <div className="border-t border-white/10">
                            <a
                                href={themedIndexHref}
                                className="report-back-link w-full inline-flex items-center gap-3 px-6 py-4 bg-[color:var(--accent-glow)] text-[10px] uppercase tracking-[0.35em] text-gray-100 transition-colors hover:bg-[color:var(--accent-border)]"
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
                                    <div className="report-brand-label text-xs uppercase tracking-[0.3em] text-[color:var(--accent-soft)]">ArcBridge Log Report</div>
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
                                    <CommanderTagIcon className="w-4 h-4 text-[color:var(--accent)]" />
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
                                        className={`group flex items-center gap-2 px-3 py-2 rounded-full text-[10px] uppercase tracking-widest whitespace-nowrap border bg-gradient-to-br shadow-[0_10px_25px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all duration-200 active:translate-y-0 active:scale-[0.98] snap-start ${activeSectionId === item.id ? 'text-white border-[color:var(--accent-border)] from-[color:var(--accent-glow)] via-white/10 to-transparent' : 'text-gray-200 border-white/15 from-white/10 via-white/5 to-transparent hover:-translate-y-0.5 hover:border-[color:var(--accent-border)] hover:shadow-[0_18px_35px_rgba(0,0,0,0.45)]'}`}
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
                            href={themedIndexHref}
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

    if (isRollupView) {
        return (
            <div
                className="min-h-screen text-white relative overflow-x-hidden"
                style={{
                    backgroundColor: isMatteUi ? 'var(--bg-base)' : (isKineticUi ? (isKineticSlateTheme ? '#353a41' : (isKineticDarkTheme ? '#2b3048' : '#d8d1c5')) : (isModernUi ? '#0f141c' : '#0f172a')),
                    backgroundImage: isMatteUi ? 'none' : reportBackgroundImage,
                    ...accentVars
                }}
            >
                {!isMatteUi && !isKineticUi && (
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
                    <div className="rounded-2xl border border-white/5 bg-black/20 p-4 sm:p-6">
                        <div className={`${glassCard} p-5 sm:p-6 mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`} style={glassCardStyle}>
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
                                    <h1 className="text-2xl sm:text-3xl font-bold mt-2">All Reports</h1>
                                    <p className="text-xs sm:text-sm text-gray-400 mt-1">Combined commander and player stats across every hosted report.</p>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                                <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 inline-flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4 text-[color:var(--accent)]" />
                                    {rollupData?.uniqueRaids || 0} Raids
                                </div>
                                <a
                                    href={themedIndexHref}
                                    className="px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-xs uppercase tracking-widest text-gray-300 inline-flex items-center justify-center gap-2 hover:border-[color:var(--accent-border)] transition-colors"
                                >
                                    <ArrowLeft className="w-4 h-4 text-[color:var(--accent)]" />
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
                                                    <div className="text-[11px] uppercase tracking-widest text-[color:var(--accent-soft)]">Commanders</div>
                                                    <h2 className="text-lg sm:text-xl font-semibold mt-1">All Commander Runs</h2>
                                                </div>
                                                <div className="text-[11px] uppercase tracking-widest text-gray-400">Runs are counted per unique raid</div>
                                            </div>
                                            {rollupData.commanderRows.length === 0 ? (
                                                <div className="text-sm text-gray-400">No commander data found yet.</div>
                                            ) : (
                                                <div className="rounded-2xl border border-white/5 bg-black/25 overflow-hidden">
                                                    <div className="border-b border-white/5 px-3 py-3 sm:px-4">
                                                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_140px_140px] gap-3">
                                                            <input
                                                                type="search"
                                                                value={commanderSearchTerm}
                                                                onChange={(event) => setCommanderSearchTerm(event.target.value)}
                                                                placeholder="Search commanders, character names, or class..."
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]"
                                                            />
                                                            <select
                                                                value={commanderProfessionFilter}
                                                                onChange={(event) => setCommanderProfessionFilter(event.target.value)}
                                                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]"
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
                                                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]"
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
                                                                        <td className="py-3 pr-4 text-gray-300">{row.profession || '--'}</td>
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
                                                    <div className="text-[11px] uppercase tracking-widest text-[color:var(--accent-soft)]">Players</div>
                                                    <h2 className="text-lg sm:text-xl font-semibold mt-1">Everyone Who Joined</h2>
                                                </div>
                                                <div className="text-[11px] uppercase tracking-widest text-gray-400">Last seen is based on the report end time</div>
                                            </div>
                                            {rollupData.playerRows.length === 0 ? (
                                                <div className="text-sm text-gray-400">No attendance data found yet.</div>
                                            ) : (
                                                <div className="rounded-2xl border border-white/5 bg-black/25 overflow-hidden">
                                                    <div className="border-b border-white/5 px-3 py-3 sm:px-4">
                                                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px_140px_140px] gap-3">
                                                            <input
                                                                type="search"
                                                                value={playerSearchTerm}
                                                                onChange={(event) => setPlayerSearchTerm(event.target.value)}
                                                                placeholder="Search players, character names, or class..."
                                                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]"
                                                            />
                                                            <select
                                                                value={playerProfessionFilter}
                                                                onChange={(event) => setPlayerProfessionFilter(event.target.value)}
                                                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]"
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
                                                                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]"
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
                                                                    <td className="py-3 pr-4 text-gray-300">{row.profession || '--'}</td>
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
                {proofOfWorkModal}
            </div>
        );
    }

    return (
        <div
            className="min-h-screen text-white relative overflow-x-hidden"
            style={{
                backgroundColor: isMatteUi ? 'var(--bg-base)' : (isKineticUi ? (isKineticSlateTheme ? '#353a41' : (isKineticDarkTheme ? '#2b3048' : '#d8d1c5')) : (isModernUi ? '#0f141c' : '#0f172a')),
                backgroundImage: isMatteUi ? 'none' : reportBackgroundImage,
                ...accentVars
            }}
        >
            {!isMatteUi && !isKineticUi && (
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
                                        <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--accent-border)] bg-[color:var(--accent-glow)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                                            <BarChart3 className="w-3.5 h-3.5" />
                                            All Reports
                                        </span>
                                        <span className="text-[11px] uppercase tracking-widest text-white/60">Overview</span>
                                    </div>
                                    <div className="text-base sm:text-lg font-semibold mt-2 text-white">Combined Stats Across Every Included Report</div>
                                    <div className="text-xs text-gray-300 mt-1 flex items-center gap-2">
                                        <Users className="w-4 h-4 text-[color:var(--accent)]" />
                                        <span>Cross-report commander totals, roster attendance, and recent participation in one place.</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 sm:mt-0 mt-2 w-full sm:w-auto">
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="text-[10px] uppercase tracking-widest text-white/60">Source Reports</div>
                                        <div className="text-lg text-white font-semibold">{sortedIndex.length}</div>
                                        <div className="text-[10px] uppercase tracking-widest text-[color:var(--accent-soft)]">Open Summary</div>
                                    </div>
                                    <div className="h-10 w-10 rounded-full border border-[color:var(--accent-border)] bg-[color:var(--accent-glow)] inline-flex items-center justify-center">
                                        <ExternalLink className="w-5 h-5 text-[color:var(--accent)] opacity-90" />
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
                                    href={buildReportHref(baseHref, entry.id, queryThemeId)}
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
