import { useState } from 'react';
import { Maximize2, Skull, X, Columns, Users } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { StatsTableCard, StatsTableCardTable } from '../ui/StatsTableCard';
import { InlineIconLabel, SkillBreakdownTooltip } from '../ui/StatsViewShared';

type ConditionsSectionProps = {
    conditionSummary: any[];
    conditionPlayers: any[];
    conditionSearch: string;
    setConditionSearch: (value: string) => void;
    activeConditionName: string;
    setActiveConditionName: (value: string) => void;
    conditionDirection: 'outgoing' | 'incoming';
    setConditionDirection: (value: 'outgoing' | 'incoming') => void;
    conditionGridClass: string;
    effectiveConditionSort: { key: 'applications' | 'damage'; dir: 'asc' | 'desc' };
    setConditionSort: (value: { key: 'applications' | 'damage'; dir: 'asc' | 'desc' }) => void;
    showConditionDamage: boolean;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    sidebarListClass: string;
};

export const ConditionsSection = ({
    conditionSummary,
    conditionPlayers,
    conditionSearch,
    setConditionSearch,
    activeConditionName,
    setActiveConditionName,
    conditionDirection,
    setConditionDirection,
    conditionGridClass,
    effectiveConditionSort,
    setConditionSort,
    showConditionDamage,
    renderProfessionIcon,
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
    sidebarListClass
}: ConditionsSectionProps) => {
    const isExpanded = expandedSection === 'conditions-outgoing';
    const [selectedConditionColumns, setSelectedConditionColumns] = useState<string[]>([]);
    const [selectedConditionPlayers, setSelectedConditionPlayers] = useState<string[]>([]);
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({ columnId: 'all', dir: 'desc' });
    const resolveApplications = (condition: any) => {
        if (!condition) return 0;
        if (conditionDirection !== 'outgoing') {
            const fromUptime = Number(condition.applicationsFromUptime);
            if (Number.isFinite(fromUptime) && fromUptime > 0) {
                return fromUptime;
            }
            return Number(condition.applications || 0);
        }
        const fromUptime = Number(condition.applicationsFromUptime);
        if (Number.isFinite(fromUptime) && fromUptime > 0) {
            return fromUptime;
        }
        const fromBuffsActive = Number(condition.applicationsFromBuffsActive);
        if (Number.isFinite(fromBuffsActive) && fromBuffsActive > 0) {
            return fromBuffsActive;
        }
        const fromBuffs = Number(condition.applicationsFromBuffs);
        if (Number.isFinite(fromBuffs) && fromBuffs > 0) {
            return fromBuffs;
        }
        return Number(condition.applications || 0);
    };

    const allConditions = [...(conditionSummary || [])]
        .sort((a: any, b: any) => (b.damage || 0) - (a.damage || 0));
    const filteredConditions = allConditions.filter((entry: any) =>
        entry.name.toLowerCase().includes(conditionSearch.trim().toLowerCase())
    );
    const conditionColumnOptionsFiltered = filteredConditions.map((entry: any) => ({
        id: entry.name,
        label: entry.name,
        icon: entry.icon ? <img src={entry.icon} alt="" className="h-4 w-4 object-contain" /> : undefined
    }));
    const selectedConditionEntries = selectedConditionColumns.length > 0
        ? allConditions.filter((entry: any) => selectedConditionColumns.includes(entry.name))
        : allConditions;
    const visibleConditionEntries = selectedConditionEntries;
    const conditionPlayerOptions = Array.from(new Map(
        (conditionPlayers || []).map((row: any) => [row.account, row])
    ).values()).map((row: any) => ({
        id: row.account,
        label: row.account,
        icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
    }));
    const conditionSearchSelectedIds = new Set([
        ...selectedConditionColumns.map((id) => `column:${id}`),
        ...selectedConditionPlayers.map((id) => `player:${id}`)
    ]);

    return (
    <div
        id="conditions-outgoing"
        data-section-visible={isSectionVisible('conditions-outgoing')}
        data-section-first={isFirstVisibleSection('conditions-outgoing')}
        className={sectionClass('conditions-outgoing', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
            expandedSection === 'conditions-outgoing'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
        }`)}
    >
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Skull className="w-5 h-5 text-amber-300" />
                Conditions
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'conditions-outgoing' ? closeExpandedSection() : openExpandedSection('conditions-outgoing'))}
                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                aria-label={expandedSection === 'conditions-outgoing' ? 'Close Outgoing Conditions' : 'Expand Outgoing Conditions'}
                title={expandedSection === 'conditions-outgoing' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'conditions-outgoing' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
        {conditionSummary && conditionSummary.length > 0 ? (
            isExpanded ? (
                <div className="flex flex-col gap-4">
                    <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Conditions</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchSelectDropdown
                            options={[
                                ...allConditions.map((entry: any) => ({ id: entry.name, label: entry.name, type: 'column' as const })),
                                ...conditionPlayerOptions.map((option) => ({ ...option, type: 'player' as const }))
                            ]}
                            onSelect={(option: SearchSelectOption) => {
                                if (option.type === 'column') {
                                    setSelectedConditionColumns((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                } else {
                                    setSelectedConditionPlayers((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                }
                            }}
                            selectedIds={conditionSearchSelectedIds}
                            className="w-full sm:w-64"
                        />
                        <ColumnFilterDropdown
                            options={conditionColumnOptionsFiltered}
                            selectedIds={selectedConditionColumns}
                            onToggle={(id) => {
                                setSelectedConditionColumns((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedConditionColumns([])}
                            buttonIcon={<Columns className="h-3.5 w-3.5" />}
                        />
                        <ColumnFilterDropdown
                            options={conditionPlayerOptions}
                            selectedIds={selectedConditionPlayers}
                            onToggle={(id) => {
                                setSelectedConditionPlayers((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedConditionPlayers([])}
                            buttonLabel="Players"
                            buttonIcon={<Users className="h-3.5 w-3.5" />}
                        />
                        <PillToggleGroup
                                value={conditionDirection}
                                onChange={setConditionDirection}
                                options={[
                                    { value: 'outgoing', label: 'Outgoing' },
                                    { value: 'incoming', label: 'Incoming' }
                                ]}
                                activeClassName="bg-amber-500/20 text-amber-200 border border-amber-500/40"
                                inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                            />
                            {showConditionDamage && (
                                <PillToggleGroup
                                    value={effectiveConditionSort.key}
                                    onChange={(value) => setConditionSort({ key: value as 'applications' | 'damage', dir: 'desc' })}
                                    options={[
                                        { value: 'applications', label: 'Applications' },
                                        { value: 'damage', label: 'Damage' }
                                    ]}
                                    activeClassName="bg-amber-500/20 text-amber-200 border border-amber-500/40"
                                    inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                />
                            )}
                        </div>
                    </div>
                    <div className="bg-black/30 border border-white/5 rounded-xl overflow-hidden">
                        {filteredConditions.length === 0 ? (
                            <div className="px-4 py-10 text-center text-gray-500 italic text-sm">No conditions match this filter</div>
                        ) : (
                            (() => {
                                const metricKey = effectiveConditionSort.key;
                                const columns = [
                                    { id: 'all', label: 'All Conditions', icon: null as any },
                                    ...visibleConditionEntries
                                ];
                                const rows = (conditionPlayers || [])
                                    .filter((player: any) => selectedConditionPlayers.length === 0 || selectedConditionPlayers.includes(player.account))
                                    .map((player: any) => {
                                        const conditionTotals = player.conditions || {};
                                        const values: Record<string, string> = {};
                                        const numericValues: Record<string, number> = {};
                                        columns.forEach((column: any) => {
                                            if (column.id === 'all' || column.name === 'All Conditions') {
                                                const totals = Object.values(conditionTotals).reduce(
                                                    (acc: { applications: number; damage: number }, condition: any) => {
                                                        const applications = resolveApplications(condition);
                                                        acc.applications += Number(applications || 0);
                                                        acc.damage += Number(condition?.damage || 0);
                                                        return acc;
                                                    },
                                                    { applications: 0, damage: 0 }
                                                );
                                                const val = metricKey === 'applications' ? totals.applications : totals.damage;
                                                numericValues.all = val || 0;
                                                values.all = Math.round(val || 0).toLocaleString();
                                                return;
                                            }
                                            const condition = conditionTotals[column.name];
                                            const val = metricKey === 'applications'
                                                ? resolveApplications(condition)
                                                : Number(condition?.damage || 0);
                                            numericValues[column.name] = Number(val || 0);
                                            values[column.name] = Math.round(val || 0).toLocaleString();
                                        });
                                        return { player, values, numericValues };
                                    })
                                    .filter((entry: any) => Object.values(entry.values).some((val) => val !== '0'));
                                const resolvedSortColumnId = [
                                    'all',
                                    ...visibleConditionEntries.map((entry: any) => entry.name)
                                ].includes(denseSort.columnId)
                                    ? denseSort.columnId
                                    : 'all';
                                const sortedRows = [...rows].sort((a: any, b: any) => {
                                    const aValue = a.numericValues[resolvedSortColumnId] ?? 0;
                                    const bValue = b.numericValues[resolvedSortColumnId] ?? 0;
                                    const diff = denseSort.dir === 'desc' ? bValue - aValue : aValue - bValue;
                                    return diff || String(a.player.account || '').localeCompare(String(b.player.account || ''));
                                });
                                return (
                                    <DenseStatsTable
                                        title="Conditions - Dense View"
                                        subtitle={metricKey === 'applications' ? 'Applications' : 'Damage'}
                                        sortColumnId={resolvedSortColumnId}
                                        sortDirection={denseSort.dir}
                                        onSortColumn={(columnId) => {
                                            setDenseSort((prev) => ({
                                                columnId,
                                                dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                            }));
                                        }}
                                        columns={[
                                            {
                                                id: 'all',
                                                label: 'All',
                                                align: 'right' as const,
                                                minWidth: 90
                                            },
                                            ...visibleConditionEntries.map((entry: any) => ({
                                                id: entry.name,
                                                label: <InlineIconLabel name={entry.name} iconUrl={entry.icon} iconClassName="h-4 w-4" />,
                                                align: 'right' as const,
                                                minWidth: 90
                                            }))
                                        ]}
                                        rows={sortedRows.map((entry: any, idx: number) => ({
                                            id: `${entry.player.account}-${idx}`,
                                            label: (
                                                <>
                                                    <span className="text-gray-500 font-mono">{idx + 1}</span>
                                                    {renderProfessionIcon(entry.player.profession, entry.player.professionList, 'w-4 h-4')}
                                                    <span className="truncate">{entry.player.account}</span>
                                                </>
                                            ),
                                            values: entry.values
                                        }))}
                                    />
                                );
                            })()
                        )}
                    </div>
                    {(selectedConditionColumns.length > 0 || selectedConditionPlayers.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedConditionColumns([]);
                                    setSelectedConditionPlayers([]);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                            >
                                Clear All
                            </button>
                            {selectedConditionColumns.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedConditionColumns((prev) => prev.filter((entry) => entry !== id))}
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                >
                                    <span>{id}</span>
                                    <span className="text-gray-400">×</span>
                                </button>
                            ))}
                            {selectedConditionPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedConditionPlayers((prev) => prev.filter((entry) => entry !== id))}
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                >
                                    <span>{id}</span>
                                    <span className="text-gray-400">×</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <StatsTableCard
                expanded={expandedSection === 'conditions-outgoing'}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Conditions</div>
                        <input
                            value={conditionSearch}
                            onChange={(e) => setConditionSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'conditions-outgoing' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                if (filteredConditions.length === 0) {
                                    return <div className="text-center text-gray-500 italic py-6 text-xs">No conditions match this filter</div>;
                                }
                                return (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setActiveConditionName('all')}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeConditionName === 'all'
                                                ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                }`}
                                        >
                                            All Conditions
                                        </button>
                                        {filteredConditions.map((entry: any) => (
                                            <button
                                                key={entry.name}
                                                type="button"
                                                onClick={() => setActiveConditionName(entry.name)}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeConditionName === entry.name
                                                    ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                    }`}
                                            >
                                                <InlineIconLabel name={entry.name} iconUrl={entry.icon} iconClassName="h-5 w-5" />
                                            </button>
                                        ))}
                                    </>
                                );
                            })()}
                        </div>
                    </>
                }
                content={
                    <StatsTableCardTable
                        expanded={expandedSection === 'conditions-outgoing'}
                        header={
                            <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-white/5">
                                <div className="text-sm font-semibold text-gray-200">
                                    {activeConditionName === 'all'
                                        ? 'All Conditions'
                                        : (
                                                <InlineIconLabel
                                                    name={activeConditionName}
                                                    iconUrl={conditionSummary.find((entry: any) => entry.name === activeConditionName)?.icon}
                                                    iconClassName="h-5 w-5"
                                                />
                                        )}
                                </div>
                                <div className="flex flex-col items-end gap-2 text-right ml-auto mt-2">
                                    <div className="text-xs uppercase tracking-widest text-gray-500">Squad Totals</div>
                                    <PillToggleGroup
                                        value={conditionDirection}
                                        onChange={setConditionDirection}
                                        options={[
                                            { value: 'outgoing', label: 'Outgoing' },
                                            { value: 'incoming', label: 'Incoming' }
                                        ]}
                                        activeClassName="bg-amber-500/20 text-amber-200 border border-amber-500/40"
                                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                    />
                                </div>
                            </div>
                        }
                        columns={
                            <div className={`grid ${conditionGridClass} text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2`}>
                                <div className="text-center">#</div>
                                <div>Player</div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setConditionSort({
                                            key: 'applications',
                                            dir: effectiveConditionSort.key === 'applications' ? (effectiveConditionSort.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                        });
                                    }}
                                    className={`text-right transition-colors ${effectiveConditionSort.key === 'applications' ? 'text-amber-200' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    Applications {effectiveConditionSort.key === 'applications' ? (effectiveConditionSort.dir === 'desc' ? '↓' : '↑') : ''}
                                </button>
                                {showConditionDamage ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setConditionSort({
                                                key: 'damage',
                                                dir: effectiveConditionSort.key === 'damage' ? (effectiveConditionSort.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                            });
                                        }}
                                        className={`text-right transition-colors ${effectiveConditionSort.key === 'damage' ? 'text-amber-200' : 'text-gray-400 hover:text-gray-200'}`}
                                    >
                                        Damage {effectiveConditionSort.key === 'damage' ? (effectiveConditionSort.dir === 'desc' ? '↓' : '↑') : ''}
                                    </button>
                                ) : null}
                            </div>
                        }
                        rows={
                            <>
                                {(() => {
                                    const entries = conditionPlayers || [];
                                    const rows = entries
                                        .map((player: any) => {
                                            const conditionTotals = player.conditions || {};
                                            if (activeConditionName === 'all') {
                                                const totals = Object.values(conditionTotals).reduce(
                                                    (acc: { applications: number; damage: number }, condition: any) => {
                                                        const applications = resolveApplications(condition);
                                                        acc.applications += Number(applications || 0);
                                                        acc.damage += Number(condition?.damage || 0);
                                                        return acc;
                                                    },
                                                    { applications: 0, damage: 0 }
                                                );
                                                return {
                                                    ...player,
                                                    applications: totals.applications,
                                                    damage: totals.damage
                                                };
                                            }
                                            const condition = conditionTotals[activeConditionName];
                                            return {
                                                ...player,
                                                applications: resolveApplications(condition),
                                                damage: Number(condition?.damage || 0)
                                            };
                                        })
                                        .filter((row: any) => row.applications > 0 || row.damage > 0)
                                        .sort((a: any, b: any) => {
                                            const aVal = effectiveConditionSort.key === 'applications' ? (a.applications || 0) : (a.damage || 0);
                                            const bVal = effectiveConditionSort.key === 'applications' ? (b.applications || 0) : (b.damage || 0);
                                            const primary = effectiveConditionSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
                                            if (primary !== 0) return primary;
                                            const secondary = effectiveConditionSort.key === 'applications'
                                                ? (b.damage || 0) - (a.damage || 0)
                                                : (b.applications || 0) - (a.applications || 0);
                                            if (secondary !== 0) return secondary;
                                            return String(a.account || '').localeCompare(String(b.account || ''));
                                        });
                                    if (rows.length === 0) {
                                        return <div className="text-center text-gray-500 italic py-6">No condition data available</div>;
                                    }
                                    return rows.map((entry: any, idx: number) => {
                                        const conditionTotals = entry.conditions || {};
                                        let skillsMap: Record<string, { name: string; hits: number; damage: number; icon?: string }> = {};
                                        if (activeConditionName === 'all') {
                                            Object.values(conditionTotals).forEach((cond: any) => {
                                                const skills = cond?.skills || {};
                                                Object.values(skills).forEach((skill: any) => {
                                                    const name = skill?.name || 'Unknown';
                                                    const hits = Number(skill?.hits || 0);
                                                    const damage = Number(skill?.damage || 0);
                                                    if ((!Number.isFinite(hits) || hits <= 0) && (!Number.isFinite(damage) || damage <= 0)) {
                                                        return;
                                                    }
                                                    const existing = skillsMap[name] || { name, hits: 0, damage: 0, icon: skill?.icon };
                                                    existing.hits += Number.isFinite(hits) ? hits : 0;
                                                    existing.damage += Number.isFinite(damage) ? damage : 0;
                                                    if (!existing.icon && skill?.icon) existing.icon = skill.icon;
                                                    skillsMap[name] = existing;
                                                });
                                            });
                                        } else {
                                            skillsMap = conditionTotals[activeConditionName]?.skills || {};
                                        }
                                        const skillsList = Object.values(skillsMap)
                                            .filter((skill: any) => Number.isFinite(skill.hits) && skill.hits > 0)
                                            .sort((a: any, b: any) => b.hits - a.hits || a.name.localeCompare(b.name));
                                        const skillsDamageList = Object.values(skillsMap)
                                            .filter((skill: any) => Number.isFinite(skill.damage) && skill.damage > 0)
                                            .sort((a: any, b: any) => b.damage - a.damage || a.name.localeCompare(b.name));
                                        const showTooltip = activeConditionName === 'all' && skillsList.length > 0;
                                        const showDamageTooltip = activeConditionName === 'all' && skillsDamageList.length > 0;
                                        const applicationsValue = Math.round(entry.applications || 0).toLocaleString();
                                        const damageValue = Math.round(entry.damage || 0).toLocaleString();
                                        return (
                                            <div key={`${entry.account}-${idx}`} className={`grid ${conditionGridClass} px-4 py-2 text-sm text-gray-200 border-t border-white/5`}>
                                                <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(entry.profession, entry.professionList, 'w-4 h-4')}
                                                    <span className="truncate">{entry.account}</span>
                                                </div>
                                                <div className="text-right font-mono text-gray-300">
                                                    {showTooltip ? (
                                                        <SkillBreakdownTooltip
                                                            value={applicationsValue}
                                                            label="Condition Sources"
                                                            items={skillsList.map((skill: any) => ({
                                                                name: skill.name,
                                                                iconUrl: skill.icon,
                                                                value: Math.round(skill.hits).toLocaleString()
                                                            }))}
                                                            className="justify-end"
                                                        />
                                                    ) : (
                                                        applicationsValue
                                                    )}
                                                </div>
                                                {showConditionDamage ? (
                                                    <div className="text-right font-mono text-gray-300">
                                                        {showDamageTooltip ? (
                                                            <SkillBreakdownTooltip
                                                                value={damageValue}
                                                                label="Condition Damage Sources"
                                                                items={skillsDamageList.map((skill: any) => ({
                                                                    name: skill.name,
                                                                    iconUrl: skill.icon,
                                                                    value: Math.round(skill.damage).toLocaleString()
                                                                }))}
                                                                className="justify-end"
                                                            />
                                                        ) : (
                                                            damageValue
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    });
                                })()}
                            </>
                        }
                    />
                }
            />
            )
        ) : (
            <div className="text-center text-gray-500 italic py-8">No condition data available</div>
        )}
    </div>
    );
};
