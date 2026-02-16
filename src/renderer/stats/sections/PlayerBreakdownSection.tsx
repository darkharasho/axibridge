import { useMemo, useState } from 'react';
import { ListTree, Maximize2, X, Columns, Users } from 'lucide-react';
import { InlineIconLabel } from '../ui/StatsViewShared';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
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
    const isExpanded = expandedSection === 'player-breakdown';
    const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({ columnId: '', dir: 'desc' });
    const [subSkillSearchByPlayer, setSubSkillSearchByPlayer] = useState<Record<string, string>>({});
    const [subSkillSearchByClass, setSubSkillSearchByClass] = useState<Record<string, string>>({});
    const sidebarBodyClass = isExpanded
        ? 'overflow-y-auto space-y-1 pr-1 flex-1 min-h-0'
        : `${sidebarListClass} max-h-72 overflow-y-auto`;
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
                                    {(isExpanded ? 'Squad Classes' : viewMode === 'player' ? 'Squad Players' : 'Squad Classes')}
                                </div>
                                {!isExpanded && (
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
                                )}
                            </div>
                            <div className="mb-2">
                                <input
                                    type="text"
                                    value={skillSearch}
                                    onChange={(event) => setSkillSearch(event.target.value)}
                                    placeholder="Search skills..."
                                    className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500/60"
                                />
                            </div>
                            <div className={sidebarBodyClass}>
                                {(isExpanded ? 'class' : viewMode) === 'player'
                                    ? playerSkillBreakdowns.map((player) => (
                                        <div key={player.key} className="space-y-1">
                                        <button
                                            onClick={() => {
                                                const switchedPlayer = activePlayerKey !== player.key;
                                                if (switchedPlayer) {
                                                    setActivePlayerSkillId(null);
                                                    setSelectedSkillIds([]);
                                                    setSelectedPlayers([]);
                                                }
                                                setActivePlayerKey(player.key);
                                                setExpandedPlayerKey(
                                                    switchedPlayer
                                                        ? player.key
                                                        : (expandedPlayerKey === player.key ? null : player.key)
                                                );
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
                                                </div>
                                            </div>
                                            </button>
                                            {!isExpanded && expandedPlayerKey === player.key && (
                                                <div className="ml-2 space-y-1 border-l border-white/10 pl-2">
                                                    <input
                                                        type="text"
                                                        value={subSkillSearchByPlayer[player.key] || ''}
                                                        onChange={(event) => {
                                                            const value = event.target.value;
                                                            setSubSkillSearchByPlayer((prev) => ({ ...prev, [player.key]: value }));
                                                        }}
                                                        placeholder="Filter this player's skills..."
                                                        className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500/60"
                                                    />
                                                    {player.skills
                                                        .filter((skill) => {
                                                            const query = (subSkillSearchByPlayer[player.key] || '').trim().toLowerCase();
                                                            if (!query) return true;
                                                            return String(skill.name || '').toLowerCase().includes(query);
                                                        })
                                                        .map((skill) => (
                                                            <button
                                                                key={skill.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setActivePlayerKey(player.key);
                                                                    setActivePlayerSkillId(skill.id);
                                                                }}
                                                                className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] border transition-colors ${
                                                                    activePlayerKey === player.key && activePlayerSkillId === skill.id
                                                                        ? 'bg-sky-500/20 text-sky-200 border-sky-500/30'
                                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                }`}
                                                                title={skill.name}
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    {skill.icon ? (
                                                                        <img src={skill.icon} alt="" className="h-3.5 w-3.5 object-contain shrink-0" />
                                                                    ) : null}
                                                                    <span className="truncate">{skill.name}</span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    {player.skills.filter((skill) => {
                                                        const query = (subSkillSearchByPlayer[player.key] || '').trim().toLowerCase();
                                                        if (!query) return true;
                                                        return String(skill.name || '').toLowerCase().includes(query);
                                                    }).length === 0 && (
                                                        <div className="px-2 py-1 text-[10px] text-gray-500">No matching skills</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                    : classSkillBreakdowns.map((bucket) => (
                                        <div key={bucket.profession} className="space-y-1">
                                            <button
                                                onClick={() => {
                                                    const switchedClass = activeClassKey !== bucket.profession;
                                                    if (switchedClass) {
                                                        setActiveClassSkillId(null);
                                                        setSelectedSkillIds([]);
                                                        setSelectedPlayers([]);
                                                    }
                                                    setActiveClassKey(bucket.profession);
                                                    setExpandedClassKey(
                                                        switchedClass
                                                            ? bucket.profession
                                                            : (expandedClassKey === bucket.profession ? null : bucket.profession)
                                                    );
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
                                                    </div>
                                                </div>
                                            </button>
                                            {!isExpanded && expandedClassKey === bucket.profession && (
                                                <div className="ml-2 space-y-1 border-l border-white/10 pl-2">
                                                    <input
                                                        type="text"
                                                        value={subSkillSearchByClass[bucket.profession] || ''}
                                                        onChange={(event) => {
                                                            const value = event.target.value;
                                                            setSubSkillSearchByClass((prev) => ({ ...prev, [bucket.profession]: value }));
                                                        }}
                                                        placeholder="Filter this class's skills..."
                                                        className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500/60"
                                                    />
                                                    {bucket.skills
                                                        .filter((skill) => {
                                                            const query = (subSkillSearchByClass[bucket.profession] || '').trim().toLowerCase();
                                                            if (!query) return true;
                                                            return String(skill.name || '').toLowerCase().includes(query);
                                                        })
                                                        .map((skill) => (
                                                            <button
                                                                key={skill.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setActiveClassKey(bucket.profession);
                                                                    setActiveClassSkillId(skill.id);
                                                                }}
                                                                className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] border transition-colors ${
                                                                    activeClassKey === bucket.profession && activeClassSkillId === skill.id
                                                                        ? 'bg-sky-500/20 text-sky-200 border-sky-500/30'
                                                                        : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                                }`}
                                                                title={skill.name}
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    {skill.icon ? (
                                                                        <img src={skill.icon} alt="" className="h-3.5 w-3.5 object-contain shrink-0" />
                                                                    ) : null}
                                                                    <span className="truncate">{skill.name}</span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    {bucket.skills.filter((skill) => {
                                                        const query = (subSkillSearchByClass[bucket.profession] || '').trim().toLowerCase();
                                                        if (!query) return true;
                                                        return String(skill.name || '').toLowerCase().includes(query);
                                                    }).length === 0 && (
                                                        <div className="px-2 py-1 text-[10px] text-gray-500">No matching skills</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        </div>
                        <div className={`bg-black/30 border border-white/5 rounded-xl overflow-hidden stats-share-table ${expandedSection === 'player-breakdown' ? 'flex flex-col min-h-0' : ''}`}>
                            {(isExpanded ? 'class' : viewMode) === 'player' ? (
                                !activePlayerBreakdown || (!isExpanded && !activePlayerSkill) ? (
                                    <div className="px-4 py-10 text-center text-gray-500 italic text-sm">
                                        Select a player and skill to view breakdown details
                                    </div>
                                ) : (
                                    <div className={expandedSection === 'player-breakdown' ? 'flex flex-col min-h-0' : ''}>
                                        {isExpanded && (() => {
                                            const skills = activePlayerBreakdown.skills || [];
                                            const playerOptions = playerSkillBreakdowns.map((player) => ({
                                                id: player.key,
                                                label: player.displayName || player.key,
                                                icon: renderProfessionIcon(player.profession, player.professionList, 'w-3 h-3')
                                            }));
                                            const skillOptions = skills.map((skill) => ({
                                                id: skill.id,
                                                label: skill.name,
                                                icon: skill.icon ? <img src={skill.icon} alt="" className="h-4 w-4 object-contain" /> : undefined
                                            }));
                                            const searchOptions = [
                                                ...skills.map((skill) => ({
                                                    id: skill.id,
                                                    label: skill.name,
                                                    type: 'column' as const,
                                                    icon: skill.icon ? <img src={skill.icon} alt="" className="h-4 w-4" /> : undefined
                                                })),
                                                ...playerSkillBreakdowns.map((player) => ({
                                                    id: player.key,
                                                    label: player.displayName || player.key,
                                                    type: 'player' as const,
                                                    icon: renderProfessionIcon(player.profession, player.professionList, 'w-3 h-3')
                                                }))
                                            ];
                                            const selectedIds = new Set([
                                                ...selectedSkillIds.map((id) => `column:${id}`),
                                                ...selectedPlayers.map((id) => `player:${id}`)
                                            ]);
                                            return (
                                                <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                                                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Player Breakdown</div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <SearchSelectDropdown
                                                            options={searchOptions}
                                                            selectedIds={selectedIds}
                                                            onSelect={(option: SearchSelectOption) => {
                                                                if (option.type === 'column') {
                                                                    setSelectedSkillIds((prev) =>
                                                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                                                    );
                                                                } else {
                                                                    setSelectedPlayers((prev) =>
                                                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                                                    );
                                                                }
                                                            }}
                                                            className="w-full sm:w-64"
                                                        />
                                                        <ColumnFilterDropdown
                                                            options={skillOptions}
                                                            selectedIds={selectedSkillIds}
                                                            onToggle={(id) => {
                                                                setSelectedSkillIds((prev) =>
                                                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                                                );
                                                            }}
                                                            onClear={() => setSelectedSkillIds([])}
                                                            buttonLabel="Columns"
                                                            buttonIcon={<Columns className="h-3.5 w-3.5" />}
                                                        />
                                                        <ColumnFilterDropdown
                                                            options={playerOptions}
                                                            selectedIds={selectedPlayers}
                                                            onToggle={(id) => {
                                                                setSelectedPlayers((prev) =>
                                                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                                                );
                                                            }}
                                                            onClear={() => setSelectedPlayers([])}
                                                            buttonLabel="Players"
                                                            buttonIcon={<Users className="h-3.5 w-3.5" />}
                                                        />
                                                    </div>
                                                    {(selectedSkillIds.length > 0 || selectedPlayers.length > 0) && (
                                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedSkillIds([]);
                                                                    setSelectedPlayers([]);
                                                                }}
                                                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                                            >
                                                                Clear All
                                                            </button>
                                                            {selectedSkillIds.map((id) => {
                                                                const label = skills.find((skill) => skill.id === id)?.name || id;
                                                                return (
                                                                    <button
                                                                        key={id}
                                                                        type="button"
                                                                        onClick={() => setSelectedSkillIds((prev) => prev.filter((entry) => entry !== id))}
                                                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                                                    >
                                                                        <span>{label}</span>
                                                                        <span className="text-gray-400">×</span>
                                                                    </button>
                                                                );
                                                            })}
                                                            {selectedPlayers.map((id) => {
                                                                const label = playerOptions.find((entry) => entry.id === id)?.label || id;
                                                                return (
                                                                    <button
                                                                        key={id}
                                                                        type="button"
                                                                        onClick={() => setSelectedPlayers((prev) => prev.filter((entry) => entry !== id))}
                                                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                                                    >
                                                                        <span>{label}</span>
                                                                        <span className="text-gray-400">×</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {isExpanded ? (() => {
                                            const skills = activePlayerBreakdown.skills || [];
                                            const visibleSkills = selectedSkillIds.length > 0
                                                ? skills.filter((skill) => selectedSkillIds.includes(skill.id))
                                                : skills;
                                            const visiblePlayers = selectedPlayers.length > 0
                                                ? playerSkillBreakdowns.filter((player) => selectedPlayers.includes(player.key))
                                                : playerSkillBreakdowns;
                                            const resolvedSortColumnId = visibleSkills.find((skill) => skill.id === denseSort.columnId)?.id
                                                || visibleSkills[0]?.id
                                                || '';
                                            const rows = visiblePlayers
                                                .map((player) => {
                                                    const values: Record<string, string> = {};
                                                    const numericValues: Record<string, number> = {};
                                                    visibleSkills.forEach((skill) => {
                                                        const skillEntry = player.skillMap?.[skill.id];
                                                        const damage = Number(skillEntry?.damage || 0);
                                                        numericValues[skill.id] = damage;
                                                        values[skill.id] = formatTopStatValue(damage);
                                                    });
                                                    return { player, values, numericValues };
                                                })
                                                .sort((a, b) => {
                                                    const aValue = a.numericValues[resolvedSortColumnId] ?? 0;
                                                    const bValue = b.numericValues[resolvedSortColumnId] ?? 0;
                                                    const diff = denseSort.dir === 'desc' ? bValue - aValue : aValue - bValue;
                                                    return diff || String(a.player.displayName || '').localeCompare(String(b.player.displayName || ''));
                                                });
                                            return (
                                                <DenseStatsTable
                                                    title="Player Breakdown - Dense View"
                                                    subtitle="Damage"
                                                    sortColumnId={resolvedSortColumnId}
                                                    sortDirection={denseSort.dir}
                                                    onSortColumn={(columnId) => {
                                                        setDenseSort((prev) => ({
                                                            columnId,
                                                            dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                                        }));
                                                    }}
                                                    columns={visibleSkills.map((skill) => ({
                                                        id: skill.id,
                                                        label: <InlineIconLabel name={skill.name} iconUrl={skill.icon} iconClassName="h-4 w-4" />,
                                                        align: 'right',
                                                        minWidth: 90
                                                    }))}
                                                    rows={rows.map((entry, idx) => ({
                                                        id: `${entry.player.key}-${idx}`,
                                                        label: (
                                                            <>
                                                                <span className="text-gray-500 font-mono">{idx + 1}</span>
                                                                {renderProfessionIcon(entry.player.profession, entry.player.professionList, 'w-4 h-4')}
                                                                <span className="truncate">{entry.player.displayName}</span>
                                                            </>
                                                        ),
                                                        values: entry.values
                                                    }))}
                                                />
                                            );
                                        })() : (
                                            <>
                                                <div className="stats-table-shell__head-stack">
                                                    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-white/5">
                                                        <div className="flex flex-col gap-2 min-w-0">
                                                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                                {renderProfessionIcon(activePlayerBreakdown.profession, activePlayerBreakdown.professionList, 'w-4 h-4')}
                                                                <div className="text-sm font-semibold text-gray-200">{activePlayerBreakdown.displayName}</div>
                                                                <span className="text-[11px] uppercase tracking-widest text-gray-500">/</span>
                                                                <div className="text-sm font-semibold text-gray-200 min-w-0">
                                                                    <InlineIconLabel
                                                                        name={activePlayerSkill?.name || ''}
                                                                        iconUrl={activePlayerSkill?.icon}
                                                                        iconClassName="h-6 w-6"
                                                                        truncateText={false}
                                                                        textClassName="whitespace-normal break-words"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="text-[11px] text-gray-500">
                                                                {activePlayerBreakdown.skills.length} skills | {formatTopStatValue(totalPlayerDamage)} total damage
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="stats-table-column-header grid grid-cols-[1.2fr_0.8fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                        <div>Metric</div>
                                                        <div className="text-right">Value</div>
                                                    </div>
                                                </div>
                                                <div className={`stats-table-shell__rows ${expandedSection === 'player-breakdown' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-72 overflow-y-auto'}`}>
                                                    {([
                                                        { label: 'Down Contribution', value: formatTopStatValue(activePlayerSkill?.downContribution || 0) },
                                                        { label: 'Total Damage', value: formatTopStatValue(activePlayerSkill?.damage || 0) },
                                                        {
                                                            label: 'DPS',
                                                            value: formatWithCommas(
                                                                activePlayerBreakdown.totalFightMs > 0
                                                                    ? (activePlayerSkill?.damage || 0) / (activePlayerBreakdown.totalFightMs / 1000)
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
                                            </>
                                        )}
                                    </div>
                                )
                            ) : (
                                !activeClassBreakdown || (!isExpanded && !activeClassSkill) ? (
                                    <div className="px-4 py-10 text-center text-gray-500 italic text-sm">
                                        Select a class and skill to view breakdown details
                                    </div>
                                ) : (
                                    <div className={expandedSection === 'player-breakdown' ? 'flex flex-col min-h-0' : ''}>
                                        {isExpanded && (() => {
                                            const skills = activeClassBreakdown.skills || [];
                                            const playerOptions = activeClassRows.map((player) => ({
                                                id: player.key,
                                                label: player.displayName || player.key,
                                                icon: renderProfessionIcon(player.profession, player.professionList, 'w-3 h-3')
                                            }));
                                            const skillOptions = skills.map((skill) => ({
                                                id: skill.id,
                                                label: skill.name,
                                                icon: skill.icon ? <img src={skill.icon} alt="" className="h-4 w-4 object-contain" /> : undefined
                                            }));
                                            const searchOptions = [
                                                ...skills.map((skill) => ({
                                                    id: skill.id,
                                                    label: skill.name,
                                                    type: 'column' as const,
                                                    icon: skill.icon ? <img src={skill.icon} alt="" className="h-4 w-4" /> : undefined
                                                })),
                                                ...activeClassRows.map((player) => ({
                                                    id: player.key,
                                                    label: player.displayName || player.key,
                                                    type: 'player' as const,
                                                    icon: renderProfessionIcon(player.profession, player.professionList, 'w-3 h-3')
                                                }))
                                            ];
                                            const selectedIds = new Set([
                                                ...selectedSkillIds.map((id) => `column:${id}`),
                                                ...selectedPlayers.map((id) => `player:${id}`)
                                            ]);
                                            return (
                                                <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                                                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Class Breakdown</div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <SearchSelectDropdown
                                                            options={searchOptions}
                                                            selectedIds={selectedIds}
                                                            onSelect={(option: SearchSelectOption) => {
                                                                if (option.type === 'column') {
                                                                    setSelectedSkillIds((prev) =>
                                                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                                                    );
                                                                } else {
                                                                    setSelectedPlayers((prev) =>
                                                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                                                    );
                                                                }
                                                            }}
                                                            className="w-full sm:w-64"
                                                        />
                                                        <ColumnFilterDropdown
                                                            options={skillOptions}
                                                            selectedIds={selectedSkillIds}
                                                            onToggle={(id) => {
                                                                setSelectedSkillIds((prev) =>
                                                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                                                );
                                                            }}
                                                            onClear={() => setSelectedSkillIds([])}
                                                            buttonLabel="Columns"
                                                            buttonIcon={<Columns className="h-3.5 w-3.5" />}
                                                        />
                                                        <ColumnFilterDropdown
                                                            options={playerOptions}
                                                            selectedIds={selectedPlayers}
                                                            onToggle={(id) => {
                                                                setSelectedPlayers((prev) =>
                                                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                                                );
                                                            }}
                                                            onClear={() => setSelectedPlayers([])}
                                                            buttonLabel="Players"
                                                            buttonIcon={<Users className="h-3.5 w-3.5" />}
                                                        />
                                                    </div>
                                                    {(selectedSkillIds.length > 0 || selectedPlayers.length > 0) && (
                                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedSkillIds([]);
                                                                    setSelectedPlayers([]);
                                                                }}
                                                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                                            >
                                                                Clear All
                                                            </button>
                                                            {selectedSkillIds.map((id) => {
                                                                const label = skills.find((skill) => skill.id === id)?.name || id;
                                                                return (
                                                                    <button
                                                                        key={id}
                                                                        type="button"
                                                                        onClick={() => setSelectedSkillIds((prev) => prev.filter((entry) => entry !== id))}
                                                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                                                    >
                                                                        <span>{label}</span>
                                                                        <span className="text-gray-400">×</span>
                                                                    </button>
                                                                );
                                                            })}
                                                            {selectedPlayers.map((id) => {
                                                                const label = playerOptions.find((entry) => entry.id === id)?.label || id;
                                                                return (
                                                                    <button
                                                                        key={id}
                                                                        type="button"
                                                                        onClick={() => setSelectedPlayers((prev) => prev.filter((entry) => entry !== id))}
                                                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                                                    >
                                                                        <span>{label}</span>
                                                                        <span className="text-gray-400">×</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                        {isExpanded ? (() => {
                                            const skills = activeClassBreakdown.skills || [];
                                            const visibleSkills = selectedSkillIds.length > 0
                                                ? skills.filter((skill) => selectedSkillIds.includes(skill.id))
                                                : skills;
                                            const visiblePlayers = selectedPlayers.length > 0
                                                ? activeClassRows.filter((player) => selectedPlayers.includes(player.key))
                                                : activeClassRows;
                                            const resolvedSortColumnId = visibleSkills.find((skill) => skill.id === denseSort.columnId)?.id
                                                || visibleSkills[0]?.id
                                                || '';
                                            const rows = visiblePlayers
                                                .map((player) => {
                                                    const values: Record<string, string> = {};
                                                    const numericValues: Record<string, number> = {};
                                                    visibleSkills.forEach((skill) => {
                                                        const skillEntry = player.skillMap?.[skill.id];
                                                        const damage = Number(skillEntry?.damage || 0);
                                                        numericValues[skill.id] = damage;
                                                        values[skill.id] = formatTopStatValue(damage);
                                                    });
                                                    return { player, values, numericValues };
                                                })
                                                .sort((a, b) => {
                                                    const aValue = a.numericValues[resolvedSortColumnId] ?? 0;
                                                    const bValue = b.numericValues[resolvedSortColumnId] ?? 0;
                                                    const diff = denseSort.dir === 'desc' ? bValue - aValue : aValue - bValue;
                                                    return diff || String(a.player.displayName || '').localeCompare(String(b.player.displayName || ''));
                                                });
                                            return (
                                                <DenseStatsTable
                                                    title="Class Breakdown - Dense View"
                                                    subtitle="Damage"
                                                    sortColumnId={resolvedSortColumnId}
                                                    sortDirection={denseSort.dir}
                                                    onSortColumn={(columnId) => {
                                                        setDenseSort((prev) => ({
                                                            columnId,
                                                            dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                                        }));
                                                    }}
                                                    columns={visibleSkills.map((skill) => ({
                                                        id: skill.id,
                                                        label: <InlineIconLabel name={skill.name} iconUrl={skill.icon} iconClassName="h-4 w-4" />,
                                                        align: 'right',
                                                        minWidth: 90
                                                    }))}
                                                    rows={rows.map((entry, idx) => ({
                                                        id: `${entry.player.key}-${idx}`,
                                                        label: (
                                                            <>
                                                                <span className="text-gray-500 font-mono">{idx + 1}</span>
                                                                {renderProfessionIcon(entry.player.profession, entry.player.professionList, 'w-4 h-4')}
                                                                <span className="truncate">{entry.player.displayName}</span>
                                                            </>
                                                        ),
                                                        values: entry.values
                                                    }))}
                                                />
                                            );
                                        })() : (
                                            <>
                                                <div className="stats-table-shell__head-stack">
                                                    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-white/5">
                                                        <div className="flex flex-col gap-2 min-w-0">
                                                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                                {renderProfessionIcon(activeClassBreakdown.profession, undefined, 'w-4 h-4')}
                                                                <div className="text-sm font-semibold text-gray-200">{activeClassBreakdown.profession}</div>
                                                                <span className="text-[11px] uppercase tracking-widest text-gray-500">/</span>
                                                                <div className="text-sm font-semibold text-gray-200 min-w-0">
                                                                    <InlineIconLabel
                                                                        name={activeClassSkill?.name || ''}
                                                                        iconUrl={activeClassSkill?.icon}
                                                                        iconClassName="h-6 w-6"
                                                                        truncateText={false}
                                                                        textClassName="whitespace-normal break-words"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="text-[11px] text-gray-500">
                                                                {activeClassRows.length} players | {activeClassBreakdown.skills.length} skills
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="stats-table-column-header grid grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                                        <div>Player</div>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleClassSort('down')}
                                                            className={`text-right flex items-center justify-end gap-1 transition-colors ${classSort.key === 'down' ? 'text-sky-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                        >
                                                            Down Contrib
                                                            <span className="text-[10px]">{classSort.key === 'down' ? (classSort.dir === 'desc' ? '↓' : '↑') : ''}</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleClassSort('damage')}
                                                            className={`text-right flex items-center justify-end gap-1 transition-colors ${classSort.key === 'damage' ? 'text-sky-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                        >
                                                            Damage
                                                            <span className="text-[10px]">{classSort.key === 'damage' ? (classSort.dir === 'desc' ? '↓' : '↑') : ''}</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleClassSort('dps')}
                                                            className={`text-right flex items-center justify-end gap-1 transition-colors ${classSort.key === 'dps' ? 'text-sky-200' : 'text-gray-400 hover:text-gray-200'}`}
                                                        >
                                                            DPS
                                                            <span className="text-[10px]">{classSort.key === 'dps' ? (classSort.dir === 'desc' ? '↓' : '↑') : ''}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className={`stats-table-shell__rows ${expandedSection === 'player-breakdown' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-72 overflow-y-auto'}`}>
                                                    {sortedClassRows.map((player) => {
                                                        const skillEntry = player.skillMap?.[activeClassSkill?.id || ''];
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
                                            </>
                                        )}
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
