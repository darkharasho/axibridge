import { useMemo, useState } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { Crosshair, ArrowUp, ArrowDown } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import type { DistanceToTagResult, DistanceToTagRow } from '../computeDistanceToTag';
import { expandedPaneProps } from './expandedPane';

type Props = {
    result: DistanceToTagResult;
    filterEnabled?: boolean;
    onFilterEnabledChange?: (v: boolean) => void;
    minFights?: number;
    onMinFightsChange?: (v: number) => void;
};

type SortKey = 'account' | 'fightCount' | 'sampleCount' | 'avg' | 'median' | 'p95';
type SortDir = 'asc' | 'desc';

export const SquadDistanceToTagSection = (props: Props) => {
    const { result } = props;
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
    const [internalFilterEnabled, setInternalFilterEnabled] = useState(false);
    const [internalMinFights, setInternalMinFights] = useState(3);
    const filterEnabled = props.filterEnabled ?? internalFilterEnabled;
    const minFights = props.minFights ?? internalMinFights;
    const setFilterEnabled = (next: boolean | ((prev: boolean) => boolean)) => {
        const value = typeof next === 'function' ? next(filterEnabled) : next;
        if (props.onFilterEnabledChange) props.onFilterEnabledChange(value);
        else setInternalFilterEnabled(value);
    };
    const setMinFights = (next: number) => {
        if (props.onMinFightsChange) props.onMinFightsChange(next);
        else setInternalMinFights(next);
    };

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
    // aria-sort is both the announcement and the styling hook: upstream's
    // .axi-table th[aria-sort] marks the sorted column off this attribute, so a
    // class saying the same thing would be a second source of truth for one fact.
    const ariaSort = (key: SortKey): 'ascending' | 'descending' | undefined =>
        key !== sortKey ? undefined : sortDir === 'asc' ? 'ascending' : 'descending';

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
                className="axi-chip"
            >{label}</span>
        );
    };

    return (
        <div {...expandedPaneProps(isExpanded, expandedSectionClosing)}>
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
                            /* Upstream's switch at the smallest size this header can hold: it
                               sits beside 11px type. The default theme's 3px control edge would
                               leave a 14px track with a 4px slot, so this one instance drops to
                               2px. That is a token, not a redraw - axi.css spells the slug's
                               travel as a calc over --axi-border-control precisely so the switch
                               stays correct at any weight. */
                            className="axi-switch"
                            style={{
                                '--axi-switch-w': '26px',
                                '--axi-switch-h': '14px',
                                '--axi-switch-knob': '8px',
                                '--axi-border-control': '2px',
                            } as React.CSSProperties}
                            title={filterEnabled ? 'Min-fights filter on' : 'Min-fights filter off'}
                        >
                            <span aria-hidden className="axi-switch__knob" />
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
                            className="axi-input shrink-0 text-center font-mono"
                            style={{ width: '3.25rem', opacity: filterEnabled ? 1 : 0.55 }}
                            aria-label="Minimum fight count"
                        />
                        <span className="shrink-0">fights</span>
                        {filterEnabled && hiddenCount > 0 && (
                            <span
                                className="axi-chip shrink-0"
                            >{hiddenCount} hidden</span>
                        )}
                    </div>
                )}
                <SectionExpandButton
                    expanded={isExpanded}
                    onToggle={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    section="Distance to Tag"
                    className={rows.length > 0 ? undefined : 'ml-auto'}
                />
            </div>

            {rows.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No distance data for the loaded fights.
                </div>
            ) : (
                <>
                    <div className={`axi-table__scroll rounded-[var(--radius-md)] ${visibleRows.length > 12 ? 'max-h-[30rem]' : ''}`}>
                        <table className="axi-table axi-table--sticky">
                            <thead>
                                <tr>
                                    <th scope="col" aria-sort={ariaSort('account')}>
                                        <button type="button" className="axi-table__sort" onClick={() => onSort('account')}>Player {sortIcon('account')}</button>
                                    </th>
                                    <th scope="col" aria-sort={ariaSort('fightCount')}>
                                        <button type="button" className="axi-table__sort" onClick={() => onSort('fightCount')}># Fights {sortIcon('fightCount')}</button>
                                    </th>
                                    <th scope="col" aria-sort={ariaSort('sampleCount')}>
                                        <button type="button" className="axi-table__sort" onClick={() => onSort('sampleCount')}>Samples {sortIcon('sampleCount')}</button>
                                    </th>
                                    <th scope="col" aria-sort={ariaSort('avg')}>
                                        <button type="button" className="axi-table__sort" onClick={() => onSort('avg')}>Avg {sortIcon('avg')}</button>
                                    </th>
                                    <th scope="col" aria-sort={ariaSort('median')}>
                                        <button type="button" className="axi-table__sort" onClick={() => onSort('median')}>Median {sortIcon('median')}</button>
                                    </th>
                                    <th scope="col" aria-sort={ariaSort('p95')}>
                                        <button type="button" className="axi-table__sort" onClick={() => onSort('p95')}>p95 {sortIcon('p95')}</button>
                                    </th>
                                    <th scope="col" className="text-left">Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRows.map(r => (
                                    <tr key={r.account} className="align-top">
                                        <td>
                                            <span className="axi-table__who">
                                                {renderProfessionIcon(r.profession, r.professionList, 'w-4 h-4 flex-shrink-0')}
                                                <span>{r.account}</span>
                                                {r.isCommander && <span title="Commander" style={{ color: 'var(--status-warning)' }}>★</span>}
                                            </span>
                                        </td>
                                        <td className="axi-table__num">{r.fightCount}</td>
                                        <td className="axi-table__num">{formatWithCommas(r.sampleCount, 0)}</td>
                                        <td className="axi-table__num">{formatWithCommas(r.avg, 0)}</td>
                                        <td className="axi-table__num">{formatWithCommas(r.median, 0)}</td>
                                        <td className="axi-table__num">{formatWithCommas(r.p95, 0)}</td>
                                        <td className="text-left">{sourceBadge(r.source)}</td>
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
