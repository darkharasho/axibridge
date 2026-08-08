import { useMemo, useState } from 'react';
import { Maximize2, X, Skull, ArrowUp, ArrowDown } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import { ON_TAG_RANGE, RUN_BACK_RANGE, type OnTagReviewResult, type OnTagReviewRow } from '../computeOnTagReview';

type Props = {
    result: OnTagReviewResult;
};

type DeathKey = 'onTag' | 'offTag' | 'afterTag' | 'runBack' | 'total';
type SortKey = 'account' | 'fightCount' | 'avgDist' | DeathKey;
type SortDir = 'asc' | 'desc';

const AFTER_TAG_COLOR = '#c4b5fd';
const MAX_RANGE_CHIPS = 8;

const DEATH_COLUMNS: Array<{ key: DeathKey; label: string; tip: string; color?: string; bold?: boolean }> = [
    { key: 'onTag', label: 'On-Tag', tip: `Died within ${ON_TAG_RANGE} units of the tag` },
    { key: 'offTag', label: 'Off-Tag', tip: `Died between ${ON_TAG_RANGE} and ${RUN_BACK_RANGE} units from the tag`, color: 'var(--status-warning)' },
    { key: 'afterTag', label: 'After-Tag', tip: 'Died after the tag had already died (also counted in the other columns)', color: AFTER_TAG_COLOR },
    { key: 'runBack', label: 'Run-Back', tip: `Died more than ${RUN_BACK_RANGE} units from the tag — likely returning from spawn`, color: 'var(--status-error)', bold: true },
    { key: 'total', label: 'Total', tip: 'All deaths: On-Tag + Off-Tag + Run-Back', bold: true },
];

export const OnTagReviewSection = ({ result }: Props) => {
    const {
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
    } = useStatsSharedContext();
    const sectionId = 'on-tag-review';
    const isExpanded = expandedSection === sectionId;

    const [sortKey, setSortKey] = useState<SortKey>('total');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const rows = result?.rows ?? [];

    const visibleRows = useMemo(() => {
        const cmp = (a: OnTagReviewRow, b: OnTagReviewRow) => {
            let av: string | number;
            let bv: string | number;
            if (sortKey === 'account') { av = a.account; bv = b.account; }
            else if (sortKey === 'avgDist') { av = a.avgDist ?? -1; bv = b.avgDist ?? -1; }
            else { av = a[sortKey]; bv = b[sortKey]; }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return a.account.localeCompare(b.account);
        };
        return [...rows].sort(cmp);
    }, [rows, sortKey, sortDir]);

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

    const countCell = (key: string, value: number, color?: string, bold?: boolean) => (
        <td
            key={key}
            className="text-right py-2 px-3 font-mono whitespace-nowrap"
            style={value === 0
                ? { color: 'var(--text-secondary)', opacity: 0.45 }
                : { color: color || 'var(--text-primary)', fontWeight: bold ? 700 : undefined }}
        >{value}</td>
    );

    const rangeChips = (ranges: number[]) => {
        if (ranges.length === 0) {
            return <span style={{ color: 'var(--text-secondary)', opacity: 0.35 }}>—</span>;
        }
        const shown = ranges.slice(0, MAX_RANGE_CHIPS);
        const rest = ranges.slice(MAX_RANGE_CHIPS);
        return (
            <span className="inline-flex flex-wrap items-center gap-1">
                {shown.map((r, i) => (
                    <span
                        key={`${r}-${i}`}
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono"
                        style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)', color: 'var(--status-warning)' }}
                    >{formatWithCommas(r, 0)}</span>
                ))}
                {rest.length > 0 && (
                    <span
                        className="inline-block px-1.5 py-0.5 rounded text-[10px]"
                        style={{ background: 'var(--bg-card-inner)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                        title={rest.map(r => formatWithCommas(r, 0)).join(', ')}
                    >+{rest.length}</span>
                )}
            </span>
        );
    };

    return (
        <div
            className={isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Skull className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>On Tag Review</h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close On Tag Review' : 'Expand On Tag Review'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>
            <div className="text-[10px] mb-3 ml-6" style={{ color: 'var(--text-secondary)' }}>
                Death distance from tag · <span style={{ color: 'var(--text-primary)' }}>On</span> ≤ {formatWithCommas(ON_TAG_RANGE, 0)}
                <span className="mx-1.5 opacity-50">|</span><span style={{ color: 'var(--status-warning)' }}>Off</span> ≤ {formatWithCommas(RUN_BACK_RANGE, 0)}
                <span className="mx-1.5 opacity-50">|</span><span style={{ color: 'var(--status-error)' }}>Run-Back</span> &gt; {formatWithCommas(RUN_BACK_RANGE, 0)}
                <span className="mx-1.5 opacity-50">|</span><span style={{ color: AFTER_TAG_COLOR }}>After-Tag</span> = tag already dead
            </div>

            {rows.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No replay data available — commander tag positions are required for this table.
                </div>
            ) : (
                <div className={`rounded-[var(--radius-md)] overflow-hidden ${visibleRows.length > 12 ? 'max-h-[30rem] overflow-y-auto' : ''}`}>
                    <table className="w-full text-xs table-auto min-w-full border-separate border-spacing-0" style={{ color: 'var(--text-primary)' }}>
                        <thead>
                            <tr className="text-[10px] uppercase tracking-widest border-b border-[color:var(--border-default)]" style={{ color: 'var(--text-secondary)' }}>
                                <th className="text-left py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer" onClick={() => onSort('account')}>Player {sortIcon('account')}</th>
                                <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer" onClick={() => onSort('fightCount')}># Fights {sortIcon('fightCount')}</th>
                                <th className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer" onClick={() => onSort('avgDist')} title="Average distance to tag while alive, before the tag died">Avg Dist {sortIcon('avgDist')}</th>
                                {DEATH_COLUMNS.map(col => (
                                    <th
                                        key={col.key}
                                        className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer"
                                        onClick={() => onSort(col.key)}
                                        title={col.tip}
                                    >
                                        <span className="inline-flex items-center gap-1">{col.label} <Skull className="w-2.5 h-2.5 inline-block opacity-60" /> {sortIcon(col.key)}</span>
                                    </th>
                                ))}
                                <th className="text-left py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)]" title="Distances of Off-Tag deaths, furthest first">Off-Tag Ranges</th>
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
                                    <td className="text-right py-2 px-3 font-mono whitespace-nowrap">
                                        {r.avgDist === null
                                            ? <span style={{ color: 'var(--text-secondary)', opacity: 0.35 }}>—</span>
                                            : formatWithCommas(r.avgDist, 0)}
                                    </td>
                                    {DEATH_COLUMNS.map(col => countCell(col.key, r[col.key], col.color, col.bold))}
                                    <td className="py-2 px-3">{rangeChips(r.offTagRanges)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
