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
        ? 'overflow-y-auto space-y-1 pr-1 flex-1 min-h-0'
        : `${sidebarListClass} max-h-72 overflow-y-auto`;

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
    <div
        className={`${expandedSection === 'apm-stats' ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
        style={expandedSection === 'apm-stats' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
    >
        <div className="flex items-center gap-2 mb-3.5">
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
                <div className={`grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-0 ${expandedSection === 'apm-stats' ? 'flex-1 min-h-0 h-full' : ''}`}>
                    <div className={`pr-3 flex flex-col min-h-0 ${expandedSection === 'apm-stats' ? 'h-full' : ''}`} style={{ borderRight: '1px solid var(--border-subtle)' }}>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>Elite Specs</div>
                        <div className="mb-2">
                            <input
                                type="text"
                                value={apmSkillSearch}
                                onChange={(event) => setApmSkillSearch(event.target.value)}
                                placeholder="Search skills..."
                                className="w-full px-2.5 py-1.5 text-xs focus:outline-none"
                                style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
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
                                        className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeApmSpec === spec.profession
                                                ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                                : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                            }`}
                                        style={activeApmSpec !== spec.profession ? { color: 'var(--text-secondary)' } : undefined}
                                    >
                                        <div className="flex items-center justify-between gap-2">
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
                                        <div className="ml-2 space-y-1 pl-2" style={{ borderLeft: '1px solid var(--border-subtle)' }}>
                                            <input
                                                type="text"
                                                value={subSkillSearchBySpec[spec.profession] || ''}
                                                onChange={(event) => {
                                                    const value = event.target.value;
                                                    setSubSkillSearchBySpec((prev) => ({ ...prev, [spec.profession]: value }));
                                                }}
                                                placeholder="Filter this spec..."
                                                className="w-full px-2 py-1 text-[11px] focus:outline-none mb-1"
                                                style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setActiveApmSpec(spec.profession);
                                                    setActiveApmSkillId(ALL_SKILLS_KEY);
                                                }}
                                                className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] transition-colors ${
                                                    activeApmSpec === spec.profession && isAllApmSkills
                                                        ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                                        : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                                }`}
                                                style={!(activeApmSpec === spec.profession && isAllApmSkills) ? { color: 'var(--text-secondary)' } : undefined}
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
                                                        className={`w-full text-left px-2 py-1.5 rounded-md text-[11px] transition-colors ${
                                                            activeApmSpec === spec.profession && activeApmSkillId === skill.id
                                                                ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] font-semibold'
                                                                : 'hover:bg-[var(--bg-hover)] hover:text-[color:var(--text-primary)]'
                                                        }`}
                                                        style={!(activeApmSpec === spec.profession && activeApmSkillId === skill.id) ? { color: 'var(--text-secondary)' } : undefined}
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
                                                    activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                                    inactiveClassName="text-[color:var(--text-secondary)]"
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
                                                        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                                        style={{ border: '1px solid var(--border-default)', background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
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
                                                                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                                                style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--brand-primary)' }}
                                                            >
                                                                <span>{label}</span>
                                                                <span style={{ color: 'var(--text-secondary)' }}>×</span>
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
                                                                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px]"
                                                                style={{ border: '1px solid var(--accent-border)', background: 'var(--accent-bg)', color: 'var(--brand-primary)' }}
                                                            >
                                                                <span>{label}</span>
                                                                <span style={{ color: 'var(--text-secondary)' }}>×</span>
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
                                        <div className="stats-table-shell__head-stack">
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
                                            {isAllApmSkills || !activeApmSkill ? (
                                                <div className="stats-table-column-header grid grid-cols-[1.4fr_0.6fr_0.7fr_0.8fr] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] px-3 py-2 border-b border-[color:var(--border-default)]">
                                                    <div>Player</div>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleAllSkillsSort('apm')}
                                                        className="text-right transition-colors"
                                                        style={{ color: allSkillsSort.key === 'apm' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                                    >
                                                        {apmView === 'perSecond' ? 'APS' : 'APM'}{allSkillsSort.key === 'apm' ? (allSkillsSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleAllSkillsSort('apmNoAuto')}
                                                        className="text-right transition-colors"
                                                        style={{ color: allSkillsSort.key === 'apmNoAuto' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                                    >
                                                        {apmView === 'perSecond' ? 'APS' : 'APM'} (No Auto){allSkillsSort.key === 'apmNoAuto' ? (allSkillsSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleAllSkillsSort('apmNoProcs')}
                                                        className="text-right transition-colors"
                                                        style={{ color: allSkillsSort.key === 'apmNoProcs' ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                                    >
                                                        {apmView === 'perSecond' ? 'APS' : 'APM'} (No Procs){allSkillsSort.key === 'apmNoProcs' ? (allSkillsSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="stats-table-column-header grid grid-cols-[1.4fr_0.8fr_0.8fr] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] px-3 py-2 border-b border-[color:var(--border-default)]">
                                                    <div>Player</div>
                                                    <div className="text-right">Casts</div>
                                                    <div className="text-right">{apmView === 'perSecond' ? 'APS' : 'APM'}</div>
                                                </div>
                                            )}
                                        </div>
                                        {isAllApmSkills || !activeApmSkill ? (
                                            <>
                                                <div className={`stats-table-shell__rows ${expandedSection === 'apm-stats' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-72 overflow-y-auto'}`}>
                                                    {sortedAllSkillsRows.map((row: ApmPlayerRow, index: number) => (
                                                        <div
                                                            key={`${activeApmSpecTable.profession}-all-${row.key}`}
                                                            className="grid grid-cols-[1.4fr_0.6fr_0.7fr_0.8fr] px-3 py-2 text-xs border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]"
                                                            style={{ color: 'var(--text-primary)' }}
                                                        >
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>{`#${index + 1}`}</span>
                                                                {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                                <div className="min-w-0">
                                                                    <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{row.displayName}</div>
                                                                </div>
                                                            </div>
                                                            <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                                {formatApmValue(apmView === 'perSecond' ? row.aps : row.apm)}
                                                            </div>
                                                            <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                                {formatApmValue(apmView === 'perSecond' ? row.apsNoAuto : row.apmNoAuto)}
                                                            </div>
                                                            <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                                {formatApmValue(apmView === 'perSecond' ? row.apsNoProcs : row.apmNoProcs)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className={`stats-table-shell__rows ${expandedSection === 'apm-stats' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-72 overflow-y-auto'}`}>
                                                    {((activeApmSkill as any)?.playerRows || []).length === 0 ? (
                                                        <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                                                            No player rows available for this skill.
                                                        </div>
                                                    ) : (
                                                        ((activeApmSkill as any)?.playerRows || []).map((row: any, index: number) => (
                                                            <div
                                                                key={`${activeApmSpecTable.profession}-${activeApmSkill.id}-${row.key}`}
                                                                className="grid grid-cols-[1.4fr_0.8fr_0.8fr] px-3 py-2 text-xs border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]"
                                                                style={{ color: 'var(--text-primary)' }}
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>{`#${index + 1}`}</span>
                                                                    {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                                    <div className="min-w-0">
                                                                        <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{row.displayName}</div>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{formatCastCountValue(Number(row.count || 0))}</div>
                                                                <div className="text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                                                    {formatApmValue(apmView === 'perSecond' ? Number(row.aps || 0) : Number(row.apm || 0))}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </>
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
