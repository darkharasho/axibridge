import type { Dispatch, SetStateAction } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, ChevronDown, ChevronRight, Maximize2, X, XCircle, Zap } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';

type SkillUsageSectionProps = {
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    selectedPlayers: string[];
    setSelectedPlayers: Dispatch<SetStateAction<string[]>>;
    removeSelectedPlayer: (key: string) => void;
    playerMapByKey: Map<string, any>;
    groupedSkillUsagePlayers: any[];
    expandedSkillUsageClass: string | null;
    setExpandedSkillUsageClass: Dispatch<SetStateAction<string | null>>;
    togglePlayerSelection: (key: string) => void;
    skillUsagePlayerFilter: string;
    setSkillUsagePlayerFilter: (value: string) => void;
    skillUsageView: 'total' | 'perSecond';
    setSkillUsageView: (value: 'total' | 'perSecond') => void;
    skillUsageData: any;
    skillUsageSkillFilter: string;
    setSkillUsageSkillFilter: (value: string) => void;
    selectedSkillId: any;
    setSelectedSkillId: (value: any) => void;
    skillBarData: any[];
    selectedSkillName: string;
    skillUsageReady: boolean;
    skillUsageAvailable: boolean;
    isSkillUsagePerSecond: boolean;
    skillChartData: any[];
    skillChartMaxY: number;
    playerTotalsForSkill: Record<string, number>;
    hoveredSkillPlayer: string[];
    setHoveredSkillPlayer: Dispatch<SetStateAction<string[]>>;
    getLineStrokeColor: (playerKey: string, isSelected: boolean, hasSelection: boolean) => string;
    getLineDashForPlayer: (playerKey: string) => string | undefined;
    formatSkillUsageValue: (value: number) => string;
    formatCastRateValue: (value: number) => string;
    formatCastCountValue: (value: number) => string;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
};

