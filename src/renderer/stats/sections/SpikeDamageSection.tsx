import { useState } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Zap } from 'lucide-react';
import { getProfessionColor } from '../../../shared/professionUtils';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import { FightMetricSection } from './FightMetricSection';
import type { FightMetricPlayer, FightMetricPoint } from './FightMetricSection';
import type { StatsTocIcon } from '../hooks/useStatsNavigation';

type SpikeDamagePlayer = {
    key: string;
    account: string;
    displayName: string;
    characterName: string;
    profession: string;
    professionList: string[];
    logs: number;
    peakHit: number;
    peak1s: number;
    peak5s: number;
    peak30s: number;
    peakHitDown: number;
    peak1sDown: number;
    peak5sDown: number;
    peak30sDown: number;
    totalDamage?: number;
    peakFightLabel: string;
    peakSkillName: string;
};

type SpikeDamageFightPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    damage: number;
    maxDamage: number;
    skillName: string;
};
type SpikeDrilldownPoint = {
    label: string;
    value: number;
};
type SpikeSkillRow = {
    skillName: string;
    damage: number;
    downContribution?: number;
    hits: number;
    icon?: string;
};

type SpikeDamageSectionProps = {
    sectionId?: string;
    title?: string;
    subtitle?: string;
    listTitle?: string;
    searchPlaceholder?: string;
    titleIcon?: StatsTocIcon;
    titleIconClassName?: string;
    spikePlayerFilter: string;
    setSpikePlayerFilter: (value: string) => void;
    groupedSpikePlayers: Array<{ profession: string; players: SpikeDamagePlayer[] }>;
    spikeMode: 'hit' | '1s' | '5s' | '30s';
    setSpikeMode: (value: 'hit' | '1s' | '5s' | '30s') => void;
    showTotalDamageToggle?: boolean;
    useTotalDamage?: boolean;
    setUseTotalDamage?: (value: boolean) => void;
    damageBasis?: 'all' | 'downContribution';
    setDamageBasis?: (value: 'all' | 'downContribution') => void;
    showDamageBasisToggle?: boolean;
    selectedSpikePlayerKey: string | null;
    setSelectedSpikePlayerKey: (value: string | null) => void;
    selectedSpikePlayer: SpikeDamagePlayer | null;
    spikeChartData: SpikeDamageFightPoint[];
    spikeChartMaxY: number;
    selectedSpikeFightIndex: number | null;
    setSelectedSpikeFightIndex: (value: number | null) => void;
    spikeDrilldownTitle: string;
    spikeDrilldownData: SpikeDrilldownPoint[];
    spikeDrilldownDownIndices: number[];
    spikeDrilldownDeathIndices: number[];
    spikeFightSkillRows?: SpikeSkillRow[];
    spikeFightSkillTitle?: string;
};

