import { useEffect, useMemo, useState } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { GitCompareArrows } from 'lucide-react';
import { StatsTableShell } from '../ui/StatsTableShell';
import { useStatsSharedContext } from '../StatsViewContext';
import { expandedPaneProps } from './expandedPane';

type DiffFightRow = {
    id: string;
    shortLabel: string;
    fullLabel: string;
    targetFocus?: Array<{ label: string; damage: number; hits: number; share: number }>;
    squadMetrics?: Array<{
        metricId: string;
        metricLabel: string;
        higherIsBetter: boolean;
        value: number;
    }>;
};

type TargetSortKey = 'aDamage' | 'aShare' | 'bDamage' | 'bShare' | 'shareDelta';

export const FightDiffModeSection = () => {
    const { stats, formatWithCommas, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection } = useStatsSharedContext();
    // Stored oldest-first; the dropdowns list newest-first.
    const fights = useMemo(
        () => (Array.isArray(stats?.fightDiffMode) ? [...stats.fightDiffMode].reverse() : []) as DiffFightRow[],
        [stats?.fightDiffMode]
    );
    const fightDiffMissingFromDataset = !Array.isArray(stats?.fightDiffMode) && Array.isArray(stats?.fightBreakdown) && stats.fightBreakdown.length > 0;
    const [fightAId, setFightAId] = useState<string>('');
    const [fightBId, setFightBId] = useState<string>('');
    const [targetSort, setTargetSort] = useState<{ key: TargetSortKey; direction: 'asc' | 'desc' } | null>(null);

    useEffect(() => {
        if (fights.length === 0) {
            setFightAId('');
            setFightBId('');
            return;
        }
        // B defaults to the newest fight and A to the one before it, so the
        // deltas still read as "what changed since the previous fight".
        const newestId = String(fights[0]?.id || '');
        const previousId = String(fights[1]?.id || fights[0]?.id || '');
        setFightAId((prev) => {
            if (prev && fights.some((fight) => String(fight.id) === prev)) return prev;
            return previousId;
        });
        setFightBId((prev) => {
            if (prev && fights.some((fight) => String(fight.id) === prev)) return prev;
            return newestId;
        });
    }, [fights]);

    const selectedFightA = useMemo(
        () => fights.find((fight) => String(fight.id) === String(fightAId)) || null,
        [fights, fightAId]
    );
    const selectedFightB = useMemo(
        () => fights.find((fight) => String(fight.id) === String(fightBId)) || null,
        [fights, fightBId]
    );

    const targetFocusRows = useMemo(() => {
        if (!selectedFightA || !selectedFightB) return [];
        const map = new Map<string, {
            label: string;
            aDamage: number;
            aShare: number;
            bDamage: number;
            bShare: number;
        }>();
        const upsert = (label: string, side: 'a' | 'b', damage: number, share: number) => {
            const key = String(label || 'Unknown');
            const existing = map.get(key) || {
                label: key,
                aDamage: 0,
                aShare: 0,
                bDamage: 0,
                bShare: 0
            };
            if (side === 'a') {
                existing.aDamage = Number(damage || 0);
                existing.aShare = Number(share || 0);
            } else {
                existing.bDamage = Number(damage || 0);
                existing.bShare = Number(share || 0);
            }
            map.set(key, existing);
        };
        (selectedFightA.targetFocus || []).forEach((row) => upsert(row.label, 'a', row.damage, row.share));
        (selectedFightB.targetFocus || []).forEach((row) => upsert(row.label, 'b', row.damage, row.share));
        return Array.from(map.values())
            .map((row) => ({ ...row, shareDelta: row.bShare - row.aShare }))
            .sort((a, b) => Math.abs(b.shareDelta) - Math.abs(a.shareDelta) || (b.bDamage + b.aDamage) - (a.bDamage + a.aDamage));
    }, [selectedFightA, selectedFightB]);
    const sortedTargetFocusRows = useMemo(() => {
        if (!targetSort) return targetFocusRows;
        const directionSign = targetSort.direction === 'asc' ? 1 : -1;
        const key = targetSort.key;
        return [...targetFocusRows].sort((a, b) => {
            const diff = (Number(a[key]) - Number(b[key])) * directionSign;
            if (diff !== 0) return diff;
            return a.label.localeCompare(b.label);
        });
    }, [targetFocusRows, targetSort]);

    const squadMetricRows = useMemo(() => {
        if (!selectedFightA || !selectedFightB) return [];
        const byMetricA = new Map((selectedFightA.squadMetrics || []).map((row) => [row.metricId, row]));
        const byMetricB = new Map((selectedFightB.squadMetrics || []).map((row) => [row.metricId, row]));
        const metricIds = Array.from(new Set([...byMetricA.keys(), ...byMetricB.keys()]));
        return metricIds.map((metricId) => {
            const a = byMetricA.get(metricId);
            const b = byMetricB.get(metricId);
            const higherIsBetter = Boolean(a?.higherIsBetter ?? b?.higherIsBetter ?? true);
            const aValue = Number(a?.value || 0);
            const bValue = Number(b?.value || 0);
            return {
                metricId,
                metricLabel: String(a?.metricLabel || b?.metricLabel || metricId),
                higherIsBetter,
                a,
                b,
                delta: bValue - aValue
            };
        });
    }, [selectedFightA, selectedFightB]);

    const formatPct = (value: number) => `${formatWithCommas((Number(value) || 0) * 100, 1)}%`;
    const metricDecimals = (metricId: string) => {
        if (metricId === 'squadKdr') return 2;
        return 0;
    };
    const targetAriaSort = (key: TargetSortKey): 'ascending' | 'descending' | undefined =>
        targetSort?.key !== key ? undefined : targetSort.direction === 'asc' ? 'ascending' : 'descending';

    const toggleTargetSort = (key: TargetSortKey) => {
        setTargetSort((current) => {
            if (!current || current.key !== key) return { key, direction: 'desc' };
            return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
        });
    };
    const sortArrow = (key: TargetSortKey) => (
        targetSort?.key === key ? (targetSort.direction === 'desc' ? ' ↓' : ' ↑') : ''
    );

    return (
        <div {...expandedPaneProps(expandedSection === 'fight-diff-mode', expandedSectionClosing)}>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <GitCompareArrows className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Fight Comparison</h3>
                <SectionExpandButton
                    expanded={expandedSection === 'fight-diff-mode'}
                    onToggle={() => (expandedSection === 'fight-diff-mode' ? closeExpandedSection() : openExpandedSection('fight-diff-mode'))}
                    section="Fight Comparison"
                />
            </div>

            {fightDiffMissingFromDataset ? (
                <div className="text-center text-[color:var(--axi-text-dim)] py-8 space-y-1">
                    <div className="font-semibold text-[color:var(--axi-text)]">Fight Comparison data is missing in this dataset.</div>
                    <div className="text-sm text-[color:var(--axi-text-dim)]">
                        Regenerate the stats/report with a build that includes Fight Comparison.
                    </div>
                </div>
            ) : fights.length < 2 ? (
                <div className="axi-empty">
                    Need at least two fights to compare.
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="text-xs uppercase tracking-widest text-[color:var(--axi-text-dim)]">
                            Fight A
                            <select
                                className="axi-select mt-2 w-full"
                               
                                value={fightAId}
                                onChange={(event) => setFightAId(event.target.value)}
                            >
                                {fights.map((fight) => (
                                    <option key={`fight-a-${fight.id}`} value={fight.id}>
                                        {fight.shortLabel} - {fight.fullLabel}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-xs uppercase tracking-widest text-[color:var(--axi-text-dim)]">
                            Fight B
                            <select
                                className="axi-select mt-2 w-full"
                               
                                value={fightBId}
                                onChange={(event) => setFightBId(event.target.value)}
                            >
                                {fights.map((fight) => (
                                    <option key={`fight-b-${fight.id}`} value={fight.id}>
                                        {fight.shortLabel} - {fight.fullLabel}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="axi-well axi-well--sm axi-edge-meta text-xs axi-ink-meta space-y-1">
                        <div className="uppercase tracking-widest text-[10px] axi-ink-meta">How Target Focus Works</div>
                        <div>
                            Target focus compares how your squad distributed damage <span className="font-semibold">to</span> enemy professions between two fights
                            (it is not damage <span className="font-semibold">from</span> those professions).
                        </div>
                        <div>
                            <span className="font-semibold">Share</span> is the percent of your squad&apos;s total enemy-player damage that landed on that profession in that fight.
                            <span className="font-semibold"> Share Delta</span> is <span className="font-semibold">Fight B - Fight A</span>.
                        </div>
                    </div>

                    <div className="stats-table-layout__content rounded-[var(--axi-radius-sm)] overflow-hidden">
                        <StatsTableShell
                            expanded={expandedSection === 'fight-diff-mode'}
                            maxHeightClass="max-h-96"
                            header={(
                                <div className="px-4 py-3 text-[10px] uppercase tracking-widest text-[color:var(--axi-text-dim)] border-b border-[color:var(--axi-ink-line)]">
                                    Target Focus Comparison
                                </div>
                            )}
                            cols={['220px', '120px', '120px', '120px', '120px', '120px']}
                            head={
                                <>
                                    <th scope="col">Target</th>
                                    <th scope="col" aria-sort={targetAriaSort('aDamage')}>
                                        <button type="button" className="axi-table__sort" onClick={() => toggleTargetSort('aDamage')}>
                                            {selectedFightA?.shortLabel} Damage{sortArrow('aDamage')}
                                        </button>
                                    </th>
                                    <th scope="col" aria-sort={targetAriaSort('aShare')}>
                                        <button type="button" className="axi-table__sort" onClick={() => toggleTargetSort('aShare')}>
                                            {selectedFightA?.shortLabel} Share{sortArrow('aShare')}
                                        </button>
                                    </th>
                                    <th scope="col" aria-sort={targetAriaSort('bDamage')}>
                                        <button type="button" className="axi-table__sort" onClick={() => toggleTargetSort('bDamage')}>
                                            {selectedFightB?.shortLabel} Damage{sortArrow('bDamage')}
                                        </button>
                                    </th>
                                    <th scope="col" aria-sort={targetAriaSort('bShare')}>
                                        <button type="button" className="axi-table__sort" onClick={() => toggleTargetSort('bShare')}>
                                            {selectedFightB?.shortLabel} Share{sortArrow('bShare')}
                                        </button>
                                    </th>
                                    <th scope="col" aria-sort={targetAriaSort('shareDelta')}>
                                        <button type="button" className="axi-table__sort" onClick={() => toggleTargetSort('shareDelta')}>
                                            Share Delta{sortArrow('shareDelta')}
                                        </button>
                                    </th>
                                </>
                            }
                            rows={targetFocusRows.length > 0 ? (
                                sortedTargetFocusRows.map((row) => (
                                    <tr key={`focus-${row.label}`}>
                                        <th scope="row">{row.label}</th>
                                        <td className="axi-table__num">{formatWithCommas(row.aDamage, 0)}</td>
                                        <td>{formatPct(row.aShare)}</td>
                                        <td className="axi-table__num">{formatWithCommas(row.bDamage, 0)}</td>
                                        <td>{formatPct(row.bShare)}</td>
                                        <td className={row.shareDelta >= 0 ? 'axi-ink-ok' : 'axi-ink-danger'}>
                                            {row.shareDelta >= 0 ? '+' : ''}{formatPct(row.shareDelta)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="axi-ink-muted text-center">
                                        No target focus data for selected fights. Usually this means the fights were
                                        uploaded without Detailed WvW enemy slices, or the report was generated from
                                        an older build.
                                    </td>
                                </tr>
                            )}
                        />
                    </div>

                    <div className="stats-table-layout__content rounded-[var(--axi-radius-sm)] overflow-hidden">
                        <StatsTableShell
                            expanded={expandedSection === 'fight-diff-mode'}
                            maxHeightClass="max-h-none"
                            header={(
                                <div className="px-4 py-3 text-[10px] uppercase tracking-widest text-[color:var(--axi-text-dim)] border-b border-[color:var(--axi-ink-line)]">
                                    Squad Metric Comparison
                                </div>
                            )}
                            cols={['320px', '120px', '120px', '120px']}
                            head={
                                <>
                                    <th scope="col">Metric</th>
                                    <th scope="col">{selectedFightA?.shortLabel} Value</th>
                                    <th scope="col">{selectedFightB?.shortLabel} Value</th>
                                    <th scope="col">Delta</th>
                                </>
                            }
                            rows={squadMetricRows.length > 0 ? (
                                squadMetricRows.map((row) => {
                                    const improving = row.higherIsBetter ? row.delta >= 0 : row.delta <= 0;
                                    const decimals = metricDecimals(row.metricId);
                                    return (
                                        <tr key={`performer-${row.metricId}`}>
                                            <th scope="row">{row.metricLabel}</th>
                                            <td className="axi-table__num">{formatWithCommas(Number(row.a?.value || 0), decimals)}</td>
                                            <td className="axi-table__num">{formatWithCommas(Number(row.b?.value || 0), decimals)}</td>
                                            <td className={improving ? 'axi-ink-ok' : 'axi-ink-danger'}>
                                                {row.delta > 0 ? '+' : ''}{formatWithCommas(row.delta, decimals)}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={4} className="axi-ink-muted text-center">No squad metric data for selected fights.</td>
                                </tr>
                            )}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
