import { useMemo } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { ArrowUpDown } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { expandedPaneProps } from './expandedPane';

type DamageComparisonPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    outgoing: number;
    incoming: number;
};

export const SquadDamageComparisonSection = () => {
    const {
        stats,
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection
    } = useStatsSharedContext();
    const sectionId = 'squad-damage-comparison';
    const isExpanded = expandedSection === sectionId;

    const fights = Array.isArray(stats?.fightBreakdown) ? stats.fightBreakdown : [];

    const chartData: DamageComparisonPoint[] = useMemo(() => {
        return fights.map((fight: any, idx: number) => ({
            index: idx,
            fightId: fight.id || `fight-${idx}`,
            shortLabel: `F${idx + 1}`,
            fullLabel: `${fight.mapName || fight.label || 'Unknown'} • ${fight.duration || '--:--'}`,
            isWin: fight.isWin,
            outgoing: Number(fight.totalOutgoingDamage || 0),
            incoming: -Math.abs(Number(fight.totalIncomingDamage || 0)),
        }));
    }, [fights]);

    const yMax = useMemo(() => {
        if (chartData.length === 0) return 1;
        return Math.max(1, ...chartData.map((d) => Math.max(Math.abs(d.outgoing), Math.abs(d.incoming))));
    }, [chartData]);

    return (
        <div {...expandedPaneProps(isExpanded, expandedSectionClosing)}>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <ArrowUpDown className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Damage Comparison</h3>
                <SectionExpandButton
                    expanded={isExpanded}
                    onToggle={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    section="Damage Comparison"
                />
            </div>

            {chartData.length === 0 ? (
                <div className="axi-empty">No fight data available</div>
            ) : (
                <div className="rounded-[var(--axi-radius-sm)] p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--axi-text-dim)]">Outgoing vs Incoming Damage</div>
                            <div className="text-[11px] text-[color:var(--axi-text-dim)] mt-1">
                                Green bars (up) are squad outgoing damage. Red bars (down) are incoming damage.
                            </div>
                        </div>
                        <div className="text-[11px] text-[color:var(--axi-text-dim)] shrink-0">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className={isExpanded ? 'h-[400px]' : 'h-[300px]'}>
                        <ChartContainer width="100%" height="100%">
                            <BarChart data={chartData} stackOffset="sign">
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="shortLabel"
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                />
                                <YAxis
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                    domain={[-yMax, yMax]}
                                    tickFormatter={(value: number) => formatWithCommas(Math.abs(value), 0)}
                                />
                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
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
                                                    <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: 'var(--axi-ok)', borderRadius: 2, marginRight: 6 }} />
                                                    Outgoing Damage : {formatWithCommas(Math.abs(point.outgoing), 0)}
                                                </p>
                                                <p style={{ margin: '2px 0 0', color: 'var(--axi-text)' }}>
                                                    <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: 'var(--axi-danger)', borderRadius: 2, marginRight: 6 }} />
                                                    Incoming Damage : {formatWithCommas(Math.abs(point.incoming), 0)}
                                                </p>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="outgoing" name="Outgoing Damage" stackId="stack">
                                    {chartData.map((entry) => (
                                        <Cell
                                            key={entry.fightId}
                                            fill="#22c55e"
                                        />
                                    ))}
                                </Bar>
                                <Bar dataKey="incoming" name="Incoming Damage" stackId="stack">
                                    {chartData.map((entry) => (
                                        <Cell
                                            key={entry.fightId}
                                            fill="#ef4444"
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <span className="axi-diamond axi-diamond--ok" />
                            <span className="text-[9px] text-[color:var(--axi-text-dim)]">Outgoing</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="axi-diamond axi-diamond--danger" />
                            <span className="text-[9px] text-[color:var(--axi-text-dim)]">Incoming</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
