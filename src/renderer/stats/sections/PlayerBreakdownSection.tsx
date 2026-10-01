import { useMemo, useState } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { Columns, Users, ListTree } from 'lucide-react';
import { InlineIconLabel } from '../ui/StatsViewShared';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { formatTopStatValue } from '../utils/dashboardUtils';
import type { PlayerSkillBreakdown, PlayerSkillDamageEntry } from '../statsTypes';
import { useStatsSharedContext } from '../StatsViewContext';
import { expandedPaneProps } from './expandedPane';

type ClassSkillBreakdown = {
    profession: string;
    players: PlayerSkillBreakdown[];
    skills: PlayerSkillDamageEntry[];
    skillMap: Record<string, PlayerSkillDamageEntry>;
};

type PlayerBreakdownSectionProps = {
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
};

export const PlayerBreakdownSection = ({
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
    activeClassSkill
}: PlayerBreakdownSectionProps) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass, renderProfessionIcon, formatWithCommas } = useStatsSharedContext();
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
    const getPlayerSkillEntry = (player: PlayerSkillBreakdown, skillId: string | null | undefined) => {
        if (!skillId) return null;
        const mapEntry = player.skillMap?.[skillId];
        if (mapEntry) return mapEntry;
        return player.skills.find((skill) => skill.id === skillId) || null;
    };
    const sidebarBodyClass = isExpanded
        ? 'axi-rail__nav axi-rail__nav--quiet overflow-y-auto pr-1 flex-1 min-h-0'
        : `${sidebarListClass} max-h-72 overflow-y-auto`;
    const sortedClassRows = useMemo(() => {
        if (!activeClassBreakdown || !activeClassSkill) return activeClassRows;
        const rows = [...activeClassRows];
        rows.sort((a, b) => {
            const aSkill = getPlayerSkillEntry(a, activeClassSkill.id);
            const bSkill = getPlayerSkillEntry(b, activeClassSkill.id);
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
    const classAriaSort = (key: 'down' | 'damage' | 'dps'): 'ascending' | 'descending' | undefined =>
        classSort.key !== key ? undefined : classSort.dir === 'asc' ? 'ascending' : 'descending';

    const toggleClassSort = (key: 'down' | 'damage' | 'dps') => {
        setClassSort((prev) => {
            if (prev.key !== key) return { key, dir: 'desc' };
            return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
        });
    };

    return (
        <div {...expandedPaneProps(expandedSection === 'player-breakdown', expandedSectionClosing)}>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <ListTree className="w-4 h-4 shrink-0" style={{ color: 'var(--section-offense)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Player Breakdown</h3>
                <SectionExpandButton
                    expanded={expandedSection === 'player-breakdown'}
                    onToggle={() => (expandedSection === 'player-breakdown' ? closeExpandedSection() : openExpandedSection('player-breakdown'))}
                    section="Player Breakdown"
                />
            </div>
            <div className={expandedSection === 'player-breakdown' ? 'flex-1 min-h-0 flex flex-col' : ''}>
                {playerSkillBreakdowns.length === 0 ? (
                    <div className="axi-empty">
                        No player skill damage data available for the current selection.
                    </div>
                ) : (
                    <div className={`grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-0 ${expandedSection === 'player-breakdown' ? 'flex-1 min-h-0 h-full' : ''}`}>
                        <div className={`pr-3 flex flex-col overflow-y-auto ${expandedSection === 'player-breakdown' ? 'h-full min-h-0' : ''}`} style={{ borderRight: '1px solid var(--axi-rule)' }}>
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <div className="text-xs uppercase tracking-widest text-[color:var(--axi-text-dim)]">
                                    {(isExpanded ? 'Squad Classes' : viewMode === 'player' ? 'Squad Players' : 'Squad Classes')}
                                </div>
                                {!isExpanded && (
                                    <PillToggleGroup
                                        value={viewMode}
                                        onChange={setViewMode}
                                        options={[
                                            { value: 'player' as const, label: 'Player' },
                                            { value: 'class' as const, label: 'Class' }
                                        ]}
                                    />
                                )}
                            </div>
                            <div className="mb-2">
                                <input
                                    type="text"
                                    value={skillSearch}
                                    onChange={(event) => setSkillSearch(event.target.value)}
                                    placeholder="Search skills..."
                                    className="axi-input mb-1"
                                    style={{ '--axi-input-pad': '5px 8px', '--axi-input-size': '12px' } as React.CSSProperties}
                                />
                            </div>
                            <div className={sidebarBodyClass}>
                                {(isExpanded ? 'class' : viewMode) === 'player'
                                    ? playerSkillBreakdowns.map((player) => (
                                        <div key={player.key} className="space-y-1">
                                        <button
                                            data-player-account={player.account}
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
                                            className="axi-rail__item"
                                            aria-current={activePlayerKey === player.key ? 'location' : undefined}
                                            title={player.displayName}
                                        >
                                            <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(player.profession, player.professionList, 'w-4 h-4')}
                                                    <span className="truncate min-w-0">{player.displayName}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[color:var(--axi-text-dim)] shrink-0">
                                                    <span className="text-[10px] whitespace-nowrap">{player.skills.length} skills</span>
                                                </div>
                                            </div>
                                            </button>
                                            {!isExpanded && expandedPlayerKey === player.key && (
                                                <div className="axi-rail__sub">
                                                    <input
                                                        type="text"
                                                        value={subSkillSearchByPlayer[player.key] || ''}
                                                        onChange={(event) => {
                                                            const value = event.target.value;
                                                            setSubSkillSearchByPlayer((prev) => ({ ...prev, [player.key]: value }));
                                                        }}
                                                        placeholder="Filter this player's skills..."
                                                        className="axi-input mb-1"
                                                        style={{ '--axi-input-pad': '4px 7px', '--axi-input-size': '11px' } as React.CSSProperties}
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
                                                                className="axi-rail__subitem"
                                                                aria-current={activePlayerKey === player.key && activePlayerSkillId === skill.id ? 'location' : undefined}
                                                                title={skill.name}
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    {skill.icon ? (
                                                                        <img src={skill.icon} alt="" className="h-3.5 w-3.5 object-contain shrink-0" />
                                                                    ) : null}
                                                                    <span className="truncate leading-[1.45] pt-[1px] pb-[2px]">{skill.name}</span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    {player.skills.filter((skill) => {
                                                        const query = (subSkillSearchByPlayer[player.key] || '').trim().toLowerCase();
                                                        if (!query) return true;
                                                        return String(skill.name || '').toLowerCase().includes(query);
                                                    }).length === 0 && (
                                                        <div className="px-2 py-1 text-[10px] text-[color:var(--axi-text-faint)]">No matching skills</div>
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
                                                className="axi-rail__item"
                                                aria-current={activeClassKey === bucket.profession ? 'location' : undefined}
                                            >
                                                <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderProfessionIcon(bucket.profession, undefined, 'w-4 h-4')}
                                                        <span className="truncate">{bucket.profession}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[color:var(--axi-text-dim)]">
                                                        <span className="text-[10px]">{bucket.players.length}p</span>
                                                    </div>
                                                </div>
                                            </button>
                                            {!isExpanded && expandedClassKey === bucket.profession && (
                                                <div className="axi-rail__sub">
                                                    <input
                                                        type="text"
                                                        value={subSkillSearchByClass[bucket.profession] || ''}
                                                        onChange={(event) => {
                                                            const value = event.target.value;
                                                            setSubSkillSearchByClass((prev) => ({ ...prev, [bucket.profession]: value }));
                                                        }}
                                                        placeholder="Filter this class's skills..."
                                                        className="axi-input mb-1"
                                                        style={{ '--axi-input-pad': '4px 7px', '--axi-input-size': '11px' } as React.CSSProperties}
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
                                                                className="axi-rail__subitem"
                                                                aria-current={activeClassKey === bucket.profession && activeClassSkillId === skill.id ? 'location' : undefined}
                                                                title={skill.name}
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    {skill.icon ? (
                                                                        <img src={skill.icon} alt="" className="h-3.5 w-3.5 object-contain shrink-0" />
                                                                    ) : null}
                                                                    <span className="truncate leading-[1.45] pt-[1px] pb-[2px]">{skill.name}</span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    {bucket.skills.filter((skill) => {
                                                        const query = (subSkillSearchByClass[bucket.profession] || '').trim().toLowerCase();
                                                        if (!query) return true;
                                                        return String(skill.name || '').toLowerCase().includes(query);
                                                    }).length === 0 && (
                                                        <div className="px-2 py-1 text-[10px] text-[color:var(--axi-text-faint)]">No matching skills</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                            </div>
                        </div>
                        <div className={`pl-3 overflow-hidden ${expandedSection === 'player-breakdown' ? 'flex flex-col min-h-0' : ''}`}>
                            {(isExpanded ? 'class' : viewMode) === 'player' ? (
                                !activePlayerBreakdown || (!isExpanded && !activePlayerSkill) ? (
                                    <div className="axi-empty">
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
                                                <div className="flex flex-wrap items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--axi-rule)' }}>
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
                                                    {(selectedSkillIds.length > 0 || selectedPlayers.length > 0) && (
                                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedSkillIds([]);
                                                                    setSelectedPlayers([]);
                                                                }}
                                                                className="axi-btn axi-btn--xs"
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
                                                                        className="axi-chip axi-chip--accent axi-chip--action"
                                                                    >
                                                                        <span>{label}</span>
                                                                        <span>×</span>
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
                                                                        className="axi-chip axi-chip--accent axi-chip--action"
                                                                    >
                                                                        <span>{label}</span>
                                                                        <span>×</span>
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
                                                        const skillEntry = getPlayerSkillEntry(player, skill.id);
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
                                                        playerAccount: entry.player.account,
                                                        label: (
                                                            <>
                                                                <span className="text-[color:var(--axi-text-faint)] font-mono">{idx + 1}</span>
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
                                                <div className="stats-table-shell__header">
                                                    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                                                        <div className="flex flex-col gap-2 min-w-0">
                                                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                                {renderProfessionIcon(activePlayerBreakdown.profession, activePlayerBreakdown.professionList, 'w-4 h-4')}
                                                                <div className="text-sm font-semibold text-[color:var(--axi-text)]">{activePlayerBreakdown.displayName}</div>
                                                                <span className="text-[11px] uppercase tracking-widest text-[color:var(--axi-text-faint)]">/</span>
                                                                <div className="text-sm font-semibold text-[color:var(--axi-text)] min-w-0">
                                                                    <InlineIconLabel
                                                                        name={activePlayerSkill?.name || ''}
                                                                        iconUrl={activePlayerSkill?.icon}
                                                                        iconClassName="h-6 w-6"
                                                                        truncateText={false}
                                                                        textClassName="whitespace-normal break-words"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="text-[11px] text-[color:var(--axi-text-dim)]">
                                                                {activePlayerBreakdown.skills.length} skills | {formatTopStatValue(totalPlayerDamage)} total damage
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`axi-table__scroll ${expandedSection === 'player-breakdown' ? 'flex-1 min-h-0' : 'max-h-72'}`}>
                                                <table className="axi-table axi-table--fixed axi-table--sticky axi-table--dense">
                                                    <colgroup>
                                                        <col style={{ width: '60%' }} />
                                                        <col style={{ width: '40%' }} />
                                                    </colgroup>
                                                    <thead>
                                                        <tr><th scope="col">Metric</th><th scope="col">Value</th></tr>
                                                    </thead>
                                                    <tbody>
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
                                                        },
                                                        { label: 'Min Hit', value: formatTopStatValue(activePlayerSkill?.min || 0) },
                                                        {
                                                            label: 'Avg Hit',
                                                            value: formatTopStatValue(
                                                                (activePlayerSkill?.hits || 0) > 0
                                                                    ? Math.round((activePlayerSkill?.damage || 0) / (activePlayerSkill?.hits || 1))
                                                                    : 0
                                                            )
                                                        },
                                                        { label: 'Max Hit', value: formatTopStatValue(activePlayerSkill?.max || 0) },
                                                        { label: 'Casts', value: formatTopStatValue(activePlayerSkill?.casts || 0) },
                                                        { label: 'Hits', value: formatTopStatValue(activePlayerSkill?.hits || 0) },
                                                        {
                                                            label: 'Hits / Cast',
                                                            value: (activePlayerSkill?.casts || 0) > 0
                                                                ? formatWithCommas((activePlayerSkill?.hits || 0) / (activePlayerSkill?.casts || 1), 2)
                                                                : '—'
                                                        }
                                                    ]).map((row) => (
                                                        <tr key={row.label}>
                                                            <th scope="row">{row.label}</th>
                                                            <td>{row.value}</td>
                                                        </tr>
                                                    ))}
                                                    </tbody>
                                                </table>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )
                            ) : (
                                !activeClassBreakdown || (!isExpanded && !activeClassSkill) ? (
                                    <div className="axi-empty">
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
                                                <div className="flex flex-wrap items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--axi-rule)' }}>
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
                                                    {(selectedSkillIds.length > 0 || selectedPlayers.length > 0) && (
                                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedSkillIds([]);
                                                                    setSelectedPlayers([]);
                                                                }}
                                                                className="axi-btn axi-btn--xs"
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
                                                                        className="axi-chip axi-chip--accent axi-chip--action"
                                                                    >
                                                                        <span>{label}</span>
                                                                        <span>×</span>
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
                                                                        className="axi-chip axi-chip--accent axi-chip--action"
                                                                    >
                                                                        <span>{label}</span>
                                                                        <span>×</span>
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
                                                        const skillEntry = getPlayerSkillEntry(player, skill.id);
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
                                                        playerAccount: entry.player.account,
                                                        label: (
                                                            <>
                                                                <span className="text-[color:var(--axi-text-faint)] font-mono">{idx + 1}</span>
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
                                                <div className="stats-table-shell__header">
                                                    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                                                        <div className="flex flex-col gap-2 min-w-0">
                                                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                                                {renderProfessionIcon(activeClassBreakdown.profession, undefined, 'w-4 h-4')}
                                                                <div className="text-sm font-semibold text-[color:var(--axi-text)]">{activeClassBreakdown.profession}</div>
                                                                <span className="text-[11px] uppercase tracking-widest text-[color:var(--axi-text-faint)]">/</span>
                                                                <div className="text-sm font-semibold text-[color:var(--axi-text)] min-w-0">
                                                                    <InlineIconLabel
                                                                        name={activeClassSkill?.name || ''}
                                                                        iconUrl={activeClassSkill?.icon}
                                                                        iconClassName="h-6 w-6"
                                                                        truncateText={false}
                                                                        textClassName="whitespace-normal break-words"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="text-[11px] text-[color:var(--axi-text-dim)]">
                                                                {activeClassRows.length} players | {activeClassBreakdown.skills.length} skills
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className={`axi-table__scroll ${expandedSection === 'player-breakdown' ? 'flex-1 min-h-0' : 'max-h-72'}`}>
                                                <table className="axi-table axi-table--fixed axi-table--sticky axi-table--dense">
                                                    <colgroup>
                                                        <col style={{ width: '40%' }} />
                                                        <col style={{ width: '20%' }} />
                                                        <col style={{ width: '20%' }} />
                                                        <col style={{ width: '20%' }} />
                                                    </colgroup>
                                                    <thead>
                                                    <tr>
                                                        <th scope="col">Player</th>
                                                        <th scope="col" aria-sort={classAriaSort('down')}>
                                                            <button type="button" className="axi-table__sort" onClick={() => toggleClassSort('down')}>
                                                                Down Contrib
                                                                <span>{classSort.key === 'down' ? (classSort.dir === 'desc' ? '↓' : '↑') : ''}</span>
                                                            </button>
                                                        </th>
                                                        <th scope="col" aria-sort={classAriaSort('damage')}>
                                                            <button type="button" className="axi-table__sort" onClick={() => toggleClassSort('damage')}>
                                                                Damage
                                                                <span>{classSort.key === 'damage' ? (classSort.dir === 'desc' ? '↓' : '↑') : ''}</span>
                                                            </button>
                                                        </th>
                                                        <th scope="col" aria-sort={classAriaSort('dps')}>
                                                            <button type="button" className="axi-table__sort" onClick={() => toggleClassSort('dps')}>
                                                                DPS
                                                                <span>{classSort.key === 'dps' ? (classSort.dir === 'desc' ? '↓' : '↑') : ''}</span>
                                                            </button>
                                                        </th>
                                                    </tr>
                                                    </thead>
                                                    <tbody>
                                                    {sortedClassRows.map((player) => {
                                                        const skillEntry = getPlayerSkillEntry(player, activeClassSkill?.id || '');
                                                        const downContribution = Number(skillEntry?.downContribution || 0);
                                                        const damage = Number(skillEntry?.damage || 0);
                                                        const dps = player.totalFightMs > 0 ? damage / (player.totalFightMs / 1000) : 0;
                                                        return (
                                                            <tr key={`${activeClassBreakdown.profession}-${player.key}`} data-player-account={player.account}>
                                                                <th scope="row">
                                                                    <span className="axi-table__who">
                                                                        {renderProfessionIcon(player.profession, player.professionList, 'w-4 h-4')}
                                                                        <span>{player.displayName}</span>
                                                                    </span>
                                                                </th>
                                                                <td className={classSort.key === 'down' ? 'axi-table__cell--sorted' : undefined}>{formatTopStatValue(downContribution)}</td>
                                                                <td className={classSort.key === 'damage' ? 'axi-table__cell--sorted' : undefined}>{formatTopStatValue(damage)}</td>
                                                                <td className={classSort.key === 'dps' ? 'axi-table__cell--sorted' : undefined}>{formatWithCommas(dps, 1)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                    </tbody>
                                                </table>
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
