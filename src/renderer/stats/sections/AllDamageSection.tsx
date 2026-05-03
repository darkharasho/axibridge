import { useMemo, useState } from 'react';
import { Brush, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Flame, Maximize2, X } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import { getProfessionColor } from '../../../shared/professionUtils';
import type { AllDamageFight, AllDamagePlayerBucket } from '../computeAllDamageData';

type AllDamageSectionProps = {
    fights: AllDamageFight[];
    mode: 'damage' | 'downContribution';
    setMode: (mode: 'damage' | 'downContribution') => void;
    selectedFightIndex: number | null;
    setSelectedFightIndex: (index: number | null) => void;
    selectedDrilldownPlayerKey: string | null;
    setSelectedDrilldownPlayerKey: (key: string | null) => void;
};

const MODES = [
    { value: 'damage', label: 'All Damage' },
    { value: 'downContribution', label: 'Down Contribution' },
] as const;

const sanitizeLabel = (value: string) => String(value || '')
    .replace(/^Detailed\s*WvW\s*-\s*/i, '')
    .replace(/^World\s*vs\s*World\s*-\s*/i, '')
    .replace(/^WvW\s*-\s*/i, '')
    .trim();

const formatDamageValue = (value: number): string => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
    return String(Math.round(value));
};

export const AllDamageSection = ({
    fights,
    mode,
    setMode,
    selectedFightIndex,
    setSelectedFightIndex,
    selectedDrilldownPlayerKey,
    setSelectedDrilldownPlayerKey,
}: AllDamageSectionProps) => {
    const { expandedSection, openExpandedSection, closeExpandedSection, formatWithCommas, renderProfessionIcon } = useStatsSharedContext();
    const sectionId = 'all-damage';
    const isExpanded = expandedSection === sectionId;

    // ── Level 1: Per-fight chart data ──
    const fightChartData = useMemo(() => fights.map((fight, idx) => ({
        index: idx,
        shortLabel: fight.shortLabel,
        fullLabel: fight.fullLabel,
        isWin: fight.isWin,
        value: mode === 'damage' ? fight.totalDamage : fight.totalDownContribution,
    })), [fights, mode]);

    const fightChartMaxY = useMemo(() => {
        const max = fightChartData.reduce((m, d) => Math.max(m, d.value), 0);
        return Math.max(1, Math.ceil(max * 1.1));
    }, [fightChartData]);

    // ── Level 2: Selected fight drilldown data ──
    const selectedFight = selectedFightIndex !== null ? fights[selectedFightIndex] ?? null : null;

    const drilldownChartData = useMemo(() => {
        if (!selectedFight) return [];
        const bucketCount = selectedFight.players.reduce(
            (max, p) => Math.max(max, mode === 'damage' ? p.buckets5s.length : p.buckets5sDown.length), 0
        );
        return Array.from({ length: bucketCount }, (_, i) => {
            const point: Record<string, any> = {
                index: i,
                label: `${i * 5}s`,
            };
            selectedFight.players.forEach((player) => {
                const buckets = mode === 'damage' ? player.buckets5s : player.buckets5sDown;
                point[player.key] = Number(buckets[i] || 0);
            });
            return point;
        });
    }, [selectedFight, mode]);

    const [percentileFilter, setPercentileFilter] = useState<'all' | 'p95' | 'p75' | 'p50' | 'p25'>('all');

    const drilldownPlayersAll = useMemo(() => {
        if (!selectedFight) return [];
        return [...selectedFight.players].sort((a, b) => {
            const aVal = mode === 'damage' ? a.totalDamage : a.totalDownContribution;
            const bVal = mode === 'damage' ? b.totalDamage : b.totalDownContribution;
            return bVal - aVal;
        });
    }, [selectedFight, mode]);

    const drilldownPlayers = useMemo(() => {
        if (percentileFilter === 'all' || drilldownPlayersAll.length === 0) return drilldownPlayersAll;
        const thresholdPct = { p95: 0.95, p75: 0.75, p50: 0.50, p25: 0.25 }[percentileFilter];
        const values = drilldownPlayersAll.map((p) => mode === 'damage' ? p.totalDamage : p.totalDownContribution);
        const sorted = [...values].sort((a, b) => a - b);
        const idx = Math.floor((sorted.length - 1) * thresholdPct);
        const cutoff = sorted[idx] ?? 0;
        return drilldownPlayersAll.filter((p) => {
            const val = mode === 'damage' ? p.totalDamage : p.totalDownContribution;
            return val >= cutoff;
        });
    }, [drilldownPlayersAll, percentileFilter, mode]);

    const drilldownMaxY = useMemo(() => {
        if (!drilldownChartData.length || !drilldownPlayers.length) return 1;
        let max = 0;
        drilldownChartData.forEach((point) => {
            drilldownPlayers.forEach((player) => {
                max = Math.max(max, Number(point[player.key] || 0));
            });
        });
        return Math.max(1, Math.ceil(max * 1.1));
    }, [drilldownChartData, drilldownPlayers]);

    // ── Level 3: Selected player skill breakdown ──
    const selectedDrilldownPlayer: AllDamagePlayerBucket | null = useMemo(() => {
        if (!selectedDrilldownPlayerKey || !selectedFight) return null;
        return selectedFight.players.find((p) => p.key === selectedDrilldownPlayerKey) ?? null;
    }, [selectedDrilldownPlayerKey, selectedFight]);

    const skillRows = useMemo(() => {
        if (!selectedDrilldownPlayer) return [];
        return selectedDrilldownPlayer.skillRows.map((row) => ({
            ...row,
            displayValue: mode === 'damage' ? row.damage : row.downContribution,
        })).filter((row) => row.displayValue > 0);
    }, [selectedDrilldownPlayer, mode]);

    // Track hover on drilldown chart
    const [hoveredPlayerKey, setHoveredPlayerKey] = useState<string | null>(null);

    const renderContent = (expanded: boolean) => (
        <div
            id={expanded ? undefined : sectionId}
            className={`rounded-xl overflow-hidden ${expanded ? 'h-full flex flex-col' : ''}`}
            style={{ scrollMarginTop: '80px' }}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-semibold text-slate-200">All Damage</span>
                </div>
                <div className="flex items-center gap-2">
                    <PillToggleGroup
                        options={MODES.map((m) => ({ value: m.value, label: m.label }))}
                        value={mode}
                        onChange={(v) => setMode(v as 'damage' | 'downContribution')}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
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

            {/* ── Level 1: Per-fight line graph ── */}
            <div className={expanded ? 'flex-1 min-h-0 flex flex-col' : ''}>
                <div className="px-4 py-3" style={expanded ? undefined : { height: 240 }}>
                    {fightChartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">No fight data</div>
                    ) : (
                        <ChartContainer width="100%" height="100%">
                            <LineChart
                                data={fightChartData}
                                onClick={(state: any) => {
                                    const idx = Number(state?.activeTooltipIndex);
                                    if (!Number.isFinite(idx)) return;
                                    if (selectedFightIndex === idx) {
                                        setSelectedFightIndex(null);
                                        setSelectedDrilldownPlayerKey(null);
                                    } else {
                                        setSelectedFightIndex(idx);
                                        setSelectedDrilldownPlayerKey(null);
                                    }
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="shortLabel"
                                    tick={(props: any) => {
                                        const { x, y, payload } = props;
                                        const datum = fightChartData[payload?.index];
                                        const outcome = datum?.isWin;
                                        const badge = outcome === true ? 'W' : outcome === false ? 'L' : null;
                                        const badgeColor = outcome === true ? '#4ade80' : '#f87171';
                                        return (
                                            <g transform={`translate(${x},${y})`}>
                                                <text x={0} y={0} dy={10} textAnchor="middle" fill="#64748b" fontSize={10}>
                                                    {payload?.value}
                                                </text>
                                                {badge && (
                                                    <text x={0} y={0} dy={22} textAnchor="middle" fill={badgeColor} fontSize={10} fontWeight={700}>
                                                        {badge}
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    }}
                                    height={36}
                                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    domain={[0, fightChartMaxY]}
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                    tickLine={false}
                                    tickFormatter={formatDamageValue}
                                    width={55}
                                />
                                <Tooltip content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const data = payload[0]?.payload;
                                    if (!data) return null;
                                    return (
                                        <div className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
                                            <div className="text-slate-200 font-medium mb-1">{sanitizeLabel(data.fullLabel)}</div>
                                            <div className="text-indigo-300">
                                                {mode === 'damage' ? 'Total Damage' : 'Down Contribution'}: <strong>{formatWithCommas(data.value, 0)}</strong>
                                            </div>
                                        </div>
                                    );
                                }} />
                                <Line
                                    dataKey="value"
                                    name={mode === 'damage' ? 'Total Damage' : 'Down Contribution'}
                                    stroke="#818cf8"
                                    strokeWidth={2.5}
                                    dot={(props: any) => {
                                        const idx = Number(props?.payload?.index);
                                        if (!Number.isFinite(idx)) return <g key={`dot-invalid-${props?.cx}-${props?.cy}`} />;
                                        const isSelected = selectedFightIndex === idx;
                                        return (
                                            <g key={`dot-${idx}`} style={{ cursor: 'pointer', pointerEvents: 'all' }}
                                                onClick={(e) => { e.stopPropagation(); setSelectedFightIndex(isSelected ? null : idx); setSelectedDrilldownPlayerKey(null); }}>
                                                <circle cx={props.cx} cy={props.cy} r={10} fill="transparent" style={{ pointerEvents: 'all' }} />
                                                <circle cx={props.cx} cy={props.cy} r={isSelected ? 5 : 3}
                                                    fill="#818cf8"
                                                    stroke={isSelected ? 'rgba(251,191,36,0.95)' : '#818cf8'}
                                                    strokeWidth={isSelected ? 2.5 : 1} />
                                            </g>
                                        );
                                    }}
                                    activeDot={{ r: 5, fill: '#818cf8', stroke: '#fff', strokeWidth: 2 }}
                                    isAnimationActive
                                    animationDuration={800}
                                    animationEasing="ease-out"
                                />
                            </LineChart>
                        </ChartContainer>
                    )}
                </div>

                {/* ── Level 2: Fight drilldown (multi-line per player) ── */}
                <div
                    className="transition-all duration-300 ease-out overflow-hidden"
                    style={{
                        maxHeight: selectedFight ? 800 : 0,
                        opacity: selectedFight ? 1 : 0,
                    }}
                >
                    {selectedFight && (
                        <div className="px-4 py-3 border-t border-white/5">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                                        Fight Breakdown — {sanitizeLabel(selectedFight.fullLabel)}
                                    </span>
                                    <PillToggleGroup
                                        options={[
                                            { value: 'all', label: 'All' },
                                            { value: 'p95', label: 'P95' },
                                            { value: 'p75', label: 'P75' },
                                            { value: 'p50', label: 'P50' },
                                            { value: 'p25', label: 'P25' },
                                        ]}
                                        value={percentileFilter}
                                        onChange={(v) => setPercentileFilter(v as typeof percentileFilter)}
                                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                        inactiveClassName="text-[color:var(--text-secondary)]"
                                    />
                                    <span className="text-[10px] text-slate-500">
                                        {drilldownPlayers.length}/{drilldownPlayersAll.length} players
                                    </span>
                                </div>
                                <button
                                    onClick={() => { setSelectedFightIndex(null); setSelectedDrilldownPlayerKey(null); }}
                                    className="text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    Clear
                                </button>
                            </div>

                            {/* Multi-line chart */}
                            <div style={{ height: 280 }}>
                                <ChartContainer width="100%" height="100%">
                                    <LineChart data={drilldownChartData}>
                                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="label"
                                            tick={{ fontSize: 10, fill: '#64748b' }}
                                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            domain={[0, drilldownMaxY]}
                                            tick={{ fontSize: 10, fill: '#64748b' }}
                                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                            tickLine={false}
                                            tickFormatter={formatDamageValue}
                                            width={55}
                                        />
                                        <Tooltip content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const sorted = [...payload].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
                                            return (
                                                <div className="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl max-h-64 overflow-y-auto">
                                                    <div className="text-slate-200 font-medium mb-1">{(payload[0]?.payload as any)?.label}</div>
                                                    {sorted.slice(0, 10).map((entry) => (
                                                        <div key={entry.dataKey as string} className="flex items-center gap-1.5">
                                                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                                            <span className="text-slate-400 truncate max-w-[120px]">
                                                                {drilldownPlayersAll.find((p) => p.key === entry.dataKey)?.displayName || entry.dataKey}
                                                            </span>
                                                            <span className="text-slate-200 font-medium ml-auto">{formatWithCommas(Number(entry.value || 0), 0)}</span>
                                                        </div>
                                                    ))}
                                                    {sorted.length > 10 && (
                                                        <div className="text-slate-500 mt-1">+{sorted.length - 10} more</div>
                                                    )}
                                                </div>
                                            );
                                        }} />
                                        {drilldownPlayers.map((player) => {
                                            const isSelected = selectedDrilldownPlayerKey === player.key;
                                            const isHovered = hoveredPlayerKey === player.key;
                                            const hasSelection = selectedDrilldownPlayerKey !== null;
                                            const isDimmed = hasSelection && !isSelected;
                                            const color = getProfessionColor(player.profession);
                                            return (
                                                <Line
                                                    key={player.key}
                                                    dataKey={player.key}
                                                    name={player.displayName}
                                                    stroke={color}
                                                    strokeWidth={isSelected || isHovered ? 3 : 1.5}
                                                    strokeOpacity={isDimmed ? 0.15 : 1}
                                                    dot={false}
                                                    activeDot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 1.5 }}
                                                    isAnimationActive
                                                    animationDuration={600}
                                                    animationEasing="ease-out"
                                                    style={{ cursor: 'pointer' }}
                                                />
                                            );
                                        })}
                                        {drilldownChartData.length > 10 && (
                                            <Brush
                                                dataKey="label"
                                                height={24}
                                                stroke="rgba(129,140,248,0.4)"
                                                fill="rgba(15,23,42,0.8)"
                                                travellerWidth={8}
                                                tickFormatter={() => ''}
                                            />
                                        )}
                                    </LineChart>
                                </ChartContainer>
                            </div>

                            {/* Player legend (clickable) */}
                            <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2 px-1">
                                {drilldownPlayers.map((player) => {
                                    const isSelected = selectedDrilldownPlayerKey === player.key;
                                    const hasSelection = selectedDrilldownPlayerKey !== null;
                                    const isDimmed = hasSelection && !isSelected;
                                    const value = mode === 'damage' ? player.totalDamage : player.totalDownContribution;
                                    return (
                                        <button
                                            key={player.key}
                                            className={`flex items-center gap-1.5 text-xs transition-opacity ${isDimmed ? 'opacity-30' : 'opacity-100'} hover:opacity-100`}
                                            onClick={() => setSelectedDrilldownPlayerKey(isSelected ? null : player.key)}
                                            onMouseEnter={() => setHoveredPlayerKey(player.key)}
                                            onMouseLeave={() => setHoveredPlayerKey(null)}
                                        >
                                            {renderProfessionIcon(player.profession, player.professionList, 'w-3.5 h-3.5')}
                                            <span className={`${isSelected ? 'text-slate-200 font-medium' : 'text-slate-400'}`}>
                                                {player.displayName}
                                            </span>
                                            <span className="text-slate-500 tabular-nums">{formatDamageValue(value)}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Level 3: Player skill breakdown table ── */}
                <div
                    className="transition-all duration-300 ease-out overflow-hidden"
                    style={{
                        maxHeight: selectedDrilldownPlayer ? 400 : 0,
                        opacity: selectedDrilldownPlayer ? 1 : 0,
                    }}
                >
                    {selectedDrilldownPlayer && skillRows.length > 0 && (
                        <div className="px-4 py-3 border-t border-white/5">
                            <div className="flex items-center gap-2 mb-2">
                                {renderProfessionIcon(selectedDrilldownPlayer.profession, selectedDrilldownPlayer.professionList, 'w-4 h-4')}
                                <span className="text-xs font-medium text-slate-200">{selectedDrilldownPlayer.displayName}</span>
                                <span className="text-[10px] uppercase tracking-wider text-slate-500 ml-2">
                                    {mode === 'damage' ? 'Damage' : 'Down Contribution'} Breakdown
                                </span>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-slate-500 border-b border-white/5">
                                            <th className="text-left py-1.5 px-2 font-medium">Skill</th>
                                            <th className="text-right py-1.5 px-2 font-medium">
                                                {mode === 'damage' ? 'Damage' : 'Down Contrib'}
                                            </th>
                                            <th className="text-right py-1.5 px-2 font-medium">Hits</th>
                                            <th className="text-right py-1.5 px-2 font-medium">%</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {skillRows.map((row, idx) => {
                                            const totalPlayerValue = mode === 'damage'
                                                ? selectedDrilldownPlayer.totalDamage
                                                : selectedDrilldownPlayer.totalDownContribution;
                                            const pct = totalPlayerValue > 0 ? (row.displayValue / totalPlayerValue * 100) : 0;
                                            return (
                                                <tr key={idx} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                                                    <td className="py-1.5 px-2 text-slate-300 flex items-center gap-2">
                                                        {row.icon && (
                                                            <img src={row.icon} alt="" className="w-4 h-4 rounded" loading="lazy" />
                                                        )}
                                                        <span className="truncate max-w-[200px]">{row.skillName}</span>
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right text-slate-200 tabular-nums font-medium">
                                                        {formatWithCommas(row.displayValue, 0)}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right text-slate-400 tabular-nums">
                                                        {formatWithCommas(row.hits, 0)}
                                                    </td>
                                                    <td className="py-1.5 px-2 text-right text-slate-500 tabular-nums">
                                                        {pct.toFixed(1)}%
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    if (isExpanded) return renderContent(true);
    return renderContent(false);
};
