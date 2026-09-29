import { useEffect, useMemo, useRef, useState } from 'react';
import { Brush, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Maximize2, X, ChevronDown } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import { Gw2BoonIcon } from '../../ui/Gw2BoonIcon';
import { getProfessionColor } from '../../../shared/professionUtils';
import { ChartTooltipBox } from '../ui/ChartTooltip';

type BoonScope = 'selfBuffs' | 'groupBuffs' | 'squadBuffs' | 'totalBuffs';

export type AllBoonsBoon = {
    id: string;
    name: string;
    icon?: string;
    stacking?: boolean;
    players: Array<{
        key: string;
        account: string;
        displayName: string;
        profession: string;
        professionList: string[];
        logs: number;
        totals: Record<BoonScope, number>;
    }>;
    fights: Array<{
        id: string;
        shortLabel: string;
        fullLabel: string;
        timestamp: number;
        durationMs: number;
        maxTotal: number;
        values: Record<string, {
            total: number;
            totals: Record<BoonScope, number>;
            bucketWeights5s: number[];
            buckets5s: number[];
        }>;
    }>;
};

type AllBoonsSectionProps = {
    boons: AllBoonsBoon[];
    activeBoonId: string | null;
    setActiveBoonId: (id: string | null) => void;
    scope: BoonScope;
    setScope: (scope: BoonScope) => void;
    selectedFightIndex: number | null;
    setSelectedFightIndex: (index: number | null) => void;
    selectedPlayerKey: string | null;
    setSelectedPlayerKey: (key: string | null) => void;
};

const SCOPE_OPTIONS = [
    { value: 'squadBuffs', label: 'Squad' },
    { value: 'groupBuffs', label: 'Group' },
    { value: 'selfBuffs', label: 'Self' },
    { value: 'totalBuffs', label: 'All' },
] as const;

const sanitizeLabel = (value: string) => String(value || '')
    .replace(/^Detailed\s*WvW\s*-\s*/i, '')
    .replace(/^World\s*vs\s*World\s*-\s*/i, '')
    .replace(/^WvW\s*-\s*/i, '')
    .trim();

const formatBoonValue = (value: number): string => {
    // Boon generation is in ms, display divided by 1000 (matches boon timeline)
    const v = value / 1000;
    if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
    return String(Math.round(v));
};

const getScopeTotal = (value: any, scope: BoonScope): number => {
    if (!value?.totals || typeof value.totals !== 'object') return Number(value?.total || 0);
    const resolved = Number(value.totals[scope] || 0);
    return Number.isFinite(resolved) ? Math.max(0, resolved) : 0;
};

