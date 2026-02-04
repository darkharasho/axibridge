import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ListTree, Maximize2, X } from 'lucide-react';
import { InlineIconLabel } from '../ui/StatsViewShared';
import { formatTopStatValue, formatWithCommas } from '../utils/dashboardUtils';
import type { PlayerSkillBreakdown, PlayerSkillDamageEntry } from '../statsTypes';

type ClassSkillBreakdown = {
    profession: string;
    players: PlayerSkillBreakdown[];
    skills: PlayerSkillDamageEntry[];
    skillMap: Record<string, PlayerSkillDamageEntry>;
};

type PlayerBreakdownSectionProps = {
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    sidebarListClass: string;
    viewMode: 'player' | 'class';
    setViewMode: (value: 'player' | 'class') => void;
    playerSkillBreakdowns: PlayerSkillBreakdown[];
    classSkillBreakdowns: ClassSkillBreakdown[];
    activePlayerKey: string | null;
    setActivePlayerKey: (value: string | null) => void;
    expandedPlayerKey: string | null;
    setExpandedPlayerKey: (value: string | null) => void;
    activePlayerSkillId: string | null;
    setActivePlayerSkillId: (value: string | null) => void;
    activeClassKey: string | null;
    setActiveClassKey: (value: string | null) => void;
    expandedClassKey: string | null;
    setExpandedClassKey: (value: string | null) => void;
    activeClassSkillId: string | null;
    setActiveClassSkillId: (value: string | null) => void;
    skillSearch: string;
    setSkillSearch: (value: string) => void;
    activePlayerBreakdown: PlayerSkillBreakdown | null;
    activePlayerSkill: PlayerSkillDamageEntry | null;
    activeClassBreakdown: ClassSkillBreakdown | null;
    activeClassSkill: PlayerSkillDamageEntry | null;
    renderProfessionIcon: (profession?: string, professionList?: string[], className?: string) => JSX.Element | null;
};

