import React from 'react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { MetricDistributionCard } from '../components/MetricDistributionCard';
import { useStatsSharedContext } from '../StatsViewContext';
import type { RoleClassificationEntry } from '../statsTypes';

export interface NoEgoMetricDef {
    id: string;
    label: string;
}

export interface NoEgoMetricSectionProps {
    title: string;
    icon: React.ReactNode;
    accentColor: string;
    sidebarLabel: string;
    keyPrefix: string;
    metrics: NoEgoMetricDef[];
    filteredMetrics: NoEgoMetricDef[];
    players: any[];
    roleClassifications?: RoleClassificationEntry[];
    activeStatId: string;
    setActiveStatId: (id: string) => void;
    search: string;
    setSearch: (v: string) => void;
    viewMode: 'total' | 'per1s' | 'per60s';
    setViewMode: (v: 'total' | 'per1s' | 'per60s') => void;
    detailOpen: boolean;
    setDetailOpen: (v: boolean | ((p: boolean) => boolean)) => void;
    higherIsBetter: (metric: NoEgoMetricDef) => boolean;
    resolveTotal: (row: any, metric: NoEgoMetricDef) => number;
    isRateOrPercent: (metric: NoEgoMetricDef) => boolean;
    fightTimeMs: (row: any) => number;
    formatValue: (metric: NoEgoMetricDef, val: number) => string;
}

