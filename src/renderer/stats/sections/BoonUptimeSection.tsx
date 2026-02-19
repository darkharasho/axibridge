import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, X } from 'lucide-react';
import { Gw2BoonIcon } from '../../ui/Gw2BoonIcon';
import { Gw2FuryIcon } from '../../ui/Gw2FuryIcon';
import { getProfessionColor } from '../../../shared/professionUtils';

type BoonUptimeBoon = {
    id: string;
    name: string;
    icon?: string;
};

type BoonUptimePlayer = {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    total: number;
    peak: number;
    uptimePercent?: number;
};

type BoonUptimeFightPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    durationMs: number;
    total: number;
    peak: number;
    uptimePercent: number;
    maxUptimePercent: number;
    maxTotal: number;
};

type BoonUptimeSectionProps = {
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    boonSearch: string;
    setBoonSearch: (value: string) => void;
    boons: BoonUptimeBoon[];
    activeBoonId: string | null;
    setActiveBoonId: (value: string | null) => void;
    playerFilter: string;
    setPlayerFilter: (value: string) => void;
    players: BoonUptimePlayer[];
    selectedPlayerKey: string | null;
    setSelectedPlayerKey: (value: string | null) => void;
    selectedPlayer: BoonUptimePlayer | null;
    chartData: BoonUptimeFightPoint[];
    chartMaxY: number;
    selectedFightIndex: number | null;
    setSelectedFightIndex: (value: number | null) => void;
    drilldownTitle: string;
    drilldownData: Array<{ label: string; value: number; maxValue?: number }>;
    overallUptimePercent: number | null;
    showStackCapLine?: boolean;
    formatWithCommas: (value: number, decimals: number) => string;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
};

