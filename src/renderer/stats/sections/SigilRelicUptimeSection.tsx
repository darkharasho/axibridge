import { useMemo, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { InlineIconLabel } from '../ui/StatsViewShared';
import { Gw2SigilIcon } from '../../ui/Gw2SigilIcon';

type SigilRelicUptimeSectionProps = {
    hasSigilRelicTables: boolean;
    sigilRelicSearch: string;
    setSigilRelicSearch: (value: string) => void;
    filteredSigilRelicTables: any[];
    activeSigilRelicTab: string | null;
    setActiveSigilRelicTab: (value: string | null) => void;
    activeSigilRelicTable: any | null;
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

const truncateSidebarLabel = (name: string, max = 30) => {
    if (!name) return '';
    return name.length > max ? `${name.slice(0, max - 1)}...` : name;
};

export const SigilRelicUptimeSection = ({
    hasSigilRelicTables,
    sigilRelicSearch,
    setSigilRelicSearch,
    filteredSigilRelicTables,
    activeSigilRelicTab,
    setActiveSigilRelicTab,
    activeSigilRelicTable,
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
}: SigilRelicUptimeSectionProps) => {
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const isExpanded = expandedSection === 'sigil-relic-uptime';
    const sortedRows = useMemo(() => {
        if (!activeSigilRelicTable?.rows) return [];
        const rows = [...activeSigilRelicTable.rows];
        rows.sort((a: any, b: any) => {
            const aUptime = Number(a?.uptimePerSecond ?? a?.perSecond ?? 0);
            const bUptime = Number(b?.uptimePerSecond ?? b?.perSecond ?? 0);
            const diff = sortDirection === 'desc' ? bUptime - aUptime : aUptime - bUptime;
            if (diff !== 0) return diff;
            return String(a?.account || '').localeCompare(String(b?.account || ''));
        });
        return rows;
    }, [activeSigilRelicTable, sortDirection]);

    return (
        <div
            id="sigil-relic-uptime"
            data-section-visible={isSectionVisible('sigil-relic-uptime')}
            data-section-first={isFirstVisibleSection('sigil-relic-uptime')}
            className={sectionClass('sigil-relic-uptime', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${expandedSection === 'sigil-relic-uptime'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
                }`)}
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <Gw2SigilIcon className="w-5 h-5 text-fuchsia-300" />
                    Sigil/Relic Uptime
                </h3>
                <button
                    type="button"
                    onClick={() => (expandedSection === 'sigil-relic-uptime' ? closeExpandedSection() : openExpandedSection('sigil-relic-uptime'))}
                    className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                    aria-label={expandedSection === 'sigil-relic-uptime' ? 'Close Sigil/Relic Uptime' : 'Expand Sigil/Relic Uptime'}
                    title={expandedSection === 'sigil-relic-uptime' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'sigil-relic-uptime' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
            </div>
            {!hasSigilRelicTables ? (
                <div className="text-center text-gray-500 italic py-8">No sigil/relic uptime data available</div>
            ) : (
                <StatsTableLayout
                    expanded={isExpanded}
                    sidebarClassName={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${isExpanded ? 'h-full flex-1' : 'self-start'}`}
                    contentClassName={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${isExpanded ? 'flex flex-col min-h-0' : ''}`}
                    sidebar={
                        <>
                            <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Sigil/Relic</div>
                            <input
                                value={sigilRelicSearch}
                                onChange={(e) => setSigilRelicSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                            />
                            <div className={`${sidebarListClass} ${isExpanded ? 'max-h-none flex-1 min-h-0' : ''}`}>
                                {filteredSigilRelicTables.length === 0 ? (
                                    <div className="text-center text-gray-500 italic py-6 text-xs">No sigil/relic entries match this filter</div>
                                ) : (
                                    filteredSigilRelicTables.map((buff: any) => (
                                        <button
                                            key={buff.id}
                                            onClick={() => setActiveSigilRelicTab(buff.id)}
                                            title={buff.name}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeSigilRelicTab === buff.id
                                                ? 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40'
                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                }`}
                                        >
                                            <InlineIconLabel
                                                name={truncateSidebarLabel(buff.name)}
                                                iconUrl={buff.icon}
                                                className="w-full"
                                                iconClassName="h-3.5 w-3.5"
                                                textClassName="max-w-[170px]"
                                            />
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    }
                    content={
                        <>
                            {!activeSigilRelicTable ? (
                                <div className="px-4 py-10 text-center text-gray-500 italic text-sm">Select a sigil/relic to view uptime</div>
                            ) : (
                                <StatsTableShell
                                    expanded={isExpanded}
                                    maxHeightClass="max-h-72"
                                    header={
                                        <div className="flex items-center justify-between px-4 py-3 bg-white/5">
                                            <div className="text-sm font-semibold text-gray-200">
                                                <InlineIconLabel name={activeSigilRelicTable.name} iconUrl={activeSigilRelicTable.icon} iconClassName="h-4 w-4" />
                                            </div>
                                            <div className="text-xs uppercase tracking-widest text-gray-500">Uptime</div>
                                        </div>
                                    }
                                    columns={
                                        <div className="grid grid-cols-[0.4fr_1.6fr_1fr] text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2">
                                            <div className="text-center">#</div>
                                            <div>Player</div>
                                            <button
                                                type="button"
                                                onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                                                className="text-right transition-colors text-gray-400 hover:text-gray-200"
                                            >
                                                Uptime {sortDirection === 'desc' ? '↓' : '↑'}
                                            </button>
                                        </div>
                                    }
                                    rows={
                                        <>
                                            {sortedRows.map((row: any, idx: number) => {
                                                const uptimePct = Number(row.uptimePerSecond ?? row.perSecond ?? 0) * 100;
                                                return (
                                                    <div key={`${activeSigilRelicTable.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.6fr_1fr] px-4 py-2 text-sm text-gray-200 border-t border-white/5">
                                                        <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                            <span className="truncate">{row.account}</span>
                                                        </div>
                                                        <div className="text-right font-mono text-gray-300">
                                                            {formatWithCommas(uptimePct, 1)}%
                                                        </div>
                                                    </div>
                                                );
                                            })}
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
};