export const NoEgoMetricSection: React.FC<NoEgoMetricSectionProps> = ({
    title,
    icon,
    accentColor,
    sidebarLabel,
    keyPrefix,
    metrics,
    filteredMetrics,
    players,
    roleClassifications,
    activeStatId,
    setActiveStatId,
    search,
    setSearch,
    viewMode,
    setViewMode,
    detailOpen,
    setDetailOpen,
    higherIsBetter,
    resolveTotal,
    isRateOrPercent,
    fightTimeMs,
    formatValue,
}) => {
    const { renderProfessionIcon, sidebarListClass } = useStatsSharedContext();

    const clickTimesRef = React.useRef<number[]>([]);
    const handleSecretIconClick = () => {
        const now = performance.now();
        const recent = clickTimesRef.current.filter((t) => now - t < 600);
        recent.push(now);
        if (recent.length >= 3) {
            clickTimesRef.current = [];
            setDetailOpen((v) => !v);
        } else {
            clickTimesRef.current = recent;
        }
    };

    const roleByAccount = new Map<string, 'support' | 'damage'>(
        ((roleClassifications as RoleClassificationEntry[] | undefined) ?? [])
            .filter((r): r is RoleClassificationEntry => !!r && (r.role === 'support' || r.role === 'damage'))
            .map((r) => [String(r.account), r.role] as [string, 'support' | 'damage']),
    );
    const roleOf = (account: string): 'support' | 'damage' | undefined =>
        roleByAccount.get(account) ?? roleByAccount.get(String(account).split('::')[0]);

    const totalSeconds = (row: any) => Math.max(1, fightTimeMs(row) / 1000);

    const resolvedValue = (row: any, metricEntry: NoEgoMetricDef): number => {
        const total = resolveTotal(row, metricEntry);
        if (isRateOrPercent(metricEntry)) return total;
        if (viewMode === 'per1s') return total / totalSeconds(row);
        if (viewMode === 'per60s') return (total * 60) / totalSeconds(row);
        return total;
    };

    const activeMetric = metrics.find((e) => e.id === activeStatId) || metrics[0];
    const activePlayers = players.map((row: any) => ({
        account: row.account,
        value: activeMetric ? resolvedValue(row, activeMetric) : 0,
        profession: row.profession,
        professionList: row.professionList,
        role: roleOf(row.account),
    }));
    const activeHigherIsBetter = activeMetric ? higherIsBetter(activeMetric) : true;
    const activeFormatValue = (val: number) =>
        activeMetric ? formatValue(activeMetric, val) : String(val);

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
                <div className="flex items-center gap-2">
                    <span data-testid="noego-secret-icon" onClick={handleSecretIconClick}>
                        {icon}
                    </span>
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                        {title}
                    </h3>
                </div>
                <PillToggleGroup
                    value={viewMode}
                    onChange={setViewMode}
                    options={[
                        { value: 'total', label: 'Total' },
                        { value: 'per1s', label: 'Stat/1s' },
                        { value: 'per60s', label: 'Stat/60s' }
                    ]}
                    activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                    inactiveClassName="text-[color:var(--text-secondary)]"
                />
            </div>
            <StatsTableLayout
                expanded={false}
                sidebarClassName="pr-3 flex flex-col overflow-y-auto"
                sidebarStyle={undefined}
                contentClassName="overflow-hidden"
                contentStyle={undefined}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>{sidebarLabel}</div>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-2 py-1 text-xs focus:outline-none mb-2"
                            style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                        />
                        <div className={sidebarListClass}>
                            {filteredMetrics.map((metric) => (
                                <button
                                    key={metric.id}
                                    onClick={() => setActiveStatId(metric.id)}
                                    className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeStatId === metric.id
                                        ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                        : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                        }`}
                                    style={activeStatId !== metric.id ? { color: 'var(--text-secondary)' } : undefined}
                                >
                                    {metric.label}
                                </button>
                            ))}
                        </div>
                    </>
                }
                content={
                    <div className="flex flex-col gap-4">
                        {activeMetric && (
                            <MetricDistributionCard
                                large
                                roleAware
                                title={activeMetric.label}
                                accentColor={accentColor}
                                higherIsBetter={activeHigherIsBetter}
                                players={activePlayers}
                                formatValue={activeFormatValue}
                                renderProfessionIcon={renderProfessionIcon}
                            />
                        )}
                        <div>
                            {detailOpen && activeMetric && (
                                <div className="mt-3">
                                    {(() => {
                                        const metric = activeMetric;
                                        const tsec = (row: any) => Math.max(1, fightTimeMs(row) / 1000);
                                        const tval = (row: any) => resolveTotal(row, metric);
                                        const fmtVal = (val: number) => formatValue(metric, val);
                                        const rows = [...players]
                                            .map((row: any) => ({
                                                ...row,
                                                total: tval(row),
                                                per1s: isRateOrPercent(metric) ? tval(row) : tval(row) / tsec(row),
                                                per60s: isRateOrPercent(metric) ? tval(row) : (tval(row) * 60) / tsec(row)
                                            }))
                                            .sort((a, b) => {
                                                const aVal = Number(viewMode === 'total' ? a.total : viewMode === 'per1s' ? a.per1s : a.per60s);
                                                const bVal = Number(viewMode === 'total' ? b.total : viewMode === 'per1s' ? b.per1s : b.per60s);
                                                return bVal - aVal || a.account.localeCompare(b.account);
                                            });
                                        return (
                                            <StatsTableShell
                                                expanded={false}
                                                animationKey={`${keyPrefix}-${activeStatId}-${viewMode}`}
                                                header={null}
                                                columns={
                                                    <div className="grid grid-cols-[1.5fr_1fr_0.9fr] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] px-3 py-2 border-b border-[color:var(--border-default)]">
                                                        <div>Player</div>
                                                        <div className="text-right">
                                                            {viewMode === 'total' ? 'Total' : viewMode === 'per1s' ? 'Stat/1s' : 'Stat/60s'}
                                                        </div>
                                                        <div className="text-right">Fight Time</div>
                                                    </div>
                                                }
                                                rows={
                                                    <>
                                                        {rows.map((row: any, idx: number) => (
                                                            <div key={`${keyPrefix}-${metric.id}-${row.account}-${idx}`} className="grid grid-cols-[1.5fr_1fr_0.9fr] px-3 py-2 text-xs border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]" style={{ color: 'var(--text-primary)' }}>
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                                    <span className="truncate">{row.account}</span>
                                                                </div>
                                                                <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                                    {fmtVal(viewMode === 'total' ? row.total : viewMode === 'per1s' ? row.per1s : row.per60s)}
                                                                </div>
                                                                <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                                    {fightTimeMs(row) ? `${(fightTimeMs(row) / 1000).toFixed(1)}s` : '-'}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </>
                                                }
                                            />
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>
                }
            />
        </div>
    );
};
