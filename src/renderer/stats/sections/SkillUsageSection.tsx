import type { Dispatch, SetStateAction } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { CheckCircle2, ChevronDown, ChevronRight, Maximize2, X, XCircle, Keyboard } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { InlineIconLabel } from '../ui/StatsViewShared';
import type { SkillUsagePlayer } from '../statsTypes';
import { useStatsSharedContext } from '../StatsViewContext';

type SkillUsageSectionProps = {
    selectedPlayers: string[];
    setSelectedPlayers: Dispatch<SetStateAction<string[]>>;
    removeSelectedPlayer: (key: string) => void;
    playerMapByKey: Map<string, any>;
    groupedSkillUsagePlayers: { profession: string; players: SkillUsagePlayer[] }[];
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
    selectedSkillIcon?: string | null;
    skillUsageReady: boolean;
    skillUsageAvailable: boolean;
    isSkillUsagePerSecond: boolean;
    skillChartData: any[];
    skillChartMaxY: number;
    playerTotalsForSkill: Map<string, number>;
    hoveredSkillPlayer: string[];
    setHoveredSkillPlayer: Dispatch<SetStateAction<string[]>>;
    getLineStrokeColor: (playerKey: string, isSelected: boolean, hasSelection: boolean) => string;
    getLineDashForPlayer: (playerKey: string) => string | undefined;
    formatSkillUsageValue: (value: number) => string;
};