export const SpikeDamageSection = ({
    sectionId = 'spike-damage',
    title = 'Spike Damage',
    listTitle = 'Squad Players',
    searchPlaceholder = 'Search player or account',
    titleIcon = Zap,
    titleIconClassName = 'text-rose-300',
    spikePlayerFilter,
    setSpikePlayerFilter,
    groupedSpikePlayers,
    spikeMode,
    setSpikeMode,
    showTotalDamageToggle = false,
    useTotalDamage = false,
    setUseTotalDamage,
    damageBasis = 'all',
    setDamageBasis,
    showDamageBasisToggle = false,
    selectedSpikePlayerKey,
    setSelectedSpikePlayerKey,
    selectedSpikePlayer,
    spikeChartData,
    spikeChartMaxY,
    selectedSpikeFightIndex,
    setSelectedSpikeFightIndex,
    spikeDrilldownTitle,
    spikeDrilldownData,
    spikeDrilldownDownIndices,
    spikeDrilldownDeathIndices,
    spikeFightSkillRows = [],
    spikeFightSkillTitle = 'Skill Damage (Selected Fight)',
}: SpikeDamageSectionProps) => {
    const { formatWithCommas } = useStatsSharedContext();
    const [hoveredMarkerKey, setHoveredMarkerKey] = useState<string | null>(null);
    const [hoveredMarkerInfo, setHoveredMarkerInfo] = useState<null | {
        x: number; y: number; kind: 'down' | 'death'; label: string;
    }>(null);

    const isDownContributionMode = damageBasis === 'downContribution';

    const peakValueForPlayer = (player: SpikeDamagePlayer) => (
        useTotalDamage
            ? Number(player.totalDamage || 0)
            : spikeMode === 'hit'
                ? (isDownContributionMode ? player.peakHitDown : player.peakHit)
                : spikeMode === '1s'
                    ? (isDownContributionMode ? player.peak1sDown : player.peak1s)
                    : spikeMode === '5s'
                        ? (isDownContributionMode ? player.peak5sDown : player.peak5s)
                        : (isDownContributionMode ? player.peak30sDown : player.peak30s)
    );

    // Map SpikeDamagePlayer[] → FightMetricPlayer[]
    const mappedGroups = groupedSpikePlayers.map((group) => ({
        profession: group.profession,
        players: group.players.map((p): FightMetricPlayer => ({
            key: p.key, account: p.account, displayName: p.displayName,
            characterName: p.characterName, profession: p.profession,
            professionList: p.professionList, logs: p.logs,
            value: peakValueForPlayer(p),
            peakFightLabel: p.peakFightLabel,
        })),
    }));

    // Map SpikeDamageFightPoint[] → FightMetricPoint[]
    const mappedChartData: FightMetricPoint[] = spikeChartData.map((p) => ({
        index: p.index, fightId: p.fightId, shortLabel: p.shortLabel,
        fullLabel: p.fullLabel, timestamp: p.timestamp,
        value: p.damage, maxValue: p.maxDamage,
    }));

    const mappedPlayer: FightMetricPlayer | null = selectedSpikePlayer ? {
        key: selectedSpikePlayer.key, account: selectedSpikePlayer.account,
        displayName: selectedSpikePlayer.displayName,
        characterName: selectedSpikePlayer.characterName,
        profession: selectedSpikePlayer.profession,
        professionList: selectedSpikePlayer.professionList,
        logs: selectedSpikePlayer.logs,
        value: peakValueForPlayer(selectedSpikePlayer),
        peakFightLabel: selectedSpikePlayer.peakFightLabel,
    } : null;

    const selectedLineColor = selectedSpikePlayer
        ? (getProfessionColor(selectedSpikePlayer.profession) || '#fda4af')
        : '#fda4af';

    // Drilldown marker logic
    const drilldownMax = spikeDrilldownData.reduce((max, point) => Math.max(max, Number(point.value || 0)), 0);
    const markerBaseline = Math.max(1, drilldownMax);
    const downIndexSet = new Set(spikeDrilldownDownIndices);
    const deathIndexSet = new Set(spikeDrilldownDeathIndices);
    const drilldownSeries = spikeDrilldownData.map((point, index) => ({
        ...point,
        downMarker: downIndexSet.has(index) ? Math.max(Number(point.value || 0), markerBaseline * 0.88) : null,
        deathMarker: deathIndexSet.has(index) ? Math.max(Number(point.value || 0), markerBaseline * 0.96) : null,
    }));

    const makeMarkerDot = (kind: 'down' | 'death') => (props: any) => {
        const cx = Number(props?.cx);
        const cy = Number(props?.cy);
        const index = Number(props?.index);
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(index)) return null;
        const point = props?.payload || {};
        const markerValue = kind === 'down' ? point?.downMarker : point?.deathMarker;
        if (!Number.isFinite(Number(markerValue))) return null;
        const key = `${kind}-${index}`;
        const hovered = hoveredMarkerKey === key;
        const fill = kind === 'down' ? '#facc15' : '#ef4444';
        const glow = kind === 'down' ? '#fde047' : '#f87171';
        return (
            <g style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onMouseEnter={() => { setHoveredMarkerKey(key); setHoveredMarkerInfo({ x: cx, y: cy, kind, label: String(point?.label || '') }); }}
                onMouseLeave={() => { setHoveredMarkerKey((c) => (c === key ? null : c)); setHoveredMarkerInfo((c) => (c?.kind === kind && c?.label === String(point?.label || '') ? null : c)); }}>
                <circle cx={cx} cy={cy} r={hovered ? 10 : 7} fill={glow} opacity={hovered ? 0.35 : 0.18} />
                <circle cx={cx} cy={cy} r={hovered ? 7 : 5.5} fill={fill} stroke="#0f172a" strokeWidth={hovered ? 2.25 : 1.75} />
            </g>
        );
    };

    const modes = useTotalDamage ? [] : [
        { id: 'hit', label: 'Highest Damage' },
        { id: '1s', label: '1s' },
        { id: '5s', label: '5s' },
        { id: '30s', label: '30s' },
    ];

    return (
        <FightMetricSection
            sectionId={sectionId}
            title={title}
            titleIcon={titleIcon}
            titleIconClassName={titleIconClassName}
            listTitle={listTitle}
            searchPlaceholder={searchPlaceholder}
            modes={modes}
            activeMode={spikeMode}
            setActiveMode={(v) => setSpikeMode(v as 'hit' | '1s' | '5s' | '30s')}
            playerFilter={spikePlayerFilter}
            setPlayerFilter={setSpikePlayerFilter}
            groupedPlayers={mappedGroups}
            selectedPlayerKey={selectedSpikePlayerKey}
            setSelectedPlayerKey={setSelectedSpikePlayerKey}
            selectedPlayer={mappedPlayer}
            chartData={mappedChartData}
            chartMaxY={spikeChartMaxY}
            formatValue={(v) => formatWithCommas(v, 0)}
            selectedFightIndex={selectedSpikeFightIndex}
            setSelectedFightIndex={setSelectedSpikeFightIndex}
            headerExtras={<>
                {showTotalDamageToggle && setUseTotalDamage && (
                    <PillToggleGroup
                        value={useTotalDamage ? 'allDamage' : 'peak'}
                        onChange={(value) => setUseTotalDamage(value === 'allDamage')}
                        options={[{ value: 'peak', label: 'Peak' }, { value: 'allDamage', label: 'All Damage' }]}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
                )}
                {showDamageBasisToggle && setDamageBasis && (
                    <PillToggleGroup
                        value={damageBasis}
                        onChange={(value) => setDamageBasis(value as 'all' | 'downContribution')}
                        options={[{ value: 'all', label: 'Damage' }, { value: 'downContribution', label: 'Down Contrib' }]}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
                )}
            </>}
            drilldownTitle={spikeDrilldownTitle}
            renderDrilldown={() => (
                <div className="h-[220px] relative">
                    {spikeDrilldownData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">
                            No detailed data available for this fight.
                        </div>
                    ) : (
                        <>
                            <ChartContainer width="100%" height="100%">
                                <LineChart data={drilldownSeries}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false}
                                        tickFormatter={(value: number) => formatWithCommas(value, 0)} width={50} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0]?.payload;
                                            if (!d) return null;
                                            return (
                                                <div className="bg-slate-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
                                                    <div className="text-slate-200 font-medium mb-1">{d.label}</div>
                                                    <div className="text-indigo-300">Damage: <strong>{formatWithCommas(Number(d.value || 0), 0)}</strong></div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Line type="monotone" dataKey="value" name="Damage" stroke={selectedLineColor} strokeWidth={2.5}
                                        dot={spikeMode === 'hit' ? { r: 2 } : false} activeDot={{ r: 4 }}
                                        isAnimationActive animationDuration={600} animationEasing="ease-out" />
                                    <Line type="linear" dataKey="downMarker" name="Down" stroke="transparent" connectNulls={false}
                                        isAnimationActive={false} activeDot={false} dot={makeMarkerDot('down')} />
                                    <Line type="linear" dataKey="deathMarker" name="Death" stroke="transparent" connectNulls={false}
                                        isAnimationActive={false} activeDot={false} dot={makeMarkerDot('death')} />
                                </LineChart>
                            </ChartContainer>
                            {hoveredMarkerInfo && (
                                <div className="pointer-events-none absolute z-20 rounded-md border border-white/10 bg-slate-900/95 px-2 py-1 text-xs shadow-xl"
                                    style={{ left: `${Math.max(8, hoveredMarkerInfo.x)}px`, top: `${Math.max(8, hoveredMarkerInfo.y - 38)}px`, transform: 'translate(-50%, -100%)' }}>
                                    <div className={`${hoveredMarkerInfo.kind === 'down' ? 'text-yellow-300' : 'text-red-300'} font-semibold`}>
                                        {hoveredMarkerInfo.kind === 'down' ? 'Down' : 'Death'}
                                    </div>
                                    <div className="text-slate-500">{hoveredMarkerInfo.label}</div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            renderFooter={spikeFightSkillRows.length > 0 ? () => {
                const metricValue = (row: SpikeSkillRow) => isDownContributionMode
                    ? Number(row.downContribution || 0) : Number(row.damage || 0);
                const displayRows = [...spikeFightSkillRows]
                    .filter((row) => metricValue(row) > 0)
                    .sort((a, b) => metricValue(b) - metricValue(a) || Number(b.hits || 0) - Number(a.hits || 0))
                    .slice(0, 30);
                if (displayRows.length === 0) return null;
                return (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500">{spikeFightSkillTitle}</span>
                            <span className="text-[10px] text-slate-500">{displayRows.length} {displayRows.length === 1 ? 'skill' : 'skills'}</span>
                        </div>
                        <div className="rounded-lg overflow-hidden border border-white/5">
                            <div className="grid grid-cols-[2fr_0.8fr_0.8fr] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                                <div>Skill</div>
                                <div className="text-right">{isDownContributionMode ? 'Down Contrib' : 'Damage'}</div>
                                <div className="text-right">Hits</div>
                            </div>
                            <div className="max-h-[260px] overflow-y-auto">
                                {displayRows.map((row, idx) => (
                                    <div key={`${row.skillName}-${idx}`}
                                        className="grid grid-cols-[2fr_0.8fr_0.8fr] gap-2 px-3 py-2.5 text-sm text-slate-300 border-b border-white/5 hover:bg-white/[0.03] last:border-b-0">
                                        <div className="min-w-0 flex items-center gap-2">
                                            {row.icon ? (
                                                <img src={row.icon} alt="" loading="lazy"
                                                    className="w-4 h-4 rounded-sm border border-white/10 bg-white/5 flex-shrink-0" />
                                            ) : (
                                                <div className="w-4 h-4 rounded-sm border border-white/10 bg-white/5 flex-shrink-0" />
                                            )}
                                            <div className="truncate" title={row.skillName}>{row.skillName}</div>
                                        </div>
                                        <div className="text-right font-mono text-indigo-300">{formatWithCommas(metricValue(row), 0)}</div>
                                        <div className="text-right font-mono text-slate-500">{formatWithCommas(Number(row.hits || 0), 0)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                );
            } : undefined}
        />
    );
};