export const SkillUsageSection = ({
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
    selectedPlayers,
    setSelectedPlayers,
    removeSelectedPlayer,
    playerMapByKey,
    groupedSkillUsagePlayers,
    expandedSkillUsageClass,
    setExpandedSkillUsageClass,
    togglePlayerSelection,
    skillUsagePlayerFilter,
    setSkillUsagePlayerFilter,
    skillUsageView,
    setSkillUsageView,
    skillUsageData,
    skillUsageSkillFilter,
    setSkillUsageSkillFilter,
    selectedSkillId,
    setSelectedSkillId,
    skillBarData,
    selectedSkillName,
    skillUsageReady,
    skillUsageAvailable,
    isSkillUsagePerSecond,
    skillChartData,
    skillChartMaxY,
    playerTotalsForSkill,
    hoveredSkillPlayer,
    setHoveredSkillPlayer,
    getLineStrokeColor,
    getLineDashForPlayer,
    formatSkillUsageValue,
    formatCastRateValue,
    formatCastCountValue,
    renderProfessionIcon
}: SkillUsageSectionProps) => (
    <div
        id="skill-usage"
        data-section-visible={isSectionVisible('skill-usage')}
        data-section-first={isFirstVisibleSection('skill-usage')}
        className={sectionClass('skill-usage', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
            expandedSection === 'skill-usage'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : 'overflow-hidden'
        }`)}
    >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4 relative">
            <div className={expandedSection === 'skill-usage' ? 'pr-10 md:pr-0' : ''}>
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-cyan-400" />
                    Skill Usage Tracker
                </h3>
                <p className="text-xs text-gray-400">
                    Compare how often squad members cast a skill and drill into the timeline breakdown.
                </p>
            </div>
            <div className="flex items-center gap-3">
                <PillToggleGroup
                    value={skillUsageView}
                    onChange={setSkillUsageView}
                    options={[
                        { value: 'total', label: 'Total' },
                        { value: 'perSecond', label: 'Per Sec' }
                    ]}
                    activeClassName="bg-cyan-500/20 text-cyan-200 border border-cyan-400/40"
                    inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                />
                <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
                    {skillUsageData.logRecords.length} {skillUsageData.logRecords.length === 1 ? 'log' : 'logs'}
                </div>
                <button
                    type="button"
                    onClick={() => (expandedSection === 'skill-usage' ? closeExpandedSection() : openExpandedSection('skill-usage'))}
                    className={`p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors ${
                        expandedSection === 'skill-usage' ? 'absolute top-2 right-2 md:static' : ''
                    }`}
                    aria-label={expandedSection === 'skill-usage' ? 'Close Skill Usage' : 'Expand Skill Usage'}
                    title={expandedSection === 'skill-usage' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'skill-usage' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>
        </div>
        {selectedPlayers.length > 0 && (
            <div className="flex items-center gap-2 pb-2 overflow-x-auto pr-1 -mx-1 px-1">
                <button
                    type="button"
                    onClick={() => setSelectedPlayers([])}
                    className="shrink-0 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[10px] uppercase tracking-widest text-gray-300 hover:text-white"
                >
                    Clear All
                </button>
                {selectedPlayers.map((playerKey) => {
                    const player = playerMapByKey.get(playerKey);
                    if (!player) return null;
                    return (
                        <span key={player.key} className="flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200 shrink-0">
                            <span className="truncate max-w-[140px]">{player.displayName}</span>
                            <span className="text-[10px] text-cyan-200/70">{player.logs} {player.logs === 1 ? 'log' : 'logs'}</span>
                            <button type="button" onClick={() => removeSelectedPlayer(player.key)} className="rounded-full p-1 text-cyan-200 hover:bg-white/20">
                                <XCircle className="w-3 h-3" />
                            </button>
                        </span>
                    );
                })}
            </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2 items-stretch">
            <div className="space-y-2 flex flex-col h-[320px]">
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                    Squad Players
                </div>
                <input
                    type="search"
                    value={skillUsagePlayerFilter}
                    onChange={(event) => setSkillUsagePlayerFilter(event.target.value)}
                    placeholder="Search player or account"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 focus:border-cyan-400 focus:outline-none"
                />
                <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/20">
                    {groupedSkillUsagePlayers.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-gray-500 italic">
                            No squad players match the filter
                        </div>
                    ) : (
                        groupedSkillUsagePlayers.map((group) => {
                            const isExpanded = expandedSkillUsageClass === group.profession;
                            const groupKeys = group.players.map((player) => player.key);
                            const allSelected = groupKeys.length > 0 && groupKeys.every((key) => selectedPlayers.includes(key));
                            return (
                                <div key={group.profession} className="border-b border-white/5 last:border-b-0">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isExpanded) {
                                                setExpandedSkillUsageClass(null);
                                                return;
                                            }
                                            setExpandedSkillUsageClass(group.profession);
                                        }}
                                        className={`w-full px-3 py-2 text-left transition-colors ${isExpanded ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {renderProfessionIcon(group.profession, undefined, 'w-4 h-4')}
                                                <div className="text-sm font-semibold truncate text-white">{group.profession}</div>
                                            </div>
                                            <div className="flex items-center gap-2 text-gray-400">
                                                <span className="text-[10px]">{group.players.length}p</span>
                                                {isExpanded ? (
                                                    <ChevronDown className="w-3.5 h-3.5" />
                                                ) : (
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                    {isExpanded && (
                                        <div className="pb-2">
                                            <div className="px-6 pt-1 pb-2 flex items-center justify-between text-[11px] text-gray-400">
                                                <span>{group.players.length} {group.players.length === 1 ? 'player' : 'players'}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedPlayers((prev) => {
                                                            if (allSelected) {
                                                                return prev.filter((key) => !groupKeys.includes(key));
                                                            }
                                                            const next = new Set(prev);
                                                            groupKeys.forEach((key) => next.add(key));
                                                            return Array.from(next);
                                                        });
                                                    }}
                                                    className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-[10px] uppercase tracking-widest text-gray-300 hover:text-white"
                                                >
                                                    {allSelected ? 'Clear All' : 'Select All'}
                                                </button>
                                            </div>
                                            {group.players.map((player) => {
                                                const isSelected = selectedPlayers.includes(player.key);
                                                return (
                                                    <button
                                                        type="button"
                                                        key={player.key}
                                                        onClick={() => togglePlayerSelection(player.key)}
                                                        className={`w-full border-b border-white/5 px-6 py-2 text-left transition-colors last:border-b-0 ${isSelected ? 'border-cyan-400 bg-cyan-500/10 text-white' : 'border-transparent hover:border-white/10 hover:bg-white/5'}`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <div className="text-sm font-semibold truncate text-white">{player.displayName}</div>
                                                                <div className="text-[11px] text-gray-400">
                                                                    {player.account} · {player.profession} · {player.logs} {player.logs === 1 ? 'log' : 'logs'}
                                                                </div>
                                                            </div>
                                                            {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-300" />}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
            <div className="space-y-2 flex flex-col h-[320px]">
                <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
                        Skill Totals
                    </div>
                    <div className="text-[11px] text-gray-500">
                        {selectedPlayers.length > 0
                            ? `${selectedPlayers.length} player${selectedPlayers.length === 1 ? '' : 's'} · ${isSkillUsagePerSecond ? 'casts/sec' : 'total casts'}`
                            : 'Select players'}
                    </div>
                </div>
                <input
                    type="search"
                    value={skillUsageSkillFilter}
                    onChange={(event) => setSkillUsageSkillFilter(event.target.value)}
                    placeholder="Filter skill names"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-200 focus:border-cyan-400 focus:outline-none"
                />
                <div className="rounded-2xl border border-white/10 bg-black/20 p-0.5 flex-1 min-h-0">
                    {selectedPlayers.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-xs text-gray-500">
                            Select squad players to see the skills they cast.
                        </div>
                    ) : skillBarData.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-xs text-gray-500">
                            No skill casts found for the selected players.
                        </div>
                    ) : (
                        (() => {
                            const maxSkillTotal = skillBarData.reduce((max, entry) => Math.max(max, entry.total), 0) || 1;
                            return (
                                <div className="space-y-0.5 h-full overflow-y-auto pr-0.5">
                                    {skillBarData.map((entry, index) => {
                                        const widthPct = Math.min(100, (entry.total / maxSkillTotal) * 100);
                                        const isSelected = selectedSkillId === entry.skillId;
                                        return (
                                            <button
                                                key={entry.skillId}
                                                type="button"
                                                onClick={() => setSelectedSkillId(entry.skillId)}
                                                className={`w-full space-y-1 rounded-lg border px-2 py-1.5 text-left transition-colors ${isSelected ? 'border-white/60 bg-white/10' : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'}`}
                                            >
                                                <div className="flex items-center justify-between text-sm text-white min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400">{`#${index + 1}`}</span>
                                                        <span className="font-semibold truncate min-w-0 flex-1 block max-w-[58vw] sm:max-w-none sm:whitespace-normal sm:overflow-visible">{entry.name}</span>
                                                    </div>
                                                    <span className="text-cyan-200 font-mono text-xs shrink-0">{formatSkillUsageValue(entry.total)}</span>
                                                </div>
                                                <div className="h-1 w-full rounded-full bg-white/10">
                                                    <div
                                                        className="h-full rounded-full transition-all"
                                                        style={{ width: `${widthPct}%`, backgroundColor: entry.color }}
                                                    />
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })()
                    )}
                </div>
            </div>
        </div>
        <div className="space-y-3">
            {skillUsageReady ? (
                <div className="space-y-4">
                    <div className="space-y-4 rounded-2xl bg-black/50 p-4 mt-2">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-gray-200">
                                {selectedSkillName || 'Selected Skill Usage'}
                            </div>
                            <div className="text-[11px] text-gray-400">
                                ({isSkillUsagePerSecond ? 'casts per second' : 'casts per log'})
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={skillChartData}>
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="index"
                                    type="number"
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                    interval={0}
                                    tickFormatter={(value: number) => {
                                        const entry = skillChartData[value];
                                        const label = String(entry?.shortLabel ?? value);
                                        return label.length > 20 ? `${label.slice(0, 20)}…` : label;
                                    }}
                                />
                                <YAxis
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                    domain={[0, Math.max(1, skillChartMaxY)]}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload || payload.length === 0) return null;
                                        const sorted = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
                                        const first = sorted[0];
                                        const header = (first?.payload as any)?.fullLabel || label;
                                        return (
                                            <div className="rounded-lg bg-slate-900/95 border border-white/10 px-3 py-2 shadow-xl">
                                                <div className="text-sm text-white mb-1">{header}</div>
                                                <div className="space-y-1">
                                                    {sorted.map((item) => {
                                                        const name = String(item.name || '');
                                                        const player = playerMapByKey.get(name);
                                                        const labelText = player?.displayName || name || 'Player';
                                                        const value = formatSkillUsageValue(Number(item.value || 0));
                                                        const color = item.color || '#38bdf8';
                                                        return (
                                                            <div key={`${labelText}-${value}`} className="flex items-center justify-between text-sm">
                                                                <span className="truncate" style={{ color }}>{labelText}</span>
                                                                <span className="text-gray-200 font-mono">{value}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    }}
                                />
                                {selectedPlayers.map((playerKey) => {
                                    const isSelected = hoveredSkillPlayer.includes(playerKey);
                                    const hasSelection = hoveredSkillPlayer.length > 0;
                                    const color = getLineStrokeColor(playerKey, isSelected, hasSelection);
                                    const dash = getLineDashForPlayer(playerKey);
                                    const isDimmed = hoveredSkillPlayer.length > 0 && !isSelected;
                                    return (
                                        <Line
                                            key={playerKey}
                                            dataKey={playerKey}
                                            stroke={color}
                                            strokeWidth={isSelected ? 4 : 3}
                                            strokeDasharray={dash}
                                            opacity={isDimmed ? 0.6 : 1}
                                            dot={false}
                                            isAnimationActive={false}
                                        />
                                    );
                                })}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    {selectedPlayers.length > 0 && (
                        <div className="rounded-2xl bg-black/40 border border-white/10 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="text-xs uppercase tracking-[0.4em] text-gray-400">Selected Players</div>
                                <div className="text-[11px] text-gray-500">
                                    {selectedPlayers.length} {selectedPlayers.length === 1 ? 'player' : 'players'}
                                </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                {[...selectedPlayers]
                                    .sort((a, b) => (playerTotalsForSkill[b] || 0) - (playerTotalsForSkill[a] || 0))
                                    .map((playerKey) => {
                                        const player = playerMapByKey.get(playerKey);
                                        const total = playerTotalsForSkill[playerKey] ?? 0;
                                        const isActive = hoveredSkillPlayer.includes(playerKey);
                                        const hasSelection = hoveredSkillPlayer.length > 0;
                                        const swatchColor = getLineStrokeColor(playerKey, isActive, hasSelection);
                                        return (
                                            <button
                                                key={playerKey}
                                                type="button"
                                                onClick={() => {
                                                    setHoveredSkillPlayer((prev) => {
                                                        if (prev.includes(playerKey)) {
                                                            return prev.filter((key) => key !== playerKey);
                                                        }
                                                        return [...prev, playerKey];
                                                    });
                                                }}
                                                className={`w-full rounded-2xl border bg-white/5 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 min-w-0 ${
                                                    isActive ? 'border-white/40 bg-white/10' : 'border-white/10 hover:border-white/30 hover:bg-white/10'
                                                }`}
                                                aria-pressed={isActive}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <svg className="h-2 w-6" viewBox="0 0 24 4" aria-hidden="true">
                                                        <line
                                                            x1="0"
                                                            y1="2"
                                                            x2="24"
                                                            y2="2"
                                                            stroke={swatchColor}
                                                            strokeWidth="2"
                                                            strokeDasharray={getLineDashForPlayer(playerKey)}
                                                            strokeLinecap="round"
                                                        />
                                                    </svg>
                                                    {renderProfessionIcon(player?.profession, player?.professionList, 'w-4 h-4')}
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] uppercase tracking-[0.4em] text-gray-400">Player</div>
                                                        <div className="font-semibold text-white truncate">{player?.displayName || playerKey}</div>
                                                        <div className="text-[11px] text-gray-400">
                                                            {player?.logs ?? 0} {(player?.logs ?? 0) === 1 ? 'log' : 'logs'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-2xl sm:text-3xl font-black text-white font-mono self-end sm:self-auto shrink-0">
                                                    {formatSkillUsageValue(total)}
                                                </div>
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="rounded-2xl border border-dashed border-white/20 px-4 py-6 mt-2 text-center text-xs text-gray-400">
                    {skillUsageAvailable
                        ? 'Pick one skill and up to two players to visualize their usage over time.'
                        : 'Upload or highlight logs with rotation data to enable the skill usage tracker.'}
                </div>
            )}
        </div>
    </div>
);
