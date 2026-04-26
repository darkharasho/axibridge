import { useMemo, useState } from 'react';
import { Maximize2, X, Crosshair, ArrowUp, ArrowDown } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { getProfessionColor, getProfessionAbbrev } from '../../../shared/professionUtils';
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
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
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
                    <div className="flex items-center gap-2 mb-2 text-[11px] whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
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
                        <span>Min</span>
                        <input
                            type="number"
                            min={1}
                            value={minFights}
                            onFocus={() => setFilterEnabled(true)}
                            onChange={e => {
                                setFilterEnabled(true);
                                setMinFights(Math.max(1, Number(e.target.value) || 1));
                            }}
                            className="w-10 px-1 py-0.5 rounded text-center font-mono text-[11px]"
                            style={{
                                background: 'var(--bg-card-inner)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-primary)',
                                opacity: filterEnabled ? 1 : 0.55,
                            }}
                            aria-label="Minimum fight count"
                        />
                        <span>fights</span>
                        {filterEnabled && hiddenCount > 0 && (
                            <span
                                className="px-1.5 py-0.5 rounded text-[10px]"
                                style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)' }}
                            >{hiddenCount} hidden</span>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs" style={{ color: 'var(--text-primary)' }}>
                            <thead>
                                <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                                    <th className="text-left px-2 py-1 cursor-pointer" onClick={() => onSort('account')}>Player {sortIcon('account')}</th>
                                    <th className="text-left px-2 py-1">Prof</th>
                                    <th className="text-right px-2 py-1 cursor-pointer" onClick={() => onSort('fightCount')}># Fights {sortIcon('fightCount')}</th>
                                    <th className="text-right px-2 py-1 cursor-pointer" onClick={() => onSort('sampleCount')}>Samples {sortIcon('sampleCount')}</th>
                                    <th className="text-right px-2 py-1 cursor-pointer" onClick={() => onSort('avg')}>Avg {sortIcon('avg')}</th>
                                    <th className="text-right px-2 py-1 cursor-pointer" onClick={() => onSort('median')}>Median {sortIcon('median')}</th>
                                    <th className="text-right px-2 py-1 cursor-pointer" onClick={() => onSort('p95')}>p95 {sortIcon('p95')}</th>
                                    <th className="text-left px-2 py-1">Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map(r => (
                                    <tr key={r.account} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td className="px-2 py-1">
                                            {r.account}
                                            {r.isCommander && <span title="Commander" className="ml-1" style={{ color: 'var(--status-warning)' }}>★</span>}
                                        </td>
                                        <td className="px-2 py-1" style={{ color: getProfessionColor(r.profession) }}>{getProfessionAbbrev(r.profession)}</td>
                                        <td className="text-right px-2 py-1 font-mono">{r.fightCount}</td>
                                        <td className="text-right px-2 py-1 font-mono">{formatWithCommas(r.sampleCount, 0)}</td>
                                        <td className="text-right px-2 py-1 font-mono">{formatWithCommas(r.avg, 0)}</td>
                                        <td className="text-right px-2 py-1 font-mono">{formatWithCommas(r.median, 0)}</td>
                                        <td className="text-right px-2 py-1 font-mono">{formatWithCommas(r.p95, 0)}</td>
                                        <td className="px-2 py-1">{sourceBadge(r.source)}</td>
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
