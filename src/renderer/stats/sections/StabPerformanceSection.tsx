import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, Shield, X } from 'lucide-react';
import { getProfessionColor } from '../../../shared/professionUtils';
import { useStatsSharedContext } from '../StatsViewContext';

const PARTY_MEMBER_COLORS = [
    '#a78bfa', '#34d399', '#f59e0b', '#60a5fa', '#f472b6',
    '#fb923c', '#4ade80', '#e879f9', '#38bdf8', '#fbbf24'
];

type StabPerfPlayer = {
    key: string;
    account: string;
    displayName: string;
    profession: string;
    professionList: string[];
    logs: number;
    total: number;
};

type StabPerfFightPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    total: number;
    maxTotal: number;
};

type StabPerfPartyMember = {
    key: string;
    displayName: string;
};

type StabPerfDrilldownEntry = {
    label: string;
    value: number;
    incomingDamage?: number;
    incomingIntensity?: number;
    partyDeaths?: number;
    partyDeathNames?: string[];
    partyAvgDistance?: number;
    partyFarNames?: string[];
    [key: string]: any;
};

type StabPerformanceSectionProps = {
    playerFilter: string;
    setPlayerFilter: (v: string) => void;
    players: StabPerfPlayer[];
    selectedPlayerKey: string | null;
    setSelectedPlayerKey: (key: string | null) => void;
    selectedPlayer: StabPerfPlayer | null;
    chartData: StabPerfFightPoint[];
    chartMaxY: number;
    selectedFightIndex: number | null;
    setSelectedFightIndex: (index: number | null) => void;
    drilldownTitle: string;
    drilldownData: StabPerfDrilldownEntry[];
    partyMembers: StabPerfPartyMember[];
    showIncomingHeatmap: boolean;
    setShowIncomingHeatmap: (v: boolean) => void;
    showPartyDeaths: boolean;
    setShowPartyDeaths: (v: boolean) => void;
    showPartyDistance: boolean;
    setShowPartyDistance: (v: boolean) => void;
};

