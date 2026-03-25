import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, X } from 'lucide-react';
import { Gw2BoonIcon } from '../../ui/Gw2BoonIcon';
import { Gw2AegisIcon } from '../../ui/Gw2AegisIcon';
import { getProfessionColor } from '../../../shared/professionUtils';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';

type BoonTimelineBoon = {
    id: string;
    name: string;
    icon?: string;
    stacking?: boolean;
};

type BoonTimelinePlayer = {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    total: number;
};

type BoonTimelineFightPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    total: number;
    maxTotal: number;
};

type BoonTimelineSectionProps = {
    boonSearch: string;
    setBoonSearch: (value: string) => void;
    boons: BoonTimelineBoon[];
    activeBoonId: string | null;
    setActiveBoonId: (value: string | null) => void;
    timelineScope: 'selfBuffs' | 'groupBuffs' | 'squadBuffs' | 'totalBuffs';
    setTimelineScope: (value: 'selfBuffs' | 'groupBuffs' | 'squadBuffs' | 'totalBuffs') => void;
    playerFilter: string;
    setPlayerFilter: (value: string) => void;
    players: BoonTimelinePlayer[];
    selectedPlayerKey: string | null;
    setSelectedPlayerKey: (value: string | null) => void;
    selectedPlayer: BoonTimelinePlayer | null;
    chartData: BoonTimelineFightPoint[];
    chartMaxY: number;
    selectedFightIndex: number | null;
    setSelectedFightIndex: (value: number | null) => void;
    drilldownTitle: string;
    drilldownData: Array<{
        label: string;
        value: number;
        incomingDamage?: number;
        incomingIntensity?: number;
    }>;
    showIncomingHeatmap: boolean;
    setShowIncomingHeatmap: (value: boolean) => void;
};

