import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Crosshair, Maximize2, X } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import type { TagDistanceDeathFightSummary } from '../computeTagDistanceDeaths';

type SquadTagDistanceDeathsSectionProps = {
    fights: TagDistanceDeathFightSummary[];
};

export const SquadTagDistanceDeathsSection = ({ fights }: SquadTagDistanceDeathsSectionProps) => {
    const {
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
        isSectionVisible,
        isFirstVisibleSection,
        sectionClass
    } = useStatsSharedContext();
    const sectionId = 'squad-tag-distance-deaths';
    const isExpanded = expandedSection === sectionId;
    const [selectedFightIndex, setSelectedFightIndex] = useState<number | null>(null);

    const DISTANCE_CAP = 1200;

    const summaryData = useMemo(() => {
        return fights.map((fight, idx) => ({
            index: idx,
            shortLabel: fight.shortLabel,
            fullLabel: fight.fullLabel,
            isWin: fight.isWin,
            avgDistance: fight.avgDistance,
            clampedAvgDistance: Math.min(fight.avgDistance, DISTANCE_CAP),
            eventCount: fight.eventCount,
            hasReplayData: fight.hasReplayData,
        }));
    }, [fights]);

    const totalDeaths = useMemo(() => fights.reduce((sum, f) => sum + f.eventCount, 0), [fights]);
    const overallAvg = useMemo(() => {
        if (totalDeaths === 0) return 0;
        const totalDist = fights.reduce((sum, f) => sum + f.events.reduce((s, e) => s + e.distanceFromTag, 0), 0);
        return Math.round(totalDist / totalDeaths);
    }, [fights, totalDeaths]);

    const selectedFight = selectedFightIndex !== null ? fights[selectedFightIndex] : null;

    const scatterData = useMemo(() => {
        if (!selectedFight) return [];
        return selectedFight.events.map((event, idx) => ({
            x: event.timeIntoFightSec,
            y: Math.min(event.distanceFromTag, DISTANCE_CAP),
            rawDistance: event.distanceFromTag,
            playerAccount: event.playerAccount,
            timeMs: event.timeIntoFightMs,
            index: idx,
        }));
    }, [selectedFight]);

    const hasAnyData = fights.some((f) => f.hasReplayData);

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
                    <Crosshair className="w-5 h-5 text-orange-300" />
                    Tag Distance Deaths
                </h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    aria-label={isExpanded ? 'Close Tag Distance Deaths' : 'Expand Tag Distance Deaths'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>

            {!hasAnyData ? (
                <div className="text-center text-gray-500 italic py-8">No replay data available — commander tag positions are required for this chart.</div>
            ) : (
                <>
                    {/* Summary stats */}
                    <div className="flex gap-4 mb-4">
                        <div className="px-3 py-2 rounded-lg bg-black/20 border border-white/5">
                            <div className="text-[10px] uppercase tracking-[0.25em] text-gray-500">Avg Distance</div>
                            <div className="text-sm font-mono text-gray-200 mt-0.5">{formatWithCommas(overallAvg, 0)}</div>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-black/20 border border-white/5">
                            <div className="text-[10px] uppercase tracking-[0.25em] text-gray-500">Total Deaths</div>
                            <div className="text-sm font-mono text-gray-200 mt-0.5">{totalDeaths}</div>
                        </div>
                    </div>

                    {/* Summary bar chart */}
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">Avg Death Distance from Tag</div>
                                <div className="text-[11px] text-gray-500 mt-1">
                                    Average distance from commander tag at moment of death. Click a bar to see individual deaths.
                                </div>
                            </div>
                        </div>
                        <div className={isExpanded ? 'h-[300px]' : 'h-[220px]'}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={summaryData}
                                    onClick={(state: any) => {
                                        const idx = Number(state?.activeTooltipIndex);
                                        if (!Number.isFinite(idx)) return;
                                        setSelectedFightIndex(selectedFightIndex === idx ? null : idx);
                                    }}
                                >
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="shortLabel" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                    <YAxis
                                        tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                        domain={[0, DISTANCE_CAP]}
                                        tickFormatter={(value: number) => value >= DISTANCE_CAP ? `${DISTANCE_CAP}+` : String(value)}
                                    />
                                    <ReferenceLine
                                        y={600}
                                        stroke="rgba(251,191,36,0.5)"
                                        strokeDasharray="6 4"
                                        label={{ value: '600', position: 'right', fill: '#fbbf24', fontSize: 9 }}
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                        content={({ payload }: any) => {
                                            const point = payload?.[0]?.payload;
                                            if (!point) return null;
                                            const extra = !point.hasReplayData ? ' (no data)' : ` (${point.eventCount} deaths)`;
                                            return (
                                                <div style={{ backgroundColor: '#161c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '10px 12px', fontSize: '12px' }}>
                                                    <p style={{ margin: 0, color: '#94a3b8' }}>
                                                        {point.fullLabel}{' '}
                                                        {point.isWin === true && <span style={{ color: '#22c55e', fontWeight: 700 }}>W</span>}
                                                        {point.isWin === false && <span style={{ color: '#ef4444', fontWeight: 700 }}>L</span>}
                                                    </p>
                                                    <p style={{ margin: '4px 0 0', color: '#e2e8f0' }}>
                                                        Avg Distance : {formatWithCommas(point.avgDistance, 0)}{extra}
                                                    </p>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar dataKey="clampedAvgDistance" name="Avg Distance" style={{ cursor: 'pointer' }}>
                                        {summaryData.map((entry, idx) => (
                                            <Cell
                                                key={`bar-${idx}`}
                                                fill={!entry.hasReplayData ? '#374151' : entry.isWin === false ? '#f87171' : '#22c55e'}
                                                stroke={selectedFightIndex === idx ? 'rgba(251,191,36,0.8)' : 'none'}
                                                strokeWidth={selectedFightIndex === idx ? 2 : 0}
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
                                <div className="w-2.5 h-2.5 rounded-sm bg-gray-600" />
                                <span className="text-[9px] text-gray-400">No data</span>
                            </div>
                        </div>
                    </div>

                    {/* Drilldown scatter chart */}
                    <div className={`mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 transition-all duration-300 ${
                        selectedFight ? 'opacity-100 translate-y-0' : 'opacity-90'
                    }`}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">
                                    {selectedFight ? `${selectedFight.fullLabel} — Death Positions` : 'Fight Details'}
                                </div>
                                {selectedFight ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                        <span>{selectedFight.eventCount} death{selectedFight.eventCount !== 1 ? 's' : ''}</span>
                                        <span>Avg: {formatWithCommas(selectedFight.avgDistance, 0)} from tag</span>
                                    </div>
                                ) : (
                                    <div className="text-xs text-gray-500 mt-1">Click a bar above to see individual death events for that fight.</div>
                                )}
                            </div>
                            {selectedFight && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedFightIndex(null)}
                                    className="text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-gray-200"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        {selectedFight && scatterData.length > 0 ? (
                            <div className={isExpanded ? 'h-[300px]' : 'h-[220px]'}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart>
                                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                        <XAxis
                                            type="number"
                                            dataKey="x"
                                            name="Time"
                                            unit="s"
                                            tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                        />
                                        <YAxis
                                            type="number"
                                            dataKey="y"
                                            name="Distance"
                                            unit=""
                                            tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                            domain={[0, DISTANCE_CAP]}
                                            tickFormatter={(value: number) => value >= DISTANCE_CAP ? `${DISTANCE_CAP}+` : String(value)}
                                        />
                                        <ReferenceLine
                                            y={600}
                                            stroke="rgba(251,191,36,0.5)"
                                            strokeDasharray="6 4"
                                        />
                                        <Tooltip
                                            content={({ payload }: any) => {
                                                const point = payload?.[0]?.payload;
                                                if (!point) return null;
                                                return (
                                                    <div style={{ backgroundColor: '#161c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '10px 12px', fontSize: '12px' }}>
                                                        <p style={{ margin: 0, color: '#94a3b8' }}>{point.playerAccount}</p>
                                                        <p style={{ margin: '4px 0 0', color: '#e2e8f0' }}>{point.x}s — {formatWithCommas(point.rawDistance, 0)} from tag</p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Scatter data={scatterData} fill={selectedFight.isWin === false ? '#f87171' : '#22c55e'}>
                                            {scatterData.map((entry) => (
                                                <Cell
                                                    key={`scatter-${entry.index}`}
                                                    fill={selectedFight.isWin === false ? '#f87171' : '#22c55e'}
                                                />
                                            ))}
                                        </Scatter>
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>
                        ) : selectedFight && scatterData.length === 0 ? (
                            <div className="text-center text-gray-500 italic py-6 text-xs">No death events in this fight.</div>
                        ) : null}
                    </div>
                </>
            )}
        </div>
    );
};
