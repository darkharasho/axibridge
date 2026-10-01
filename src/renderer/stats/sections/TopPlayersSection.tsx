import { Crown, Flame, ShieldCheck, Sparkles, Star, Trophy } from 'lucide-react';
import { TOP_STATS_CATALOG, DEFAULT_ENABLED_TOP_STATS, type TopStatDef } from '../topStatsCatalog';
import { TOP_STAT_ICONS } from '../topStatIcons';
import { BoonGlyph } from '../../ui/BoonGlyph';
import { useStatsSharedContext } from '../StatsViewContext';
import { MetricDistributionCard } from '../components/MetricDistributionCard';
import type { RoleClassificationEntry } from '../statsTypes';

type TopPlayersSectionProps = {
    showTopStats: boolean;
    showMvp: boolean;
    topStatsMode: 'total' | 'perSecond' | 'perMinute';
    expandedLeader: string | null;
    setExpandedLeader: (value: string | null | ((prev: string | null) => string | null)) => void;
    formatTopStatValue: (value: number) => string;
    isMvpStatEnabled: (name: string) => boolean;
    enabledTopStats?: string[];
    noEgoMode?: boolean;
};

const LeaderCard = ({ icon: Icon, title, data, isBoon = false, accentColor, unit = '', onClick, active, rows, formatValue, renderProfessionIcon }: any) => {
    const { singleFight } = useStatsSharedContext();
    const value = data?.value ?? 0;
    const displayValue = formatValue ? formatValue(value) : Math.round(value).toLocaleString();
    const tint = accentColor || '#818cf8';
    const iconWrapStyle = { color: tint };

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick?.();
                }
            }}
            aria-pressed={Boolean(active)}
            className="leader-card axi-panel axi-panel--tile flex flex-col gap-3 group cursor-pointer relative"
            style={{ '--axi-panel-pad': '16px' } as React.CSSProperties}
        >
            <div className="flex items-center gap-4">
                <div className="p-3 rounded-[var(--axi-radius-sm)] shrink-0" style={iconWrapStyle}>
                    {isBoon
                        ? <BoonGlyph className="w-6 h-6" />
                        : <Icon className="w-6 h-6" />
                    }
                </div>
                <div className="min-w-0 flex-1">
                    <div data-testid="leader-card-title" className="text-[color:var(--axi-text-dim)] text-xs font-bold uppercase tracking-wider truncate">{title}</div>
                    <div className="text-2xl font-bold axi-ink-plain mt-0.5 break-words">
                        {displayValue} <span className="text-sm font-normal text-[color:var(--axi-text-dim)]">{unit}</span>
                    </div>
                </div>
            </div>
            {/* A single-fight report opens every card on the full standings, and
                row 1 of those standings is this leader — so the summary line
                below the rule would restate the name directly above the table
                that already holds it. */}
            {!(singleFight && active) && (
                <div className="flex flex-col border-t border-[color:var(--axi-rule)] pt-2">
                    <div className="flex items-center gap-2 min-w-0">
                        {renderProfessionIcon(data?.profession || 'Unknown', data?.professionList, 'w-4 h-4')}
                        <div className="text-sm font-medium text-[color:var(--axi-accent)] truncate">{data?.player || '-'}</div>
                    </div>
                    {/* The log count is what distinguishes a leader who topped one
                        fight from one who topped twenty. In a single-fight report it
                        is always "1 logs" — noise, and ungrammatical noise. */}
                    <div className="text-xs text-[color:var(--axi-text-dim)] truncate">{singleFight ? '' : (data?.count ? `${data.count} logs` : '-')}</div>
                </div>
            )}
            {active && (
                <div className={singleFight ? 'border-t border-[color:var(--axi-rule)] pt-2' : 'mt-3'}>
                    {/* Restating the card title inside the card is only worth it
                        when the panel was opened by a click and could be scrolled
                        away from its heading. */}
                    {!singleFight && <div className="text-xs font-semibold text-[color:var(--axi-text)] mb-2">{title}</div>}
                    {rows?.length ? (
                        <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
                            {rows.map((row: any) => (
                                <div key={`${title}-${row.rank}-${row.account}`} className="flex items-center gap-2 min-w-0 text-xs text-[color:var(--axi-text-dim)]">
                                    <div className="w-6 shrink-0 text-right text-[color:var(--axi-text-faint)]">{row.rank}</div>
                                    <div className="shrink-0">
                                        {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                    </div>
                                    <div className="flex-1 min-w-0 truncate">{row.account}</div>
                                    <div className="shrink-0 text-[color:var(--axi-text-dim)] font-mono">{formatValue ? formatValue(row.value) : row.value}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="axi-empty">No data available</div>
                    )}
                </div>
            )}
        </div>
    );
};

const normalizeLeaderboardRows = (rows: any[], higherIsBetter: boolean) => {
    const normalized = (Array.isArray(rows) ? rows : [])
        .map((row) => ({ ...row, value: Number(row?.value ?? 0) }))
        .filter((row) => Number.isFinite(row.value))
        .sort((a, b) => {
            const diff = higherIsBetter ? (b.value - a.value) : (a.value - b.value);
            if (diff !== 0) return diff;
            return String(a?.account || '').localeCompare(String(b?.account || ''));
        });

    let lastValue: number | null = null;
    let lastRank = 0;
    return normalized.map((row, index) => {
        if (lastValue === null || row.value !== lastValue) {
            lastRank = index + 1;
            lastValue = row.value;
        }
        return { ...row, rank: lastRank };
    });
};

const formatMvpPillValue = (value: unknown, formatTopStatValue: (n: number) => string) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return formatTopStatValue(value);
    }
    if (typeof value === 'string') {
        const parsed = Number(value.replace(/,/g, '').trim());
        if (Number.isFinite(parsed)) {
            return formatTopStatValue(parsed);
        }
        return value;
    }
    return '--';
};

