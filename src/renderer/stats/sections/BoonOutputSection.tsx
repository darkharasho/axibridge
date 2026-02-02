import { Maximize2, ShieldCheck, X } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';

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
}: BoonOutputSectionProps) => (
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
                                        {boon.name}
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
                                    <div className="text-sm font-semibold text-gray-200">{activeBoonTable.name}</div>
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
                                            activeClassName="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
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
                                        <div className="text-right">
                                            {activeBoonMetric === 'total'
                                                ? 'Total'
                                                : activeBoonMetric === 'average'
                                                    ? 'Gen/Sec'
                                                    : 'Uptime'}
                                        </div>
                                        <div className="text-right">Fight Time</div>
                                    </div>
                                </>
                            }
                            rows={
                                <>
                                    {[...activeBoonTable.rows]
                                        .sort((a: any, b: any) => (
                                            getBoonMetricValue(b, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric)
                                            - getBoonMetricValue(a, activeBoonCategory, activeBoonTable.stacking, activeBoonMetric)
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
