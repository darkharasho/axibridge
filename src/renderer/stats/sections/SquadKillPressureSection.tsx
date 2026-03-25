import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, X, Target } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

type KillPressurePoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    kdr: number;
    logKdr: number;
    enemyDeaths: number;
    squadDeaths: number;
};

export const SquadKillPressureSection = () => {
    const {
        stats,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection
    } = useStatsSharedContext();
    const sectionId = 'squad-kill-pressure';
    const isExpanded = expandedSection === sectionId;

    const fights = Array.isArray(stats?.fightBreakdown) ? stats.fightBreakdown : [];

    const chartData: KillPressurePoint[] = useMemo(() => {
        return fights.map((fight: any, idx: number) => {
            const enemyDeaths = Number(fight.enemyDeaths || 0);
            const squadDeaths = Number(fight.alliesDead || 0);
            const kdr = squadDeaths > 0 ? enemyDeaths / squadDeaths : enemyDeaths;
            const safeKdr = Math.max(kdr, 0.01);
            return {
                index: idx,
                fightId: fight.id || `fight-${idx}`,
                shortLabel: `F${idx + 1}`,
                fullLabel: `${fight.mapName || fight.label || 'Unknown'} • ${fight.duration || '--:--'}`,
                isWin: fight.isWin,
                kdr: Math.round(kdr * 100) / 100,
                logKdr: Math.log2(safeKdr),
                enemyDeaths,
                squadDeaths,
            };
        });
    }, [fights]);

    const yExtent = useMemo(() => {
        if (chartData.length === 0) return 2;
        const maxAbs = Math.max(1, ...chartData.map((d) => Math.abs(d.logKdr)));
        return Math.ceil(maxAbs);
    }, [chartData]);

    const yTicks = useMemo(() => {
        const ticks: number[] = [0];
        for (let i = 1; i <= yExtent; i++) {
            ticks.push(i);
            ticks.push(-i);
        }
        return ticks.sort((a, b) => a - b);
    }, [yExtent]);

    return (
        <div
            className={`stats-share-exclude ${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex items-center gap-2 mb-3.5">
                <Target className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Kill Pressure</h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Kill Pressure' : 'Expand Kill Pressure'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            {chartData.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No fight data available</div>
            ) : (
                <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--text-secondary)]">Kill/Death Ratio per Fight</div>
                            <div className="text-[11px] text-[color:var(--text-secondary)] mt-1">
                                Baseline is KDR 1.0. Green above = winning attrition. Red below = losing attrition. Scale is logarithmic.
                            </div>
                        </div>
                        <div className="text-[11px] text-[color:var(--text-secondary)] shrink-0">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className={isExpanded ? 'h-[400px]' : 'h-[280px]'}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="shortLabel"
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                />
                                <YAxis
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                    domain={[-yExtent, yExtent]}
                                    ticks={yTicks}
                                    tickFormatter={(value: number) => {
                                        const kdr = Math.pow(2, value);
                                        return kdr >= 1 ? kdr.toFixed(0) : kdr.toFixed(1);
                                    }}
                                />
                                <ReferenceLine
                                    y={0}
                                    stroke="rgba(251,191,36,0.5)"
                                    strokeDasharray="6 4"
                                    label={{ value: 'KDR 1.0', position: 'right', fill: '#fbbf24', fontSize: 9 }}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                    content={({ payload }: any) => {
                                        const point = payload?.[0]?.payload;
                                        if (!point) return null;
                                        return (
                                            <div style={{ backgroundColor: '#161c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '10px 12px', fontSize: '12px' }}>
                                                <p style={{ margin: 0, color: '#94a3b8' }}>
                                                    {point.fullLabel}{' '}
                                                    {point.isWin === true && <span style={{ color: '#22c55e', fontWeight: 700 }}>W</span>}
                                                    {point.isWin === false && <span style={{ color: '#ef4444', fontWeight: 700 }}>L</span>}
                                                </p>
                                                <p style={{ margin: '4px 0 0', color: '#e2e8f0' }}>
                                                    KDR : {point.kdr.toFixed(2)} ({point.enemyDeaths} kills / {point.squadDeaths} deaths)
                                                </p>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="logKdr" name="KDR">
                                    {chartData.map((entry) => (
                                        <Cell
                                            key={entry.fightId}
                                            fill={entry.logKdr >= 0 ? '#22c55e' : '#ef4444'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                            <span className="text-[9px] text-[color:var(--text-secondary)]">KDR &gt; 1.0</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-red-400" />
                            <span className="text-[9px] text-[color:var(--text-secondary)]">KDR &lt; 1.0</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0 border-t border-dashed border-amber-400" />
                            <span className="text-[9px] text-[color:var(--text-secondary)]">Break-even</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