// Stat ids that get a "Total " prefix in non-rate mode
const TOTAL_PREFIX_IDS = new Set([
    'barrier', 'healing', 'dodges', 'strips', 'cleanses',
    'cc', 'interrupts', 'ccAndInterrupts', 'stability',
    'downedHealing', 'revives', 'dps', 'damage', 'participation',
]);

type BoonMetric = 'total' | 'average' | 'uptime';

// The boon `unit` baked into the catalog assumes 'uptime' scoring. The displayed
// unit and whether the value is a percentage both depend on the active
// mvpBoonMetric, so derive them here instead of trusting def.unit.
const boonUnitInfo = (stacking: boolean, metric: BoonMetric): { unit: string; isPercent: boolean } => {
    if (metric === 'average') return { unit: 'gen/sec', isPercent: false };
    if (metric === 'total') return { unit: 'total gen', isPercent: false };
    // uptime: stacking boons report average stacks, others report uptime %
    return stacking ? { unit: 'avg stacks', isPercent: false } : { unit: 'uptime', isPercent: true };
};

const getCardTitle = (def: TopStatDef, isPerSecond: boolean, isPerMinute: boolean): string => {
    if (def.source.kind === 'boon') return def.label;
    if (def.id === 'closestToTag') return 'Closest to Tag';
    // Only rate-capable stats get a "/s" or "/m" suffix. Non-rate stats (kills,
    // enemyDowns, etc.) always show their total, so they must not be relabeled.
    const isRate = (isPerSecond || isPerMinute) && def.supportsRate;
    const titleSuffix = !isRate ? '' : isPerSecond ? ' /s' : ' /m';
    const prefix = (!isRate && TOTAL_PREFIX_IDS.has(def.id)) ? 'Total ' : '';
    return `${prefix}${def.label}${titleSuffix}`;
};