export const SkillUsageSection = ({
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
    skillUsageSkillFilter,
    setSkillUsageSkillFilter,
    selectedSkillId,
    setSelectedSkillId,
    skillBarData,
    selectedSkillName,
    selectedSkillIcon,
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
    formatSkillUsageValue
}: SkillUsageSectionProps) => {
    const { expandedSection, openExpandedSection, closeExpandedSection, renderProfessionIcon } = useStatsSharedContext();
    const allPlayerKeys = groupedSkillUsagePlayers.flatMap((group) => group.players.map((player) => player.key));
    const hasAllPlayersSelected = allPlayerKeys.length > 0 && allPlayerKeys.every((key) => selectedPlayers.includes(key));
    return (
    <div
        className={`${expandedSection === 'skill-usage' ? 'fixed inset-0 z-50 overflow-y-auto h-screen flex flex-col pb-10' : ''}`}
        style={{ scrollMarginTop: '80px' }}
    >
        <div className="flex items-center gap-2 mb-3.5">
            <Keyboard className="w-4 h-4 shrink-0 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-200">Skill Usage Tracker</h3>
            <div className="ml-auto flex items-center gap-2">
                <PillToggleGroup
                    value={skillUsageView}
                    onChange={setSkillUsageView}
                    options={[
                        { value: 'total', label: 'Total' },
                        { value: 'perSecond', label: 'Per Sec' }
                    ]}
                    activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                    inactiveClassName="text-slate-500"
                />
                <button
                    type="button"
                    onClick={() => (expandedSection === 'skill-usage' ? closeExpandedSection() : openExpandedSection('skill-usage'))}
                    className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors"
                    aria-label={expandedSection === 'skill-usage' ? 'Close Skill Usage' : 'Expand Skill Usage'}
                    title={expandedSection === 'skill-usage' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'skill-usage' ? <X className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </button>
            </div>
        </div>
        {selectedPlayers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pb-2 pr-1">
                <button
                    type="button"
                    onClick={() => setSelectedPlayers([])}
                    className="px-3 py-1 rounded-full border border-white/5 bg-white/5 text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-200"
                >
                    Clear All
                </button>
                {selectedPlayers.map((playerKey) => {
                    const player = playerMapByKey.get(playerKey);
                    if (!player) return null;
                    return (
                        <span key={player.key} className="max-w-full flex items-center gap-1 rounded-full border border-[color:var(--accent-border)] bg-[var(--accent-bg)] px-3 py-1 text-xs text-[color:var(--brand-primary)]">
                            <span className="truncate max-w-[140px]">{player.displayName}</span>
                            <span className="text-[10px] text-[color:var(--brand-primary)]/70">{player.logs} {player.logs === 1 ? 'log' : 'logs'}</span>
                            <button type="button" onClick={() => removeSelectedPlayer(player.key)} className="rounded-full p-1 text-[color:var(--brand-primary)] hover:bg-white/20">
                                <XCircle className="w-3 h-3" />
                            </button>
                        </span>
                    );
                })}
            </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2 items-stretch">
            <div className="space-y-2 flex flex-col h-[320px]">
                <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Squad Players
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedPlayers((prev) => {
                                if (hasAllPlayersSelected) {
                                    return prev.filter((key) => !allPlayerKeys.includes(key));
                                }
                                const next = new Set(prev);
                                allPlayerKeys.forEach((key) => next.add(key));
                                return Array.from(next);
                            });
                        }}
                        disabled={allPlayerKeys.length === 0}
                        className="skill-usage-player-list-item px-2 py-0.5 rounded-full border border-white/5 bg-white/5 text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {hasAllPlayersSelected ? 'Clear All' : 'Select All'}
                    </button>
                </div>
                <input
                    type="search"
                    value={skillUsagePlayerFilter}
                    onChange={(event) => setSkillUsagePlayerFilter(event.target.value)}
                    placeholder="Search player or account"
                    className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500/50 outline-none"
                />
                <div className="skill-usage-player-list-container flex-1 min-h-0 overflow-y-auto rounded-lg border border-white/5">
                    {groupedSkillUsagePlayers.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-slate-600 italic">
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
                                        className={`skill-usage-player-list-item w-full px-3 py-2 text-left transition-colors ${isExpanded ? 'bg-white/5' : 'hover:bg-white/5'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {renderProfessionIcon(group.profession, undefined, 'w-4 h-4')}
                                                <div className="text-sm font-semibold truncate text-white">{group.profession}</div>
                                            </div>
                                            <div className="flex items-center gap-2 text-slate-500">
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
                                            <div className="px-6 pt-1 pb-2 flex items-center justify-between text-[11px] text-slate-500">
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
                                                        className="skill-usage-player-list-item px-2 py-0.5 rounded-full border border-white/5 bg-white/5 text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-200"
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
                                                        className={`skill-usage-player-list-item w-full border-b border-white/5 px-6 py-2 text-left transition-colors last:border-b-0 ${isSelected ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30 text-slate-200' : 'border-transparent hover:border-white/10 hover:bg-white/5'}`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <div className="text-sm font-semibold truncate text-white">{player.displayName}</div>
                                                                <div className="text-[11px] text-slate-500">
                                                                    {player.account} · {player.profession} · {player.logs} {player.logs === 1 ? 'log' : 'logs'}
                                                                </div>
                                                            </div>
                                                            {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-300" />}
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
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        Skill Totals
                    </div>
                    <div className="text-[11px] text-slate-500">
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
                    className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-indigo-500/50 outline-none"
                />
                <div className="rounded-lg p-0.5 flex-1 min-h-0">
                    {selectedPlayers.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-xs text-slate-600">
                            Select squad players to see the skills they cast.
                        </div>
                    ) : skillBarData.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-xs text-slate-600">
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
                                                className={`w-full space-y-1 rounded-lg border px-2 py-1.5 text-left transition-colors ${isSelected ? 'border-white/60 bg-white/5' : 'border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/5'}`}
                                            >
                                                <div className="flex items-center justify-between text-sm text-white min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{`#${index + 1}`}</span>
                                                        <InlineIconLabel
                                                            name={entry.name}
                                                            iconUrl={entry.icon}
                                                            iconClassName="h-6 w-6"
                                                            className="min-w-0 flex-1 max-w-[58vw] sm:max-w-none"
                                                            textClassName="font-semibold"
                                                        />
                                                    </div>
                                                    <span className="text-indigo-300 font-mono text-xs shrink-0">{formatSkillUsageValue(entry.total)}</span>
                                                </div>
                                                <div className="h-1 w-full rounded-full bg-white/5">
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
                    <div className="space-y-4 rounded-lg p-4 mt-2">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-slate-200">
                                {selectedSkillName
                                    ? <InlineIconLabel name={selectedSkillName} iconUrl={selectedSkillIcon} iconClassName="h-6 w-6" />
                                    : 'Selected Skill Usage'}
                            </div>
                            <div className="text-[11px] text-slate-500">
                                ({isSkillUsagePerSecond ? 'casts per second' : 'casts per log'})
                            </div>
                        </div>
                        <ChartContainer width="100%" height={250}>
                            <LineChart data={skillChartData}>
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="index"
                                    type="number"
                                    tick={{ fill: '#64748b', fontSize: 10 }}
                                    interval={0}
                                    tickFormatter={(value: number) => {
                                        const entry = skillChartData[value];
                                        const label = String(entry?.shortLabel ?? value);
                                        return label.length > 20 ? `${label.slice(0, 20)}…` : label;
                                    }}
                                />
                                <YAxis
                                    tick={{ fill: '#64748b', fontSize: 10 }}
                                    domain={[0, Math.max(1, skillChartMaxY)]}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload || payload.length === 0) return null;
                                        const sorted = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
                                        const first = sorted[0];
                                        const header = (first?.payload as any)?.fullLabel || label;
                                        return (
                                            <div className="rounded-lg bg-white/5 border border-white/5 px-3 py-2">
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
                                                                <span className="text-slate-200 font-mono">{value}</span>
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
                                            isAnimationActive={selectedPlayers.length <= 16}
                                            animationDuration={420}
                                            animationEasing="ease-out"
                                        />
                                    );
                                })}
                            </LineChart>
                        </ChartContainer>
                    </div>
                    {selectedPlayers.length > 0 && (
                        <div className="rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500">Selected Players</div>
                                <div className="text-[11px] text-slate-500">
                                    {selectedPlayers.length} {selectedPlayers.length === 1 ? 'player' : 'players'}
                                </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                {[...selectedPlayers]
                                    .sort((a, b) => (playerTotalsForSkill.get(b) || 0) - (playerTotalsForSkill.get(a) || 0))
                                    .map((playerKey) => {
                                        const player = playerMapByKey.get(playerKey);
                                        const total = playerTotalsForSkill.get(playerKey) ?? 0;
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
                                                className={`w-full rounded-lg border bg-white/5 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 min-w-0 ${isActive ? 'border-white/40 bg-white/5' : 'border-white/5 hover:border-white/10 hover:bg-white/5'
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
                                                        <div className="text-[10px] uppercase tracking-wider text-slate-500">Player</div>
                                                        <div className="font-semibold text-white truncate">{player?.displayName || playerKey}</div>
                                                        <div className="text-[11px] text-slate-500">
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
                <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 mt-2 text-center text-xs text-slate-500">
                    {skillUsageAvailable
                        ? 'Pick one skill and up to two players to visualize their usage over time.'
                        : 'Upload or highlight logs with rotation data to enable the skill usage tracker.'}
                </div>
            )}
        </div>
    </div>
    );
};