export const AllBoonsSection = ({
    boons,
    activeBoonId,
    setActiveBoonId,
    scope,
    setScope,
    selectedFightIndex,
    setSelectedFightIndex,
    selectedPlayerKey,
    setSelectedPlayerKey,
}: AllBoonsSectionProps) => {
    const { expandedSection, openExpandedSection, closeExpandedSection, formatWithCommas, renderProfessionIcon } = useStatsSharedContext();
    const sectionId = 'all-boons';
    const isExpanded = expandedSection === sectionId;

    // ── Boon dropdown ──
    const [boonDropdownOpen, setBoonDropdownOpen] = useState(false);
    const [boonSearch, setBoonSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setBoonDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const activeBoon = useMemo(() => {
        if (!activeBoonId) return null;
        return boons.find((b) => b.id === activeBoonId) ?? null;
    }, [boons, activeBoonId]);

    const filteredBoons = useMemo(() => {
        const term = boonSearch.trim().toLowerCase();
        if (!term) return boons;
        return boons.filter((b) => b.name.toLowerCase().includes(term));
    }, [boons, boonSearch]);

    // ── Level 1: Per-fight chart data ──
    const fightChartData = useMemo(() => {
        if (!activeBoon) return [];
        return activeBoon.fights.map((fight, idx) => {
            const total = Object.entries(fight.values)
                .filter(([key]) => key !== '__all__')
                .reduce((sum, [, val]) => sum + getScopeTotal(val, scope), 0);
            return {
                index: idx,
                shortLabel: fight.shortLabel,
                fullLabel: fight.fullLabel,
                value: total,
            };
        });
    }, [activeBoon, scope]);

    const fightChartMaxY = useMemo(() => {
        const max = fightChartData.reduce((m, d) => Math.max(m, d.value), 0);
        return Math.max(1, Math.ceil(max * 1.1));
    }, [fightChartData]);

    // ── Level 2: Fight drilldown data ──
    const selectedFight = selectedFightIndex !== null && activeBoon ? activeBoon.fights[selectedFightIndex] ?? null : null;

    const [percentileFilter, setPercentileFilter] = useState<'all' | 'p95' | 'p75' | 'p50' | 'p25'>('all');
    const [hoveredPlayerKey, setHoveredPlayerKey] = useState<string | null>(null);

    const drilldownPlayersAll = useMemo(() => {
        if (!selectedFight || !activeBoon) return [];
        return Object.entries(selectedFight.values)
            .filter(([key]) => key !== '__all__')
            .map(([key, val]) => {
                const playerMeta = activeBoon.players.find((p) => p.key === key);
                return {
                    key,
                    account: playerMeta?.account || key,
                    displayName: playerMeta?.displayName || key,
                    profession: playerMeta?.profession || 'Unknown',
                    professionList: playerMeta?.professionList || [],
                    total: getScopeTotal(val, scope),
                    buckets5s: val.buckets5s,
                    bucketWeights5s: val.bucketWeights5s,
                };
            })
            .filter((p) => p.total > 0)
            .sort((a, b) => b.total - a.total);
    }, [selectedFight, activeBoon, scope]);

    const drilldownPlayers = useMemo(() => {
        if (percentileFilter === 'all' || drilldownPlayersAll.length === 0) return drilldownPlayersAll;
        const thresholdPct = { p95: 0.95, p75: 0.75, p50: 0.50, p25: 0.25 }[percentileFilter];
        const values = drilldownPlayersAll.map((p) => p.total);
        const sorted = [...values].sort((a, b) => a - b);
        const idx = Math.floor((sorted.length - 1) * thresholdPct);
        const cutoff = sorted[idx] ?? 0;
        return drilldownPlayersAll.filter((p) => p.total >= cutoff);
    }, [drilldownPlayersAll, percentileFilter]);

    const drilldownChartData = useMemo(() => {
        if (!selectedFight || drilldownPlayersAll.length === 0) return [];
        const bucketCount = drilldownPlayersAll.reduce(
            (max, p) => Math.max(max, p.buckets5s.length, p.bucketWeights5s.length), 0
        );
        return Array.from({ length: bucketCount }, (_, i) => {
            const point: Record<string, any> = {
                index: i,
                label: `${i * 5}s`,
            };
            drilldownPlayersAll.forEach((player) => {
                // Use buckets5s (scaled to total) if available, fall back to weights
                const buckets = player.buckets5s.length > 0 ? player.buckets5s : player.bucketWeights5s;
                const raw = Number(buckets[i] || 0);
                // Scale total to scope if using raw weights
                const playerScopeTotal = player.total;
                const rawSum = buckets.reduce((sum: number, v: number) => sum + Number(v || 0), 0);
                const scaleFactor = rawSum > 0 ? playerScopeTotal / rawSum : 0;
                point[player.key] = raw * scaleFactor;
            });
            return point;
        });
    }, [selectedFight, drilldownPlayersAll]);

    const drilldownMaxY = useMemo(() => {
        if (!drilldownChartData.length || !drilldownPlayers.length) return 1;
        let max = 0;
        drilldownChartData.forEach((point) => {
            drilldownPlayers.forEach((player) => {
                max = Math.max(max, Number(point[player.key] || 0));
            });
        });
        return Math.max(0.1, Math.ceil(max * 1.1));
    }, [drilldownChartData, drilldownPlayers]);

    const renderContent = (expanded: boolean) => (
        <div
            id={expanded ? undefined : sectionId}
            className={`rounded-xl overflow-hidden ${expanded ? 'h-full flex flex-col' : ''}`}
            style={{ scrollMarginTop: '80px' }}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 py-3 border-b axi-edge-rule">
                <div className="flex items-center gap-2">
                    <Gw2BoonIcon className="w-4 h-4" />
                    <span className="text-sm font-semibold axi-ink-plain">All Boons</span>

                    {/* Boon selector dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setBoonDropdownOpen(!boonDropdownOpen)}
                            className="axi-btn axi-btn--sm"
                        >
                            {activeBoon?.icon && (
                                <img src={activeBoon.icon} alt="" className="w-4 h-4 rounded" loading="lazy" />
                            )}
                            <span className="axi-ink-dim">{activeBoon?.name || 'Select boon'}</span>
                            <ChevronDown className="w-3 h-3 axi-ink-faint" />
                        </button>
                        {boonDropdownOpen && (
                            <div className="absolute top-full left-0 mt-2 z-50 w-80 rounded-lg border axi-edge-rule bg-[var(--bg-elevated)] shadow-xl">
                                <div className="p-2 border-b axi-edge-rule">
                                    <input
                                        type="text"
                                        value={boonSearch}
                                        onChange={(e) => setBoonSearch(e.target.value)}
                                        placeholder="Search boon"
                                        className="axi-input" style={{ '--axi-input-pad': '5px 8px', '--axi-input-size': '12px' } as React.CSSProperties}
                                        autoFocus
                                    />
                                </div>
                                <div className="max-h-64 overflow-y-auto p-1.5">
                                    <div className="grid grid-cols-3 gap-1.5">
                                        {filteredBoons.map((boon) => (
                                            <button
                                                key={boon.id}
                                                onClick={() => {
                                                    setActiveBoonId(boon.id);
                                                    setBoonDropdownOpen(false);
                                                    setBoonSearch('');
                                                    setSelectedFightIndex(null);
                                                    setSelectedPlayerKey(null);
                                                }}
                                                className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition-colors ${
                                                    activeBoonId === boon.id
                                                        ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30 axi-ink-plain'
                                                        : 'hover:bg-white/5 axi-ink-dim'
                                                }`}
                                            >
                                                {boon.icon && <img src={boon.icon} alt="" className="w-4 h-4 rounded" loading="lazy" />}
                                                <span className="truncate">{boon.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                    {filteredBoons.length === 0 && (
                                        <div className="text-xs axi-ink-faint text-center py-3">No boons found</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <PillToggleGroup
                        options={SCOPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                        value={scope}
                        onChange={(v) => setScope(v as BoonScope)}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
                    {!expanded && (
                        <button
                            onClick={() => openExpandedSection(sectionId)}
                            className="axi-btn axi-btn--icon axi-ink-dim"
                            title="Expand"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {expanded && (
                        <button
                            onClick={closeExpandedSection}
                            className="axi-btn axi-btn--icon axi-ink-dim"
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
                    {!activeBoon ? (
                        <div className="h-full flex items-center justify-center text-xs axi-ink-faint">Select a boon to view per-fight generation</div>
                    ) : fightChartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs axi-ink-faint">No fight data</div>
                    ) : (
                        <ChartContainer width="100%" height="100%">
                            <LineChart
                                data={fightChartData}
                                onClick={(state: any) => {
                                    const idx = Number(state?.activeTooltipIndex);
                                    if (!Number.isFinite(idx)) return;
                                    if (selectedFightIndex === idx) {
                                        setSelectedFightIndex(null);
                                        setSelectedPlayerKey(null);
                                    } else {
                                        setSelectedFightIndex(idx);
                                        setSelectedPlayerKey(null);
                                    }
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="shortLabel"
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    domain={[0, fightChartMaxY]}
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                    tickLine={false}
                                    tickFormatter={formatBoonValue}
                                    width={50}
                                />
                                <Tooltip content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const data = payload[0]?.payload;
                                    if (!data) return null;
                                    return (
                                        <ChartTooltipBox>
                                            <div className="axi-ink-plain font-medium mb-1">{sanitizeLabel(data.fullLabel)}</div>
                                            <div className="axi-ink-meta">
                                                Total Generation: <strong>{formatWithCommas(data.value / 1000, 0)}</strong>
                                            </div>
                                        </ChartTooltipBox>
                                    );
                                }} />
                                <Line
                                    dataKey="value"
                                    name="Total Generation"
                                    stroke="#22d3ee"
                                    strokeWidth={2.5}
                                    dot={(props: any) => {
                                        const idx = Number(props?.payload?.index);
                                        if (!Number.isFinite(idx)) return <g key={`dot-invalid-${props?.cx}-${props?.cy}`} />;
                                        const isSelected = selectedFightIndex === idx;
                                        return (
                                            <g key={`dot-${idx}`} style={{ cursor: 'pointer', pointerEvents: 'all' }}
                                                onClick={(e) => { e.stopPropagation(); setSelectedFightIndex(isSelected ? null : idx); setSelectedPlayerKey(null); }}>
                                                <circle cx={props.cx} cy={props.cy} r={10} fill="transparent" style={{ pointerEvents: 'all' }} />
                                                <circle cx={props.cx} cy={props.cy} r={isSelected ? 5 : 3}
                                                    fill="#22d3ee"
                                                    stroke={isSelected ? 'rgba(251,191,36,0.95)' : '#22d3ee'}
                                                    strokeWidth={isSelected ? 2.5 : 1} />
                                            </g>
                                        );
                                    }}
                                    activeDot={{ r: 5, fill: '#22d3ee', stroke: '#fff', strokeWidth: 2 }}
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
                        <div className="px-4 py-3 border-t axi-edge-rule">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] uppercase tracking-wider axi-ink-faint">
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
                                    <span className="text-[10px] axi-ink-faint">
                                        {drilldownPlayers.length}/{drilldownPlayersAll.length} players
                                    </span>
                                </div>
                                <button
                                    onClick={() => { setSelectedFightIndex(null); setSelectedPlayerKey(null); }}
                                    className="text-[10px] uppercase tracking-wider axi-ink-faint hover:text-slate-300 transition-colors"
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
                                            tickFormatter={formatBoonValue}
                                            width={50}
                                        />
                                        <Tooltip content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const sorted = [...payload].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
                                            return (
                                                <ChartTooltipBox className="max-h-64 overflow-y-auto">
                                                    <div className="axi-ink-plain font-medium mb-1">{(payload[0]?.payload as any)?.label}</div>
                                                    {sorted.slice(0, 10).map((entry) => (
                                                        <div key={entry.dataKey as string} className="flex items-center gap-1.5">
                                                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                                            <span className="axi-ink-dim truncate max-w-[120px]">
                                                                {drilldownPlayersAll.find((p) => p.key === entry.dataKey)?.displayName || entry.dataKey}
                                                            </span>
                                                            <span className="axi-ink-plain font-medium ml-auto">{formatWithCommas(Number(entry.value || 0) / 1000, 0)}</span>
                                                        </div>
                                                    ))}
                                                    {sorted.length > 10 && (
                                                        <div className="axi-ink-faint mt-1">+{sorted.length - 10} more</div>
                                                    )}
                                                </ChartTooltipBox>
                                            );
                                        }} />
                                        {drilldownPlayers.map((player) => {
                                            const isSelected = selectedPlayerKey === player.key;
                                            const isHovered = hoveredPlayerKey === player.key;
                                            const hasSelection = selectedPlayerKey !== null;
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
                                    const isSelected = selectedPlayerKey === player.key;
                                    const hasSelection = selectedPlayerKey !== null;
                                    const isDimmed = hasSelection && !isSelected;
                                    return (
                                        <button
                                            key={player.key}
                                            className={`flex items-center gap-1.5 text-xs transition-opacity ${isDimmed ? 'opacity-30' : 'opacity-100'} hover:opacity-100`}
                                            onClick={() => setSelectedPlayerKey(isSelected ? null : player.key)}
                                            onMouseEnter={() => setHoveredPlayerKey(player.key)}
                                            onMouseLeave={() => setHoveredPlayerKey(null)}
                                        >
                                            {renderProfessionIcon(player.profession, player.professionList, 'w-3.5 h-3.5')}
                                            <span className={`${isSelected ? 'axi-ink-plain font-medium' : 'axi-ink-dim'}`}>
                                                {player.displayName}
                                            </span>
                                            <span className="axi-ink-faint tabular-nums">{formatWithCommas(player.total / 1000, 0)}</span>
                                        </button>
                                    );
                                })}
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
