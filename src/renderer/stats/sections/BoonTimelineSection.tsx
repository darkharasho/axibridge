import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, X } from 'lucide-react';
import { Gw2BoonIcon } from '../../ui/Gw2BoonIcon';
import { getProfessionColor } from '../../../shared/professionUtils';
import { PillToggleGroup } from '../ui/PillToggleGroup';

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
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
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
    drilldownData: Array<{ label: string; value: number }>;
    formatWithCommas: (value: number, decimals: number) => string;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
};

export const BoonTimelineSection = ({
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
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
    formatWithCommas,
    renderProfessionIcon
}: BoonTimelineSectionProps) => {
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
            id={sectionId}
            data-section-visible={isSectionVisible(sectionId)}
            data-section-first={isFirstVisibleSection(sectionId)}
            className={sectionClass(sectionId, `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${isExpanded
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}`
                : 'overflow-hidden'
                }`)}
        >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4 relative">
                <div className={isExpanded ? 'pr-10 md:pr-0' : ''}>
                    <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                        <Gw2BoonIcon className="w-5 h-5 text-cyan-300" />
                        Boon Timeline
                    </h3>
                    <p className="text-xs text-gray-400">
                        Select a boon, then a player (or All) to chart generation totals by fight and 5-second buckets.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className={`p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors ${isExpanded ? 'absolute top-2 right-2 md:static' : ''}`}
                    aria-label={isExpanded ? 'Close Boon Timeline' : 'Expand Boon Timeline'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>

            <div className="mb-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <input
                        type="search"
                        value={boonSearch}
                        onChange={(event) => setBoonSearch(event.target.value)}
                        placeholder="Search boon"
                        className="w-full lg:w-72 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 focus:border-cyan-400 focus:outline-none"
                    />
                    <div className="text-[11px] text-gray-500">
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
                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                    />
                </div>
                <div className="mt-2 max-h-28 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-1.5">
                    {boons.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-500 italic">No boons match this filter.</div>
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
                                            : 'border-white/10 bg-white/[0.03] text-gray-300 hover:border-white/20 hover:text-white'
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
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                        Boon Sources
                    </div>
                    <input
                        type="search"
                        value={playerFilter}
                        onChange={(event) => setPlayerFilter(event.target.value)}
                        placeholder="Search player or account"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 focus:border-cyan-400 focus:outline-none"
                    />
                    <div className="spike-player-list-container flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/20">
                        {players.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-gray-500 italic">
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
                                                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
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
                                                            <span className="text-[9px] uppercase tracking-[0.14em] text-gray-400 shrink-0">
                                                                {player.profession}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 truncate">
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
                        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                            Per Fight {scopeLabel} Generation
                        </div>
                        <div className="text-[11px] text-gray-500">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 flex-1 min-h-0">
                        {!selectedPlayer || chartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-gray-500">
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
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 grid gap-3 md:grid-cols-3">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">Selected Source</div>
                        <div className="mt-1 text-sm font-semibold text-white flex items-center gap-2 min-w-0">
                            {selectedPlayer.key === '__all__'
                                ? <Gw2BoonIcon className="w-4 h-4 text-cyan-300" />
                                : renderProfessionIcon(selectedPlayer.profession, selectedPlayer.professionList, 'w-4 h-4')}
                            <span className="truncate">{selectedPlayer.displayName}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">Peak Fight Generation</div>
                        <div className="mt-1 text-lg font-black text-cyan-200 font-mono">
                            {formatWithCommas(Number(topFight?.total || 0) / 1000, 0)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">Peak Fight</div>
                        <div className="mt-1 text-sm text-gray-200 truncate">
                            {(() => {
                                const bestLabel = sanitizeWvwLabel(topFight?.fullLabel || 'N/A');
                                const timeLabel = formatFightTimestamp(Number(topFight?.timestamp || 0));
                                return timeLabel ? `${timeLabel} - ${bestLabel}` : bestLabel;
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {selectedPlayer && selectedFightIndex !== null && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">{drilldownTitle}</div>
                        <button
                            type="button"
                            onClick={() => setSelectedFightIndex(null)}
                            className="text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-gray-200"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="h-[220px] relative">
                        {drilldownData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-gray-500">
                                No detailed data available for this fight.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={drilldownData}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                    <YAxis tick={{ fill: '#e2e8f0', fontSize: 10 }} tickFormatter={(value: number) => formatWithCommas(value / 1000, 0)} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any) => [formatWithCommas(Number(value || 0) / 1000, 0), 'Generation']}
                                        labelFormatter={(value: any) => String(value || '')}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        name="Generation"
                                        stroke={selectedLineColor}
                                        strokeWidth={2.5}
                                        dot={{ r: 2 }}
                                        activeDot={{ r: 4 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
