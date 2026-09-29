import { useMemo, useState } from 'react';
import { Maximize2, X, Columns, Users } from 'lucide-react';
import { Gw2ApmIcon } from '../../ui/Gw2ApmIcon';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { InlineIconLabel } from '../ui/StatsViewShared';
import type { ApmPlayerRow, ApmSkillEntry } from '../statsTypes';
import { useStatsSharedContext } from '../StatsViewContext';
import { expandedPaneProps } from './expandedPane';

type ApmSectionProps = {
    apmSpecAvailable: boolean;
    skillUsageAvailable: boolean;
    apmSpecTables: any[];
    activeApmSpec: string | null;
    setActiveApmSpec: (value: string | null) => void;
    expandedApmSpec: string | null;
    setExpandedApmSpec: (value: string | null) => void;
    activeApmSkillId: any;
    setActiveApmSkillId: (value: any) => void;
    ALL_SKILLS_KEY: any;
    apmSkillSearch: string;
    setApmSkillSearch: (value: string) => void;
    activeApmSpecTable: any;
    activeApmSkill: any;
    isAllApmSkills: boolean;
    apmView: 'total' | 'perSecond';
    setApmView: (value: 'total' | 'perSecond') => void;
    formatApmValue: (value: number) => string;
    formatCastRateValue: (value: number) => string;
    formatCastCountValue: (value: number) => string;
};

