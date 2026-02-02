import { Maximize2, Sparkles, X } from 'lucide-react';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';

type SpecialBuffsSectionProps = {
    stats: any;
    specialSearch: string;
    setSpecialSearch: (value: string) => void;
    filteredSpecialTables: any[];
    activeSpecialTab: string | null;
    setActiveSpecialTab: (value: string | null) => void;
    activeSpecialTable: any | null;
    formatWithCommas: (value: number, decimals: number) => string;
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

export const SpecialBuffsSection = ({
    stats,
    specialSearch,
    setSpecialSearch,
    filteredSpecialTables,
    activeSpecialTab,
    setActiveSpecialTab,
    activeSpecialTable,
    formatWithCommas,
    renderProfessionIcon,
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
    sidebarListClass
}: SpecialBuffsSectionProps) => (
    <div
        id="special-buffs"
        data-section-visible={isSectionVisible('special-buffs')}
        data-section-first={isFirstVisibleSection('special-buffs')}
        className={sectionClass('special-buffs', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${expandedSection === 'special-buffs'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
            }`)}
    >
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-300" />
                Special Buffs
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'special-buffs' ? closeExpandedSection() : openExpandedSection('special-buffs'))}
                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                aria-label={expandedSection === 'special-buffs' ? 'Close Special Buffs' : 'Expand Special Buffs'}
                title={expandedSection === 'special-buffs' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'special-buffs' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
        {stats.specialTables.length === 0 ? (
            <div className="text-center text-gray-500 italic py-8">No special buff data available</div>
        ) : (
            <StatsTableLayout
                expanded={expandedSection === 'special-buffs'}
                sidebarClassName={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'special-buffs' ? 'h-full flex-1' : 'self-start'}`}
                contentClassName={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'special-buffs' ? 'flex flex-col min-h-0' : ''}`}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Special Buffs</div>
                        <input
                            value={specialSearch}
                            onChange={(e) => setSpecialSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'special-buffs' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {filteredSpecialTables.length === 0 ? (
                                <div className="text-center text-gray-500 italic py-6 text-xs">No special buffs match this filter</div>
                            ) : (
                                filteredSpecialTables.map((buff: any) => (
                                    <button
                                        key={buff.id}
                                        onClick={() => setActiveSpecialTab(buff.id)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeSpecialTab === buff.id
                                            ? 'bg-purple-500/20 text-purple-200 border-purple-500/40'
                                            : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                            }`}
                                    >
                                        {buff.name}
                                    </button>
                                ))
                            )}
                        </div>
                    </>
                }
                content={
                    <>
                        {!activeSpecialTable ? (
                            <div className="px-4 py-10 text-center text-gray-500 italic text-sm">Select a special buff to view details</div>
                        ) : (
                            <StatsTableShell
                                expanded={expandedSection === 'special-buffs'}
                                maxHeightClass="max-h-64"
                                header={
                                    <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                        <div className="text-sm font-semibold text-gray-200">{activeSpecialTable.name}</div>
                                        <div className="text-xs uppercase tracking-widest text-gray-500">Totals</div>
                                    </div>
                                }
                                columns={
                                    <div className="grid grid-cols-[0.4fr_1.5fr_0.8fr_0.8fr_0.8fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                        <div className="text-center">#</div>
                                        <div>Player</div>
                                        <div className="text-right">Total</div>
                                        <div className="text-right">Per Sec</div>
                                        <div className="text-right">Fight Time</div>
                                    </div>
                                }
                                rows={
                                    <>
                                        {activeSpecialTable.rows.map((row: any, idx: number) => (
                                            <div key={`${activeSpecialTable.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.5fr_0.8fr_0.8fr_0.8fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                    <span className="truncate">{row.account}</span>
                                                </div>
                                                <div className="text-right font-mono text-gray-300">
                                                    {Math.round(row.total).toLocaleString()}
                                                </div>
                                                <div className="text-right font-mono text-gray-300">
                                                    {formatWithCommas(row.perSecond, 1)}
                                                </div>
                                                <div className="text-right font-mono text-gray-400">
                                                    {row.duration ? `${row.duration.toFixed(1)}s` : '-'}
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                }
                            />
                        )}
                    </>
                }
            />
        )}
    </div>
);
