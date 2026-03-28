import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { ChevronDown } from 'lucide-react';
import { Gw2BoonIcon } from '../../ui/Gw2BoonIcon';
import { Gw2FuryIcon } from '../../ui/Gw2FuryIcon';
import { getProfessionColor } from '../../../shared/professionUtils';
import { useStatsSharedContext } from '../StatsViewContext';
import { useFixedTooltipPosition } from '../ui/StatsViewShared';
import { FightMetricSection } from './FightMetricSection';
import type { FightMetricPlayer, FightMetricPoint } from './FightMetricSection';

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
    entryType?: 'player' | 'subgroup';
    subgroupId?: number;
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
    average?: number;
    maxUptimePercent: number;
    maxTotal: number;
};

type BoonUptimeSectionProps = {
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
    drilldownData: Array<{ label: string; value: number; maxValue?: number; incomingDamage?: number; incomingIntensity?: number }>;
    overallUptimePercent: number | null;
    showStackCapLine?: boolean;
    subgroupMembers?: Map<number, Array<{ account: string; profession: string; professionList: string[]; fightCount: number }>>;
    showIncomingHeatmap: boolean;
    setShowIncomingHeatmap: (value: boolean) => void;
};

const SubgroupMembersTooltip = ({
    members,
    renderProfessionIcon
}: {
    members: Array<{ account: string; profession: string; professionList: string[]; fightCount: number }>;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
}) => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLSpanElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const closeTimeoutRef = useRef<number | null>(null);
    const tooltipStyle = useFixedTooltipPosition(open, [members.length], wrapperRef, tooltipRef);

    const cancelClose = () => {
        if (closeTimeoutRef.current !== null) {
            window.clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    };
    const scheduleClose = () => {
        cancelClose();
        closeTimeoutRef.current = window.setTimeout(() => {
            setOpen(false);
            closeTimeoutRef.current = null;
        }, 140);
    };

    useEffect(() => () => cancelClose(), []);

    return (
        <>
            {' · '}
            <span
                ref={wrapperRef}
                className="cursor-help border-b border-dotted border-cyan-300/40 hover:border-cyan-200/70 transition-colors"
                onMouseEnter={() => { cancelClose(); setOpen(true); }}
                onMouseLeave={scheduleClose}
            >
                {members.length} {members.length === 1 ? 'player' : 'players'}
            </span>
            {open && typeof document !== 'undefined' && createPortal(
                <div
                    ref={tooltipRef}
                    style={tooltipStyle}
                    className={`z-[9999] w-max max-w-xs rounded-md border border-[color:var(--border-default)] bg-[#0d1117]/95 px-3 py-2 text-[11px] text-[color:var(--text-primary)] backdrop-blur-sm ${open ? 'block' : 'hidden'}`}
                    onMouseEnter={() => { cancelClose(); setOpen(true); }}
                    onMouseLeave={scheduleClose}
                >
                    <div className="mb-1.5 text-[9px] uppercase tracking-wider text-cyan-300/80">
                        Subgroup Members
                    </div>
                    <div className="space-y-1">
                        {members.map((member) => (
                            <div key={member.account} className="flex items-center gap-2">
                                {renderProfessionIcon(member.profession, member.professionList, 'w-3.5 h-3.5')}
                                <span className="text-gray-100 truncate">{member.account}</span>
                                <span className="ml-auto shrink-0 text-[10px] text-[color:var(--text-secondary)]">
                                    {member.fightCount} {member.fightCount === 1 ? 'fight' : 'fights'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export const BoonUptimeSection = ({
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
    overallUptimePercent: _overallUptimePercent,
    showStackCapLine = false,
    subgroupMembers,
    showIncomingHeatmap,
    setShowIncomingHeatmap
}: BoonUptimeSectionProps) => {
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
        ? (getProfessionColor(selectedPlayer.profession) || '#f59e0b')
        : '#f59e0b';

    const hasIncomingHeatData = drilldownData.some((entry) => Number(entry?.incomingDamage || 0) > 0);

    const drilldownHeatData = drilldownData.map((entry) => ({
        ...entry,
        incomingHeatBand: 1
    }));

    const drilldownMaxY = Math.max(
        1,
        ...drilldownData.map((entry) => Math.max(0, Number(entry?.value || 0))),
        ...(showStackCapLine ? [25] : [])
    );
    const drilldownChartMaxY = showStackCapLine
        ? Math.ceil(Math.max(1, drilldownMaxY) + 3)
        : Math.max(1, drilldownMaxY);

    // Build a lookup map from player key to original BoonUptimePlayer for subgroup detection
    const rawPlayerMap = new Map(players.map((p) => [p.key, p]));

    const formatValue = (v: number) =>
        showStackCapLine
            ? formatWithCommas(v, 1)
            : `${formatWithCommas(v, 1)}%`;

    // Map BoonUptimePlayer[] -> FightMetricPlayer[]
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
            value: showStackCapLine
                ? Number(p.total / Math.max(1, p.logs))
                : Number(p.uptimePercent || 0),
            peakFightLabel: '',
        })),
    }];

    // Map BoonUptimeFightPoint[] -> FightMetricPoint[]
    const mappedChartData: FightMetricPoint[] = chartData.map((p) => ({
        index: p.index,
        fightId: p.fightId,
        shortLabel: p.shortLabel,
        fullLabel: p.fullLabel,
        timestamp: p.timestamp,
        value: showStackCapLine ? Number(p.average || 0) : p.uptimePercent,
        maxValue: showStackCapLine ? Number(p.maxTotal || 0) : p.maxUptimePercent,
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
        value: showStackCapLine
            ? Number(selectedPlayer.total / Math.max(1, selectedPlayer.logs))
            : Number(selectedPlayer.uptimePercent || 0),
        peakFightLabel: '',
    } : null;

    return (
        <FightMetricSection
            sectionId="boon-uptime"
            title="Boon Uptime"
            titleIcon={Gw2FuryIcon}
            titleIconClassName="text-amber-300"
            listTitle="Entries"
            searchPlaceholder="Search player, account, or subgroup"
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
            chartMaxY={showStackCapLine ? Math.ceil(Math.max(1, chartMaxY) + 3) : chartMaxY}
            formatValue={formatValue}
            referenceLineY={showStackCapLine ? 25 : undefined}
            referenceLineLabel={showStackCapLine ? '25' : undefined}
            selectedFightIndex={selectedFightIndex}
            setSelectedFightIndex={setSelectedFightIndex}
            headerExtras={selectedFightIndex !== null ? (
                <button
                    onClick={() => setShowIncomingHeatmap(!showIncomingHeatmap)}
                    className={`text-[10px] uppercase tracking-wider transition-colors ${
                        showIncomingHeatmap ? 'text-red-300 hover:text-red-200' : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    Squad Damage Heatmap
                </button>
            ) : undefined}
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
                            <Gw2BoonIcon className="h-3.5 w-3.5 text-amber-300" />
                        )}
                        <span>{activeBoon?.name || 'Select boon'}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${boonDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {boonDropdownOpen && (
                        <div className="app-dropdown absolute top-full left-0 mt-2 z-50 w-96 rounded-lg border border-white/10 bg-[rgba(15,18,25,0.85)] backdrop-blur-2xl shadow-xl p-3 space-y-2">
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
                    )}
                </div>
            )}
            renderPlayerItem={(player, isSelected) => {
                const rawPlayer = rawPlayerMap.get(player.key);
                const isSubgroup = rawPlayer?.entryType === 'subgroup';

                if (isSubgroup) {
                    return (
                        <div className="flex flex-col gap-0.5 w-full min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-4 h-4 inline-flex shrink-0 items-center justify-center rounded-full border border-cyan-300/50 bg-cyan-400/15 font-bold tracking-[0.08em] text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.16)] text-[8px]">
                                    SG
                                </span>
                                <span className={`text-xs truncate flex-1 ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>
                                    {player.displayName}
                                </span>
                                <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-cyan-200 shrink-0">
                                    Aggregate
                                </span>
                                <span className={`text-xs tabular-nums shrink-0 ${isSelected ? 'text-cyan-200 font-semibold' : 'text-cyan-300/60'}`}>
                                    {formatValue(player.value)}
                                </span>
                            </div>
                            <div className="text-[10px] text-cyan-200/80 pl-6">
                                {rawPlayer.logs} {rawPlayer.logs === 1 ? 'fight' : 'fights'}
                                {rawPlayer.subgroupId != null && subgroupMembers?.has(rawPlayer.subgroupId) ? (
                                    <SubgroupMembersTooltip
                                        members={subgroupMembers.get(rawPlayer.subgroupId)!}
                                        renderProfessionIcon={renderProfessionIcon}
                                    />
                                ) : ' averaged across subgroup members'}
                            </div>
                        </div>
                    );
                }

                return (
                    <>
                        {renderProfessionIcon(player.profession, player.professionList, 'w-4 h-4 flex-shrink-0')}
                        <span className={`text-xs truncate flex-1 ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>
                            {player.displayName}
                        </span>
                        <span className={`text-xs tabular-nums ${isSelected ? 'text-amber-200 font-semibold' : 'text-slate-500'}`}>
                            {formatValue(player.value)}
                        </span>
                    </>
                );
            }}
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
                                    domain={[0, drilldownChartMaxY]}
                                    tickFormatter={(value: number) => showStackCapLine ? formatWithCommas(value, 0) : `${formatWithCommas(value, 0)}%`}
                                    width={50} />
                                <YAxis yAxisId="incomingHeat" hide domain={[0, 1]} />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        const d = payload[0]?.payload;
                                        if (!d) return null;
                                        return (
                                            <div className="bg-slate-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
                                                <div className="text-slate-200 font-medium mb-1">{d.label}</div>
                                                <div className="text-indigo-300">
                                                    {showStackCapLine ? 'Stacks' : 'Uptime'}: <strong>
                                                        {showStackCapLine
                                                            ? formatWithCommas(Number(d.value || 0), 1)
                                                            : `${formatWithCommas(Number(d.value || 0), 1)}%`}
                                                    </strong>
                                                </div>
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
                            </ComposedChart>
                        </ChartContainer>
                    )}
                </div>
            )}
        />
    );
};
