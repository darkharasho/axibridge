import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, X, ArrowUpDown } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

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
        <div
            className={`stats-share-exclude ${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex items-center gap-2 mb-3.5">
                <ArrowUpDown className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Damage Comparison</h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Damage Comparison' : 'Expand Damage Comparison'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            {chartData.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No fight data available</div>
            ) : (
                <div className="rounded-[var(--radius-md)] p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--text-secondary)]">Outgoing vs Incoming Damage</div>
                            <div className="text-[11px] text-[color:var(--text-secondary)] mt-1">
                                Green bars (up) are squad outgoing damage. Red bars (down) are incoming damage.
                            </div>
                        </div>
                        <div className="text-[11px] text-[color:var(--text-secondary)] shrink-0">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className={isExpanded ? 'h-[400px]' : 'h-[300px]'}>
                        <ResponsiveContainer width="100%" height="100%">
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
                                            <div style={{ backgroundColor: '#161c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '10px 12px', fontSize: '12px' }}>
                                                <p style={{ margin: 0, color: '#94a3b8' }}>
                                                    {point.fullLabel}{' '}
                                                    {point.isWin === true && <span style={{ color: '#22c55e', fontWeight: 700 }}>W</span>}
                                                    {point.isWin === false && <span style={{ color: '#ef4444', fontWeight: 700 }}>L</span>}
                                                </p>
                                                <p style={{ margin: '4px 0 0', color: '#e2e8f0' }}>
                                                    <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: '#22c55e', borderRadius: 2, marginRight: 6 }} />
                                                    Outgoing Damage : {formatWithCommas(Math.abs(point.outgoing), 0)}
                                                </p>
                                                <p style={{ margin: '2px 0 0', color: '#e2e8f0' }}>
                                                    <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: '#ef4444', borderRadius: 2, marginRight: 6 }} />
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
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                            <span className="text-[9px] text-[color:var(--text-secondary)]">Outgoing</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
                            <span className="text-[9px] text-[color:var(--text-secondary)]">Incoming</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
