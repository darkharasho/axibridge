import { useState } from 'react';
import { Maximize2, ShieldCheck, X, Columns, Users } from 'lucide-react';
import { ColumnFilterDropdown } from '../ui/ColumnFilterDropdown';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { SearchSelectDropdown, SearchSelectOption } from '../ui/SearchSelectDropdown';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { InlineIconLabel } from '../ui/StatsViewShared';

type BoonOutputSectionProps = {
    stats: any;
    activeBoonCategory: string;
    setActiveBoonCategory: (value: string) => void;
    activeBoonMetric: 'total' | 'average' | 'uptime';
    setActiveBoonMetric: (value: 'total' | 'average' | 'uptime') => void;
    activeBoonTab: string | null;
    setActiveBoonTab: (value: string | null) => void;
    activeBoonTable: any;
    filteredBoonTables: any[];
    boonSearch: string;
    setBoonSearch: (value: string) => void;
    formatBoonMetricDisplay: (...args: any[]) => string;
    getBoonMetricValue: (...args: any[]) => number;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
    roundCountStats: boolean;
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    sidebarListClass: string;
};

export const BoonOutputSection = ({
    stats,
    activeBoonCategory,
    setActiveBoonCategory,
    activeBoonMetric,
    setActiveBoonMetric,
    activeBoonTab,
    setActiveBoonTab,
    activeBoonTable,
    filteredBoonTables,
    boonSearch,
    setBoonSearch,
    formatBoonMetricDisplay,
    getBoonMetricValue,
    renderProfessionIcon,
    roundCountStats,
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
    sidebarListClass
}: BoonOutputSectionProps) => {
    const [sortState, setSortState] = useState<{ key: 'value' | 'fightTime'; dir: 'asc' | 'desc' }>({ key: 'value', dir: 'desc' });
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({ columnId: '', dir: 'desc' });
    const isExpanded = expandedSection === 'boon-output';
    const [selectedBoonColumnIds, setSelectedBoonColumnIds] = useState<string[]>([]);
    const [selectedBoonPlayers, setSelectedBoonPlayers] = useState<string[]>([]);
    const allBoonColumns = stats.boonTables || [];
    const selectedBoonColumns = selectedBoonColumnIds.length > 0
        ? allBoonColumns.filter((boon: any) => selectedBoonColumnIds.includes(boon.id))
        : allBoonColumns;
    const visibleBoonColumns = selectedBoonColumns;
    const boonColumnOptions = filteredBoonTables.map((boon: any) => ({
        id: boon.id,
        label: boon.name,
        icon: boon.icon ? <img src={boon.icon} alt="" className="h-4 w-4 object-contain" /> : undefined
    }));
    const boonPlayerOptions = Array.from(new Map((stats.boonTables || [])
        .flatMap((table: any) => table.rows || [])
        .filter((row: any) => row.account)
        .map((row: any) => [row.account, row])).values())
        .map((row: any) => ({
            id: row.account,
            label: row.account,
            icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
        }));
    const boonSearchSelectedIds = new Set([
        ...selectedBoonColumnIds.map((id) => `column:${id}`),
        ...selectedBoonPlayers.map((id) => `player:${id}`)
    ]);
    const updateSort = (key: 'value' | 'fightTime') => {
        setSortState((prev) => ({
            key,
            dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
        }));
    };
    return (
    <div
        id="boon-output"
        data-section-visible={isSectionVisible('boon-output')}
        data-section-first={isFirstVisibleSection('boon-output')}
        className={sectionClass('boon-output', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${expandedSection === 'boon-output'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
            }`)}
    >
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                Boon Output
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'boon-output' ? closeExpandedSection() : openExpandedSection('boon-output'))}
                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                aria-label={expandedSection === 'boon-output' ? 'Close Boon Output' : 'Expand Boon Output'}
                title={expandedSection === 'boon-output' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'boon-output' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
        {stats.boonTables.length === 0 ? (
            <div className="text-center text-gray-500 italic py-8">No boon data available</div>
        ) : isExpanded ? (
            <div className="flex flex-col gap-4">
                <div className="bg-black/20 border border-white/5 rounded-xl px-4 py-3">
                    <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Boons</div>
                    <div className="flex flex-wrap items-center gap-2">
                        <SearchSelectDropdown
                            options={[
                                ...allBoonColumns.map((boon: any) => ({ id: boon.id, label: boon.name, type: 'column' as const })),
                                ...Array.from(new Map((stats.boonTables || [])
                                    .flatMap((table: any) => table.rows || [])
                                    .filter((row: any) => row.account)
                                    .map((row: any) => [row.account, row])).values())
                                    .map((row: any) => ({
                                        id: row.account,
                                        label: row.account,
                                        type: 'player' as const,
                                        icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3')
                                    }))
                            ]}
                            onSelect={(option: SearchSelectOption) => {
                                if (option.type === 'column') {
                                    setSelectedBoonColumnIds((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                } else {
                                    setSelectedBoonPlayers((prev) =>
                                        prev.includes(option.id) ? prev.filter((entry) => entry !== option.id) : [...prev, option.id]
                                    );
                                }
                            }}
                            selectedIds={boonSearchSelectedIds}
                            className="w-full sm:w-64"
                        />
                        <ColumnFilterDropdown
                            options={boonColumnOptions}
                            selectedIds={selectedBoonColumnIds}
                            onToggle={(id) => {
                                setSelectedBoonColumnIds((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedBoonColumnIds([])}
                            buttonIcon={<Columns className="h-3.5 w-3.5" />}
                        />
                        <ColumnFilterDropdown
                            options={boonPlayerOptions}
                            selectedIds={selectedBoonPlayers}
                            onToggle={(id) => {
                                setSelectedBoonPlayers((prev) =>
                                    prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]
                                );
                            }}
                            onClear={() => setSelectedBoonPlayers([])}
                            buttonLabel="Players"
                            buttonIcon={<Users className="h-3.5 w-3.5" />}
                        />
                        <PillToggleGroup
                            value={activeBoonCategory}
                            onChange={setActiveBoonCategory}
                            options={[
                                { value: 'selfBuffs', label: 'Self' },
                                { value: 'groupBuffs', label: 'Group' },
                                { value: 'squadBuffs', label: 'Squad' },
                                { value: 'totalBuffs', label: 'Total' }
                            ]}
                            activeClassName="bg-blue-500/20 text-blue-200 border border-blue-500/40"
                            inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                        />
                        <PillToggleGroup
                            value={activeBoonMetric}
                            onChange={setActiveBoonMetric}
                            options={[
                                { value: 'total', label: 'Total Gen' },
                                { value: 'average', label: 'Gen/Sec' },
                                { value: 'uptime', label: 'Uptime' }
                            ]}
                            activeClassName="bg-blue-500/20 text-blue-200 border border-blue-500/40"
                            inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                        />
                    </div>
                    {(selectedBoonColumnIds.length > 0 || selectedBoonPlayers.length > 0) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedBoonColumnIds([]);
                                    setSelectedBoonPlayers([]);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                            >
                                Clear All
                            </button>
                            {selectedBoonColumnIds.map((id) => {
                                const label = allBoonColumns.find((boon: any) => boon.id === id)?.name || id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setSelectedBoonColumnIds((prev) => prev.filter((entry) => entry !== id))}
                                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                    >
                                        <span>{label}</span>
                                        <span className="text-gray-400">×</span>
                                    </button>
                                );
                            })}
                            {selectedBoonPlayers.map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedBoonPlayers((prev) => prev.filter((entry) => entry !== id))}
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-gray-200 hover:text-white"
                                >
                                    <span>{id}</span>
                                    <span className="text-gray-400">×</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl overflow-hidden">
                    {allBoonColumns.length === 0 ? (
                        <div className="px-4 py-10 text-center text-gray-500 italic text-sm">No boons match this filter</div>
                    ) : (
                        (() => {
                            const columnTables = visibleBoonColumns;
                            const resolvedSortColumnId = columnTables.find((item: any) => item.id === denseSort.columnId)?.id
                                || (activeBoonTab && columnTables.some((item: any) => item.id === activeBoonTab) ? activeBoonTab : undefined)
                                || columnTables[0]?.id
                                || '';
                            const tableRowMaps = new Map<string, Map<string, any>>();
                            const playerMap = new Map<string, any>();
                            columnTables.forEach((table: any) => {
                                const rowMap = new Map<string, any>();
                                table.rows.forEach((row: any) => {
                                    const key = row.account || row.name || row.id;
                                    if (!key) return;
                                    rowMap.set(key, row);
                                    if (!playerMap.has(key)) {
                                        playerMap.set(key, row);
                                    }
                                });
                                tableRowMaps.set(table.id, rowMap);
                            });
                            const rows = Array.from(playerMap.entries())
                                .filter(([key]) => selectedBoonPlayers.length === 0 || selectedBoonPlayers.includes(String(key)))
                                .map(([key, row]) => {
                                const values: Record<string, string> = {};
                                columnTables.forEach((table: any) => {
                                    const tableRow = tableRowMaps.get(table.id)?.get(key);
                                    values[table.id] = tableRow
                                        ? formatBoonMetricDisplay(tableRow, activeBoonCategory, table.stacking, activeBoonMetric, { roundCountStats })
                                        : '-';
                                });
                                return { key, row, values };
                            }).sort((a, b) => {
                                if (!resolvedSortColumnId) return String(a.key).localeCompare(String(b.key));
                                const table = columnTables.find((item: any) => item.id === resolvedSortColumnId);
                                const aRow = table ? tableRowMaps.get(table.id)?.get(a.key) : null;
                                const bRow = table ? tableRowMaps.get(table.id)?.get(b.key) : null;
                                const aVal = aRow ? getBoonMetricValue(aRow, activeBoonCategory, table?.stacking, activeBoonMetric) : 0;
                                const bVal = bRow ? getBoonMetricValue(bRow, activeBoonCategory, table?.stacking, activeBoonMetric) : 0;
                                const primary = denseSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
                                return primary || String(a.key).localeCompare(String(b.key));
                            });
                            return (
                                <DenseStatsTable
                                    title="Boon Output - Dense View"
                                    subtitle={`${activeBoonCategory.replace('Buffs', '')} • ${activeBoonMetric === 'total' ? 'Total Gen' : activeBoonMetric === 'average' ? 'Gen/Sec' : 'Uptime'}`}
                                    sortColumnId={resolvedSortColumnId}
                                    sortDirection={denseSort.dir}
                                    onSortColumn={(columnId) => {
                                        setDenseSort((prev) => ({
                                            columnId,
                                            dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                        }));
                                    }}
                                    columns={columnTables.map((boon: any) => ({
                                        id: boon.id,
                                        label: <InlineIconLabel name={boon.name} iconUrl={boon.icon} iconClassName="h-4 w-4" />,
                                        align: 'right',
                                        minWidth: 90
                                    }))}
                                    rows={rows.map((entry, idx) => ({
                                        id: `${entry.key}-${idx}`,
                                        label: (
                                            <>
                                                <span className="text-gray-500 font-mono">{idx + 1}</span>
                                                {renderProfessionIcon(entry.row.profession, entry.row.professionList, 'w-4 h-4')}
                                                <span className="truncate">{entry.row.account || entry.row.name || entry.key}</span>
                                            </>
                                        ),
                                        values: entry.values
                                    }))}
                                />
                            );
                        })()
                    )}
                </div>
            </div>
        ) : (
            <StatsTableLayout
                expanded={expandedSection === 'boon-output'}
                sidebarClassName={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'boon-output' ? 'h-full flex-1' : 'self-start'}`}
                contentClassName={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'boon-output' ? 'flex flex-col min-h-0' : ''}`}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Boons</div>
                        <input
                            value={boonSearch}
                            onChange={(e) => setBoonSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'boon-output' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {filteredBoonTables.length === 0 ? (
                                <div className="text-center text-gray-500 italic py-6 text-xs">No boons match this filter</div>
                            ) : (
                                filteredBoonTables.map((boon: any) => (
                                    <button
                                        key={boon.id}
                                        onClick={() => setActiveBoonTab(boon.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeBoonTab === boon.id
                                            ? 'bg-blue-500/20 text-blue-200 border-blue-500/40'
                                            : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                            }`}
                                    >
                                        <InlineIconLabel name={boon.name} iconUrl={boon.icon} iconClassName="h-3.5 w-3.5" />
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                }
                content={
                    !activeBoonTable ? (
                        <div className="px-4 py-10 text-center text-gray-500 italic text-sm">Select a boon to view details</div>
                    ) : (
                        <StatsTableShell
                            expanded={expandedSection === 'boon-output'}
                            maxHeightClass="max-h-64"
                            header={
                                <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                    <div className="text-sm font-semibold text-gray-200">
                                        <InlineIconLabel name={activeBoonTable.name} iconUrl={activeBoonTable.icon} iconClassName="h-4 w-4" />
                                    </div>
                                    <div className="text-xs uppercase tracking-widest text-gray-500">
                                        {`${activeBoonCategory.replace('Buffs', '')} • ${activeBoonMetric === 'total' ? 'Total Gen' : activeBoonMetric === 'average' ? 'Gen/Sec' : 'Uptime'}`}
                                    </div>
                                </div>
                            }
                            columns={
                                <>
                                    <div className="flex flex-wrap items-center justify-start gap-2 px-4 py-2 bg-white/5">
                                        <PillToggleGroup
                                            value={activeBoonCategory}
                                            onChange={setActiveBoonCategory}
                                            options={[
                                                { value: 'selfBuffs', label: 'Self' },
                                                { value: 'groupBuffs', label: 'Group' },
                                                { value: 'squadBuffs', label: 'Squad' },
                                                { value: 'totalBuffs', label: 'Total' }
                                            ]}
                                            activeClassName="bg-blue-500/20 text-blue-200 border border-blue-500/40"
                                            inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                        />
                                        <PillToggleGroup
                                            value={activeBoonMetric}
                                            onChange={setActiveBoonMetric}
                                            options={[
                                                { value: 'total', label: 'Total Gen' },
                                                { value: 'average', label: 'Gen/Sec' },
                                                { value: 'uptime', label: 'Uptime' }
                                            ]}
                                            className="sm:ml-auto"
                                            activeClassName="bg-blue-500/20 text-blue-200 border border-blue-500/40"
                                            inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                        />
                                    </div>
                                    <div className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                        <div className="text-center">#</div>
                                        <div>Player</div>
                                        <button
                                            type="button"
                                            onClick={() => updateSort('value')}
                                            className={`text-right transition-colors ${sortState.key === 'value' ? 'text-blue-200' : 'text-gray-400 hover:text-gray-200'}`}
                                        >
                                            {activeBoonMetric === 'total'
                                                ? 'Total'
                                                : activeBoonMetric === 'average'
                                                    ? 'Gen/Sec'
                                                    : 'Uptime'}
                                            {sortState.key === 'value' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateSort('fightTime')}
                                            className={`text-right transition-colors ${sortState.key === 'fightTime' ? 'text-blue-200' : 'text-gray-400 hover:text-gray-200'}`}
                                        >
                                            Fight Time{sortState.key === 'fightTime' ? (sortState.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                        </button>
                                    </div>
                                </>
                            }
                            rows={
                                <>
                                    {[...activeBoonTable.rows]
                                        .sort((a: any, b: any) => (
                                            (() => {
                                                const aVal = sortState.key === 'fightTime'
                                                    ? Number(a.activeTimeMs || 0)
                                                    : getBoonMetricValue(a, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric);
                                                const bVal = sortState.key === 'fightTime'
                                                    ? Number(b.activeTimeMs || 0)
                                                    : getBoonMetricValue(b, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric);
                                                const diff = sortState.dir === 'desc' ? bVal - aVal : aVal - bVal;
                                                return diff || String(a.account || '').localeCompare(String(b.account || ''));
                                            })()
                                        ))
                                        .map((row: any, idx: number) => (
                                            <div key={`${activeBoonTable.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_1fr_0.9fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                    <span className="truncate">{row.account}</span>
                                                </div>
                                                <div className="text-right font-mono text-gray-300">
                                                    {formatBoonMetricDisplay(row, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric, { roundCountStats })}
                                                </div>
                                                <div className="text-right font-mono text-gray-400">
                                                    {row.activeTimeMs ? `${(row.activeTimeMs / 1000).toFixed(1)}s` : '-'}
                                                </div>
                                            </div>
                                        ))}
                                </>
                            }
                        />
                    )
                }
            />
        )}
    </div>
    );
};
