import { type ReactNode, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Maximize2, X, Users, User } from 'lucide-react';
import { getProfessionColor } from '../../../shared/professionUtils';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import type { StatsTocIcon } from '../hooks/useStatsNavigation';

export type FightMetricPlayer = {
    key: string;
    account: string;
    displayName: string;
    characterName: string;
    profession: string;
    professionList: string[];
    logs: number;
    value: number;
    peakFightLabel: string;
};

export type FightMetricPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    value: number;
    maxValue: number;
};

type FightMetricSectionProps = {
    sectionId: string;
    title: string;
    titleIcon?: StatsTocIcon;
    titleIconClassName?: string;
    listTitle?: string;
    searchPlaceholder?: string;

    modes: Array<{ id: string; label: string }>;
    activeMode: string;
    setActiveMode: (value: string) => void;

    playerFilter: string;
    setPlayerFilter: (value: string) => void;
    groupedPlayers: Array<{ profession: string; players: FightMetricPlayer[] }>;
    selectedPlayerKey: string | null;
    setSelectedPlayerKey: (value: string | null) => void;
    selectedPlayer: FightMetricPlayer | null;

    chartData: FightMetricPoint[];
    chartMaxY: number;

    formatValue: (n: number) => string;
    valueSuffix?: string;

    // Fight selection
    selectedFightIndex?: number | null;
    setSelectedFightIndex?: (index: number | null) => void;

    // Header extras (rendered between mode toggles and expand button)
    headerExtras?: ReactNode;

    // Drilldown (shown when fight is selected and renderDrilldown is provided)
    drilldownTitle?: string;
    renderDrilldown?: () => ReactNode;

    // Summary row override (replaces default Peak/Avg row)
    renderSummary?: () => ReactNode;

    // Footer (shown when fight is selected and renderFooter is provided)
    renderFooter?: () => ReactNode;
};

