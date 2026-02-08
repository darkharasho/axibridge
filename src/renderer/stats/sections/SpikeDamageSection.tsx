import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, Zap, X } from 'lucide-react';
import { getProfessionColor } from '../../../shared/professionUtils';
import { PillToggleGroup } from '../ui/PillToggleGroup';

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

type SpikeDamageSectionProps = {
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    spikePlayerFilter: string;
    setSpikePlayerFilter: (value: string) => void;
    groupedSpikePlayers: Array<{ profession: string; players: SpikeDamagePlayer[] }>;
    spikeMode: 'hit' | '1s' | '5s';
    setSpikeMode: (value: 'hit' | '1s' | '5s') => void;
    selectedSpikePlayerKey: string | null;
    setSelectedSpikePlayerKey: (value: string | null) => void;
    selectedSpikePlayer: SpikeDamagePlayer | null;
    spikeChartData: SpikeDamageFightPoint[];
    spikeChartMaxY: number;
    selectedSpikeFightIndex: number | null;
    setSelectedSpikeFightIndex: (value: number | null) => void;
    spikeDrilldownTitle: string;
    spikeDrilldownData: SpikeDrilldownPoint[];
    formatWithCommas: (value: number, decimals: number) => string;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
};

export const SpikeDamageSection = ({
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
    spikePlayerFilter,
    setSpikePlayerFilter,
    groupedSpikePlayers,
    spikeMode,
    setSpikeMode,
    selectedSpikePlayerKey,
    setSelectedSpikePlayerKey,
    selectedSpikePlayer,
    spikeChartData,
    spikeChartMaxY,
    selectedSpikeFightIndex,
    setSelectedSpikeFightIndex,
    spikeDrilldownTitle,
    spikeDrilldownData,
    formatWithCommas,
    renderProfessionIcon
}: SpikeDamageSectionProps) => {
    const sanitizeWvwLabel = (value: string) => String(value || '')
        .replace(/^Detailed\s*WvW\s*-\s*/i, '')
        .replace(/^World\s*vs\s*World\s*-\s*/i, '')
        .replace(/^WvW\s*-\s*/i, '')
        .trim();
    const isExpanded = expandedSection === 'spike-damage';
    const selectedLineColor = selectedSpikePlayer
        ? (getProfessionColor(selectedSpikePlayer.profession) || '#fda4af')
        : '#fda4af';
    const modeLabel = spikeMode === 'hit' ? 'Highest Damage' : spikeMode === '1s' ? '1s Burst' : '5s Burst';
    const peakValueForPlayer = (player: SpikeDamagePlayer) => (
        spikeMode === 'hit' ? player.peakHit : spikeMode === '1s' ? player.peak1s : player.peak5s
    );
    const flatSpikePlayers = groupedSpikePlayers
        .flatMap((group) => group.players.map((player) => ({ ...player, groupProfession: group.profession })))
        .sort((a, b) => {
            const valueDiff = peakValueForPlayer(b) - peakValueForPlayer(a);
            if (valueDiff !== 0) return valueDiff;
            return a.displayName.localeCompare(b.displayName);
        });
    const topFight = spikeChartData.reduce((best, entry) => {
        if (!best || entry.damage > best.damage) return entry;
        return best;
    }, null as SpikeDamageFightPoint | null);
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
            id="spike-damage"
            data-section-visible={isSectionVisible('spike-damage')}
            data-section-first={isFirstVisibleSection('spike-damage')}
            className={sectionClass('spike-damage', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${isExpanded
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}`
                : 'overflow-hidden'
                }`)}
        >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4 relative">
                <div className={isExpanded ? 'pr-10 md:pr-0' : ''}>
                    <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-rose-300" />
                        Spike Damage
                    </h3>
                    <p className="text-xs text-gray-400">
                        Select one player to chart their highest damage burst per fight.
                    </p>
                </div>
                <div className={`flex items-center gap-3 ${isExpanded ? 'pr-10 md:pr-0' : ''}`}>
                    <PillToggleGroup
                        value={spikeMode}
                        onChange={(value) => setSpikeMode(value as 'hit' | '1s' | '5s')}
                        options={[
                            { value: 'hit', label: 'Highest Damage' },
                            { value: '1s', label: '1s' },
                            { value: '5s', label: '5s' }
                        ]}
                        activeClassName="bg-rose-500/20 text-rose-200 border border-rose-500/40"
                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                    />
                    <button
                        type="button"
                        onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection('spike-damage'))}
                        className={`p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors ${isExpanded ? 'absolute top-2 right-2 md:static' : ''}`}
                        aria-label={isExpanded ? 'Close Spike Damage' : 'Expand Spike Damage'}
                        title={isExpanded ? 'Close' : 'Expand'}
                    >
                        {isExpanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 items-stretch">
                <div className="space-y-2 flex flex-col h-[320px]">
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                        Squad Players
                    </div>
                    <input
                        type="search"
                        value={spikePlayerFilter}
                        onChange={(event) => setSpikePlayerFilter(event.target.value)}
                        placeholder="Search player or account"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 focus:border-rose-400 focus:outline-none"
                    />
                    <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/20">
                        {flatSpikePlayers.length === 0 ? (
                            <div className="px-3 py-4 text-xs text-gray-500 italic">
                                No players match the filter.
                            </div>
                        ) : (
                            <div className="p-1.5 space-y-1">
                                {flatSpikePlayers.map((player) => {
                                    const isSelected = selectedSpikePlayerKey === player.key;
                                    return (
                                        <button
                                            key={player.key}
                                            type="button"
                                            onClick={() => setSelectedSpikePlayerKey(player.key)}
                                            className={`w-full rounded-md border px-2.5 py-1.5 text-left transition-colors ${isSelected
                                                ? 'border-rose-300/60 bg-rose-400/10 text-white'
                                                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderProfessionIcon(player.profession, undefined, 'w-3.5 h-3.5')}
                                                        <div className="text-sm font-semibold truncate text-white">{player.displayName}</div>
                                                        <span className="text-[9px] uppercase tracking-[0.14em] text-gray-400 shrink-0">
                                                            {player.groupProfession}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 truncate">
                                                        {player.characterName || player.displayName} · {player.logs} {player.logs === 1 ? 'fight' : 'fights'}
                                                    </div>
                                                </div>
                                                <div className="text-xs font-mono text-rose-200 shrink-0">
                                                    {formatWithCommas(peakValueForPlayer(player) || 0, 0)}
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
                            Per Fight {modeLabel}
                        </div>
                        <div className="text-[11px] text-gray-500">
                            {spikeChartData.length} {spikeChartData.length === 1 ? 'fight' : 'fights'}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 flex-1 min-h-0">
                        {!selectedSpikePlayer || spikeChartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-gray-500">
                                Select one player to view burst damage by fight.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={spikeChartData}
                                    onClick={(state: any) => {
                                        const idx = Number(state?.activeTooltipIndex);
                                        if (!Number.isFinite(idx)) return;
                                        setSelectedSpikeFightIndex(selectedSpikeFightIndex === idx ? null : idx);
                                    }}
                                >
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="shortLabel" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                    <YAxis
                                        tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                        domain={[0, Math.max(1, spikeChartMaxY)]}
                                        tickFormatter={(value: number) => formatWithCommas(value, 0)}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any, name: any) => [formatWithCommas(Number(value || 0), 0), String(name || '')]}
                                        labelFormatter={(_, payload?: readonly any[]) => {
                                            const point = payload?.[0]?.payload;
                                            if (!point) return '';
                                            const cleanLabel = sanitizeWvwLabel(point.fullLabel || '');
                                            if (spikeMode === 'hit' && point.skillName) {
                                                return `${cleanLabel} · ${point.skillName}`;
                                            }
                                            return cleanLabel;
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="damage"
                                        name={selectedSpikePlayer.displayName}
                                        stroke={selectedLineColor}
                                        strokeWidth={3}
                                        dot={(props: any) => {
                                            const idx = Number(props?.payload?.index);
                                            if (!Number.isFinite(idx)) return null;
                                            const isSelected = selectedSpikeFightIndex === idx;
                                            return (
                                                <g
                                                    style={{ cursor: 'pointer', pointerEvents: 'all' }}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setSelectedSpikeFightIndex(isSelected ? null : idx);
                                                    }}
                                                >
                                                    <circle
                                                        cx={props.cx}
                                                        cy={props.cy}
                                                        r={10}
                                                        fill="transparent"
                                                        style={{ pointerEvents: 'all' }}
                                                    />
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
                                        dataKey="maxDamage"
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

            {selectedSpikePlayer && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 grid gap-3 md:grid-cols-3">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">Selected Player</div>
                        <div className="mt-1 text-sm font-semibold text-white flex items-center gap-2 min-w-0">
                            {renderProfessionIcon(selectedSpikePlayer.profession, selectedSpikePlayer.professionList, 'w-4 h-4')}
                            <span className="truncate">{selectedSpikePlayer.displayName}</span>
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">
                            {spikeMode === 'hit' ? 'Peak Highest Skill Damage' : `Peak ${modeLabel}`}
                        </div>
                        <div className="mt-1 text-lg font-black text-rose-200 font-mono">
                            {formatWithCommas(peakValueForPlayer(selectedSpikePlayer) || 0, 0)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">
                            {spikeMode === 'hit' ? 'Peak Skill / Fight' : 'Peak Fight'}
                        </div>
                        <div className="mt-1 text-sm text-gray-200 truncate">
                            {(() => {
                                const bestLabel = sanitizeWvwLabel(topFight?.fullLabel || selectedSpikePlayer.peakFightLabel || 'N/A');
                                const timeLabel = formatFightTimestamp(Number(topFight?.timestamp || 0));
                                const fightWithTime = timeLabel ? `${timeLabel} - ${bestLabel}` : bestLabel;
                                if (spikeMode !== 'hit') return fightWithTime;
                                return selectedSpikePlayer.peakSkillName
                                    ? `${selectedSpikePlayer.peakSkillName} · ${fightWithTime}`
                                    : fightWithTime;
                            })()}
                        </div>
                    </div>
                </div>
            )}
            {selectedSpikePlayer && selectedSpikeFightIndex !== null && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] uppercase tracking-[0.35em] text-gray-500">{spikeDrilldownTitle}</div>
                        <button
                            type="button"
                            onClick={() => setSelectedSpikeFightIndex(null)}
                            className="text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-gray-200"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="h-[220px]">
                        {spikeDrilldownData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-gray-500">
                                No detailed data available for this fight.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={spikeDrilldownData}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                    <YAxis
                                        tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                        tickFormatter={(value: number) => formatWithCommas(value, 0)}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any) => [formatWithCommas(Number(value || 0), 0), 'Damage']}
                                        labelFormatter={(value: any) => String(value || '')}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        name="Damage"
                                        stroke={selectedLineColor}
                                        strokeWidth={2.5}
                                        dot={spikeMode === 'hit' ? { r: 2 } : false}
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
