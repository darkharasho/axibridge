import { useMemo, useState } from 'react';
import { Maximize2, X, Crosshair, ArrowUp, ArrowDown } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import type { EnemyAttentionResult, EnemyAttentionRow } from '../computeEnemyAttention';

type Props = { result: EnemyAttentionResult };

type SortKey = 'account' | 'fightCount' | 'castsDrawn' | 'focusIndex' | 'castsDrawnMinions' | 'preDownPerDown' | 'downs';
type SortDir = 'asc' | 'desc';

export const EnemyAttentionSection = ({ result }: Props) => {
    const {
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
    } = useStatsSharedContext();
    const sectionId = 'enemy-attention';
    const isExpanded = expandedSection === sectionId;

    const [sortKey, setSortKey] = useState<SortKey>('focusIndex');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const rows = result?.rows ?? [];
    const measured = result?.measuredFightCount ?? 0;
    const unmeasured = result?.unmeasuredFightCount ?? 0;

    const sortedRows = useMemo(() => {
        const cmp = (a: EnemyAttentionRow, b: EnemyAttentionRow) => {
            const av: string | number = sortKey === 'account' ? a.account : a[sortKey];
            const bv: string | number = sortKey === 'account' ? b.account : b[sortKey];
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return a.account.localeCompare(b.account);
        };
        return [...rows].sort(cmp);
    }, [rows, sortKey, sortDir]);

    const onSort = (key: SortKey) => {
        if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortKey(key); setSortDir(key === 'account' ? 'asc' : 'desc'); }
    };

    const sortIcon = (key: SortKey) =>
        key !== sortKey ? null : sortDir === 'asc'
            ? <ArrowUp className="w-3 h-3 inline-block" />
            : <ArrowDown className="w-3 h-3 inline-block" />;

    const preDownSeconds = result.preDownWindowMs > 0 ? Math.round(result.preDownWindowMs / 100) / 10 : 3;

    const th = (key: SortKey, label: string, title: string) => (
        <th
            className="text-right py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer"
            onClick={() => onSort(key)}
            title={title}
        >{label} {sortIcon(key)}</th>
    );

    return (
        <div
            className={isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Crosshair className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Enemy Attention</h3>
                {measured > 0 && (
                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {formatWithCommas(result.totalCasts, 0)} aimed casts across {measured} {measured === 1 ? 'fight' : 'fights'}
                    </span>
                )}
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Enemy Attention' : 'Expand Enemy Attention'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            {/*
              The two empty states are deliberately DIFFERENT sentences. A fight
              recorded before the May 2026 arcdps build carries no enemy
              cast-start rows at all, so "nobody was focused" would be a claim
              the log cannot support. Saying which one it is, is the point.
            */}
            {rows.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    {measured === 0 && unmeasured > 0
                        ? <>None of the {unmeasured} loaded {unmeasured === 1 ? 'fight was' : 'fights were'} recorded with an arcdps build that logs enemy casts (May 2026 or later), so who the enemy aimed at cannot be measured for {unmeasured === 1 ? 'it' : 'them'}.</>
                        : <>No enemy attention data for the loaded fights.</>}
                </div>
            ) : (
                <>
                    <div className={`rounded-[var(--radius-md)] overflow-hidden ${sortedRows.length > 12 ? 'max-h-[30rem] overflow-y-auto' : ''}`}>
                        <table className="w-full text-xs table-auto min-w-full border-separate border-spacing-0" style={{ color: 'var(--text-primary)' }}>
                            <thead>
                                <tr className="text-[10px] uppercase tracking-widest border-b border-[color:var(--border-default)]" style={{ color: 'var(--text-secondary)' }}>
                                    <th className="text-left py-2 px-3 sticky top-0 z-20 bg-[color:var(--bg-elevated)] cursor-pointer" onClick={() => onSort('account')}>Player {sortIcon('account')}</th>
                                    {th('fightCount', '# Fights', 'Measurable fights this player appeared in.')}
                                    {th('focusIndex', 'Focus', 'Share of enemy casts aimed at this player, over an even share of the squad. 1.00× is average attention; 3.00× is three times it.')}
                                    {th('castsDrawn', 'Casts Drawn', 'Enemy cast-starts that named this player as their target.')}
                                    {th('castsDrawnMinions', 'At Minions', 'Enemy casts aimed at this player’s pets, clones, phantasms, turrets or gyros. Kept out of the Focus column on purpose — a cast at your pet is not the enemy shooting you.')}
                                    {th('downs', 'Downs', 'Times this player entered downstate in the measurable fights.')}
                                    {th('preDownPerDown', `Casts / Down (${preDownSeconds}s)`, `Aimed casts in the ${preDownSeconds}s before each of this player’s downs, per down.`)}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRows.map(r => (
                                    <tr key={r.account} className="align-top border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                        <td className="py-2 px-3 whitespace-nowrap">
                                            <span className="inline-flex items-center gap-1.5">
                                                {renderProfessionIcon(r.profession, r.professionList, 'w-4 h-4 flex-shrink-0')}
                                                <span>{r.account}</span>
                                                {r.isCommander && <span title="Commander" style={{ color: 'var(--status-warning)' }}>★</span>}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono">{r.fightCount}</td>
                                        <td className="py-2 px-3 text-right font-mono" style={{ color: r.focusIndex >= 1.5 ? 'var(--status-warning)' : undefined }}>
                                            {r.focusIndex.toFixed(2)}×
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono">{formatWithCommas(r.castsDrawn, 0)}</td>
                                        <td className="py-2 px-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                                            {r.castsDrawnMinions > 0 ? formatWithCommas(r.castsDrawnMinions, 0) : '—'}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono">{r.downs}</td>
                                        <td className="py-2 px-3 text-right font-mono">{r.downs > 0 ? r.preDownPerDown.toFixed(1) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className="mt-2.5 text-[10px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        Enemy cast-starts survive into a log only when they are aimed at someone squad-side, which makes
                        this a census of what the other side pointed at you rather than a sample of it. Untargeted ground
                        AoE leaves no row here, so this measures <em>aimed</em> attention, not incoming pressure in general.
                        {unmeasured > 0 && <>
                            {' '}<strong>{unmeasured} of {measured + unmeasured} loaded {measured + unmeasured === 1 ? 'fight is' : 'fights are'}</strong> from an
                            arcdps build older than May 2026, which logs no enemy casts at all — {unmeasured === 1 ? 'it is' : 'they are'} excluded
                            from every number above rather than counted as zero.
                        </>}
                    </p>
                </>
            )}
        </div>
    );
};
