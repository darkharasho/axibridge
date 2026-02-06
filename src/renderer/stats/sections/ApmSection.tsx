import { useMemo, useState } from 'react';
import { Activity, Maximize2, X, Columns, Users } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { InlineIconLabel } from '../ui/StatsViewShared';
import type { ApmPlayerRow, ApmSkillEntry } from '../statsTypes';

type ApmSectionProps = {
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    sidebarListClass: string;
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
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
};

export const ApmSection = ({
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
    sidebarListClass,
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
    formatCastCountValue,
    renderProfessionIcon
}: ApmSectionProps) => {
    const [allSkillsSort, setAllSkillsSort] = useState<{ key: 'apm' | 'apmNoAuto'; dir: 'asc' | 'desc' }>({ key: 'apm', dir: 'desc' });
    const [skillSort, setSkillSort] = useState<{ key: 'apm' | 'casts'; dir: 'asc' | 'desc' }>({ key: 'apm', dir: 'desc' });
    const isExpanded = expandedSection === 'apm-stats';
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({ columnId: '', dir: 'desc' });
    const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

    const toggleAllSkillsSort = (key: 'apm' | 'apmNoAuto') => {
        setAllSkillsSort((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
        }));
    };
    const toggleSkillSort = (key: 'apm' | 'casts') => {
        setSkillSort((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
        }));
    };

    const sortedAllSkillsRows = useMemo(() => {
        const rows = [...(activeApmSpecTable?.playerRows || [])];
        rows.sort((a: any, b: any) => {
            const aVal = allSkillsSort.key === 'apm'
                ? Number(apmView === 'perSecond' ? a.aps : a.apm)
                : Number(apmView === 'perSecond' ? a.apsNoAuto : a.apmNoAuto);
            const bVal = allSkillsSort.key === 'apm'
                ? Number(apmView === 'perSecond' ? b.aps : b.apm)
                : Number(apmView === 'perSecond' ? b.apsNoAuto : b.apmNoAuto);
            const diff = allSkillsSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
            return diff || String(a.displayName || '').localeCompare(String(b.displayName || ''));
        });
        return rows;
    }, [activeApmSpecTable, allSkillsSort, apmView]);

    const sortedSkillRows = useMemo(() => {
        const rows = [...(activeApmSkill?.playerRows || [])];
        rows.sort((a: any, b: any) => {
            const aVal = skillSort.key === 'apm'
                ? Number(a.apm || 0)
                : Number(apmView === 'perSecond' ? a.aps : a.count);
            const bVal = skillSort.key === 'apm'
                ? Number(b.apm || 0)
                : Number(apmView === 'perSecond' ? b.aps : b.count);
            const diff = skillSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
            return diff || String(a.displayName || '').localeCompare(String(b.displayName || ''));
        });
        return rows;
    }, [activeApmSkill, skillSort, apmView]);

    return (
    <div
        id="apm-stats"
        data-section-visible={isSectionVisible('apm-stats')}
        data-section-first={isFirstVisibleSection('apm-stats')}
        className={sectionClass('apm-stats', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid scroll-mt-24 flex flex-col ${expandedSection === 'apm-stats'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : 'overflow-hidden'
            }`)}
    >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-300" />
                APM Breakdown
            </h3>
            <div className="flex items-center gap-3 relative">
                <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
        {apmSpecTables.length} {apmSpecTables.length === 1 ? 'spec' : 'specs'}
                </div>
                <button
                    type="button"
                    onClick={() => (expandedSection === 'apm-stats' ? closeExpandedSection() : openExpandedSection('apm-stats'))}
                    className={`p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors ${expandedSection === 'apm-stats' ? 'absolute -top-1 -right-1 md:static' : ''
                        }`}
                    aria-label={expandedSection === 'apm-stats' ? 'Close APM Breakdown' : 'Expand APM Breakdown'}
                    title={expandedSection === 'apm-stats' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'apm-stats' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>
        </div>
        <div className={expandedSection === 'apm-stats' ? 'flex-1 min-h-0 flex flex-col' : ''}>
            {!apmSpecAvailable ? (
                <div className="rounded-2xl border border-dashed border-white/20 px-4 py-6 text-center text-xs text-gray-400">
                    {skillUsageAvailable
                        ? 'No APM data available for the current selection.'
                        : 'Upload or highlight logs with rotation data to enable the APM table.'}
                </div>
            ) : (
                <div className={`grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 ${expandedSection === 'apm-stats' ? 'flex-1 min-h-0 h-full' : ''}`}>
                    <div className={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'apm-stats' ? 'h-full' : ''}`}>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Elite Specs</div>
                        <div className={`${sidebarListClass} ${expandedSection === 'apm-stats' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {apmSpecTables.map((spec) => (
                                <div key={spec.profession} className="space-y-1">
                                    <button
                                        onClick={() => {
                                            setActiveApmSpec(spec.profession);
                                            setExpandedApmSpec(null);
                                            setActiveApmSkillId(ALL_SKILLS_KEY);
                                            setApmSkillSearch('');
                                            setSelectedSkillIds([]);
                                            setSelectedPlayers([]);
                                        }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeApmSpec === spec.profession
                                                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {renderProfessionIcon(spec.profession, undefined, 'w-4 h-4')}
                                                <span className="truncate">{spec.profession}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-gray-400">
                                                <span className="text-[10px]">{spec.players.length}p</span>
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className={`bg-black/30 border border-white/5 rounded-xl overflow-hidden stats-share-table ${expandedSection === 'apm-stats' ? 'flex flex-col min-h-0' : ''}`}>
                        {!activeApmSpecTable ? (
                            <div className="px-4 py-10 text-center text-gray-500 italic text-sm">
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
                                        <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                                            <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">APM</div>
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
                                                <PillToggleGroup
                                                    value={apmView}
                                                    onChange={setApmView}
                                                    options={[
                                                        { value: 'total', label: 'Total' },
                                                        { value: 'perSecond', label: 'Per Sec' }
                                                    ]}
                                                    activeClassName="bg-emerald-500/20 text-emerald-200 border border-emerald-400/40"
                                                    inactiveClassName="border border-transparent text-gray-400 hover:text-white"
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
                                                        const label = skills.find((skill: ApmSkillEntry) => skill.id === id)?.name || id;
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
                                                <div className="px-4 py-10 text-center text-gray-500 italic text-sm">
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
                                                            <span className="text-gray-500 font-mono">{index + 1}</span>
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
                                        <div className="grid grid-cols-[1.6fr_0.7fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                            <div>Player</div>
                                            <button
                                                type="button"
                                                onClick={() => toggleAllSkillsSort('apm')}
                                                className={`text-right transition-colors ${allSkillsSort.key === 'apm' ? 'text-emerald-200' : 'text-gray-400 hover:text-gray-200'}`}
                                            >
                                                {apmView === 'perSecond' ? 'APS' : 'APM'}{allSkillsSort.key === 'apm' ? (allSkillsSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleAllSkillsSort('apmNoAuto')}
                                                className={`text-right transition-colors ${allSkillsSort.key === 'apmNoAuto' ? 'text-emerald-200' : 'text-gray-400 hover:text-gray-200'}`}
                                            >
                                                {apmView === 'perSecond' ? 'APS' : 'APM'} (No Auto){allSkillsSort.key === 'apmNoAuto' ? (allSkillsSort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                            </button>
                                        </div>
                                        <div className={expandedSection === 'apm-stats' ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-72 overflow-y-auto'}>
                                            {sortedAllSkillsRows.map((row: ApmPlayerRow, index: number) => (
                                                <div
                                                    key={`${activeApmSpecTable.profession}-all-${row.key}`}
                                                    className="grid grid-cols-[1.6fr_0.7fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">{`#${index + 1}`}</span>
                                                        {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-white truncate">{row.displayName}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right font-mono text-gray-300">
                                                        {formatApmValue(apmView === 'perSecond' ? row.aps : row.apm)}
                                                    </div>
                                                    <div className="text-right font-mono text-gray-300">
                                                        {formatApmValue(apmView === 'perSecond' ? row.apsNoAuto : row.apmNoAuto)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
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