export const StabPerformanceSection = ({
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
    partyMembers,
    showIncomingHeatmap,
    setShowIncomingHeatmap,
    showPartyDeaths,
    setShowPartyDeaths,
    showPartyDistance,
    setShowPartyDistance,
}: StabPerformanceSectionProps) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, isSectionVisible, isFirstVisibleSection, sectionClass, formatWithCommas, renderProfessionIcon } = useStatsSharedContext();
    const sectionId = 'stab-performance';
    const isExpanded = expandedSection === sectionId;
    const selectedLineColor = selectedPlayer?.profession && selectedPlayer.profession !== 'All'
        ? (getProfessionColor(selectedPlayer.profession) || '#a78bfa')
        : '#a78bfa';
    const sanitizeWvwLabel = (value: string) => String(value || '')
        .replace(/^Detailed\s*WvW\s*-\s*/i, '')
        .replace(/^World\s*vs\s*World\s*-\s*/i, '')
        .replace(/^WvW\s*-\s*/i, '')
        .trim();
    const topFight = chartData.reduce((best, entry) => {
        if (!best || entry.total > best.total) return entry;
        return best;
    }, null as StabPerfFightPoint | null);
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
                        <Shield className="w-5 h-5 text-violet-300" />
                        Stab Performance
                    </h3>
                    <p className="text-xs text-gray-400">
                        Combines per-player stability stack tracking, party incoming damage intensity, deaths, and commander distance into a single 5-second bucket timeline. The top chart shows your selected player's total stab generation across all fights; click a fight point to drill into the full breakdown. The drilldown plots each party member's active stab stacks (time-weighted average over each 5s window, capturing all skill casts within the bucket) overlaid with a red heatmap of incoming PARTY damage — darker bars mean your PARTY absorbed more damage in that window. Deaths (💀/☠️) and out-of-range markers (📍, &gt;600 units from tag) are plotted directly on each player's line. What this does not show: stab provided to players outside your immediate party group, or damage mitigated by barrier/aegis. Best used to identify which fight phases your party was hit hard while running low stab, and whether specific players were out of position when it mattered.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className={`p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors ${isExpanded ? 'absolute top-2 right-2 md:static' : ''}`}
                    aria-label={isExpanded ? 'Close Stab Performance' : 'Expand Stab Performance'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 items-stretch">
                <div className="space-y-2 flex flex-col h-[320px]">
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                        Stability Sources
                    </div>
                    <input
                        type="search"
                        value={playerFilter}
                        onChange={(e) => setPlayerFilter(e.target.value)}
                        placeholder="Search player or account"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 focus:border-violet-400 focus:outline-none"
                    />
                    <div className="spike-player-list-container flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/20">
                        {players.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-gray-500 italic">
                                No stability generation data available.
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
                                                ? 'border-violet-300/60 bg-violet-400/10 text-white'
                                                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderProfessionIcon(player.profession, player.professionList, 'w-3.5 h-3.5')}
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
                                                <div className="text-xs font-mono text-violet-200 shrink-0">
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
                            Per Fight Squad Stab Generation
                        </div>
                        <div className="text-[11px] text-gray-500">
                            {chartData.length} {chartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 flex-1 min-h-0">
                        {!selectedPlayer || chartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-gray-500">
                                Select one player to view stab generation by fight.
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
                                                    onClick={(e) => {
                                                        e.stopPropagation();
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
                            {renderProfessionIcon(selectedPlayer.profession, selectedPlayer.professionList, 'w-4 h-4')}
                            <span className="truncate">{selectedPlayer.displayName}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">
                            {selectedFight ? 'Selected Fight Generation' : 'Peak Fight Generation'}
                        </div>
                        <div className="mt-1 text-lg font-black text-violet-200 font-mono">
                            {formatWithCommas(Number(infoFight?.total || 0) / 1000, 0)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">
                            {selectedFight ? 'Selected Fight' : 'Peak Fight'}
                        </div>
                        <div className="mt-1 text-sm text-gray-200 truncate">
                            {(() => {
                                const bestLabel = sanitizeWvwLabel(infoFight?.fullLabel || 'N/A');
                                const timeLabel = formatFightTimestamp(Number(infoFight?.timestamp || 0));
                                return timeLabel ? `${timeLabel} · ${bestLabel}` : bestLabel;
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {selectedPlayer && selectedFightIndex !== null && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">{drilldownTitle}</div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setShowIncomingHeatmap(!showIncomingHeatmap)}
                                className={`text-[10px] uppercase tracking-[0.16em] transition-colors ${
                                    showIncomingHeatmap
                                        ? 'text-red-200 hover:text-red-100'
                                        : 'text-gray-400 hover:text-gray-200'
                                }`}
                                title="Toggle party incoming damage heatmap overlay"
                            >
                                Party Damage
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowPartyDeaths(!showPartyDeaths)}
                                className={`text-[10px] uppercase tracking-[0.16em] transition-colors ${
                                    showPartyDeaths
                                        ? 'text-red-400 hover:text-red-300'
                                        : 'text-gray-400 hover:text-gray-200'
                                }`}
                                title="Toggle party death markers"
                            >
                                Party Deaths
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowPartyDistance(!showPartyDistance)}
                                className={`text-[10px] uppercase tracking-[0.16em] transition-colors ${
                                    showPartyDistance
                                        ? 'text-yellow-300 hover:text-yellow-200'
                                        : 'text-gray-400 hover:text-gray-200'
                                }`}
                                title="Toggle party distance markers (>600 range from tag)"
                            >
                                Party Distance
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedFightIndex(null)}
                                className="text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-gray-200"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                    {partyMembers.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                            {partyMembers.map((m, mi) => (
                                <div key={m.key} className="flex items-center gap-1.5">
                                    <div className="w-5 h-0" style={{ borderTop: `2px dashed ${PARTY_MEMBER_COLORS[mi % PARTY_MEMBER_COLORS.length]}` }} />
                                    <span className="text-[9px] text-gray-400">{m.displayName}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="h-[220px] relative">
                        {drilldownData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-gray-500">
                                No detailed data available for this fight.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={drilldownHeatData}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                    <YAxis tick={{ fill: '#e2e8f0', fontSize: 10 }} tickFormatter={(v: number) => formatWithCommas(v / 1000, 0)} />
                                    <YAxis yAxisId="incomingHeat" hide domain={[0, 1]} />
                                    <YAxis yAxisId="stabStacks" hide domain={[0, 'auto']} />
                                    <Tooltip
                                        content={({ payload, label }: any) => {
                                            if (!payload || payload.length === 0) return null;
                                            const point = payload[0]?.payload || {};
                                            const gen = Number(point?.value || 0);
                                            const damage = Number(point?.incomingDamage || 0);
                                            return (
                                                <div style={{ backgroundColor: '#161c24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '8px 12px', fontSize: '0.8rem' }}>
                                                    <div style={{ fontWeight: 600, marginBottom: 6, color: '#e2e8f0' }}>
                                                        {String(label || '')}
                                                        {gen > 0 && <span style={{ color: '#a78bfa' }}>{` · Gen: ${formatWithCommas(gen / 1000, 0)}`}</span>}
                                                    </div>
                                                    {showIncomingHeatmap && damage > 0 && (
                                                        <div style={{ color: 'rgba(239,100,100,0.9)', marginBottom: 4 }}>
                                                            {`Party Incoming Damage : ${formatWithCommas(damage, 0)}`}
                                                        </div>
                                                    )}
                                                    {[...partyMembers].sort((a, b) => a.displayName.localeCompare(b.displayName)).map((member) => {
                                                        const mi = partyMembers.indexOf(member);
                                                        const color = PARTY_MEMBER_COLORS[mi % PARTY_MEMBER_COLORS.length];
                                                        const stacks = Number(point?.[`pm_${member.key}`] ?? 0);
                                                        const deaths = Number(point?.[`playerDeaths_${member.key}`] || 0);
                                                        const deathIcon = deaths > 0 ? (member.key === selectedPlayerKey ? ' �' : ' ☠️') : '';
                                                        const distance = Number(point?.[`playerDistance_${member.key}`] || 0);
                                                        const distIcon = distance > 600 ? ' 📍' : '';
                                                        return (
                                                            <div key={member.key} style={{ color, padding: '1px 0' }}>
                                                                {`${member.displayName}${distIcon} : ${stacks === 0 ? 'No stab' : stacks.toFixed(1) + ' stacks' + deathIcon}`}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        }}
                                    />
                                    {showIncomingHeatmap && hasIncomingHeatData && (
                                        <Bar
                                            yAxisId="incomingHeat"
                                            dataKey="incomingHeatBand"
                                            name="Party Incoming Damage Heat"
                                            barSize={24}
                                            fill="rgba(239,68,68,0.35)"
                                            stroke="none"
                                            isAnimationActive={false}
                                        >
                                            {drilldownData.map((entry, index) => {
                                                const intensity = Math.max(0, Math.min(1, Number(entry?.incomingIntensity || 0)));
                                                const alpha = 0.06 + (0.52 * intensity);
                                                return <Cell key={`stab-heat-${index}`} fill={`rgba(239, 68, 68, ${alpha.toFixed(3)})`} />;
                                            })}
                                        </Bar>
                                    )}
                                    {partyMembers.map((member, mi) => {
                                        const color = PARTY_MEMBER_COLORS[mi % PARTY_MEMBER_COLORS.length];
                                        return (
                                            <Line
                                                key={member.key}
                                                yAxisId="stabStacks"
                                                type="monotone"
                                                dataKey={`pm_${member.key}`}
                                                name={member.displayName}
                                                stroke={color}
                                                strokeWidth={1.5}
                                                strokeDasharray="4 2"
                                                dot={(props: any) => {
                                                    const point = props.payload;
                                                    if (!point) return null;
                                                    
                                                    // Check if this player died in this bucket
                                                    const deaths = Number(point?.[`playerDeaths_${member.key}`] || 0);
                                                    const distance = Number(point?.[`playerDistance_${member.key}`] || 0);
                                                    const hasDeaths = showPartyDeaths && deaths > 0;
                                                    const hasHighDistance = showPartyDistance && distance > 600;
                                                    
                                                    if (!hasDeaths && !hasHighDistance) {
                                                        return null; // No dot for normal points
                                                    }
                                                    
                                                    const isSelectedPlayer = member.key === selectedPlayerKey;
                                                    return (
                                                        <g>
                                                            {hasDeaths && (
                                                                <text x={props.cx} y={props.cy + 4} textAnchor="middle" fill={isSelectedPlayer ? "#a855f7" : "#ef4444"} fontSize={isSelectedPlayer ? 14 : 12} fontWeight="bold">
                                                                    {isSelectedPlayer ? '💀' : '☠️'}
                                                                </text>
                                                            )}
                                                            {!hasDeaths && hasHighDistance && (
                                                                <text x={props.cx} y={props.cy + 3} textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">
                                                                    📍
                                                                </text>
                                                            )}
                                                        </g>
                                                    );
                                                }}
                                                activeDot={{ r: 3, fill: color }}
                                                isAnimationActive={false}
                                            />
                                        );
                                    })}
                                                                    </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
