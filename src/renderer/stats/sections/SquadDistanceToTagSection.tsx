import { useMemo, useState } from 'react';
import { Maximize2, X, Crosshair, ArrowUp, ArrowDown } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import type { DistanceToTagResult, DistanceToTagRow } from '../computeDistanceToTag';

type Props = {
    result: DistanceToTagResult;
};

type SortKey = 'account' | 'fightCount' | 'sampleCount' | 'avg' | 'median' | 'p95';
type SortDir = 'asc' | 'desc';

export const SquadDistanceToTagSection = ({ result }: Props) => {
    const {
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
    } = useStatsSharedContext();
    const sectionId = 'squad-distance-to-tag';
    const isExpanded = expandedSection === sectionId;

    const [sortKey, setSortKey] = useState<SortKey>('avg');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [filterEnabled, setFilterEnabled] = useState(false);
    const [minFights, setMinFights] = useState(3);

    const rows = result?.rows ?? [];

    const visibleRows = useMemo(() => {
        const filtered = filterEnabled ? rows.filter(r => r.fightCount >= minFights) : rows;
        const cmp = (a: DistanceToTagRow, b: DistanceToTagRow) => {
            let av: string | number;
            let bv: string | number;
            if (sortKey === 'account') { av = a.account; bv = b.account; }
            else { av = a[sortKey]; bv = b[sortKey]; }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        };
        return [...filtered].sort(cmp);
    }, [rows, sortKey, sortDir, filterEnabled, minFights]);

    const hiddenCount = rows.length - visibleRows.length;

    const onSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir(key === 'account' ? 'asc' : 'desc');
        }
    };

    const sortIcon = (key: SortKey) =>
        key !== sortKey ? null : sortDir === 'asc' ? <ArrowUp className="w-3 h-3 inline-block" /> : <ArrowDown className="w-3 h-3 inline-block" />;

    const sourceBadge = (source: DistanceToTagRow['source']) => {
        const label = source === 'replay' ? 'replay' : source === 'fightAvg' ? 'avg' : 'mixed';
        const tip = source === 'replay'
            ? 'Aggregated from per-tick replay samples.'
            : source === 'fightAvg'
                ? 'Aggregated from per-fight averages (replay data not available).'
                : 'Some fights had replay samples, others did not. Aggregated per-fight to avoid skew.';
        return (
            <span
                title={tip}
                className="inline-block px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide"
                style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
            >{label}</span>
        );
    };

    return (
        <div
            className={isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Crosshair className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Distance to Tag</h3>
                {rows.length > 0 && (
                    <div className="ml-auto flex flex-nowrap items-center gap-2 text-[11px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={filterEnabled}
                            onClick={() => setFilterEnabled(v => !v)}
                            className="relative inline-flex items-center shrink-0"
                            style={{
                                width: 26,
                                height: 14,
                                borderRadius: 9999,
                                background: filterEnabled ? 'var(--brand-primary)' : 'var(--bg-card-inner)',
                                border: '1px solid var(--border-subtle)',
                                transition: 'background 120ms',
                                cursor: 'pointer',
                            }}
                            title={filterEnabled ? 'Min-fights filter on' : 'Min-fights filter off'}
                        >
                            <span
                                aria-hidden
                                style={{
                                    position: 'absolute',
                                    top: 1,
                                    left: filterEnabled ? 13 : 1,
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: 'var(--text-primary)',
                                    transition: 'left 120ms',
                                }}
                            />
                        </button>
                        <span className="shrink-0">Min</span>
                        <input
                            type="number"
                            min={1}
                            value={minFights}
                            onFocus={() => setFilterEnabled(true)}
                            onChange={e => {
                                setFilterEnabled(true);
                                setMinFights(Math.max(1, Number(e.target.value) || 1));
                            }}
                            className="shrink-0 w-10 px-1 py-0.5 rounded text-center font-mono text-[11px]"
                            style={{
                                background: 'var(--bg-card-inner)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                opacity: filterEnabled ? 1 : 0.55,
                            }}
                            aria-label="Minimum fight count"
                        />
                        <span className="shrink-0">fights</span>
                        {filterEnabled && hiddenCount > 0 && (
                            <span
                                className="shrink-0 px-1.5 py-0.5 rounded text-[10px]"
                                style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)' }}
                            >{hiddenCount} hidden</span>
                        )}
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className={`${rows.length > 0 ? '' : 'ml-auto '}flex items-center justify-center w-[26px] h-[26px]`}
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Distance to Tag' : 'Expand Distance to Tag'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No distance data for the loaded fights.
                </div>
            ) : (
                <>
                    <div className={`rounded-[var(--radius-md)] overflow-hidden ${visibleRows.length > 12 ? 'max-h-[30rem] overflow-y-auto' : ''}`}>
                        <table className="w-full text-xs table-auto min-w-full border-separate border-spacing-0" style={{ color: 'var(--text-primary)' }}>
                            <thead>
                                <tr className="text-[10px] uppercase tracking-widest border-b border-[color:var(--border-default)]" style={{ color: 'var(--text-secondary)' }}>
                                    <th className="text-left py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer" onClick={() => onSort('account')}>Player {sortIcon('account')}</th>
                                    <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer" onClick={() => onSort('fightCount')}># Fights {sortIcon('fightCount')}</th>
                                    <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer" onClick={() => onSort('sampleCount')}>Samples {sortIcon('sampleCount')}</th>
                                    <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer" onClick={() => onSort('avg')}>Avg {sortIcon('avg')}</th>
                                    <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer" onClick={() => onSort('median')}>Median {sortIcon('median')}</th>
                                    <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer" onClick={() => onSort('p95')}>p95 {sortIcon('p95')}</th>
                                    <th className="text-left py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)]">Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map(r => (
                                    <tr key={r.account} className="align-top border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                        <td className="py-2 px-3 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5">
                                                {renderProfessionIcon(r.profession, r.professionList, 'w-4 h-4 flex-shrink-0')}
                                                <span>{r.account}</span>
                                                {r.isCommander && <span title="Commander" style={{ color: 'var(--status-warning)' }}>★</span>}
                                            </span>
                                        </td>
                                        <td className="text-right py-2 px-3 font-mono whitespace-nowrap">{r.fightCount}</td>
                                        <td className="text-right py-2 px-3 font-mono whitespace-nowrap">{formatWithCommas(r.sampleCount, 0)}</td>
                                        <td className="text-right py-2 px-3 font-mono whitespace-nowrap">{formatWithCommas(r.avg, 0)}</td>
                                        <td className="text-right py-2 px-3 font-mono whitespace-nowrap">{formatWithCommas(r.median, 0)}</td>
                                        <td className="text-right py-2 px-3 font-mono whitespace-nowrap">{formatWithCommas(r.p95, 0)}</td>
                                        <td className="py-2 px-3 whitespace-nowrap">{sourceBadge(r.source)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};