export const PlayerBreakdownSection = ({
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
    sidebarListClass,
    viewMode,
    setViewMode,
    playerSkillBreakdowns,
    classSkillBreakdowns,
    activePlayerKey,
    setActivePlayerKey,
    expandedPlayerKey,
    setExpandedPlayerKey,
    activePlayerSkillId,
    setActivePlayerSkillId,
    activeClassKey,
    setActiveClassKey,
    expandedClassKey,
    setExpandedClassKey,
    activeClassSkillId,
    setActiveClassSkillId,
    skillSearch,
    setSkillSearch,
    activePlayerBreakdown,
    activePlayerSkill,
    activeClassBreakdown,
    activeClassSkill,
    renderProfessionIcon
}: PlayerBreakdownSectionProps) => {
    const playerCount = playerSkillBreakdowns.length;
    const totalPlayerDamage = (activePlayerBreakdown?.skills || []).reduce((sum, skill) => sum + (skill.damage || 0), 0);
    const activeClassRows = activeClassBreakdown?.players || [];
    const [classSort, setClassSort] = useState<{ key: 'down' | 'damage' | 'dps'; dir: 'asc' | 'desc' }>({
        key: 'down',
        dir: 'desc'
    });
    const sortedClassRows = useMemo(() => {
        if (!activeClassBreakdown || !activeClassSkill) return activeClassRows;
        const rows = [...activeClassRows];
        rows.sort((a, b) => {
            const aSkill = a.skillMap?.[activeClassSkill.id];
            const bSkill = b.skillMap?.[activeClassSkill.id];
            const aDown = Number(aSkill?.downContribution || 0);
            const bDown = Number(bSkill?.downContribution || 0);
            const aDamage = Number(aSkill?.damage || 0);
            const bDamage = Number(bSkill?.damage || 0);
            const aDps = a.totalFightMs > 0 ? aDamage / (a.totalFightMs / 1000) : 0;
            const bDps = b.totalFightMs > 0 ? bDamage / (b.totalFightMs / 1000) : 0;
            let diff = 0;
            if (classSort.key === 'down') diff = aDown - bDown;
            if (classSort.key === 'damage') diff = aDamage - bDamage;
            if (classSort.key === 'dps') diff = aDps - bDps;
            return classSort.dir === 'asc' ? diff : -diff;
        });
        return rows;
    }, [activeClassBreakdown, activeClassRows, activeClassSkill, classSort]);
    const toggleClassSort = (key: 'down' | 'damage' | 'dps') => {
        setClassSort((prev) => {
            if (prev.key !== key) return { key, dir: 'desc' };
            return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
        });
    };

    return (
        <div
            id="player-breakdown"
            data-section-visible={isSectionVisible('player-breakdown')}
            data-section-first={isFirstVisibleSection('player-breakdown')}
            className={sectionClass(
                'player-breakdown',
                `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid scroll-mt-24 flex flex-col ${expandedSection === 'player-breakdown'
                    ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}`
                    : 'overflow-hidden'
                }`
            )}
        >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <ListTree className="w-5 h-5 text-sky-300" />
                    Player Breakdown
                </h3>
                <div className="flex items-center gap-3 relative">
                    <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
                        {playerCount} {playerCount === 1 ? 'player' : 'players'}
                    </div>
                    <button
                        type="button"
                        onClick={() => (expandedSection === 'player-breakdown' ? closeExpandedSection() : openExpandedSection('player-breakdown'))}
                        className={`p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors ${expandedSection === 'player-breakdown' ? 'absolute -top-1 -right-1 md:static' : ''}`}
                        aria-label={expandedSection === 'player-breakdown' ? 'Close Player Breakdown' : 'Expand Player Breakdown'}
                        title={expandedSection === 'player-breakdown' ? 'Close' : 'Expand'}
                    >
                        {expandedSection === 'player-breakdown' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>
            <div className={expandedSection === 'player-breakdown' ? 'flex-1 min-h-0 flex flex-col' : ''}>
                {playerSkillBreakdowns.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/20 px-4 py-6 text-center text-xs text-gray-400">
                        No player skill damage data available for the current selection.
                    </div>
                ) : (
                    <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expandedSection === 'player-breakdown' ? 'flex-1 min-h-0 h-full' : ''}`}>
                        <div className={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'player-breakdown' ? 'h-full' : ''}`}>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="text-xs uppercase tracking-widest text-gray-500">
                                    {viewMode === 'player' ? 'Squad Players' : 'Squad Classes'}
                                </div>
                                <div className="flex items-center gap-1 rounded-full bg-white/5 border border-white/10 p-1">
                                    {([
                                        { id: 'player', label: 'Player' },
                                        { id: 'class', label: 'Class' }
                                    ] as const).map((option) => {
                                        const isActive = viewMode === option.id;
                                        return (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => setViewMode(option.id)}
                                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                                    isActive ? 'bg-sky-500/30 text-sky-100' : 'text-gray-400 hover:text-white'
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className={`${sidebarListClass} ${expandedSection === 'player-breakdown' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                                {viewMode === 'player'
                                    ? playerSkillBreakdowns.map((player) => (
                                        <div key={player.key} className="space-y-1">
                                        <button
                                            onClick={() => {
                                                if (activePlayerKey === player.key && expandedPlayerKey === player.key) {
                                                    setExpandedPlayerKey(null);
                                                    return;
                                                    }
                                                    if (activePlayerKey !== player.key) {
                                                        setActivePlayerSkillId(null);
                                                    }
                                                    setActivePlayerKey(player.key);
                                                    setExpandedPlayerKey(player.key);
                                                }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                                activePlayerKey === player.key
                                                    ? 'bg-sky-500/20 text-sky-200 border-sky-500/40'
                                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                            }`}
                                            title={player.displayName}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(player.profession, player.professionList, 'w-4 h-4')}
                                                    <span className="truncate min-w-0">{player.displayName}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-gray-400 shrink-0">
                                                    <span className="text-[10px] whitespace-nowrap">{player.skills.length} skills</span>
                                                    {expandedPlayerKey === player.key ? (
                                                        <ChevronDown className="w-3.5 h-3.5" />
                                                    ) : (
                                                            <ChevronRight className="w-3.5 h-3.5" />
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                            {expandedPlayerKey === player.key && (
                                                <div className="ml-4 space-y-2">
                                                    <input
                                                        type="search"
                                                        value={skillSearch}
                                                        onChange={(event) => setSkillSearch(event.target.value)}
                                                        placeholder="Search skills..."
                                                        className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-sky-400"
                                                    />
                                                    {player.skills.length === 0 ? (
                                                        <div className="px-3 py-2 text-[11px] text-gray-500 italic">
                                                            No damage skills recorded.
                                                        </div>
                                                    ) : (
                                                        (() => {
                                                            const term = skillSearch.trim().toLowerCase();
                                                            const filteredSkills = term
                                                                ? player.skills.filter((skill) => skill.name.toLowerCase().includes(term))
                                                                : player.skills;
                                                            if (filteredSkills.length === 0) {
                                                                return (
                                                                    <div className="px-3 py-2 text-[11px] text-gray-500 italic">
                                                                        No skills match this search.
                                                                    </div>
                                                                );
                                                            }
                                                            return filteredSkills.map((skill) => (
                                                            <button
                                                                key={skill.id}
                                                                onClick={() => setActivePlayerSkillId(skill.id)}
                                                                className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors overflow-hidden ${
                                                                    activePlayerSkillId === skill.id
                                                                        ? 'bg-sky-500/10 text-sky-100 border-sky-400/40'
                                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                }`}
                                                                title={skill.name}
                                                            >
                                                                <div className="min-w-0 pr-4 w-full">
                                                                    <InlineIconLabel
                                                                        name={skill.name}
                                                                        iconUrl={skill.icon}
                                                                        iconClassName="h-4 w-4"
                                                                        className="min-w-0 flex-1 w-full"
                                                                        textClassName="truncate max-w-[140px] sm:max-w-full"
                                                                    />
                                                                </div>
                                                            </button>
                                                        ));
                                                    })()
                                                )}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                    : classSkillBreakdowns.map((bucket) => (
                                        <div key={bucket.profession} className="space-y-1">
                                            <button
                                                onClick={() => {
                                                    if (activeClassKey === bucket.profession && expandedClassKey === bucket.profession) {
                                                        setExpandedClassKey(null);
                                                        return;
                                                    }
                                                    if (activeClassKey !== bucket.profession) {
                                                        setActiveClassSkillId(null);
                                                    }
                                                    setActiveClassKey(bucket.profession);
                                                    setExpandedClassKey(bucket.profession);
                                                }}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                                    activeClassKey === bucket.profession
                                                        ? 'bg-sky-500/20 text-sky-200 border-sky-500/40'
                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderProfessionIcon(bucket.profession, undefined, 'w-4 h-4')}
                                                        <span className="truncate">{bucket.profession}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-gray-400">
                                                        <span className="text-[10px]">{bucket.players.length}p</span>
                                                        {expandedClassKey === bucket.profession ? (
                                                            <ChevronDown className="w-3.5 h-3.5" />
                                                        ) : (
                                                            <ChevronRight className="w-3.5 h-3.5" />
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                            {expandedClassKey === bucket.profession && (
                                                <div className="ml-4 space-y-2">
                                                    <input
                                                        type="search"
                                                        value={skillSearch}
                                                        onChange={(event) => setSkillSearch(event.target.value)}
                                                        placeholder="Search skills..."
                                                        className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-sky-400"
                                                    />
                                                    {bucket.skills.length === 0 ? (
                                                        <div className="px-3 py-2 text-[11px] text-gray-500 italic">
                                                            No damage skills recorded.
                                                        </div>
                                                    ) : (
                                                        (() => {
                                                            const term = skillSearch.trim().toLowerCase();
                                                            const filteredSkills = term
                                                                ? bucket.skills.filter((skill) => skill.name.toLowerCase().includes(term))
                                                                : bucket.skills;
                                                            if (filteredSkills.length === 0) {
                                                                return (
                                                                    <div className="px-3 py-2 text-[11px] text-gray-500 italic">
                                                                        No skills match this search.
                                                                    </div>
                                                                );
                                                            }
                                                            return filteredSkills.map((skill) => (
                                                            <button
                                                                key={skill.id}
                                                                onClick={() => setActiveClassSkillId(skill.id)}
                                                                className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors overflow-hidden ${
                                                                    activeClassSkillId === skill.id
                                                                        ? 'bg-sky-500/10 text-sky-100 border-sky-400/40'
                                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                }`}
                                                                title={skill.name}
                                                            >
                                                                <div className="min-w-0 pr-4 w-full">
                                                                    <InlineIconLabel
                                                                        name={skill.name}
                                                                        iconUrl={skill.icon}
                                                                        iconClassName="h-4 w-4"
                                                                        className="min-w-0 flex-1 w-full"
                                                                        textClassName="truncate max-w-[140px] sm:max-w-full"
                                                                    />
                                                                </div>
                                                            </button>
                                                        ));
                                                    })()
                                                )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        </div>
                        <div className={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'player-breakdown' ? 'flex flex-col min-h-0' : ''}`}>
                            {viewMode === 'player' ? (
                                !activePlayerBreakdown || !activePlayerSkill ? (
                                    <div className="px-4 py-10 text-center text-gray-500 italic text-sm">
                                        Select a player and skill to view breakdown details
                                    </div>
                                ) : (
                                    <div className={expandedSection === 'player-breakdown' ? 'flex flex-col min-h-0' : ''}>
                                        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-white/5">
                                            <div className="flex flex-col gap-2 min-w-0">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(activePlayerBreakdown.profession, activePlayerBreakdown.professionList, 'w-4 h-4')}
                                                    <div className="text-sm font-semibold text-gray-200">{activePlayerBreakdown.displayName}</div>
                                                    <span className="text-[11px] uppercase tracking-widest text-gray-500">/</span>
                                                    <div className="text-sm font-semibold text-gray-200 truncate">
                                                        <InlineIconLabel name={activePlayerSkill.name} iconUrl={activePlayerSkill.icon} iconClassName="h-6 w-6" />
                                                    </div>
                                                </div>
                                                <div className="text-[11px] text-gray-500">
                                                    {activePlayerBreakdown.skills.length} skills | {formatTopStatValue(totalPlayerDamage)} total damage
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[1.2fr_0.8fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                            <div>Metric</div>
                                            <div className="text-right">Value</div>
                                        </div>
                                        <div className={expandedSection === 'player-breakdown' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-72 overflow-y-auto'}>
                                            {([
                                                { label: 'Down Contribution', value: formatTopStatValue(activePlayerSkill.downContribution) },
                                                { label: 'Total Damage', value: formatTopStatValue(activePlayerSkill.damage) },
                                                {
                                                    label: 'DPS',
                                                    value: formatWithCommas(
                                                        activePlayerBreakdown.totalFightMs > 0
                                                            ? activePlayerSkill.damage / (activePlayerBreakdown.totalFightMs / 1000)
                                                            : 0,
                                                        1
                                                    )
                                                }
                                            ]).map((row) => (
                                                <div key={row.label} className="grid grid-cols-[1.2fr_0.8fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                    <div className="font-semibold text-white">{row.label}</div>
                                                    <div className="text-right font-mono text-gray-300">{row.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )
                            ) : (
                                !activeClassBreakdown || !activeClassSkill ? (
                                    <div className="px-4 py-10 text-center text-gray-500 italic text-sm">
                                        Select a class and skill to view breakdown details
                                    </div>
                                ) : (
                                    <div className={expandedSection === 'player-breakdown' ? 'flex flex-col min-h-0' : ''}>
                                        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-white/5">
                                            <div className="flex flex-col gap-2 min-w-0">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(activeClassBreakdown.profession, undefined, 'w-4 h-4')}
                                                    <div className="text-sm font-semibold text-gray-200">{activeClassBreakdown.profession}</div>
                                                    <span className="text-[11px] uppercase tracking-widest text-gray-500">/</span>
                                                    <div className="text-sm font-semibold text-gray-200 truncate">
                                                        <InlineIconLabel name={activeClassSkill.name} iconUrl={activeClassSkill.icon} iconClassName="h-6 w-6" />
                                                    </div>
                                                </div>
                                                <div className="text-[11px] text-gray-500">
                                                    {activeClassRows.length} players | {activeClassBreakdown.skills.length} skills
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                            <div>Player</div>
                                            <button
                                                type="button"
                                                onClick={() => toggleClassSort('down')}
                                                className="text-right flex items-center justify-end gap-1 hover:text-white transition-colors"
                                            >
                                                Down Contrib
                                                <span className="text-[10px]">{classSort.key === 'down' ? (classSort.dir === 'desc' ? '▼' : '▲') : ''}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleClassSort('damage')}
                                                className="text-right flex items-center justify-end gap-1 hover:text-white transition-colors"
                                            >
                                                Damage
                                                <span className="text-[10px]">{classSort.key === 'damage' ? (classSort.dir === 'desc' ? '▼' : '▲') : ''}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleClassSort('dps')}
                                                className="text-right flex items-center justify-end gap-1 hover:text-white transition-colors"
                                            >
                                                DPS
                                                <span className="text-[10px]">{classSort.key === 'dps' ? (classSort.dir === 'desc' ? '▼' : '▲') : ''}</span>
                                            </button>
                                        </div>
                                        <div className={expandedSection === 'player-breakdown' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-72 overflow-y-auto'}>
                                            {sortedClassRows.map((player) => {
                                                const skillEntry = player.skillMap?.[activeClassSkill.id];
                                                const downContribution = Number(skillEntry?.downContribution || 0);
                                                const damage = Number(skillEntry?.damage || 0);
                                                const dps = player.totalFightMs > 0 ? damage / (player.totalFightMs / 1000) : 0;
                                                return (
                                                    <div key={`${activeClassBreakdown.profession}-${player.key}`} className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(player.profession, player.professionList, 'w-4 h-4')}
                                                            <div className="min-w-0">
                                                                <div className="font-semibold text-white truncate">{player.displayName}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right font-mono text-gray-300">{formatTopStatValue(downContribution)}</div>
                                                        <div className="text-right font-mono text-gray-300">{formatTopStatValue(damage)}</div>
                                                        <div className="text-right font-mono text-gray-300">{formatWithCommas(dps, 1)}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