export const ApmSection = ({
    apmSpecAvailable,
    skillUsageAvailable,
    apmSpecTables,
    activeApmSpec,
    setActiveApmSpec,
    expandedApmSpec,
    setExpandedApmSpec,
    activeApmSkillId,
    setActiveApmSkillId,
    ALL_SKILLS_KEY,
    apmSkillSearch,
    setApmSkillSearch,
    activeApmSpecTable,
    activeApmSkill,
    isAllApmSkills,
    apmView,
    setApmView,
    formatApmValue,
    formatCastRateValue,
    formatCastCountValue
}: ApmSectionProps) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass, renderProfessionIcon } = useStatsSharedContext();
    const [allSkillsSort, setAllSkillsSort] = useState<{ key: 'apm' | 'apmNoAuto' | 'apmNoProcs'; dir: 'asc' | 'desc' }>({ key: 'apm', dir: 'desc' });
    const isExpanded = expandedSection === 'apm-stats';
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({ columnId: '', dir: 'desc' });
    const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [subSkillSearchBySpec, setSubSkillSearchBySpec] = useState<Record<string, string>>({});
    const sidebarBodyClass = isExpanded
        ? 'axi-rail__nav axi-rail__nav--quiet overflow-y-auto pr-1 flex-1 min-h-0'
        : `${sidebarListClass} max-h-72 overflow-y-auto`;

    const allSkillsAriaSort = (
        key: 'apm' | 'apmNoAuto' | 'apmNoProcs'
    ): 'ascending' | 'descending' | undefined =>
        allSkillsSort.key !== key ? undefined : allSkillsSort.dir === 'asc' ? 'ascending' : 'descending';

    const toggleAllSkillsSort = (key: 'apm' | 'apmNoAuto' | 'apmNoProcs') => {
        setAllSkillsSort((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
        }));
    };
    const sortedAllSkillsRows = useMemo(() => {
        const rows = [...(activeApmSpecTable?.playerRows || [])];
        rows.sort((a: any, b: any) => {
            const resolveVal = (row: any) => {
                if (allSkillsSort.key === 'apm') return Number(apmView === 'perSecond' ? row.aps : row.apm);
                if (allSkillsSort.key === 'apmNoAuto') return Number(apmView === 'perSecond' ? row.apsNoAuto : row.apmNoAuto);
                return Number(apmView === 'perSecond' ? row.apsNoProcs : row.apmNoProcs);
            };
            const diff = allSkillsSort.dir === 'desc' ? resolveVal(b) - resolveVal(a) : resolveVal(a) - resolveVal(b);
            return diff || String(a.displayName || '').localeCompare(String(b.displayName || ''));
        });
        return rows;
    }, [activeApmSpecTable, allSkillsSort, apmView]);

    return (
    <div {...expandedPaneProps(expandedSection === 'apm-stats', expandedSectionClosing)}>
        <div className="flex flex-wrap items-center gap-2 mb-3.5">
            <span className="flex shrink-0" style={{ color: 'var(--brand-primary)' }}><Gw2ApmIcon className="w-4 h-4" /></span>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>APM Breakdown</h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'apm-stats' ? closeExpandedSection() : openExpandedSection('apm-stats'))}
                className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                aria-label={expandedSection === 'apm-stats' ? 'Close APM Breakdown' : 'Expand APM Breakdown'}
                title={expandedSection === 'apm-stats' ? 'Close' : 'Expand'}
            >
                {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
            </button>
        </div>
        <div className={expandedSection === 'apm-stats' ? 'flex-1 min-h-0 flex flex-col' : ''}>
            {!apmSpecAvailable ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    {skillUsageAvailable
                        ? 'No APM data available for the current selection.'
                        : 'Upload or highlight logs with rotation data to enable the APM table.'}
                </div>
            ) : (
                <div className={`grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-0 ${expandedSection === 'apm-stats' ? 'flex-1 min-h-0 h-full' : ''}`}>
                    <div className={`pr-3 flex flex-col min-h-0 ${expandedSection === 'apm-stats' ? 'h-full' : ''}`} style={{ borderRight: '1px solid var(--border-subtle)' }}>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Elite Specs</div>
                        <div className="mb-2">
                            <input
                                type="text"
                                value={apmSkillSearch}
                                onChange={(event) => setApmSkillSearch(event.target.value)}
                                placeholder="Search skills..."
                                className="axi-input"
                                style={{ '--axi-input-pad': '5px 8px', '--axi-input-size': '12px' } as React.CSSProperties}
                            />
                        </div>
                        <div className={sidebarBodyClass}>
                            {apmSpecTables.map((spec) => (
                                <div key={spec.profession} className="space-y-1">
                                    <button
                                        onClick={() => {
                                            const switchedSpec = activeApmSpec !== spec.profession;
                                            setActiveApmSpec(spec.profession);
                                            setExpandedApmSpec(
                                                switchedSpec
                                                    ? spec.profession
                                                    : (expandedApmSpec === spec.profession ? null : spec.profession)
                                            );
                                            if (switchedSpec) {
                                                setActiveApmSkillId(ALL_SKILLS_KEY);
                                                setSelectedSkillIds([]);
                                                setSelectedPlayers([]);
                                            }
                                        }}
                                        className="axi-rail__item"
                                        aria-current={activeApmSpec === spec.profession ? 'location' : undefined}
                                    >
                                        <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {renderProfessionIcon(spec.profession, undefined, 'w-4 h-4')}
                                                <span className="truncate">{spec.profession}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[color:var(--text-secondary)]">
                                                <span className="text-[10px]">{spec.players.length}p</span>
                                            </div>
                                        </div>
                                    </button>
                                    {!isExpanded && expandedApmSpec === spec.profession && (
                                        <div className="axi-rail__sub">
                                            <input
                                                type="text"
                                                value={subSkillSearchBySpec[spec.profession] || ''}
                                                onChange={(event) => {
                                                    const value = event.target.value;
                                                    setSubSkillSearchBySpec((prev) => ({ ...prev, [spec.profession]: value }));
                                                }}
                                                placeholder="Filter this spec..."
                                                className="axi-input mb-1"
                                                style={{ '--axi-input-pad': '4px 7px', '--axi-input-size': '11px' } as React.CSSProperties}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setActiveApmSpec(spec.profession);
                                                    setActiveApmSkillId(ALL_SKILLS_KEY);
                                                }}
                                                className="axi-rail__subitem"
                                                aria-current={activeApmSpec === spec.profession && isAllApmSkills ? 'location' : undefined}
                                            >
                                                All Skills
                                            </button>
                                            {(spec.skills || [])
                                                .filter((skill: ApmSkillEntry) => {
                                                    const query = (subSkillSearchBySpec[spec.profession] || '').trim().toLowerCase();
                                                    if (!query) return true;
                                                    return String(skill.name || '').toLowerCase().includes(query);
                                                })
                                                .map((skill: ApmSkillEntry) => (
                                                    <button
                                                        key={skill.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setActiveApmSpec(spec.profession);
                                                            setActiveApmSkillId(skill.id);
                                                        }}
                                                        className="axi-rail__subitem"
                                                        aria-current={activeApmSpec === spec.profession && activeApmSkillId === skill.id ? 'location' : undefined}
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
                                            {(spec.skills || []).filter((skill: ApmSkillEntry) => {
                                                const query = (subSkillSearchBySpec[spec.profession] || '').trim().toLowerCase();
                                                if (!query) return true;
                                                return String(skill.name || '').toLowerCase().includes(query);
                                            }).length === 0 && (
                                                <div className="px-2 py-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>No matching skills</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={`pl-3 overflow-hidden ${expandedSection === 'apm-stats' ? 'flex flex-col min-h-0' : ''}`}>
                        {!activeApmSpecTable ? (
                            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                                Select an elite spec to view APM details
                            </div>
                        ) : (
                            <div className={expandedSection === 'apm-stats' ? 'flex flex-col min-h-0' : ''}>
                                {isExpanded && (() => {
                                    const skills = activeApmSpecTable.skills || [];
                                    const playerOptions = (activeApmSpecTable.playerRows || []).map((row: ApmPlayerRow) => ({
                                        id: row.key,
                                        label: row.displayName || row.account || row.key,
                                        icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
                                    }));
                                    const skillOptions = skills.map((skill: ApmSkillEntry) => ({
                                        id: skill.id,
                                        label: skill.name,
                                        icon: skill.icon ? <img src={skill.icon} alt="" className="h-4 w-4 object-contain" /> : undefined
                                    }));
                                    const searchOptions = [
                                        ...skills.map((skill: ApmSkillEntry) => ({
                                            id: skill.id,
                                            label: skill.name,
                                            type: 'column' as const,
                                            icon: skill.icon ? <img src={skill.icon} alt="" className="h-4 w-4" /> : undefined
                                        })),
                                        ...(activeApmSpecTable.playerRows || []).map((row: ApmPlayerRow) => ({
                                            id: row.key,
                                            label: row.displayName || row.account || row.key,
                                            type: 'player' as const,
                                            icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
                                        }))
                                    ];
                                    const selectedIds = new Set([
                                        ...selectedSkillIds.map((id) => `column:${id}`),
                                        ...selectedPlayers.map((id) => `player:${id}`)
                                    ]);
                                    return (
                                        <>
                                        <div className="flex flex-wrap items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
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
                                                <div className="h-5 w-px" style={{ background: 'var(--border-subtle)' }} />
                                                <PillToggleGroup
                                                    value={apmView}
                                                    onChange={setApmView}
                                                    options={[
                                                        { value: 'total', label: 'Total' },
                                                        { value: 'perSecond', label: 'Per Sec' }
                                                    ]}
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
                                                        className="axi-btn axi-btn--xs"
                                                    >
                                                        Clear All
                                                    </button>
                                                    {selectedSkillIds.map((id) => {
                                                        const label = skills.find((skill: ApmSkillEntry) => skill.id === id)?.name || id;
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
                                                        const label = playerOptions.find((entry: SearchSelectOption) => entry.id === id)?.label || id;
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
                                        </>
                                    );
                                })()}
                                {isExpanded ? (
                                    (() => {
                                        const skills = activeApmSpecTable.skills || [];
                                        const visibleSkills = selectedSkillIds.length > 0
                                            ? skills.filter((skill: ApmSkillEntry) => selectedSkillIds.includes(skill.id))
                                            : skills;
                                        const visiblePlayers = selectedPlayers.length > 0
                                            ? (activeApmSpecTable.playerRows || []).filter((row: ApmPlayerRow) => selectedPlayers.includes(row.key))
                                            : (activeApmSpecTable.playerRows || []);
                                        if (skills.length === 0) {
                                            return (
                                                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                                                    No skills available for this class.
                                                </div>
                                            );
                                        }
                                        const resolvedSortColumnId = visibleSkills.find((entry: ApmSkillEntry) => entry.id === denseSort.columnId)?.id
                                            || visibleSkills[0]?.id
                                            || '';
                                        const rows = [...visiblePlayers]
                                            .map((row: ApmPlayerRow) => {
                                                const values: Record<string, string> = {};
                                                const numericValues: Record<string, number> = {};
                                                visibleSkills.forEach((skill: ApmSkillEntry) => {
                                                    const count = Number(skill.playerCounts?.get(row.key) || 0);
                                                    const value = apmView === 'perSecond'
                                                        ? count / Math.max(1, row.totalActiveSeconds || 0)
                                                        : count;
                                                    numericValues[skill.id] = value;
                                                    values[skill.id] = apmView === 'perSecond'
                                                        ? formatCastRateValue(value)
                                                        : formatCastCountValue(value);
                                                });
                                                return { row, values, numericValues };
                                            })
                                            .sort((a, b) => {
                                                const aValue = a.numericValues[resolvedSortColumnId] ?? 0;
                                                const bValue = b.numericValues[resolvedSortColumnId] ?? 0;
                                                const diff = denseSort.dir === 'desc' ? bValue - aValue : aValue - bValue;
                                                return diff || String(a.row.displayName || '').localeCompare(String(b.row.displayName || ''));
                                            });
                                        return (
                                            <DenseStatsTable
                                                title="APM - Dense View"
                                                subtitle="Skills"
                                                sortColumnId={resolvedSortColumnId}
                                                sortDirection={denseSort.dir}
                                                onSortColumn={(columnId) => {
                                            setDenseSort((prev) => ({
                                                columnId,
                                                dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                            }));
                                        }}
                                                columns={visibleSkills.map((skill: ApmSkillEntry) => ({
                                                    id: skill.id,
                                                    label: <InlineIconLabel name={skill.name} iconUrl={skill.icon} iconClassName="h-4 w-4" />,
                                                    align: 'right',
                                                    minWidth: 90
                                                }))}
                                                rows={rows.map((entry, index: number) => ({
                                                    id: `${activeApmSpecTable.profession}-${entry.row.key}`,
                                                    label: (
                                                        <>
                                                            <span className="text-[color:var(--text-muted)] font-mono">{index + 1}</span>
                                                            {renderProfessionIcon(entry.row.profession, entry.row.professionList, 'w-4 h-4')}
                                                            <span className="truncate">{entry.row.displayName}</span>
                                                        </>
                                                    ),
                                                    values: entry.values
                                                }))}
                                            />
                                        );
                                    })()
                                ) : (
                                    <>
                                        <div className="stats-table-shell__header">
                                            <div className="flex items-center justify-between gap-2 px-4 py-3">
                                                <div className="min-w-0 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderProfessionIcon(activeApmSpecTable.profession, undefined, 'w-4 h-4')}
                                                        <span className="truncate">{activeApmSpecTable.profession}</span>
                                                        <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>/</span>
                                                        {isAllApmSkills || !activeApmSkill ? (
                                                            <span className="truncate">All Skills</span>
                                                        ) : (
                                                            <InlineIconLabel name={activeApmSkill.name} iconUrl={activeApmSkill.icon} iconClassName="h-5 w-5" />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                                    {isAllApmSkills || !activeApmSkill
                                                        ? `${activeApmSpecTable.playerRows?.length || 0} players`
                                                        : `${(activeApmSkill as any)?.totalCasts ?? 0} casts`}
                                                </div>
                                            </div>
                                        </div>
                                        {isAllApmSkills || !activeApmSkill ? (
                                            <div className={`axi-table__scroll ${expandedSection === 'apm-stats' ? 'flex-1 min-h-0' : 'max-h-72'}`}>
                                                <table className="axi-table axi-table--fixed axi-table--sticky axi-table--dense">
                                                    <colgroup>
                                                        <col style={{ width: '40%' }} />
                                                        <col style={{ width: '17.1429%' }} />
                                                        <col style={{ width: '20%' }} />
                                                        <col style={{ width: '22.8571%' }} />
                                                    </colgroup>
                                                    <thead>
                                                        <tr>
                                                            <th scope="col">Player</th>
                                                            <th scope="col" aria-sort={allSkillsAriaSort('apm')}>
                                                                <button type="button" className="axi-table__sort" onClick={() => toggleAllSkillsSort('apm')}>
                                                                    {apmView === 'perSecond' ? 'APS' : 'APM'}{allSkillsSort.key === 'apm' ? (allSkillsSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                                </button>
                                                            </th>
                                                            <th scope="col" aria-sort={allSkillsAriaSort('apmNoAuto')}>
                                                                <button type="button" className="axi-table__sort" onClick={() => toggleAllSkillsSort('apmNoAuto')}>
                                                                    {apmView === 'perSecond' ? 'APS' : 'APM'} (No Auto){allSkillsSort.key === 'apmNoAuto' ? (allSkillsSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                                </button>
                                                            </th>
                                                            <th scope="col" aria-sort={allSkillsAriaSort('apmNoProcs')}>
                                                                <button type="button" className="axi-table__sort" onClick={() => toggleAllSkillsSort('apmNoProcs')}>
                                                                    {apmView === 'perSecond' ? 'APS' : 'APM'} (No Procs){allSkillsSort.key === 'apmNoProcs' ? (allSkillsSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                                </button>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sortedAllSkillsRows.map((row: ApmPlayerRow, index: number) => (
                                                            <tr key={`${activeApmSpecTable.profession}-all-${row.key}`}>
                                                                <th scope="row">
                                                                    <span className="axi-table__who">
                                                                        <span className="axi-ink-muted">{`#${index + 1}`}</span>
                                                                        {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                                        <span>{row.displayName}</span>
                                                                    </span>
                                                                </th>
                                                                <td className={allSkillsSort.key === 'apm' ? 'axi-table__cell--sorted' : undefined}>
                                                                    {formatApmValue(apmView === 'perSecond' ? row.aps : row.apm)}
                                                                </td>
                                                                <td className={allSkillsSort.key === 'apmNoAuto' ? 'axi-table__cell--sorted' : undefined}>
                                                                    {formatApmValue(apmView === 'perSecond' ? row.apsNoAuto : row.apmNoAuto)}
                                                                </td>
                                                                <td className={allSkillsSort.key === 'apmNoProcs' ? 'axi-table__cell--sorted' : undefined}>
                                                                    {formatApmValue(apmView === 'perSecond' ? row.apsNoProcs : row.apmNoProcs)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className={`axi-table__scroll ${expandedSection === 'apm-stats' ? 'flex-1 min-h-0' : 'max-h-72'}`}>
                                                <table className="axi-table axi-table--fixed axi-table--sticky axi-table--dense">
                                                    <colgroup>
                                                        <col style={{ width: '46.6667%' }} />
                                                        <col style={{ width: '26.6667%' }} />
                                                        <col style={{ width: '26.6667%' }} />
                                                    </colgroup>
                                                    <thead>
                                                        <tr>
                                                            <th scope="col">Player</th>
                                                            <th scope="col">Casts</th>
                                                            <th scope="col">{apmView === 'perSecond' ? 'APS' : 'APM'}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {((activeApmSkill as any)?.playerRows || []).length === 0 ? (
                                                            <tr>
                                                                <td colSpan={3} className="axi-ink-muted text-center">
                                                                    No player rows available for this skill.
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            ((activeApmSkill as any)?.playerRows || []).map((row: any, index: number) => (
                                                                <tr key={`${activeApmSpecTable.profession}-${activeApmSkill.id}-${row.key}`}>
                                                                    <th scope="row">
                                                                        <span className="axi-table__who">
                                                                            <span className="axi-ink-muted">{`#${index + 1}`}</span>
                                                                            {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                                            <span>{row.displayName}</span>
                                                                        </span>
                                                                    </th>
                                                                    <td>{formatCastCountValue(Number(row.count || 0))}</td>
                                                                    <td className="axi-table__num">
                                                                        {formatApmValue(apmView === 'perSecond' ? Number(row.aps || 0) : Number(row.apm || 0))}
                                                                    </td>
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    </div>
    );
};
