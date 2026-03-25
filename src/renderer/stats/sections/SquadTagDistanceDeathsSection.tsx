import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, X, Crosshair } from 'lucide-react';
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
        closeExpandedSection
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
            isCommander: event.isCommander,
            timeMs: event.timeIntoFightMs,
            index: idx,
        }));
    }, [selectedFight]);

    const hasAnyData = fights.some((f) => f.hasReplayData);

    return (
        <div
            className={`stats-share-exclude ${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex items-center gap-2 mb-3.5">
                <Crosshair className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Tag Distance Deaths</h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Tag Distance Deaths' : 'Expand Tag Distance Deaths'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            {!hasAnyData ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No replay data available — commander tag positions are required for this chart.</div>
            ) : (
                <>
                    {/* Summary stats */}
                    <div className="flex gap-4 mb-4">
                        <div className="px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-card-inner)] border border-[color:var(--border-subtle)]">
                            <div className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--text-secondary)]">Avg Distance</div>
                            <div className="text-sm font-mono text-[color:var(--text-primary)] mt-0.5">{formatWithCommas(overallAvg, 0)}</div>
                        </div>
                        <div className="px-3 py-2 rounded-[var(--radius-md)] bg-[var(--bg-card-inner)] border border-[color:var(--border-subtle)]">
                            <div className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--text-secondary)]">Total Deaths</div>
                            <div className="text-sm font-mono text-[color:var(--text-primary)] mt-0.5">{totalDeaths}</div>
                        </div>
                    </div>

                    {/* Summary bar chart */}
                    <div className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--text-secondary)]">Avg Death Distance from Tag</div>
                                <div className="text-[11px] text-[color:var(--text-secondary)] mt-1">
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
                                <span className="text-[9px] text-[color:var(--text-secondary)]">Win</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-sm bg-red-400" />
                                <span className="text-[9px] text-[color:var(--text-secondary)]">Loss</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-sm bg-gray-600" />
                                <span className="text-[9px] text-[color:var(--text-secondary)]">No data</span>
                            </div>
                        </div>
                    </div>

                    {/* Drilldown scatter chart */}
                    <div className={`mt-4 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-4 py-3 transition-all duration-300 ${
                        selectedFight ? 'opacity-100 translate-y-0' : 'opacity-90'
                    }`}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">
                                    {selectedFight ? `${selectedFight.fullLabel} — Death Positions` : 'Fight Details'}
                                </div>
                                {selectedFight ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[color:var(--text-secondary)]">
                                        <span>{selectedFight.eventCount} death{selectedFight.eventCount !== 1 ? 's' : ''}</span>
                                        <span>Avg: {formatWithCommas(selectedFight.avgDistance, 0)} from tag</span>
                                    </div>
                                ) : (
                                    <div className="text-xs text-[color:var(--text-secondary)] mt-1">Click a bar above to see individual death events for that fight.</div>
                                )}
                            </div>
                            {selectedFight && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedFightIndex(null)}
                                    className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
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
                                        {scatterData.filter((d) => d.isCommander).map((d) => (
                                            <ReferenceLine
                                                key={`cmd-${d.index}`}
                                                x={d.x}
                                                stroke="rgba(251,191,36,0.25)"
                                                strokeDasharray="4 4"
                                            />
                                        ))}
                                        <Tooltip
                                            content={({ payload }: any) => {
                                                const point = payload?.[0]?.payload;
                                                if (!point) return null;
                                                return (
                                                    <div style={{ backgroundColor: '#161c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '10px 12px', fontSize: '12px' }}>
                                                        <p style={{ margin: 0, color: point.isCommander ? '#fbbf24' : '#94a3b8' }}>{point.playerAccount}{point.isCommander ? ' ★' : ''}</p>
                                                        <p style={{ margin: '4px 0 0', color: '#e2e8f0' }}>{point.x}s — {formatWithCommas(point.rawDistance, 0)} from tag</p>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Scatter data={scatterData} fill={selectedFight.isWin === false ? '#f87171' : '#22c55e'}>
                                            {scatterData.map((entry) => (
                                                <Cell
                                                    key={`scatter-${entry.index}`}
                                                    fill={entry.isCommander ? '#fbbf24' : (selectedFight.isWin === false ? '#f87171' : '#22c55e')}
                                                    stroke={entry.isCommander ? '#ffffff' : 'none'}
                                                    strokeWidth={entry.isCommander ? 2 : 0}
                                                    r={entry.isCommander ? 6 : undefined}
                                                />
                                            ))}
                                        </Scatter>
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>
                        ) : selectedFight && scatterData.length === 0 ? (
                            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No death events in this fight.</div>
                        ) : null}
                    </div>
                </>
            )}
        </div>
    );
};
