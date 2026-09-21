// src/renderer/stats/sections/PlayerComparisonSection.tsx
import { useMemo, useState } from 'react';
import { Maximize2, X, Users } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import { getComparisonColor, getDiffPercent } from '../utils/comparisonColors';
import {
    COMPARISON_CATEGORIES,
    COMPARISON_METRICS,
    getMetricValue,
    getPlayersArrayKey,
    type ComparisonCategory,
    type ComparisonMetric,
    type ComparisonContext,
} from '../utils/comparisonMetrics';

type ComparisonMode = 'head-to-head' | 'vs-average';

type PlayerComparisonSectionProps = {
    comparisonMode: ComparisonMode;
    setComparisonMode: (mode: ComparisonMode) => void;
    comparisonCategory: ComparisonCategory;
    setComparisonCategory: (cat: ComparisonCategory) => void;
    playerAKey: string | null;
    setPlayerAKey: (key: string | null) => void;
    playerBKey: string | null;
    setPlayerBKey: (key: string | null) => void;
};

export const PlayerComparisonSection = ({
    comparisonMode,
    setComparisonMode,
    comparisonCategory,
    setComparisonCategory,
    playerAKey,
    setPlayerAKey,
    playerBKey,
    setPlayerBKey,
}: PlayerComparisonSectionProps) => {
    const {
        stats,
        formatWithCommas,
        renderProfessionIcon,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
    } = useStatsSharedContext();

    const [avgSortMetric, setAvgSortMetric] = useState<string | null>(null);
    const [avgSortDir, setAvgSortDir] = useState<'asc' | 'desc'>('desc');

    const isExpanded = expandedSection === 'player-comparison';

    const playersArrayKey = getPlayersArrayKey(comparisonCategory);
    const players: any[] = stats?.[playersArrayKey] || [];
    const metrics = COMPARISON_METRICS[comparisonCategory];

    const comparisonContext: ComparisonContext = useMemo(() => ({
        boonTables: stats?.boonTables,
        spikePlayers: stats?.spikeDamage?.players,
    }), [stats?.boonTables, stats?.spikeDamage?.players]);

    const playerA = useMemo(() => players.find((p: any) => p.account === playerAKey), [players, playerAKey]);
    const playerB = useMemo(() => players.find((p: any) => p.account === playerBKey), [players, playerBKey]);

    const formatValue = (value: number, metric: ComparisonMetric) => {
        const decimals = metric.decimals ?? (metric.isPercent ? 1 : 0);
        const formatted = metric.isPercent ? `${value.toFixed(decimals)}%` : formatWithCommas(value, decimals);
        if (metric.perSecond) return `${formatted}/s`;
        if (metric.perMinute) return `${formatted}/m`;
        if (metric.boonId) return `${formatted}/m`;
        return formatted;
    };

    const hasData = players.length > 0;

    return (
        <div
            className={`${isExpanded
                ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}`
                : ''
            }`}
            style={isExpanded ? { background: 'var(--pane-bg, var(--bg-elevated))', boxShadow: 'var(--pane-block, var(--shadow-card))' } : undefined}
        >
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                    Player Comparison
                </h3>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection('player-comparison'))}
                        className="flex items-center justify-center w-[26px] h-[26px]"
                        style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                        aria-label={isExpanded ? 'Close Player Comparison' : 'Expand Player Comparison'}
                        title={isExpanded ? 'Close' : 'Expand'}
                    >
                        {isExpanded
                            ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
                            : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />
                        }
                    </button>
                </div>
            </div>

            {!hasData ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    No player data available
                </div>
            ) : (
                <>
                    {/* Controls bar */}
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                        <PillToggleGroup
                            value={comparisonMode}
                            onChange={(v) => setComparisonMode(v as ComparisonMode)}
                            options={[
                                { value: 'head-to-head', label: 'Head-to-Head' },
                                { value: 'vs-average', label: 'vs Squad Avg' },
                            ]}
                            className="inline-flex w-auto"
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                        <div className="ml-auto">
                            <PillToggleGroup
                                value={comparisonCategory}
                                onChange={(v) => setComparisonCategory(v as ComparisonCategory)}
                                options={COMPARISON_CATEGORIES}
                                className="inline-flex w-auto"
                                activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                inactiveClassName="text-[color:var(--text-secondary)]"
                            />
                        </div>
                    </div>

                    {/* Mode-specific content */}
                    {comparisonMode === 'head-to-head' ? (
                        <HeadToHeadView
                            players={players}
                            playerA={playerA}
                            playerB={playerB}
                            playerAKey={playerAKey}
                            playerBKey={playerBKey}
                            setPlayerAKey={setPlayerAKey}
                            setPlayerBKey={setPlayerBKey}
                            metrics={metrics}
                            formatValue={formatValue}
                            renderProfessionIcon={renderProfessionIcon}
                            comparisonContext={comparisonContext}
                        />
                    ) : (
                        <VsAverageView
                            players={players}
                            metrics={metrics}
                            formatValue={formatValue}
                            renderProfessionIcon={renderProfessionIcon}
                            sortMetric={avgSortMetric}
                            sortDir={avgSortDir}
                            onSort={(metricId) => {
                                if (avgSortMetric === metricId) {
                                    setAvgSortDir(avgSortDir === 'desc' ? 'asc' : 'desc');
                                } else {
                                    setAvgSortMetric(metricId);
                                    setAvgSortDir('desc');
                                }
                            }}
                            comparisonContext={comparisonContext}
                        />
                    )}
                </>
            )}
        </div>
    );
};

/* ─── Player Selector Dropdown ────────────────────────────────────── */

const PlayerSelect = ({
    players,
    selectedKey,
    excludeKey,
    onChange,
    renderProfessionIcon,
    label,
}: {
    players: any[];
    selectedKey: string | null;
    excludeKey: string | null;
    onChange: (key: string | null) => void;
    renderProfessionIcon: any;
    label: string;
}) => {
    const selected = players.find((p: any) => p.account === selectedKey);
    const [open, setOpen] = useState(false);

    return (
        <div className="relative flex-1">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2"
                style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-default)' }}
            >
                {selected ? (
                    <>
                        {renderProfessionIcon(selected.profession, selected.professionList, 'w-4 h-4')}
                        <span style={{ color: 'var(--text-primary)' }} className="font-medium text-sm truncate">{selected.account}</span>
                        <span style={{ color: 'var(--text-muted)' }} className="text-xs ml-auto">{selected.profession}</span>
                    </>
                ) : (
                    <span style={{ color: 'var(--text-muted)' }} className="text-sm">{label}</span>
                )}
            </button>
            {open && (
                <div
                    className="absolute z-10 mt-1 w-full rounded-[var(--radius-md)] overflow-y-auto max-h-60"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
                >
                    {players
                        .filter((p: any) => p.account !== excludeKey)
                        .map((p: any) => (
                            <button
                                key={p.account}
                                type="button"
                                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)]"
                                onClick={() => { onChange(p.account); setOpen(false); }}
                            >
                                {renderProfessionIcon(p.profession, p.professionList, 'w-4 h-4')}
                                <span style={{ color: 'var(--text-primary)' }} className="text-sm truncate">{p.account}</span>
                                <span style={{ color: 'var(--text-muted)' }} className="text-xs ml-auto">{p.profession}</span>
                            </button>
                        ))}
                </div>
            )}
        </div>
    );
};

/* ─── Head-to-Head View ───────────────────────────────────────────── */

const HeadToHeadView = ({
    players,
    playerA,
    playerB,
    playerAKey,
    playerBKey,
    setPlayerAKey,
    setPlayerBKey,
    metrics,
    formatValue,
    renderProfessionIcon,
    comparisonContext,
}: {
    players: any[];
    playerA: any;
    playerB: any;
    playerAKey: string | null;
    playerBKey: string | null;
    setPlayerAKey: (key: string | null) => void;
    setPlayerBKey: (key: string | null) => void;
    metrics: ComparisonMetric[];
    formatValue: (value: number, metric: ComparisonMetric) => string;
    renderProfessionIcon: any;
    comparisonContext: ComparisonContext;
}) => {
    return (
        <>
            {/* Player selectors */}
            <div className="flex items-center gap-3 mb-4">
                <PlayerSelect
                    players={players}
                    selectedKey={playerAKey}
                    excludeKey={playerBKey}
                    onChange={setPlayerAKey}
                    renderProfessionIcon={renderProfessionIcon}
                    label="Select Player A"
                />
                <span style={{ color: 'var(--text-muted)' }} className="font-bold text-base">vs</span>
                <PlayerSelect
                    players={players}
                    selectedKey={playerBKey}
                    excludeKey={playerAKey}
                    onChange={setPlayerBKey}
                    renderProfessionIcon={renderProfessionIcon}
                    label="Select Player B"
                />
            </div>

            {!playerA || !playerB ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    Select two players to compare
                </div>
            ) : (
                <div className="rounded-[var(--radius-md)] overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
                    <table className="stats-table w-full" style={{ borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-default)' }}>
                                <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)', width: '30%' }}>Metric</th>
                                <th className="text-right px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)', width: '25%' }}>{playerA.account}</th>
                                <th className="text-right px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)', width: '25%' }}>{playerB.account}</th>
                                <th className="text-right px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)', width: '20%' }}>Diff</th>
                            </tr>
                        </thead>
                        <tbody>
                            {metrics.map((metric) => {
                                const valA = getMetricValue(playerA, metric, comparisonContext);
                                const valB = getMetricValue(playerB, metric, comparisonContext);
                                const colorA = getComparisonColor(valA, valB, metric.lowerIsBetter);
                                const colorB = getComparisonColor(valB, valA, metric.lowerIsBetter);
                                const diff = getDiffPercent(valA, valB, metric.lowerIsBetter);

                                return (
                                    <tr key={metric.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td className="px-4 py-2.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{metric.label}</td>
                                        <td className="px-4 py-2.5 text-right text-sm font-semibold" style={{ background: colorA.bg || undefined, color: colorA.text || 'var(--text-primary)' }}>
                                            {formatValue(valA, metric)}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-sm font-semibold" style={{ background: colorB.bg || undefined, color: colorB.text || 'var(--text-primary)' }}>
                                            {formatValue(valB, metric)}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-xs" style={{ color: diff !== null && diff >= 0 ? 'var(--status-success)' : diff !== null ? 'var(--status-error)' : 'var(--text-muted)' }}>
                                            {diff !== null ? `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%` : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
};

/* ─── vs Squad Average View ───────────────────────────────────────── */

const VsAverageView = ({
    players,
    metrics,
    formatValue,
    renderProfessionIcon,
    sortMetric,
    sortDir,
    onSort,
    comparisonContext,
}: {
    players: any[];
    metrics: ComparisonMetric[];
    formatValue: (value: number, metric: ComparisonMetric) => string;
    renderProfessionIcon: any;
    sortMetric: string | null;
    sortDir: 'asc' | 'desc';
    onSort: (metricId: string) => void;
    comparisonContext: ComparisonContext;
}) => {
    const averages = useMemo(() => {
        const avgs: Record<string, number> = {};
        for (const metric of metrics) {
            const values = players.map((p) => getMetricValue(p, metric, comparisonContext));
            avgs[metric.id] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        }
        return avgs;
    }, [players, metrics, comparisonContext]);

    const sortedPlayers = useMemo(() => {
        if (!sortMetric) return players;
        const metric = metrics.find((m) => m.id === sortMetric);
        if (!metric) return players;
        return [...players].sort((a, b) => {
            const va = getMetricValue(a, metric, comparisonContext);
            const vb = getMetricValue(b, metric, comparisonContext);
            return sortDir === 'desc' ? vb - va : va - vb;
        });
    }, [players, metrics, sortMetric, sortDir, comparisonContext]);

    if (players.length === 0) {
        return (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                No data for this category
            </div>
        );
    }

    return (
        <div className="rounded-[var(--radius-md)] overflow-x-auto" style={{ border: '1px solid var(--border-default)' }}>
            <table className="stats-table w-full" style={{ borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-default)' }}>
                        <th className="text-left px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Player</th>
                        {metrics.map((metric) => (
                            <th
                                key={metric.id}
                                className="text-right px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide cursor-pointer hover:bg-[var(--bg-hover)]"
                                style={{ color: 'var(--text-muted)' }}
                                onClick={() => onSort(metric.id)}
                            >
                                {metric.label}
                                {sortMetric === metric.id && (
                                    <span className="ml-1">{sortDir === 'desc' ? '▼' : '▲'}</span>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {/* Squad Average row */}
                    <tr style={{ borderBottom: '2px solid var(--border-default)', background: 'var(--bg-card-inner)' }}>
                        <td className="px-4 py-2.5 text-sm font-semibold italic" style={{ color: 'var(--text-muted)' }}>Squad Average</td>
                        {metrics.map((metric) => (
                            <td key={metric.id} className="px-3 py-2.5 text-right text-sm" style={{ color: 'var(--text-muted)' }}>
                                {formatValue(averages[metric.id], metric)}
                            </td>
                        ))}
                    </tr>
                    {/* Player rows */}
                    {sortedPlayers.map((player: any) => (
                        <tr key={player.account} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td className="px-4 py-2.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                <span className="inline-flex items-center gap-2">
                                    {renderProfessionIcon(player.profession, player.professionList, 'w-4 h-4')}
                                    {player.account}
                                </span>
                            </td>
                            {metrics.map((metric) => {
                                const value = getMetricValue(player, metric, comparisonContext);
                                const color = getComparisonColor(value, averages[metric.id], metric.lowerIsBetter);
                                return (
                                    <td
                                        key={metric.id}
                                        className="px-3 py-2.5 text-right text-sm font-semibold"
                                        style={{ background: color.bg || undefined, color: color.text || 'var(--text-primary)' }}
                                    >
                                        {formatValue(value, metric)}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