export const TopPlayersSection = ({
    showTopStats,
    showMvp,
    topStatsMode,
    expandedLeader,
    setExpandedLeader,
    formatTopStatValue,
    isMvpStatEnabled,
    enabledTopStats = DEFAULT_ENABLED_TOP_STATS,
    noEgoMode = false,
}: TopPlayersSectionProps) => {
    const { stats, formatWithCommas, renderProfessionIcon, mvpBoonMetric, singleFight } = useStatsSharedContext();
    if (!showTopStats) return null;
    const offenseMvp = stats.offensiveMvp || stats.mvp;
    const offenseSilver = stats.offensiveSilver || stats.silver;
    const offenseBronze = stats.offensiveBronze || stats.bronze;
    const defenseMvp = stats.defensiveMvp || stats.mvp;
    const defenseSilver = stats.defensiveSilver || stats.silver;
    const defenseBronze = stats.defensiveBronze || stats.bronze;
    const offenseAvg = Number.isFinite(stats.offensiveAvgMvpScore) ? stats.offensiveAvgMvpScore : (stats.avgMvpScore || 0);
    const defenseAvg = Number.isFinite(stats.defensiveAvgMvpScore) ? stats.defensiveAvgMvpScore : (stats.avgMvpScore || 0);

    const isPerSecond = topStatsMode === 'perSecond';
    const isPerMinute = topStatsMode === 'perMinute';

    // Pick the non-boon leaderboard source map based on rate mode
    const topStatsLeaderboards = isPerSecond && stats.topStatsLeaderboardsPerSecond
        ? stats.topStatsLeaderboardsPerSecond
        : isPerMinute && stats.topStatsLeaderboardsPerMinute
            ? stats.topStatsLeaderboardsPerMinute
            : stats.leaderboards;

    // The per-second/per-minute leaderboard maps only contain rate-capable stats.
    // Non-rate stats (kills, enemyDowns, blocks, deaths, …) have no per-rate entry,
    // so read their totals directly instead of rendering an empty (0 / dashes) card.
    const isRateMode = isPerSecond || isPerMinute;
    const leaderboardsForDef = (def: TopStatDef) =>
        isRateMode && !def.supportsRate ? stats.leaderboards : topStatsLeaderboards;

    // Participation counts the fights a player was present for. In a single-fight
    // report that is 1 for every name on the roster, so it ranks nobody and
    // crowds out a real stat in both the MVP pills and the leaderboard grid.
    const isAggregateOnlyStat = (idOrLabel: string) => singleFight && (idOrLabel === 'participation' || idOrLabel === 'Participation');
    const statEnabled = (name: string) => isMvpStatEnabled(name) && !isAggregateOnlyStat(name);

    const enabledSet = new Set(enabledTopStats);
    // Filter catalog to enabled defs in catalog order
    const enabledDefs = TOP_STATS_CATALOG.filter((d) => enabledSet.has(d.id) && !isAggregateOnlyStat(d.id));

    const formatValue = (def: TopStatDef, value: number): string => {
        if (def.source.kind === 'boon') {
            const { isPercent } = boonUnitInfo(def.source.stacking, mvpBoonMetric);
            if (isPercent) return `${formatWithCommas(value, 1)}%`;
            return formatWithCommas(value, 1);
        }
        if ((isPerSecond || isPerMinute) && def.supportsRate) {
            return formatWithCommas(value, 2);
        }
        return formatTopStatValue(value);
    };

    if (noEgoMode) {
        const roleByAccount = new Map<string, 'support' | 'damage'>(
            ((stats.roleClassifications as RoleClassificationEntry[] | undefined) ?? [])
                .filter((r): r is RoleClassificationEntry => !!r && (r.role === 'support' || r.role === 'damage'))
                .map((r) => [String(r.account), r.role] as [string, 'support' | 'damage']),
        );
        const roleOf = (account: string): 'support' | 'damage' | undefined =>
            roleByAccount.get(account) ?? roleByAccount.get(String(account).split('::')[0]);

        return (
            <div data-testid="squad-summary">
                <div className="flex items-center gap-2 mb-3.5">
                    <Trophy className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>
                        Squad Summary
                    </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {enabledDefs.map((def) => {
                        const rows =
                            def.source.kind === 'boon'
                                ? (stats.boonLeaderboards?.[def.source.boonId] ?? [])
                                : (leaderboardsForDef(def)?.[def.source.key] ?? []);
                        const players = (Array.isArray(rows) ? rows : []).map((r: any) => ({
                            account: r.account,
                            value: Number(r.value ?? 0),
                            profession: r.profession,
                            professionList: r.professionList,
                            role: roleOf(r.account),
                        }));
                        return (
                            <MetricDistributionCard
                                key={def.id}
                                title={getCardTitle(def, isPerSecond, isPerMinute)}
                                accentColor={def.color}
                                higherIsBetter={def.higherIsBetter}
                                players={players}
                                unit={def.source.kind === 'boon' ? boonUnitInfo(def.source.stacking, mvpBoonMetric).unit : (def.unit ?? '')}
                                roleAware
                                formatValue={(n) => formatValue(def, n)}
                                renderProfessionIcon={renderProfessionIcon}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-2 mb-3.5">
                <Trophy className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Top Players</h3>
            </div>
            {showMvp && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                    {[
                        {
                            key: 'offense',
                            title: 'Offensive MVP',
                            accent: 'axi-ink-warn',
                            accentSoft: 'axi-ink-warn',
                            accentLabelBorder: 'axi-edge-warn',
                            goldReasonIcon: 'axi-ink-warn',
                            goldScoreTitle: 'axi-ink-warn',
                            goldScoreValue: 'axi-ink-warn',
                            goldScoreMeta: 'axi-ink-warn',
                            gold: offenseMvp,
                            silver: offenseSilver,
                            bronze: offenseBronze,
                            avg: offenseAvg
                        },
                        {
                            key: 'defense',
                            title: 'Defensive MVP',
                            accent: 'axi-ink-ok',
                            accentSoft: 'axi-ink-ok',
                            accentLabelBorder: 'axi-edge-ok',
                            goldReasonIcon: 'axi-ink-meta',
                            goldScoreTitle: 'axi-ink-meta',
                            goldScoreValue: 'axi-ink-meta',
                            goldScoreMeta: 'axi-ink-meta',
                            gold: defenseMvp,
                            silver: defenseSilver,
                            bronze: defenseBronze,
                            avg: defenseAvg
                        }
                    ].map((group) => (
                        <div
                            key={group.title}
                            className={`mvp-group mvp-group--${group.key} axi-well relative grid grid-cols-1 gap-3`}
                            /* The group's own label straddles its top edge, so the well pays
                               for the half that hangs inside out of its padding. */
                            style={{ '--axi-well-pad': '8px', paddingTop: '22px' } as React.CSSProperties}
                        >
                            <div className={`mvp-group-label absolute left-3 inline-flex items-center gap-2 border ${group.accentLabelBorder}`}>
                                <Sparkles className={`mvp-group-label-icon w-4 h-4 ${group.accent}`} />
                                <span className="mvp-group-label-title font-bold uppercase tracking-widest text-xs text-[color:var(--axi-text)]">{group.title}</span>
                            </div>
                            <div
                                className="mvp-card mvp-card--gold axi-panel min-h-[182px] flex items-center"
                                style={{ '--axi-panel-pad': '12px' } as React.CSSProperties}
                            >
                                <div className="flex items-center gap-5 w-full">
                                    <div className="mvp-gold-icon-ring flex shrink-0 aspect-square items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full border relative">
                                        <Crown className="w-8 h-8 sm:w-10 sm:h-10 axi-ink-warn" />
                                        <span className="mvp-gold-icon-badge absolute -bottom-1 -right-1 inline-flex items-center justify-center w-6 h-6 rounded-full border">
                                            {group.key === 'offense'
                                                ? <Flame className="w-3.5 h-3.5" />
                                                : <ShieldCheck className="w-3.5 h-3.5" />}
                                        </span>
                                    </div>
                                    <div className="flex-1 flex flex-col h-full min-w-0">
                                        <div className="mb-2 flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-2xl sm:text-3xl font-black axi-ink-plain flex flex-wrap items-center gap-2 sm:gap-3">
                                                    <span className="min-w-0 max-w-full truncate">{group.gold?.account || 'None'}</span>
                                                    {renderProfessionIcon(group.gold?.profession || 'Unknown', group.gold?.professionList, 'w-6 h-6')}
                                                    <span className="mvp-profession-chip text-xs sm:text-sm font-medium px-2 py-0.5 sm:px-1.5 sm:py-0 border max-w-full truncate">
                                                        {group.gold?.profession || 'Unknown'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="sm:hidden text-right shrink-0">
                                                <div className={`text-3xl font-black leading-none ${group.goldScoreValue}`}>{group.gold?.score > 0 ? group.gold.score.toFixed(1) : '-'}</div>
                                                <div className={`text-[10px] font-mono mt-1 ${group.goldScoreMeta}`}>Avg: {group.avg.toFixed(1)}</div>
                                            </div>
                                        </div>
                                        <p className={`italic flex items-center gap-2 mb-2 ${group.accentSoft}`}>
                                            <Star className={`w-4 h-4 fill-current ${group.goldReasonIcon}`} />
                                            <span className="truncate">"{group.gold?.reason || 'Top Performance'}"</span>
                                        </p>
                                        <div className="hidden sm:flex xl:hidden mb-2 items-end justify-between gap-3">
                                            <div className={`font-mono text-[10px] uppercase tracking-wider font-bold ${group.goldScoreTitle}`}>{group.title}</div>
                                            <div className="text-right">
                                                <div className={`text-3xl font-black leading-none ${group.goldScoreValue}`}>{group.gold?.score > 0 ? group.gold.score.toFixed(1) : '-'}</div>
                                                <div className={`text-[10px] font-mono mt-1 ${group.goldScoreMeta}`}>Avg: {group.avg.toFixed(1)}</div>
                                            </div>
                                        </div>
                                        <div className="mt-auto min-h-[58px] sm:min-h-[54px]">
                                            <div className="space-y-1 sm:space-y-0.5 max-w-[12rem]">
                                                {(group.gold?.topStats || []).filter((stat: any) => statEnabled(stat.name)).slice(0, 3).map((stat: any, i: number) => (
                                                    <div
                                                        key={i}
                                                        className="mvp-stat-pill mvp-stat-pill--gold axi-well [--axi-well-radius:var(--axi-radius-sm)] [--axi-well-pad:4px_8px] sm:[--axi-well-pad:2px_6px] flex items-center justify-between gap-2 text-[11px] sm:gap-1.5 sm:text-[10px] leading-normal"
                                                    >
                                                        <span className="axi-ink-warn font-semibold truncate leading-normal">{stat.name}</span>
                                                        <span className="axi-ink-warn font-mono tabular-nums shrink-0 leading-normal">{formatMvpPillValue(stat.val, formatTopStatValue)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="hidden xl:block text-right">
                                        <div className={`font-mono text-sm uppercase tracking-wider font-bold ${group.goldScoreTitle}`}>{group.title}</div>
                                        <div className={`text-4xl font-black ${group.goldScoreValue}`}>{group.gold?.score > 0 ? group.gold.score.toFixed(1) : '-'}</div>
                                        <div className={`text-xs font-mono mt-1 ${group.goldScoreMeta}`}>Avg: {group.avg.toFixed(1)}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Silver', data: group.silver },
                                    { label: 'Bronze', data: group.bronze }
                                ].map((entry) => (
                                    <div
                                        key={`${group.title}-${entry.label}`}
                                        className={`mvp-card mvp-card--${entry.label.toLowerCase()} axi-panel axi-panel--tile min-h-[126px] flex flex-col`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <div className={`text-xs uppercase tracking-widest font-semibold ${entry.label === 'Silver' ? 'axi-ink-plain' : 'axi-ink-warn'}`}>
                                                {entry.label}
                                            </div>
                                            <div className="text-xs text-[color:var(--axi-text-dim)] font-mono">
                                                {entry.data?.score ? entry.data.score.toFixed(1) : '-'}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 mb-2">
                                            {entry.data && renderProfessionIcon(entry.data.profession, entry.data.professionList, 'w-6 h-6')}
                                            <div className="min-w-0 flex-1">
                                                <div className={`text-base font-semibold ${entry.label === 'Silver' ? 'axi-ink-plain' : 'axi-ink-warn'} truncate`}>
                                                    {entry.data?.account || '—'}
                                                </div>
                                                <div className={`text-xs ${entry.label === 'Silver' ? 'axi-ink-faint' : 'axi-ink-warn'} truncate`}>
                                                    {entry.data?.profession || 'Unknown'}
                                                </div>
                                            </div>
                                        </div>
                                        {entry.data?.topStats?.some((stat: any) => statEnabled(stat.name)) ? (
                                            <div className={`mt-auto min-h-[40px] sm:min-h-[36px] text-[11px] sm:text-[10px] ${entry.label === 'Silver' ? 'axi-ink-plain' : 'axi-ink-warn'}`}>
                                                <div className="space-y-1 sm:space-y-0.5 sm:max-w-[12rem]">
                                                    {entry.data.topStats.filter((stat: any) => statEnabled(stat.name)).slice(0, 2).map((stat: any, idx: number) => (
                                                        <div
                                                            key={idx}
                                                            className="mvp-stat-pill mvp-stat-pill--minor axi-well [--axi-well-radius:var(--axi-radius-sm)] [--axi-well-pad:4px_8px] sm:[--axi-well-pad:2px_6px] flex items-center justify-between gap-2 sm:gap-1.5 leading-normal"
                                                        >
                                                            <span className="truncate leading-normal">{stat.name}</span>
                                                            <span className="tabular-nums shrink-0 leading-normal">{formatMvpPillValue(stat.val, formatTopStatValue)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {enabledDefs.length === 0 ? (
                <div className="axi-empty">
                    No top stats selected — enable some in Settings → Dashboard - Top Stats &amp; MVP.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {enabledDefs.map((def) => {
                        const isBoon = def.source.kind === 'boon';
                        const isActive = expandedLeader === 'all';

                        // Resolve raw leaderboard rows
                        let sourceRows: any[] = [];
                        if (def.source.kind === 'boon') {
                            sourceRows = stats.boonLeaderboards?.[def.source.boonId] || [];
                        } else {
                            sourceRows = leaderboardsForDef(def)?.[def.source.key] || [];
                        }

                        const rows = normalizeLeaderboardRows(sourceRows, def.higherIsBetter);
                        const topRow = rows[0];

                        const cardData = topRow
                            ? {
                                value: Number(topRow.value ?? 0),
                                player: topRow.account || '-',
                                count: topRow.count || 0,
                                profession: topRow.profession || 'Unknown',
                                professionList: topRow.professionList || [],
                            }
                            : { value: 0, player: '-', count: 0, profession: 'Unknown', professionList: [] };

                        const cardTitle = getCardTitle(def, isPerSecond, isPerMinute);
                        const cardUnit = isBoon && def.source.kind === 'boon'
                            ? boonUnitInfo(def.source.stacking, mvpBoonMetric).unit
                            : (def.id === 'closestToTag' ? 'dist' : '');

                        const fmtValue = (v: number) => formatValue(def, v);

                        return (
                            <LeaderCard
                                key={def.id}
                                icon={def.icon !== 'boon' ? TOP_STAT_ICONS[def.icon] : undefined}
                                title={cardTitle}
                                data={cardData}
                                isBoon={isBoon}
                                accentColor={def.color}
                                unit={cardUnit}
                                active={isActive}
                                onClick={() => setExpandedLeader((prev) => (prev === 'all' ? null : 'all'))}
                                rows={rows}
                                formatValue={fmtValue}
                                renderProfessionIcon={renderProfessionIcon}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};
