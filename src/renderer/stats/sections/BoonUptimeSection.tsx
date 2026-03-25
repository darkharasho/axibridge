import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, X } from 'lucide-react';
import { Gw2BoonIcon } from '../../ui/Gw2BoonIcon';
import { Gw2FuryIcon } from '../../ui/Gw2FuryIcon';
import { getProfessionColor } from '../../../shared/professionUtils';
import { useStatsSharedContext } from '../StatsViewContext';
import { useFixedTooltipPosition } from '../ui/StatsViewShared';

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
    drilldownData: Array<{ label: string; value: number; maxValue?: number }>;
    overallUptimePercent: number | null;
    showStackCapLine?: boolean;
    subgroupMembers?: Map<number, Array<{ account: string; profession: string; professionList: string[]; fightCount: number }>>;
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
    overallUptimePercent,
    showStackCapLine = false,
    subgroupMembers
}: BoonUptimeSectionProps) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, formatWithCommas, renderProfessionIcon } = useStatsSharedContext();
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
    const selectedFight = selectedFightIndex === null
        ? null
        : chartData.find((entry) => entry.index === selectedFightIndex) || null;
    const infoFight = selectedFight || topFight;
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
    const renderEntryIcon = (player: BoonUptimePlayer, sizeClass: string) => {
        if (player.entryType === 'subgroup') {
            const textClass = sizeClass.includes('w-4') ? 'text-[8px]' : 'text-[7px]';
            return (
                <span className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full border border-cyan-300/50 bg-cyan-400/15 font-bold tracking-[0.08em] text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.16)] ${textClass}`}>
                    SG
                </span>
            );
        }
        return renderProfessionIcon(player.profession, player.professionList, sizeClass);
    };

    return (
        <div
            className={`stats-share-exclude ${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex items-center gap-2 mb-3.5">
                <span className="flex shrink-0" style={{ color: 'var(--section-boon)' }}><Gw2FuryIcon className="w-4 h-4" /></span>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Boon Uptime</h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Boon Uptime' : 'Expand Boon Uptime'}
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
                        className="w-full lg:w-72 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-3 py-2 text-sm text-[color:var(--text-primary)] focus:border-amber-400 focus:outline-none"
                    />
                    <div className="text-[11px] text-[color:var(--text-secondary)]">
                        {boons.length} {boons.length === 1 ? 'boon' : 'boons'}
                    </div>
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
                                            ? 'border-amber-300/60 bg-amber-500/15 text-amber-100'
                                            : 'border-[color:var(--border-default)] bg-white/[0.03] text-[color:var(--text-secondary)] hover:border-[color:var(--border-hover)] hover:text-[color:var(--text-primary)]'
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
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--text-secondary)]">
                        Entries
                    </div>
                    <input
                        type="search"
                        value={playerFilter}
                        onChange={(event) => setPlayerFilter(event.target.value)}
                        placeholder="Search player, account, or subgroup"
                        className="w-full rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-3 py-2 text-sm text-[color:var(--text-primary)] focus:border-amber-400 focus:outline-none"
                    />
                    <div className="spike-player-list-container flex-1 min-h-0 overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--border-default)]">
                        {players.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-[color:var(--text-muted)] italic">
                                Select a boon to view uptime entries.
                            </div>
                        ) : (
                            <div className="p-1.5 space-y-1">
                                {players.map((player) => {
                                    const isSelected = selectedPlayerKey === player.key;
                                    const isSubgroup = player.entryType === 'subgroup';
                                    return (
                                        <button
                                            key={player.key}
                                            type="button"
                                            onClick={() => setSelectedPlayerKey(player.key)}
                                            className={`spike-player-list-item w-full rounded-md border px-2.5 py-1.5 text-left transition-colors ${isSubgroup
                                                ? (isSelected
                                                    ? 'border-cyan-300/70 bg-cyan-400/12 text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)]'
                                                    : 'border-cyan-400/25 bg-cyan-400/[0.06] hover:border-cyan-300/45 hover:bg-cyan-400/[0.10]')
                                                : (isSelected
                                                    ? 'border-amber-300/60 bg-amber-400/10 text-white'
                                                    : 'border-[color:var(--border-default)] bg-white/[0.02] hover:border-[color:var(--border-hover)] hover:bg-white/[0.05]')
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderEntryIcon(player, 'w-3.5 h-3.5')}
                                                        <div className="text-sm font-semibold truncate text-white">{player.displayName}</div>
                                                        {isSubgroup && (
                                                            <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-cyan-200 shrink-0">
                                                                Aggregate
                                                            </span>
                                                        )}
                                                        {!isSubgroup && player.profession !== 'All' && (
                                                            <span className="text-[9px] uppercase tracking-[0.14em] text-[color:var(--text-secondary)] shrink-0">
                                                                {player.profession}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className={`text-[10px] truncate ${isSubgroup ? 'text-cyan-200/80' : 'text-[color:var(--text-secondary)]'}`}>
                                                        {player.logs} {player.logs === 1 ? 'fight' : 'fights'}
                                                        {isSubgroup && player.subgroupId != null && subgroupMembers?.has(player.subgroupId) ? (
                                                            <SubgroupMembersTooltip
                                                                members={subgroupMembers.get(player.subgroupId)!}
                                                                renderProfessionIcon={renderProfessionIcon}
                                                            />
                                                        ) : isSubgroup ? ' averaged across subgroup members' : ''}
                                                    </div>
                                                </div>
                                                <div className={`text-xs font-mono shrink-0 ${isSubgroup ? 'text-cyan-100' : 'text-amber-200'}`}>
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
                        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--text-secondary)]">
                            {mainSeriesLabel}
                        </div>
                        <div className="text-[11px] text-[color:var(--text-secondary)]">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className="rounded-[var(--radius-md)] p-4 flex-1 min-h-0">
                        {!selectedPlayer || chartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-[color:var(--text-muted)]">
                                Select one entry to view boon uptime by fight.
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
                <div className="mt-4 px-4 py-3 grid gap-3 md:grid-cols-3">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">Selected Entry</div>
                        <div className="mt-1 text-sm font-semibold text-white flex items-center gap-2 min-w-0">
                            {renderEntryIcon(selectedPlayer, 'w-4 h-4')}
                            <span className="truncate">{selectedPlayer.displayName}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">
                            {selectedFight
                                ? (showStackCapLine ? 'Selected Fight Avg Stacks' : 'Selected Fight Uptime')
                                : 'Overall Uptime'}
                        </div>
                        <div className="mt-1 text-lg font-black text-amber-200 font-mono">
                            {selectedFight
                                ? (showStackCapLine
                                    ? formatWithCommas(Number(selectedFight.average ?? 0), 1)
                                    : `${formatWithCommas(Number(selectedFight.uptimePercent || 0), 1)}%`)
                                : (overallUptimePercent === null
                                    ? '--'
                                    : `${formatWithCommas(Number(overallUptimePercent || 0), 1)}%`)}
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
                        <button
                            type="button"
                            onClick={() => setSelectedFightIndex(null)}
                            className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="h-[220px] relative">
                        {drilldownData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-[color:var(--text-muted)]">
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
