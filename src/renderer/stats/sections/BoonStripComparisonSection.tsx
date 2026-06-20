import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { Eraser, Maximize2, X } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

export type BoonStripMode = 'strips' | 'generation';

export type BoonStripPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    outgoing: number;
    incoming: number;
};

export const buildBoonStripChartData = (fights: any[], mode: BoonStripMode): BoonStripPoint[] => {
    const list = Array.isArray(fights) ? fights : [];
    return list.map((fight: any, idx: number) => {
        const outgoing = mode === 'generation'
            ? Number(fight?.totalBoonsGenerated || 0)
            : Number(fight?.totalOutgoingStrips || 0);
        return {
            index: idx,
            fightId: fight?.id || `fight-${idx}`,
            shortLabel: `F${idx + 1}`,
            fullLabel: `${fight?.mapName || fight?.label || 'Unknown'} • ${fight?.duration || '--:--'}`,
            isWin: typeof fight?.isWin === 'boolean' ? fight.isWin : null,
            outgoing,
            incoming: -Math.abs(Number(fight?.totalIncomingStrips || 0)),
        };
    });
};

const MODE_OPTIONS: Array<{ value: BoonStripMode; label: string }> = [
    { value: 'strips', label: 'Outgoing Strips' },
    { value: 'generation', label: 'Boon Generation' },
];

export const BoonStripComparisonSection = () => {
    const {
        stats,
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
    } = useStatsSharedContext();
    const sectionId = 'boon-strip-comparison';
    const isExpanded = expandedSection === sectionId;
    const [mode, setMode] = useState<BoonStripMode>('strips');

    const fights = Array.isArray(stats?.fightBreakdown) ? stats.fightBreakdown : [];
    const chartData = useMemo(() => buildBoonStripChartData(fights, mode), [fights, mode]);
    const yMax = useMemo(() => {
        if (chartData.length === 0) return 1;
        return Math.max(1, ...chartData.map((d) => Math.max(Math.abs(d.outgoing), Math.abs(d.incoming))));
    }, [chartData]);

    const outgoingLabel = mode === 'generation' ? 'Boons Generated' : 'Outgoing Strips';

    return (
        <div
            className={`${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Eraser className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Boon Strips</h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Boon Strips' : 'Expand Boon Strips'}
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
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--text-secondary)]">{outgoingLabel} vs Incoming Strips</div>
                            <div className="text-[11px] text-[color:var(--text-secondary)] mt-1">
                                Green bars (up) are squad {outgoingLabel.toLowerCase()}. Red bars (down) are boons stripped off the squad.
                            </div>
                        </div>
                        <PillToggleGroup
                            value={mode}
                            onChange={setMode}
                            options={MODE_OPTIONS}
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="border border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                        />
                    </div>
                    <div className={isExpanded ? 'h-[400px]' : 'h-[300px]'}>
                        <ChartContainer width="100%" height="100%">
                            <BarChart data={chartData} stackOffset="sign">
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis dataKey="shortLabel" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                <YAxis
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                    domain={[-yMax, yMax]}
                                    tickFormatter={(value: number) => formatWithCommas(Math.abs(value), 0)}
                                />
                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                    content={({ payload }: any) => {
                                        const point = payload?.[0]?.payload as BoonStripPoint | undefined;
                                        if (!point) return null;
                                        return (
                                            <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '10px 12px', fontSize: '12px' }}>
                                                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                                    {point.fullLabel}{' '}
                                                    {point.isWin === true && <span style={{ color: 'var(--status-success)', fontWeight: 700 }}>W</span>}
                                                    {point.isWin === false && <span style={{ color: 'var(--status-error)', fontWeight: 700 }}>L</span>}
                                                </p>
                                                <p style={{ margin: '4px 0 0', color: 'var(--text-primary)' }}>
                                                    <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: 'var(--status-success)', borderRadius: 2, marginRight: 6 }} />
                                                    {outgoingLabel} : {formatWithCommas(Math.abs(point.outgoing), 0)}
                                                </p>
                                                <p style={{ margin: '2px 0 0', color: 'var(--text-primary)' }}>
                                                    <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: 'var(--status-error)', borderRadius: 2, marginRight: 6 }} />
                                                    Incoming Strips : {formatWithCommas(Math.abs(point.incoming), 0)}
                                                </p>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="outgoing" name={outgoingLabel} stackId="stack">
                                    {chartData.map((entry) => (<Cell key={entry.fightId} fill="#22c55e" />))}
                                </Bar>
                                <Bar dataKey="incoming" name="Incoming Strips" stackId="stack">
                                    {chartData.map((entry) => (<Cell key={entry.fightId} fill="#ef4444" />))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                            <span className="text-[9px] text-[color:var(--text-secondary)]">{outgoingLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
                            <span className="text-[9px] text-[color:var(--text-secondary)]">Incoming Strips</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
