import { useState } from 'react';
import { Maximize2, X, Columns, Users, Skull } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { InlineIconLabel, SkillBreakdownTooltip } from '../ui/StatsViewShared';
import { useStatsSharedContext } from '../StatsViewContext';

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
    effectiveConditionSort: { key: 'applications' | 'damage' | 'uptime'; dir: 'asc' | 'desc' };
    setConditionSort: (value: { key: 'applications' | 'damage' | 'uptime'; dir: 'asc' | 'desc' }) => void;
    showConditionDamage: boolean;
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
    showConditionDamage
}: ConditionsSectionProps) => {
    const { renderProfessionIcon, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass } = useStatsSharedContext();
    const isExpanded = expandedSection === 'conditions-outgoing';
    const [selectedConditionColumns, setSelectedConditionColumns] = useState<string[]>([]);
    const [selectedConditionPlayers, setSelectedConditionPlayers] = useState<string[]>([]);
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({ columnId: 'all', dir: 'desc' });
    const resolveApplications = (condition: any) => {
        if (!condition) return 0;
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
        className={`stats-share-exclude ${expandedSection === 'conditions-outgoing' ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
        style={expandedSection === 'conditions-outgoing' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
    >
        <div className="flex items-center gap-2 mb-3.5">
            <Skull className="w-4 h-4 shrink-0" style={{ color: 'var(--section-offense)' }} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Conditions</h3>
            <div className="ml-auto flex items-center gap-2">
                {!isExpanded && (
                    <PillToggleGroup
                        value={conditionDirection}
                        onChange={setConditionDirection}
                        options={[
                            { value: 'outgoing', label: 'Outgoing' },
                            { value: 'incoming', label: 'Incoming' }
                        ]}
                        activeClassName="bg-amber-500/20 text-amber-200 border border-amber-500/40"
                        inactiveClassName="border border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                    />
                )}
                <button
                    type="button"
                    onClick={() => (expandedSection === 'conditions-outgoing' ? closeExpandedSection() : openExpandedSection('conditions-outgoing'))}
                    className="flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={expandedSection === 'conditions-outgoing' ? 'Close Outgoing Conditions' : 'Expand Outgoing Conditions'}
                    title={expandedSection === 'conditions-outgoing' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'conditions-outgoing' ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>
        </div>
        {conditionSummary && conditionSummary.length > 0 ? (
            isExpanded ? (
                <div className="flex flex-col gap-4">
                    <div className="border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] px-4 py-3">
                        <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-2">Conditions</div>
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
                                inactiveClassName="border border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                            />
                            <PillToggleGroup
                                    value={effectiveConditionSort.key}
                                    onChange={(value) => setConditionSort({ key: value as 'applications' | 'damage' | 'uptime', dir: 'desc' })}
                                    options={[
                                        { value: 'applications', label: 'Applications' },
                                        ...(conditionDirection === 'outgoing' ? [{ value: 'uptime', label: 'Uptime' }] : []),
                                        ...(showConditionDamage ? [{ value: 'damage', label: 'Damage' }] : [])
                                    ]}
                                    activeClassName="bg-amber-500/20 text-amber-200 border border-amber-500/40"
                                    inactiveClassName="border border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                                />
                        </div>
                    </div>
                    <div className="overflow-hidden">
                        {filteredConditions.length === 0 ? (
                            <div className="px-4 py-10 text-center text-[color:var(--text-muted)] italic text-sm">No conditions match this filter</div>
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
                                        const resolveMetricValue = (condition: any) => {
                                            if (!condition) return 0;
                                            if (metricKey === 'uptime') return Number(condition?.uptimeMs || 0) / 1000;
                                            if (metricKey === 'damage') return Number(condition?.damage || 0);
                                            return resolveApplications(condition);
                                        };
                                        const formatMetricValue = (val: number) =>
                                            metricKey === 'uptime'
                                                ? `${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}s`
                                                : Math.round(val || 0).toLocaleString();
                                        columns.forEach((column: any) => {
                                            if (column.id === 'all' || column.name === 'All Conditions') {
                                                const val = Object.values(conditionTotals).reduce(
                                                    (acc: number, condition: any) => acc + resolveMetricValue(condition), 0
                                                );
                                                numericValues.all = val || 0;
                                                values.all = formatMetricValue(val || 0);
                                                return;
                                            }
                                            const condition = conditionTotals[column.name];
                                            const val = resolveMetricValue(condition);
                                            numericValues[column.name] = Number(val || 0);
                                            values[column.name] = formatMetricValue(val || 0);
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
                                        subtitle={metricKey === 'uptime' ? 'Uptime (seconds)' : metricKey === 'applications' ? 'Applications' : 'Damage'}
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
                                                    <span className="text-[color:var(--text-muted)] font-mono">{idx + 1}</span>
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
                                className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-default)] bg-[var(--bg-hover)] px-2 py-1 text-[11px] text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)]"
                            >
                                Clear All
                            </button>
                            {selectedConditionColumns.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedConditionColumns((prev) => prev.filter((entry) => entry !== id))}
                                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-default)] bg-[var(--bg-hover)] px-2 py-1 text-[11px] text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)]"
                                >
                                    <span>{id}</span>
                                    <span className="text-[color:var(--text-secondary)]">×</span>
                                </button>
                            ))}
                            {selectedConditionPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedConditionPlayers((prev) => prev.filter((entry) => entry !== id))}
                                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-default)] bg-[var(--bg-hover)] px-2 py-1 text-[11px] text-[color:var(--text-primary)] hover:text-[color:var(--text-primary)]"
                                >
                                    <span>{id}</span>
                                    <span className="text-[color:var(--text-secondary)]">×</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <>
                <StatsTableLayout
                expanded={expandedSection === 'conditions-outgoing'}
                sidebarClassName={`pr-3 flex flex-col min-h-0 overflow-y-auto ${expandedSection === 'conditions-outgoing' ? 'h-full flex-1' : ''}`}
                contentClassName={`overflow-hidden ${expandedSection === 'conditions-outgoing' ? 'flex flex-col min-h-0' : ''}`}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-2">Conditions</div>
                        <input
                            value={conditionSearch}
                            onChange={(e) => setConditionSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full px-2 py-1 text-xs text-[color:var(--text-primary)] focus:outline-none mb-2"
                            style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)' }}
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'conditions-outgoing' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                if (filteredConditions.length === 0) {
                                    return <div className="text-center text-[color:var(--text-muted)] italic py-6 text-xs">No conditions match this filter</div>;
                                }
                                return (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setActiveConditionName('all')}
                                            className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeConditionName === 'all'
                                                ? 'bg-amber-500/20 text-amber-200 font-semibold'
                                                : 'hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                                                }`}
                                        >
                                            All Conditions
                                        </button>
                                        {filteredConditions.map((entry: any) => (
                                            <button
                                                key={entry.name}
                                                type="button"
                                                onClick={() => setActiveConditionName(entry.name)}
                                                className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeConditionName === entry.name
                                                    ? 'bg-amber-500/20 text-amber-200 font-semibold'
                                                    : 'hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
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
                    <StatsTableShell
                        expanded={expandedSection === 'conditions-outgoing'}
                        header={null}
                        columns={
                            <>
                            <div className={`grid ${conditionGridClass} text-xs uppercase tracking-wider text-[color:var(--text-muted)] px-4 py-2`} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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
                                    className={`text-right transition-colors ${effectiveConditionSort.key === 'applications' ? 'text-amber-200' : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}
                                >
                                    Applications {effectiveConditionSort.key === 'applications' ? (effectiveConditionSort.dir === 'desc' ? '↓' : '↑') : ''}
                                </button>
                                {conditionDirection === 'outgoing' ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setConditionSort({
                                                key: 'uptime',
                                                dir: effectiveConditionSort.key === 'uptime' ? (effectiveConditionSort.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                            });
                                        }}
                                        className={`text-right transition-colors ${effectiveConditionSort.key === 'uptime' ? 'text-amber-200' : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}
                                    >
                                        Uptime {effectiveConditionSort.key === 'uptime' ? (effectiveConditionSort.dir === 'desc' ? '↓' : '↑') : ''}
                                    </button>
                                ) : null}
                                {showConditionDamage ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setConditionSort({
                                                key: 'damage',
                                                dir: effectiveConditionSort.key === 'damage' ? (effectiveConditionSort.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                            });
                                        }}
                                        className={`text-right transition-colors ${effectiveConditionSort.key === 'damage' ? 'text-amber-200' : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'}`}
                                    >
                                        Damage {effectiveConditionSort.key === 'damage' ? (effectiveConditionSort.dir === 'desc' ? '↓' : '↑') : ''}
                                    </button>
                                ) : null}
                            </div>
                            </>
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
                                                    (acc: { applications: number; damage: number; uptimeMs: number }, condition: any) => {
                                                        acc.applications += resolveApplications(condition);
                                                        acc.damage += Number(condition?.damage || 0);
                                                        acc.uptimeMs += Number(condition?.uptimeMs || 0);
                                                        return acc;
                                                    },
                                                    { applications: 0, damage: 0, uptimeMs: 0 }
                                                );
                                                return { ...player, ...totals };
                                            }
                                            const condition = conditionTotals[activeConditionName];
                                            return {
                                                ...player,
                                                applications: resolveApplications(condition),
                                                damage: Number(condition?.damage || 0),
                                                uptimeMs: Number(condition?.uptimeMs || 0)
                                            };
                                        })
                                        .filter((row: any) => row.applications > 0 || row.damage > 0 || row.uptimeMs > 0)
                                        .sort((a: any, b: any) => {
                                            const sortKey = effectiveConditionSort.key;
                                            const aVal = sortKey === 'uptime' ? (a.uptimeMs || 0) : sortKey === 'damage' ? (a.damage || 0) : (a.applications || 0);
                                            const bVal = sortKey === 'uptime' ? (b.uptimeMs || 0) : sortKey === 'damage' ? (b.damage || 0) : (b.applications || 0);
                                            const primary = effectiveConditionSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
                                            if (primary !== 0) return primary;
                                            return String(a.account || '').localeCompare(String(b.account || ''));
                                        });
                                    if (rows.length === 0) {
                                        return <div className="text-center text-[color:var(--text-muted)] italic py-6">No condition data available</div>;
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
                                            <div key={`${entry.account}-${idx}`} className={`grid ${conditionGridClass} px-4 py-3 text-sm text-[color:var(--text-primary)] border-t border-[color:var(--border-subtle)]`}>
                                                <div className="text-center text-[color:var(--text-muted)] font-mono">{idx + 1}</div>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(entry.profession, entry.professionList, 'w-4 h-4')}
                                                    <span className="truncate">{entry.account}</span>
                                                </div>
                                                <div className="text-right font-mono text-[color:var(--text-secondary)]">
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
                                                {conditionDirection === 'outgoing' ? (
                                                    <div className="text-right font-mono text-[color:var(--text-secondary)]">
                                                        {Math.round((entry.uptimeMs || 0) / 1000).toLocaleString()}s
                                                    </div>
                                                ) : null}
                                                {showConditionDamage ? (
                                                    <div className="text-right font-mono text-[color:var(--text-secondary)]">
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
                </>
            )
        ) : (
            <div className="text-center text-[color:var(--text-muted)] italic py-8">No condition data available</div>
        )}
    </div>
    );
};