export const BoonUptimeSection = ({
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
    overallUptimePercent,
    showStackCapLine = false,
    formatWithCommas,
    renderProfessionIcon
}: BoonUptimeSectionProps) => {
    const sectionId = 'boon-uptime';
    const isExpanded = expandedSection === sectionId;
    const selectedLineColor = selectedPlayer?.profession && selectedPlayer.profession !== 'All'
        ? (getProfessionColor(selectedPlayer.profession) || '#f59e0b')
        : '#f59e0b';
    const sanitizeWvwLabel = (value: string) => String(value || '')
        .replace(/^Detailed\s*WvW\s*-\s*/i, '')
        .replace(/^World\s*vs\s*World\s*-\s*/i, '')
        .replace(/^WvW\s*-\s*/i, '')
        .trim();
    const topFight = chartData.reduce((best, entry) => {
        if (!best || entry.peak > best.peak) return entry;
        return best;
    }, null as BoonUptimeFightPoint | null);
    const mainChartMaxY = showStackCapLine
        ? Math.ceil(Math.max(1, chartMaxY) + 3)
        : Math.max(1, chartMaxY);
    const drilldownMaxY = Math.max(
        1,
        ...drilldownData.map((entry) => Math.max(0, Number(entry?.value || 0))),
        ...(showStackCapLine ? [25] : [])
    );
    const drilldownChartMaxY = showStackCapLine
        ? Math.ceil(Math.max(1, drilldownMaxY) + 3)
        : Math.max(1, drilldownMaxY);
    const mainSeriesKey = showStackCapLine ? 'average' : 'uptimePercent';
    const mainSeriesLabel = showStackCapLine ? 'Per Fight Average Stacks' : 'Per Fight Uptime %';
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
                        <Gw2FuryIcon className="w-5 h-5 text-amber-300" />
                        Boon Uptime
                    </h3>
                    <p className="text-xs text-gray-400">
                        Select a boon, then a player to chart per-fight peak stacks and drill into 5-second fight buckets.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className={`p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors ${isExpanded ? 'absolute top-2 right-2 md:static' : ''}`}
                    aria-label={isExpanded ? 'Close Boon Uptime' : 'Expand Boon Uptime'}
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
                        className="w-full lg:w-72 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 focus:border-amber-400 focus:outline-none"
                    />
                    <div className="text-[11px] text-gray-500">
                        {boons.length} {boons.length === 1 ? 'boon' : 'boons'}
                    </div>
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
                                            ? 'border-amber-300/60 bg-amber-500/15 text-amber-100'
                                            : 'border-white/10 bg-white/[0.03] text-gray-300 hover:border-white/20 hover:text-white'
                                            }`}
                                    >
                                        {boon.icon ? (
                                            <img src={boon.icon} alt="" className="h-3.5 w-3.5 object-contain" loading="lazy" />
                                        ) : (
                                            <Gw2BoonIcon className="h-3.5 w-3.5 text-amber-300" />
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
                        Players
                    </div>
                    <input
                        type="search"
                        value={playerFilter}
                        onChange={(event) => setPlayerFilter(event.target.value)}
                        placeholder="Search player or account"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 focus:border-amber-400 focus:outline-none"
                    />
                    <div className="spike-player-list-container flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/20">
                        {players.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-gray-500 italic">
                                Select a boon to view player uptime.
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
                                                ? 'border-amber-300/60 bg-amber-400/10 text-white'
                                                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {player.key === '__all__'
                                                            ? <Gw2FuryIcon className="w-3.5 h-3.5 text-amber-300" />
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
                                                <div className="text-xs font-mono text-amber-200 shrink-0">
                                                    {formatWithCommas(Number(player.uptimePercent || 0), 1)}%
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
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                            {mainSeriesLabel}
                        </div>
                        <div className="text-[11px] text-gray-500">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 flex-1 min-h-0">
                        {!selectedPlayer || chartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-gray-500">
                                Select one player to view boon uptime by fight.
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
                                        domain={[0, mainChartMaxY]}
                                        tickFormatter={(value: number) => showStackCapLine ? formatWithCommas(value, 0) : `${formatWithCommas(value, 0)}%`}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any, name: any) => [
                                            showStackCapLine
                                                ? formatWithCommas(Number(value || 0), 1)
                                                : `${formatWithCommas(Number(value || 0), 1)}%`,
                                            String(name || '')
                                        ]}
                                        labelFormatter={(_, payload?: readonly any[]) => {
                                            const point = payload?.[0]?.payload;
                                            return sanitizeWvwLabel(String(point?.fullLabel || ''));
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey={mainSeriesKey}
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
                                    {showStackCapLine && (
                                        <ReferenceLine
                                            y={25}
                                            stroke="rgba(251,191,36,0.9)"
                                            strokeDasharray="6 4"
                                            ifOverflow="extendDomain"
                                            label={{ value: '25', position: 'right', fill: '#fbbf24', fontSize: 10 }}
                                        />
                                    )}
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {selectedPlayer && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 grid gap-3 md:grid-cols-3">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">Selected Player</div>
                        <div className="mt-1 text-sm font-semibold text-white flex items-center gap-2 min-w-0">
                            {selectedPlayer.key === '__all__'
                                ? <Gw2FuryIcon className="w-4 h-4 text-amber-300" />
                                : renderProfessionIcon(selectedPlayer.profession, selectedPlayer.professionList, 'w-4 h-4')}
                            <span className="truncate">{selectedPlayer.displayName}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">Overall Uptime</div>
                        <div className="mt-1 text-lg font-black text-amber-200 font-mono">
                            {overallUptimePercent === null
                                ? '--'
                                : `${formatWithCommas(Number(overallUptimePercent || 0), 1)}%`}
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
                                    <YAxis tick={{ fill: '#e2e8f0', fontSize: 10 }} domain={[0, drilldownChartMaxY]} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any, name: any) => [formatWithCommas(Number(value || 0), 0), String(name || '')]}
                                        labelFormatter={(value: any) => String(value || '')}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        name="Selected"
                                        stroke={selectedLineColor}
                                        strokeWidth={2.5}
                                        dot={{ r: 2 }}
                                        activeDot={{ r: 4 }}
                                    />
                                    {showStackCapLine && (
                                        <ReferenceLine
                                            y={25}
                                            stroke="rgba(251,191,36,0.9)"
                                            strokeDasharray="6 4"
                                            ifOverflow="extendDomain"
                                            label={{ value: '25', position: 'right', fill: '#fbbf24', fontSize: 10 }}
                                        />
                                    )}
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
