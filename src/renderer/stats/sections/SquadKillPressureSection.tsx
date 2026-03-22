import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Target, Maximize2, X } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

type KillPressurePoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    kdr: number;
    enemyDeaths: number;
    squadDeaths: number;
};

export const SquadKillPressureSection = () => {
    const {
        stats,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
        isSectionVisible,
        isFirstVisibleSection,
        sectionClass
    } = useStatsSharedContext();
    const sectionId = 'squad-kill-pressure';
    const isExpanded = expandedSection === sectionId;

    const fights = Array.isArray(stats?.fightBreakdown) ? stats.fightBreakdown : [];

    const chartData: KillPressurePoint[] = useMemo(() => {
        return fights.map((fight: any, idx: number) => {
            const enemyDeaths = Number(fight.enemyDeaths || 0);
            const squadDeaths = Number(fight.alliesDead || 0);
            const kdr = squadDeaths > 0 ? enemyDeaths / squadDeaths : enemyDeaths;
            return {
                index: idx,
                fightId: fight.id || `fight-${idx}`,
                shortLabel: `F${idx + 1}`,
                fullLabel: `${fight.mapName || fight.label || 'Unknown'} • ${fight.duration || '--:--'}`,
                isWin: fight.isWin,
                kdr: Math.round(kdr * 100) / 100,
                enemyDeaths,
                squadDeaths,
            };
        });
    }, [fights]);

    const yMax = useMemo(() => {
        if (chartData.length === 0) return 5;
        return Math.max(5, ...chartData.map((d) => d.kdr));
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
                    <Target className="w-5 h-5 text-violet-400" />
                    Kill Pressure
                </h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    aria-label={isExpanded ? 'Close Kill Pressure' : 'Expand Kill Pressure'}
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
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Kill/Death Ratio per Fight</div>
                            <div className="text-[11px] text-gray-500 mt-1">
                                KDR = enemy deaths ÷ squad deaths. Dashed line at 1.0 is break-even.
                            </div>
                        </div>
                        <div className="text-[11px] text-gray-500 shrink-0">
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
                                    domain={[0, yMax]}
                                    tickFormatter={(value: number) => value.toFixed(1)}
                                />
                                <ReferenceLine
                                    y={1}
                                    stroke="rgba(251,191,36,0.5)"
                                    strokeDasharray="6 4"
                                    label={{ value: 'KDR 1.0', position: 'right', fill: '#fbbf24', fontSize: 9 }}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                    contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                    formatter={(value: any, _name: any, props: any) => {
                                        const point = props?.payload;
                                        if (!point) return [String(value), 'KDR'];
                                        return [
                                            `${point.kdr.toFixed(2)} (${point.enemyDeaths} kills / ${point.squadDeaths} deaths)`,
                                            'KDR'
                                        ];
                                    }}
                                    labelFormatter={(_, payload?: readonly any[]) => {
                                        const point = payload?.[0]?.payload;
                                        if (!point) return '';
                                        const winLabel = point.isWin === true ? ' W' : point.isWin === false ? ' L' : '';
                                        return `${point.fullLabel}${winLabel}`;
                                    }}
                                />
                                <Bar dataKey="kdr" name="KDR">
                                    {chartData.map((entry) => (
                                        <Cell
                                            key={entry.fightId}
                                            fill={entry.isWin === false ? '#f87171' : '#22c55e'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                            <span className="text-[9px] text-gray-400">Win</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-red-400" />
                            <span className="text-[9px] text-gray-400">Loss</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-0 border-t border-dashed border-amber-400" />
                            <span className="text-[9px] text-gray-400">Break-even</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
