import { useMemo } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Target } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { expandedPaneProps } from './expandedPane';

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
                fullLabel: fight.fullLabel || `${fight.mapName || fight.label || 'Unknown'} • ${fight.duration || '--:--'}`,
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
        <div {...expandedPaneProps(isExpanded, expandedSectionClosing)}>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Target className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Kill Pressure</h3>
                <SectionExpandButton
                    expanded={isExpanded}
                    onToggle={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    section="Kill Pressure"
                />
            </div>

            {chartData.length === 0 ? (
                <div className="axi-empty">No fight data available</div>
            ) : (
                <div className="rounded-[var(--axi-radius-sm)] p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--axi-text-dim)]">Kill/Death Ratio per Fight</div>
                            <div className="text-[11px] text-[color:var(--axi-text-dim)] mt-1">
                                Baseline is KDR 1.0. Green above = winning attrition. Red below = losing attrition. Scale is logarithmic.
                            </div>
                        </div>
                        <div className="text-[11px] text-[color:var(--axi-text-dim)] shrink-0">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className={isExpanded ? 'h-[400px]' : 'h-[280px]'}>
                        <ChartContainer width="100%" height="100%">
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
                                            <div className="axi-panel axi-panel--float" style={{ '--axi-panel-pad': '10px 12px', fontSize: '12px' } as React.CSSProperties}>
                                                <p style={{ margin: 0, color: 'var(--axi-text-dim)' }}>
                                                    {point.fullLabel}{' '}
                                                    {point.isWin === true && <span style={{ color: 'var(--axi-ok)', fontWeight: 700 }}>W</span>}
                                                    {point.isWin === false && <span style={{ color: 'var(--axi-danger)', fontWeight: 700 }}>L</span>}
                                                </p>
                                                <p style={{ margin: '4px 0 0', color: 'var(--axi-text)' }}>
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
                        </ChartContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <span className="axi-diamond axi-diamond--ok" />
                            <span className="text-[9px] text-[color:var(--axi-text-dim)]">KDR &gt; 1.0</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="axi-diamond axi-diamond--danger" />
                            <span className="text-[9px] text-[color:var(--axi-text-dim)]">KDR &lt; 1.0</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0 border-t border-dashed axi-edge-warn" />
                            <span className="text-[9px] text-[color:var(--axi-text-dim)]">Break-even</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