export const BoonTimelineSection = ({
    boonSearch,
    setBoonSearch,
    boons,
    activeBoonId,
    setActiveBoonId,
    timelineScope,
    setTimelineScope,
    playerFilter,
    setPlayerFilter,
    players,
    selectedPlayerKey,
    setSelectedPlayerKey,
    selectedPlayer,
    chartData,
    chartMaxY,
    selectedFightIndex,
    setSelectedFightIndex,
    drilldownTitle,
    drilldownData,
    showIncomingHeatmap,
    setShowIncomingHeatmap
}: BoonTimelineSectionProps) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, formatWithCommas, renderProfessionIcon } = useStatsSharedContext();
    const sectionId = 'boon-timeline';
    const isExpanded = expandedSection === sectionId;
    const selectedLineColor = selectedPlayer?.profession && selectedPlayer.profession !== 'All'
        ? (getProfessionColor(selectedPlayer.profession) || '#22d3ee')
        : '#22d3ee';
    const scopeLabel = timelineScope === 'selfBuffs'
        ? 'Self'
        : timelineScope === 'groupBuffs'
            ? 'Group'
            : timelineScope === 'squadBuffs'
                ? 'Squad'
                : 'All';
    const sanitizeWvwLabel = (value: string) => String(value || '')
        .replace(/^Detailed\s*WvW\s*-\s*/i, '')
        .replace(/^World\s*vs\s*World\s*-\s*/i, '')
        .replace(/^WvW\s*-\s*/i, '')
        .trim();
    const topFight = chartData.reduce((best, entry) => {
        if (!best || entry.total > best.total) return entry;
        return best;
    }, null as BoonTimelineFightPoint | null);
    const selectedFight = selectedFightIndex === null
        ? null
        : chartData.find((entry) => entry.index === selectedFightIndex) || null;
    const infoFight = selectedFight || topFight;
    const hasIncomingHeatData = drilldownData.some((entry) => Number(entry?.incomingDamage || 0) > 0);
    const drilldownHeatData = drilldownData.map((entry) => ({
        ...entry,
        incomingHeatBand: 1
    }));
    const formatFightTimestamp = (timestampMs: number) => {
        if (!Number.isFinite(timestampMs) || timestampMs <= 0) return '';
        try {
            return new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            }).format(new Date(timestampMs));
        } catch {
            return '';
        }
    };

    return (
        <div
            className={`stats-share-exclude ${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex items-center gap-2 mb-3.5">
                <span className="flex shrink-0" style={{ color: 'var(--section-boon)' }}><Gw2AegisIcon className="w-4 h-4" /></span>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Boon Timeline</h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Boon Timeline' : 'Expand Boon Timeline'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            <div className="mb-4 rounded-[var(--radius-md)] p-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <input
                        type="search"
                        value={boonSearch}
                        onChange={(event) => setBoonSearch(event.target.value)}
                        placeholder="Search boon"
                        className="w-full lg:w-72 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-3 py-2 text-sm text-[color:var(--text-primary)] focus:border-cyan-400 focus:outline-none"
                    />
                    <div className="text-[11px] text-[color:var(--text-secondary)]">
                        {boons.length} {boons.length === 1 ? 'boon' : 'boons'}
                    </div>
                </div>
                <div className="mt-2">
                    <PillToggleGroup
                        value={timelineScope}
                        onChange={(value) => setTimelineScope(value as 'selfBuffs' | 'groupBuffs' | 'squadBuffs' | 'totalBuffs')}
                        options={[
                            { value: 'selfBuffs', label: 'Self' },
                            { value: 'squadBuffs', label: 'Squad' },
                            { value: 'groupBuffs', label: 'Group' },
                            { value: 'totalBuffs', label: 'All' }
                        ]}
                        activeClassName="bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
                        inactiveClassName="border border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                    />
                </div>
                <div className="mt-2 max-h-28 overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--border-default)] p-1.5">
                    {boons.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[color:var(--text-muted)] italic">No boons match this filter.</div>
                    ) : (
                        <div className="flex flex-wrap gap-1.5">
                            {boons.map((boon) => {
                                const isActive = activeBoonId === boon.id;
                                return (
                                    <button
                                        key={boon.id}
                                        type="button"
                                        onClick={() => setActiveBoonId(boon.id)}
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${isActive
                                            ? 'border-cyan-300/60 bg-cyan-500/15 text-cyan-100'
                                            : 'border-[color:var(--border-default)] bg-white/[0.03] text-[color:var(--text-secondary)] hover:border-[color:var(--border-hover)] hover:text-[color:var(--text-primary)]'
                                            }`}
                                    >
                                        {boon.icon ? (
                                            <img src={boon.icon} alt="" className="h-3.5 w-3.5 object-contain" loading="lazy" />
                                        ) : (
                                            <Gw2BoonIcon className="h-3.5 w-3.5 text-cyan-300" />
                                        )}
                                        <span>{boon.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 items-stretch">
                <div className="space-y-2 flex flex-col h-[320px]">
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--text-secondary)]">
                        Boon Sources
                    </div>
                    <input
                        type="search"
                        value={playerFilter}
                        onChange={(event) => setPlayerFilter(event.target.value)}
                        placeholder="Search player or account"
                        className="w-full rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-3 py-2 text-sm text-[color:var(--text-primary)] focus:border-cyan-400 focus:outline-none"
                    />
                    <div className="spike-player-list-container flex-1 min-h-0 overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--border-default)]">
                        {players.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-[color:var(--text-muted)] italic">
                                Select a boon to view player generation.
                            </div>
                        ) : (
                            <div className="p-1.5 space-y-1">
                                {players.map((player) => {
                                    const isSelected = selectedPlayerKey === player.key;
                                    return (
                                        <button
                                            key={player.key}
                                            type="button"
                                            onClick={() => setSelectedPlayerKey(player.key)}
                                            className={`spike-player-list-item w-full rounded-md border px-2.5 py-1.5 text-left transition-colors ${isSelected
                                                ? 'border-cyan-300/60 bg-cyan-400/10 text-white'
                                                : 'border-[color:var(--border-default)] bg-white/[0.02] hover:border-[color:var(--border-hover)] hover:bg-white/[0.05]'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {player.key === '__all__'
                                                            ? <Gw2BoonIcon className="w-3.5 h-3.5 text-cyan-300" />
                                                            : renderProfessionIcon(player.profession, player.professionList, 'w-3.5 h-3.5')}
                                                        <div className="text-sm font-semibold truncate text-white">{player.displayName}</div>
                                                        {player.profession !== 'All' && (
                                                            <span className="text-[9px] uppercase tracking-[0.14em] text-[color:var(--text-secondary)] shrink-0">
                                                                {player.profession}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-[color:var(--text-secondary)] truncate">
                                                        {player.logs} {player.logs === 1 ? 'fight' : 'fights'}
                                                    </div>
                                                </div>
                                                <div className="text-xs font-mono text-cyan-200 shrink-0">
                                                    {formatWithCommas((player.total || 0) / 1000, 0)}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-2 flex flex-col h-[320px]">
                    <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--text-secondary)]">
                            Per Fight {scopeLabel} Generation
                        </div>
                        <div className="text-[11px] text-[color:var(--text-secondary)]">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className="rounded-[var(--radius-md)] p-4 flex-1 min-h-0">
                        {!selectedPlayer || chartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-[color:var(--text-muted)]">
                                Select one player to view boon generation by fight.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={chartData}
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
                                        domain={[0, Math.max(1, chartMaxY)]}
                                        tickFormatter={(value: number) => formatWithCommas(value / 1000, 0)}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any, name: any) => [formatWithCommas(Number(value || 0) / 1000, 0), String(name || '')]}
                                        labelFormatter={(_, payload?: readonly any[]) => {
                                            const point = payload?.[0]?.payload;
                                            return sanitizeWvwLabel(String(point?.fullLabel || ''));
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="total"
                                        name={selectedPlayer.displayName}
                                        stroke={selectedLineColor}
                                        strokeWidth={3}
                                        dot={(props: any) => {
                                            const idx = Number(props?.payload?.index);
                                            if (!Number.isFinite(idx)) return null;
                                            const isSelected = selectedFightIndex === idx;
                                            return (
                                                <g
                                                    style={{ cursor: 'pointer', pointerEvents: 'all' }}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setSelectedFightIndex(isSelected ? null : idx);
                                                    }}
                                                >
                                                    <circle cx={props.cx} cy={props.cy} r={10} fill="transparent" style={{ pointerEvents: 'all' }} />
                                                    <circle
                                                        cx={props.cx}
                                                        cy={props.cy}
                                                        r={isSelected ? 4 : 3}
                                                        fill={selectedLineColor}
                                                        stroke={isSelected ? 'rgba(251,191,36,0.95)' : 'rgba(15,23,42,0.9)'}
                                                        strokeWidth={isSelected ? 2 : 1}
                                                        style={{ pointerEvents: 'all' }}
                                                    />
                                                </g>
                                            );
                                        }}
                                        activeDot={{ r: 4 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="maxTotal"
                                        name="Fight Max"
                                        stroke="rgba(148,163,184,0.8)"
                                        strokeWidth={2}
                                        strokeDasharray="6 4"
                                        dot={false}
                                        activeDot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {selectedPlayer && (
                <div className="mt-4 px-4 py-3 grid gap-3 md:grid-cols-3">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">Selected Source</div>
                        <div className="mt-1 text-sm font-semibold text-white flex items-center gap-2 min-w-0">
                            {selectedPlayer.key === '__all__'
                                ? <Gw2BoonIcon className="w-4 h-4 text-cyan-300" />
                                : renderProfessionIcon(selectedPlayer.profession, selectedPlayer.professionList, 'w-4 h-4')}
                            <span className="truncate">{selectedPlayer.displayName}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">
                            {selectedFight ? 'Selected Fight Generation' : 'Peak Fight Generation'}
                        </div>
                        <div className="mt-1 text-lg font-black text-cyan-200 font-mono">
                            {formatWithCommas(Number(infoFight?.total || 0) / 1000, 0)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">
                            {selectedFight ? 'Selected Fight' : 'Peak Fight'}
                        </div>
                        <div className="mt-1 text-sm text-[color:var(--text-primary)] truncate">
                            {(() => {
                                const bestLabel = sanitizeWvwLabel(infoFight?.fullLabel || 'N/A');
                                const timeLabel = formatFightTimestamp(Number(infoFight?.timestamp || 0));
                                return timeLabel ? `${timeLabel} - ${bestLabel}` : bestLabel;
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {selectedPlayer && selectedFightIndex !== null && (
                <div className="mt-4 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">{drilldownTitle}</div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setShowIncomingHeatmap(!showIncomingHeatmap)}
                                className={`text-[10px] uppercase tracking-[0.16em] transition-colors ${
                                    showIncomingHeatmap
                                        ? 'text-red-200 hover:text-red-100'
                                        : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                                }`}
                                title="Toggle squad incoming damage intensity heatmap overlay"
                            >
                                Squad Damage Heatmap
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedFightIndex(null)}
                                className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                    <div className="h-[220px] relative">
                        {drilldownData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-[color:var(--text-muted)]">
                                No detailed data available for this fight.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={drilldownHeatData}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                    <YAxis tick={{ fill: '#e2e8f0', fontSize: 10 }} tickFormatter={(value: number) => formatWithCommas(value / 1000, 0)} />
                                    <YAxis yAxisId="incomingHeat" hide domain={[0, 1]} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any, name: any, item: any) => {
                                            const point = item?.payload || {};
                                            if (String(name || '') === 'Incoming Damage Heat') {
                                                return [formatWithCommas(Number(point?.incomingDamage || 0), 0), 'Squad Incoming Damage'];
                                            }
                                            return [formatWithCommas(Number(value || 0) / 1000, 0), 'Generation'];
                                        }}
                                        labelFormatter={(value: any) => String(value || '')}
                                    />
                                    {showIncomingHeatmap && hasIncomingHeatData && (
                                        <Bar
                                            yAxisId="incomingHeat"
                                            dataKey="incomingHeatBand"
                                            name="Incoming Damage Heat"
                                            barSize={24}
                                            fill="rgba(239,68,68,0.35)"
                                            stroke="none"
                                            isAnimationActive={false}
                                        >
                                            {drilldownData.map((entry, index) => {
                                                const intensity = Math.max(0, Math.min(1, Number(entry?.incomingIntensity || 0)));
                                                const alpha = 0.06 + (0.52 * intensity);
                                                return <Cell key={`incoming-heat-${index}`} fill={`rgba(239, 68, 68, ${alpha.toFixed(3)})`} />;
                                            })}
                                        </Bar>
                                    )}
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        name="Generation"
                                        stroke={selectedLineColor}
                                        strokeWidth={2.5}
                                        dot={{ r: 2 }}
                                        activeDot={{ r: 4 }}
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
