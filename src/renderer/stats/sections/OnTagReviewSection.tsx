import { useMemo, useState } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { Skull, ArrowUp, ArrowDown } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import { ON_TAG_RANGE, RUN_BACK_RANGE, type OnTagReviewResult, type OnTagReviewRow } from '../computeOnTagReview';
import { expandedPaneProps } from './expandedPane';

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
    { key: 'offTag', label: 'Off-Tag', tip: `Died between ${ON_TAG_RANGE} and ${RUN_BACK_RANGE} units from the tag`, color: 'var(--axi-warn)' },
    { key: 'afterTag', label: 'After-Tag', tip: 'Died after the tag had already died (also counted in the other columns)', color: AFTER_TAG_COLOR },
    { key: 'runBack', label: 'Run-Back', tip: `Died more than ${RUN_BACK_RANGE} units from the tag — likely returning from spawn`, color: 'var(--axi-danger)', bold: true },
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
    // aria-sort is both the announcement and the styling hook that upstream's
    // .axi-table th[aria-sort] reads; a class beside it would say one fact twice.
    const ariaSort = (key: SortKey): 'ascending' | 'descending' | undefined =>
        key !== sortKey ? undefined : sortDir === 'asc' ? 'ascending' : 'descending';

    const countCell = (key: string, value: number, color?: string, bold?: boolean) => (
        <td
            key={key}
            className="axi-table__num"
            style={value === 0
                ? { color: 'var(--axi-text-dim)', opacity: 0.45 }
                : { color: color || 'var(--axi-text)', fontWeight: bold ? 700 : undefined }}
        >{value}</td>
    );

    const rangeChips = (ranges: number[]) => {
        if (ranges.length === 0) {
            return <span style={{ color: 'var(--axi-text-dim)', opacity: 0.35 }}>—</span>;
        }
        const shown = ranges.slice(0, MAX_RANGE_CHIPS);
        const rest = ranges.slice(MAX_RANGE_CHIPS);
        return (
            <span className="inline-flex flex-wrap items-center gap-1">
                {shown.map((r, i) => (
                    <span
                        key={`${r}-${i}`}
                        className="axi-chip axi-ink-warn font-mono"
                    >{formatWithCommas(r, 0)}</span>
                ))}
                {rest.length > 0 && (
                    <span
                        className="axi-chip"
                        title={rest.map(r => formatWithCommas(r, 0)).join(', ')}
                    >+{rest.length}</span>
                )}
            </span>
        );
    };

    return (
        <div {...expandedPaneProps(isExpanded, expandedSectionClosing)}>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <Skull className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>On Tag Review</h3>
                <SectionExpandButton
                    expanded={isExpanded}
                    onToggle={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    section="On Tag Review"
                />
            </div>
            <div className="text-[10px] mb-3 ml-6" style={{ color: 'var(--axi-text-dim)' }}>
                Death distance from tag · <span style={{ color: 'var(--axi-text)' }}>On</span> ≤ {formatWithCommas(ON_TAG_RANGE, 0)}
                <span className="mx-1.5 opacity-50">|</span><span style={{ color: 'var(--axi-warn)' }}>Off</span> ≤ {formatWithCommas(RUN_BACK_RANGE, 0)}
                <span className="mx-1.5 opacity-50">|</span><span style={{ color: 'var(--axi-danger)' }}>Run-Back</span> &gt; {formatWithCommas(RUN_BACK_RANGE, 0)}
                <span className="mx-1.5 opacity-50">|</span><span style={{ color: AFTER_TAG_COLOR }}>After-Tag</span> = tag already dead
            </div>

            {rows.length === 0 ? (
                <div className="axi-empty">
                    No replay data available — commander tag positions are required for this table.
                </div>
            ) : (
                <div className={`axi-table__scroll rounded-[var(--axi-radius-sm)] ${visibleRows.length > 12 ? 'max-h-[30rem]' : ''}`}>
                    <table className="axi-table axi-table--sticky">
                        <thead>
                            <tr>
                                <th scope="col" aria-sort={ariaSort('account')}>
                                    <button type="button" className="axi-table__sort" onClick={() => onSort('account')}>Player {sortIcon('account')}</button>
                                </th>
                                <th scope="col" aria-sort={ariaSort('fightCount')}>
                                    <button type="button" className="axi-table__sort" onClick={() => onSort('fightCount')}># Fights {sortIcon('fightCount')}</button>
                                </th>
                                <th scope="col" aria-sort={ariaSort('avgDist')} title="Average distance to tag while alive, before the tag died">
                                    <button type="button" className="axi-table__sort" onClick={() => onSort('avgDist')}>Avg Dist {sortIcon('avgDist')}</button>
                                </th>
                                {DEATH_COLUMNS.map(col => (
                                    <th key={col.key} scope="col" aria-sort={ariaSort(col.key)} title={col.tip}>
                                        <button type="button" className="axi-table__sort" onClick={() => onSort(col.key)}>
                                            {col.label} <Skull className="w-2.5 h-2.5 inline-block opacity-60" /> {sortIcon(col.key)}
                                        </button>
                                    </th>
                                ))}
                                <th scope="col" className="text-left" title="Distances of Off-Tag deaths, furthest first">Off-Tag Ranges</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map(r => (
                                <tr key={r.account} className="align-top">
                                    <td>
                                        <span className="axi-table__who">
                                            {renderProfessionIcon(r.profession, r.professionList, 'w-4 h-4 flex-shrink-0')}
                                            <span>{r.account}</span>
                                            {r.isCommander && <span title="Commander" style={{ color: 'var(--axi-warn)' }}>★</span>}
                                        </span>
                                    </td>
                                    <td className="axi-table__num">{r.fightCount}</td>
                                    <td className="axi-table__num">
                                        {r.avgDist === null
                                            ? <span style={{ color: 'var(--axi-text-dim)', opacity: 0.35 }}>—</span>
                                            : formatWithCommas(r.avgDist, 0)}
                                    </td>
                                    {DEATH_COLUMNS.map(col => countCell(col.key, r[col.key], col.color, col.bold))}
                                    <td className="text-left">{rangeChips(r.offTagRanges)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