export const FightMetricSection = ({
    sectionId,
    title,
    titleIcon: TitleIcon,
    titleIconClassName = '',
    listTitle = 'Squad Players',
    searchPlaceholder = 'Search player or account',
    modes,
    activeMode,
    setActiveMode,
    playerFilter,
    setPlayerFilter,
    groupedPlayers,
    selectedPlayerKey,
    setSelectedPlayerKey,
    selectedPlayer,
    chartData,
    chartMaxY,
    formatValue,
    valueSuffix = '',
    selectedFightIndex = null,
    setSelectedFightIndex,
    headerExtras,
    drilldownTitle = 'Fight Breakdown',
    renderDrilldown,
    renderSummary,
    renderFooter,
}: FightMetricSectionProps) => {
    const { expandedSection, openExpandedSection, closeExpandedSection, formatWithCommas, renderProfessionIcon } = useStatsSharedContext();
    const isExpanded = expandedSection === sectionId;

    const sanitizeWvwLabel = (value: string) => String(value || '')
        .replace(/^Detailed\s*WvW\s*-\s*/i, '')
        .replace(/^World\s*vs\s*World\s*-\s*/i, '')
        .replace(/^WvW\s*-\s*/i, '')
        .trim();

    const playerColor = selectedPlayer ? getProfessionColor(selectedPlayer.profession) : '#818cf8';

    const avgValue = chartData.length > 0
        ? chartData.reduce((sum, entry) => sum + Number(entry.value || 0), 0) / chartData.length
        : 0;

    const [playerSortMode, setPlayerSortMode] = useState<'group' | 'player'>('group');

    const displayPlayers = useMemo(() => {
        if (playerSortMode === 'group') return groupedPlayers;
        // Flat list sorted by individual value, wrapped in a single group
        const all = groupedPlayers.flatMap((g) => g.players);
        all.sort((a, b) => b.value - a.value || a.displayName.localeCompare(b.displayName));
        return [{ profession: '', players: all }];
    }, [groupedPlayers, playerSortMode]);

    const renderContent = (expanded: boolean) => (
        <div
            id={expanded ? undefined : sectionId}
            className={`glass-surface rounded-xl overflow-hidden ${expanded ? 'h-full flex flex-col' : ''}`}
            style={{ scrollMarginTop: '80px' }}
        >
            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    {TitleIcon && <TitleIcon className={`w-4 h-4 ${titleIconClassName}`} />}
                    <span className="text-sm font-semibold text-slate-200">{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    {modes.length > 1 && (
                        <PillToggleGroup
                            options={modes.map((m) => ({ value: m.id, label: m.label }))}
                            value={activeMode}
                            onChange={setActiveMode}
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                    )}
                    {headerExtras}
                    {!expanded && (
                        <button
                            onClick={() => openExpandedSection(sectionId)}
                            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors"
                            title="Expand"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {expanded && (
                        <button
                            onClick={closeExpandedSection}
                            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors"
                            title="Close"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Body ────────────────────────────────────────── */}
            <div className={`flex ${expanded ? 'flex-1 min-h-0' : ''}`} style={expanded ? undefined : { height: 420 }}>
                {/* ── Player list ─────────────────────────────── */}
                <div className="w-[260px] flex-shrink-0 border-r border-white/5 flex flex-col">
                    <div className="px-3 py-2 border-b border-white/5">
                        <input
                            type="text"
                            value={playerFilter}
                            onChange={(e) => setPlayerFilter(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full bg-white/5 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-500 outline-none focus:ring-1 focus:ring-indigo-500/50"
                        />
                    </div>
                    <div className="flex items-center justify-between px-3 pt-2 pb-1">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">{listTitle}</div>
                        <button
                            onClick={() => setPlayerSortMode(playerSortMode === 'group' ? 'player' : 'group')}
                            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                            title={playerSortMode === 'group' ? 'Sorted by class group' : 'Sorted by player'}
                        >
                            {playerSortMode === 'group' ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-1.5 pb-2">
                        {displayPlayers.map((group) => (
                            <div key={group.profession || '__all__'}>
                                {displayPlayers.length > 1 && group.profession && (
                                    <div className="text-[10px] text-slate-500 px-2 pt-2 pb-0.5">{group.profession}</div>
                                )}
                                {group.players.map((player) => {
                                    const isSelected = selectedPlayerKey === player.key;
                                    return (
                                        <button
                                            key={player.key}
                                            onClick={() => setSelectedPlayerKey(isSelected ? null : player.key)}
                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                                                isSelected
                                                    ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30'
                                                    : 'hover:bg-white/5'
                                            }`}
                                        >
                                            {renderProfessionIcon(player.profession, player.professionList, 'w-4 h-4 flex-shrink-0')}
                                            <span className={`text-xs truncate flex-1 ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>
                                                {player.displayName}
                                            </span>
                                            <span className={`text-xs tabular-nums ${isSelected ? 'text-indigo-300 font-semibold' : 'text-slate-500'}`}>
                                                {formatValue(player.value)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                        {displayPlayers.length === 0 && (
                            <div className="text-xs text-slate-500 px-2 py-4 text-center">No players</div>
                        )}
                    </div>
                </div>

                {/* ── Chart area ─────────────────────────────── */}
                <div className="flex-1 flex flex-col min-w-0">
                    {!selectedPlayer ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                            Select a player to view per-fight trend
                        </div>
                    ) : (
                        <>
                            {/* Summary row */}
                            {renderSummary ? renderSummary() : (
                                <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 text-xs text-slate-400">
                                    {renderProfessionIcon(selectedPlayer.profession, selectedPlayer.professionList, 'w-4 h-4')}
                                    <span className="text-slate-200 font-medium">{selectedPlayer.displayName}</span>
                                    <span className="text-slate-500">|</span>
                                    <span>Peak: <strong className="text-indigo-300">{formatValue(selectedPlayer.value)}</strong>{valueSuffix ? ` ${valueSuffix}` : ''}</span>
                                    {selectedPlayer.peakFightLabel && (
                                        <span className="text-slate-500">in {sanitizeWvwLabel(selectedPlayer.peakFightLabel)}</span>
                                    )}
                                    <span className="text-slate-500">|</span>
                                    <span>Avg: <strong className="text-slate-200">{formatWithCommas(avgValue, 1)}</strong> per fight</span>
                                </div>
                            )}

                            {/* Chart */}
                            <div className="flex-1 min-h-0 px-4 py-3">
                                <ChartContainer width="100%" height="100%">
                                    <LineChart
                                        data={chartData}
                                        onClick={setSelectedFightIndex ? (state: any) => {
                                            const idx = Number(state?.activeTooltipIndex);
                                            if (!Number.isFinite(idx)) return;
                                            setSelectedFightIndex(selectedFightIndex === idx ? null : idx);
                                        } : undefined}
                                        style={setSelectedFightIndex ? { cursor: 'pointer' } : undefined}
                                    >
                                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="shortLabel"
                                            tick={{ fontSize: 10, fill: '#64748b' }}
                                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            domain={[0, Math.max(1, chartMaxY)]}
                                            tick={{ fontSize: 10, fill: '#64748b' }}
                                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                            tickLine={false}
                                            tickFormatter={(v: number) => formatValue(v)}
                                            width={50}
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null;
                                                const data = payload[0]?.payload as FightMetricPoint | undefined;
                                                if (!data) return null;
                                                return (
                                                    <div className="bg-slate-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
                                                        <div className="text-slate-200 font-medium mb-1">{sanitizeWvwLabel(data.fullLabel)}</div>
                                                        <div className="text-indigo-300">{selectedPlayer?.displayName}: <strong>{formatValue(data.value)}</strong>{valueSuffix ? ` ${valueSuffix}` : ''}</div>
                                                        <div className="text-slate-500">Fight Max: {formatValue(data.maxValue)}</div>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Line
                                            dataKey="maxValue"
                                            name="Fight Max"
                                            stroke="rgba(148,163,184,0.5)"
                                            strokeWidth={1.5}
                                            strokeDasharray="6 4"
                                            dot={false}
                                            isAnimationActive
                                            animationDuration={600}
                                            animationEasing="ease-out"
                                        />
                                        <Line
                                            dataKey="value"
                                            name={selectedPlayer?.displayName || 'Player'}
                                            stroke={playerColor}
                                            strokeWidth={2.5}
                                            dot={setSelectedFightIndex ? (props: any) => {
                                                const idx = Number(props?.payload?.index);
                                                if (!Number.isFinite(idx)) return null;
                                                const isSelectedFight = selectedFightIndex === idx;
                                                return (
                                                    <g style={{ cursor: 'pointer', pointerEvents: 'all' }}
                                                        onClick={(e) => { e.stopPropagation(); setSelectedFightIndex!(isSelectedFight ? null : idx); }}>
                                                        <circle cx={props.cx} cy={props.cy} r={10} fill="transparent" style={{ pointerEvents: 'all' }} />
                                                        <circle cx={props.cx} cy={props.cy} r={isSelectedFight ? 5 : 3}
                                                            fill={playerColor}
                                                            stroke={isSelectedFight ? 'rgba(251,191,36,0.95)' : playerColor}
                                                            strokeWidth={isSelectedFight ? 2.5 : 1} />
                                                    </g>
                                                );
                                            } : { r: 3, fill: playerColor, stroke: playerColor }}
                                            activeDot={{ r: 5, fill: playerColor, stroke: '#fff', strokeWidth: 2 }}
                                            isAnimationActive
                                            animationDuration={800}
                                            animationEasing="ease-out"
                                        />
                                    </LineChart>
                                </ChartContainer>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Drilldown ──────────────────────────────────── */}
            <div
                className="transition-all duration-300 ease-out overflow-hidden"
                style={{
                    maxHeight: selectedFightIndex !== null && renderDrilldown ? 600 : 0,
                    opacity: selectedFightIndex !== null && renderDrilldown ? 1 : 0,
                }}
            >
                {selectedFightIndex !== null && renderDrilldown && (
                    <div className="px-4 py-3 border-t border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500">{drilldownTitle}</span>
                            <button
                                onClick={() => setSelectedFightIndex?.(null)}
                                className="text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                        {renderDrilldown()}
                    </div>
                )}
            </div>

            {/* ── Footer ─────────────────────────────────────── */}
            {selectedFightIndex !== null && renderFooter && (
                <div className="px-4 py-3 border-t border-white/5">
                    {renderFooter()}
                </div>
            )}
        </div>
    );

    if (isExpanded) {
        return renderContent(true);
    }

    return renderContent(false);
};
