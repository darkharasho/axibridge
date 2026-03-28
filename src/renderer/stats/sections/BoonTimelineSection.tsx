import { useEffect, useRef, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { ChevronDown } from 'lucide-react';
import { Gw2BoonIcon } from '../../ui/Gw2BoonIcon';
import { Gw2AegisIcon } from '../../ui/Gw2AegisIcon';
import { getProfessionColor } from '../../../shared/professionUtils';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import { FightMetricSection } from './FightMetricSection';
import type { FightMetricPlayer, FightMetricPoint } from './FightMetricSection';

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
    const { formatWithCommas, renderProfessionIcon } = useStatsSharedContext();
    const [boonDropdownOpen, setBoonDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!boonDropdownOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setBoonDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [boonDropdownOpen]);

    const activeBoon = boons.find((b) => b.id === activeBoonId);

    const selectedLineColor = selectedPlayer?.profession && selectedPlayer.profession !== 'All'
        ? (getProfessionColor(selectedPlayer.profession) || '#22d3ee')
        : '#22d3ee';

    const hasIncomingHeatData = drilldownData.some((entry) => Number(entry?.incomingDamage || 0) > 0);

    const drilldownHeatData = drilldownData.map((entry) => ({
        ...entry,
        incomingHeatBand: 1
    }));

    // Map BoonTimelinePlayer[] -> FightMetricPlayer[]
    const mappedGroups = [{
        profession: '',
        players: players.map((p): FightMetricPlayer => ({
            key: p.key,
            account: p.account,
            displayName: p.displayName,
            characterName: p.displayName,
            profession: p.profession,
            professionList: p.professionList,
            logs: p.logs,
            value: p.total,
            peakFightLabel: '',
        })),
    }];

    // Map BoonTimelineFightPoint[] -> FightMetricPoint[]
    const mappedChartData: FightMetricPoint[] = chartData.map((p) => ({
        index: p.index,
        fightId: p.fightId,
        shortLabel: p.shortLabel,
        fullLabel: p.fullLabel,
        timestamp: p.timestamp,
        value: p.total,
        maxValue: p.maxTotal,
    }));

    // Map selected player
    const mappedPlayer: FightMetricPlayer | null = selectedPlayer ? {
        key: selectedPlayer.key,
        account: selectedPlayer.account,
        displayName: selectedPlayer.displayName,
        characterName: selectedPlayer.displayName,
        profession: selectedPlayer.profession,
        professionList: selectedPlayer.professionList,
        logs: selectedPlayer.logs,
        value: selectedPlayer.total,
        peakFightLabel: '',
    } : null;

    return (
        <FightMetricSection
            sectionId="boon-timeline"
            title="Boon Timeline"
            titleIcon={Gw2AegisIcon}
            titleIconClassName="text-cyan-300"
            listTitle="Boon Sources"
            searchPlaceholder="Search player or account"
            modes={[]}
            activeMode=""
            setActiveMode={() => {}}
            playerFilter={playerFilter}
            setPlayerFilter={setPlayerFilter}
            groupedPlayers={mappedGroups}
            selectedPlayerKey={selectedPlayerKey}
            setSelectedPlayerKey={setSelectedPlayerKey}
            selectedPlayer={mappedPlayer}
            chartData={mappedChartData}
            chartMaxY={chartMaxY}
            formatValue={(v) => formatWithCommas(v / 1000, 0)}
            selectedFightIndex={selectedFightIndex}
            setSelectedFightIndex={setSelectedFightIndex}
            headerExtras={<>
                <PillToggleGroup
                    value={timelineScope}
                    onChange={(value) => setTimelineScope(value as 'selfBuffs' | 'groupBuffs' | 'squadBuffs' | 'totalBuffs')}
                    options={[
                        { value: 'selfBuffs', label: 'Self' },
                        { value: 'squadBuffs', label: 'Squad' },
                        { value: 'groupBuffs', label: 'Group' },
                        { value: 'totalBuffs', label: 'All' }
                    ]}
                    activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                    inactiveClassName="text-[color:var(--text-secondary)]"
                />
                {selectedFightIndex !== null && (
                    <button
                        onClick={() => setShowIncomingHeatmap(!showIncomingHeatmap)}
                        className={`text-[10px] uppercase tracking-wider transition-colors ${
                            showIncomingHeatmap ? 'text-red-300 hover:text-red-200' : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        Squad Damage Heatmap
                    </button>
                )}
            </>}
            renderTitleExtra={() => (
                <div className="relative" ref={dropdownRef}>
                    <button
                        onClick={() => setBoonDropdownOpen(!boonDropdownOpen)}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <span className="text-slate-500">·</span>
                        {activeBoon?.icon ? (
                            <img src={activeBoon.icon} alt="" className="h-3.5 w-3.5 object-contain" />
                        ) : (
                            <Gw2BoonIcon className="h-3.5 w-3.5 text-cyan-300" />
                        )}
                        <span>{activeBoon?.name || 'Select boon'}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${boonDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {boonDropdownOpen && (
                        <div className="absolute top-full left-0 mt-2 z-50 w-96 rounded-lg border border-white/10 bg-[#0f1219] shadow-xl p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={boonSearch}
                                    onChange={(event) => setBoonSearch(event.target.value)}
                                    placeholder="Search boon"
                                    className="flex-1 bg-white/5 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-500 outline-none focus:ring-1 focus:ring-indigo-500/50"
                                />
                                <span className="text-[10px] text-slate-500 shrink-0">
                                    {boons.length} {boons.length === 1 ? 'boon' : 'boons'}
                                </span>
                            </div>
                            <div className="max-h-40 overflow-y-auto">
                                {boons.length === 0 ? (
                                    <div className="px-2 py-2 text-xs text-slate-500 italic">No boons match this filter.</div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {boons.map((boon) => {
                                            const isActive = activeBoonId === boon.id;
                                            return (
                                                <button
                                                    key={boon.id}
                                                    type="button"
                                                    onClick={() => { setActiveBoonId(boon.id); setBoonDropdownOpen(false); }}
                                                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${isActive
                                                        ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30 border-transparent text-slate-200'
                                                        : 'bg-white/5 border-transparent text-slate-400 hover:text-slate-300'
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
                    )}
                </div>
            )}
            renderPlayerItem={(player, isSelected) => (
                <>
                    {player.key === '__all__'
                        ? <Gw2BoonIcon className="w-4 h-4 text-cyan-300 flex-shrink-0" />
                        : renderProfessionIcon(player.profession, player.professionList, 'w-4 h-4 flex-shrink-0')}
                    <span className={`text-xs truncate flex-1 ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>
                        {player.displayName}
                    </span>
                    <span className={`text-xs tabular-nums ${isSelected ? 'text-indigo-300 font-semibold' : 'text-slate-500'}`}>
                        {formatWithCommas(player.value / 1000, 0)}
                    </span>
                </>
            )}
            drilldownTitle={drilldownTitle}
            renderDrilldown={() => (
                <div className="h-[220px] relative">
                    {drilldownData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">
                            No detailed data available for this fight.
                        </div>
                    ) : (
                        <ChartContainer width="100%" height="100%">
                            <ComposedChart data={drilldownHeatData}>
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false}
                                    tickFormatter={(value: number) => formatWithCommas(value / 1000, 0)} width={50} />
                                <YAxis yAxisId="incomingHeat" hide domain={[0, 1]} />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        const d = payload[0]?.payload;
                                        if (!d) return null;
                                        return (
                                            <div className="bg-slate-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
                                                <div className="text-slate-200 font-medium mb-1">{d.label}</div>
                                                <div className="text-indigo-300">Generation: <strong>{formatWithCommas(Number(d.value || 0) / 1000, 0)}</strong></div>
                                                {showIncomingHeatmap && hasIncomingHeatData && Number(d.incomingDamage || 0) > 0 && (
                                                    <div className="text-red-300">Squad Incoming Damage: <strong>{formatWithCommas(Number(d.incomingDamage || 0), 0)}</strong></div>
                                                )}
                                            </div>
                                        );
                                    }}
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
                        </ChartContainer>
                    )}
                </div>
            )}
        />
    );
};
