import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpDown, Maximize2, X } from 'lucide-react';
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
        closeExpandedSection,
        isSectionVisible,
        isFirstVisibleSection,
        sectionClass
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
            id={sectionId}
            data-section-visible={isSectionVisible(sectionId)}
            data-section-first={isFirstVisibleSection(sectionId)}
            className={sectionClass(sectionId, `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
                isExpanded
                    ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                        expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                    }`
                    : ''
            }`)}
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <ArrowUpDown className="w-5 h-5 text-orange-400" />
                    Damage Comparison
                </h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    aria-label={isExpanded ? 'Close Damage Comparison' : 'Expand Damage Comparison'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>

            {chartData.length === 0 ? (
                <div className="text-center text-gray-500 italic py-8">No fight data available</div>
            ) : (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Outgoing vs Incoming Damage</div>
                            <div className="text-[11px] text-gray-500 mt-1">
                                Green bars (up) are squad outgoing damage. Red bars (down) are incoming damage.
                            </div>
                        </div>
                        <div className="text-[11px] text-gray-500 shrink-0">
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
                                    contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                    formatter={(value: any, name: string | undefined) => {
                                        const absVal = formatWithCommas(Math.abs(Number(value || 0)), 0);
                                        return [absVal, name ?? ''];
                                    }}
                                    labelFormatter={(_, payload?: readonly any[]) => {
                                        const point = payload?.[0]?.payload;
                                        if (!point) return '';
                                        const winLabel = point.isWin === true ? ' ✓' : point.isWin === false ? ' ✗' : '';
                                        return `${point.fullLabel}${winLabel}`;
                                    }}
                                />
                                <Bar dataKey="outgoing" name="Outgoing Damage" stackId="stack">
                                    {chartData.map((entry) => (
                                        <Cell
                                            key={entry.fightId}
                                            fill={entry.isWin === false ? '#4ade80' : '#22c55e'}
                                        />
                                    ))}
                                </Bar>
                                <Bar dataKey="incoming" name="Incoming Damage" stackId="stack">
                                    {chartData.map((entry) => (
                                        <Cell
                                            key={entry.fightId}
                                            fill={entry.isWin === false ? '#f87171' : '#ef4444'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                            <span className="text-[9px] text-gray-400">Outgoing</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
                            <span className="text-[9px] text-gray-400">Incoming</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
