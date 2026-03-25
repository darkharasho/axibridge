import { useMemo, useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { Gw2SigilIcon } from '../../ui/Gw2SigilIcon';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { InlineIconLabel } from '../ui/StatsViewShared';
import { useStatsSharedContext } from '../StatsViewContext';

type SigilRelicUptimeSectionProps = {
    hasSigilRelicTables: boolean;
    sigilRelicSearch: string;
    setSigilRelicSearch: (value: string) => void;
    filteredSigilRelicTables: any[];
    activeSigilRelicTab: string | null;
    setActiveSigilRelicTab: (value: string | null) => void;
    activeSigilRelicTable: any | null;
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
    activeSigilRelicTable
}: SigilRelicUptimeSectionProps) => {
    const { formatWithCommas, renderProfessionIcon, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, sidebarListClass } = useStatsSharedContext();
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
            className={`stats-share-exclude ${expandedSection === 'sigil-relic-uptime' ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={expandedSection === 'sigil-relic-uptime' ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex items-center gap-2 mb-3.5">
                <span className="flex shrink-0" style={{ color: 'var(--section-support)' }}><Gw2SigilIcon className="w-4 h-4" /></span>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Sigil/Relic Uptime</h3>
                <button
                    type="button"
                    onClick={() => (expandedSection === 'sigil-relic-uptime' ? closeExpandedSection() : openExpandedSection('sigil-relic-uptime'))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={expandedSection === 'sigil-relic-uptime' ? 'Close Sigil/Relic Uptime' : 'Expand Sigil/Relic Uptime'}
                    title={expandedSection === 'sigil-relic-uptime' ? 'Close' : 'Expand'}
                >
                    {expandedSection === 'sigil-relic-uptime' ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>
            {!hasSigilRelicTables ? (
                <div className="text-center text-[color:var(--text-muted)] italic py-8">No sigil/relic uptime data available</div>
            ) : (
                <StatsTableLayout
                    expanded={isExpanded}
                    sidebarClassName={`pr-3 flex flex-col min-h-0 overflow-y-auto ${isExpanded ? 'h-full flex-1' : ''}`}
                    contentClassName={`overflow-hidden ${isExpanded ? 'flex flex-col min-h-0' : ''}`}
                    sidebar={
                        <>
                            <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-2">Sigil/Relic</div>
                            <input
                                value={sigilRelicSearch}
                                onChange={(e) => setSigilRelicSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full px-2 py-1 text-xs text-[color:var(--text-primary)] focus:outline-none mb-2"
                                style={{ background: 'transparent', borderBottom: '1px solid var(--border-subtle)' }}
                            />
                            <div className={`${sidebarListClass} ${isExpanded ? 'max-h-none flex-1 min-h-0' : ''}`}>
                                {filteredSigilRelicTables.length === 0 ? (
                                    <div className="text-center text-[color:var(--text-muted)] italic py-6 text-xs">No sigil/relic entries match this filter</div>
                                ) : (
                                    filteredSigilRelicTables.map((buff: any) => (
                                        <button
                                            key={buff.id}
                                            onClick={() => setActiveSigilRelicTab(buff.id)}
                                            title={buff.name}
                                            className={`w-full text-left px-3 py-1.5 rounded-[var(--radius-md)] text-xs transition-colors ${activeSigilRelicTab === buff.id
                                                ? 'bg-fuchsia-500/20 text-fuchsia-200 font-semibold'
                                                : 'hover:bg-[var(--bg-hover)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
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
                                <div className="px-4 py-10 text-center text-[color:var(--text-muted)] italic text-sm">Select a sigil/relic to view uptime</div>
                            ) : (
                                <StatsTableShell
                                    expanded={isExpanded}
                                    maxHeightClass="max-h-72"
                                    header={null}
                                    columns={
                                        <div className="grid grid-cols-[0.4fr_1.6fr_1fr] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] px-4 py-2 border-b border-[color:var(--border-default)]">
                                            <div className="text-center">#</div>
                                            <div>Player</div>
                                            <button
                                                type="button"
                                                onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                                                className="text-right transition-colors text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
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
                                                    <div key={`${activeSigilRelicTable.id}-${row.account}-${idx}`} className="grid grid-cols-[0.4fr_1.6fr_1fr] px-4 py-3 text-sm text-[color:var(--text-primary)] border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                                        <div className="text-center text-[color:var(--text-muted)] font-mono">{idx + 1}</div>
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(row.profession, row.professionList, 'w-4 h-4')}
                                                            <span className="truncate">{row.account}</span>
                                                        </div>
                                                        <div className="text-right font-mono text-[color:var(--text-secondary)]">
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
