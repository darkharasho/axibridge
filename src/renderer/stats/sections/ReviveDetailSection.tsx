import { useMemo, useState } from 'react';
import { HelpingHand } from 'lucide-react';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import type { ReviveDetailSummary, RevivePlayerRow } from '../statsTypes';

type ReviveDetailSectionProps = {
    reviveDetail: ReviveDetailSummary | null | undefined;
    /** account|profession -> total active ms, used only to normalize the count
     *  columns into per-1s / per-60s rates. Missing/absent entries fall back to
     *  a 1-second floor so the section never divides by zero. */
    playerActiveMs?: Record<string, number>;
};

type PlayerSortKey =
    | 'account' | 'attempts' | 'attemptTimeMs' | 'handRevives' | 'successRate'
    | 'utilityCasts' | 'utilityRevives' | 'revivesPerCast' | 'assists' | 'totalRevives';

/** The count fields that get divided by active time when the rate toggle is off
 *  "Total" — mirrors DefenseSection's total/per1s/per60s mechanism. successRate
 *  and revivesPerCast are already ratios and must never be time-scaled. */
const RATE_FIELDS = new Set<PlayerSortKey>([
    'attempts', 'handRevives', 'utilityCasts', 'utilityRevives', 'assists', 'totalRevives',
]);

type ViewMode = 'total' | 'per1s' | 'per60s';

const PLAYER_COLUMNS: Array<{ id: PlayerSortKey; label: string; align: 'left' | 'right' }> = [
    { id: 'account', label: 'Player', align: 'left' },
    { id: 'attempts', label: 'Resurrect Attempts', align: 'right' },
    { id: 'attemptTimeMs', label: 'Resurrect Time', align: 'right' },
    { id: 'handRevives', label: 'Hand Revives', align: 'right' },
    { id: 'successRate', label: 'Success Rate', align: 'right' },
    { id: 'utilityCasts', label: 'Utility Casts', align: 'right' },
    { id: 'utilityRevives', label: 'Utility Revives', align: 'right' },
    { id: 'revivesPerCast', label: 'Revives per Cast', align: 'right' },
    { id: 'assists', label: 'Assists', align: 'right' },
    { id: 'totalRevives', label: 'Total Revives', align: 'right' },
];

const GRID_COLS = 'grid-cols-[1.6fr_1fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_0.7fr_0.9fr]';

const formatSeconds = (ms: number): string => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
const formatPercent = (value: number, denominatorZero: boolean): string =>
    denominatorZero ? '—' : `${Math.round(value * 100)}%`;
const formatRatio = (value: number, denominatorZero: boolean): string =>
    denominatorZero ? '—' : value.toFixed(2);
const displayName = (key: string | null): string => {
    if (!key) return '—';
    const [account] = key.split('|');
    return account || key;
};

/** Player's total active seconds, floored at 1s so per-second/per-minute rates
 *  never divide by zero. Falls back to the floor when no activeMs was supplied
 *  for this player (e.g. old data, or the caller didn't pass playerActiveMs). */
const totalSecondsFor = (row: RevivePlayerRow, playerActiveMs?: Record<string, number>): number =>
    Math.max(1, (playerActiveMs?.[row.key] || 0) / 1000);

const resolveCountValue = (raw: number, viewMode: ViewMode, seconds: number): number => {
    if (viewMode === 'total') return raw;
    const perSecond = raw / seconds;
    return viewMode === 'per1s' ? perSecond : perSecond * 60;
};

const formatCountValue = (raw: number, viewMode: ViewMode, seconds: number): string => {
    const value = resolveCountValue(raw, viewMode, seconds);
    return viewMode === 'total' ? String(value) : value.toFixed(2);
};

export const ReviveDetailSection = ({ reviveDetail, playerActiveMs }: ReviveDetailSectionProps) => {
    const [sort, setSort] = useState<{ key: PlayerSortKey; dir: 'asc' | 'desc' }>({ key: 'totalRevives', dir: 'desc' });
    const [viewMode, setViewMode] = useState<ViewMode>('total');

    const toggleSort = (key: PlayerSortKey) => {
        setSort((prev) => {
            if (prev.key === key) return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
            return { key, dir: key === 'account' ? 'asc' : 'desc' };
        });
    };

    const players = reviveDetail?.players ?? [];
    const utilities = reviveDetail?.utilities ?? [];
    const squad = reviveDetail?.squad ?? { downs: 0, recovered: 0, died: 0, hand: 0, utility: 0, self: 0, unattributed: 0 };
    const coverage = reviveDetail?.coverage ?? { logsWithData: 0, logsWithoutData: 0 };
    const iol = reviveDetail?.iol ?? null;

    const sortedPlayers = useMemo(() => {
        const rows = [...players];
        const resolveSortValue = (row: RevivePlayerRow): number | string => {
            if (sort.key === 'account') return row.account;
            const raw = Number((row as any)[sort.key] || 0);
            if (RATE_FIELDS.has(sort.key) && viewMode !== 'total') {
                return resolveCountValue(raw, viewMode, totalSecondsFor(row, playerActiveMs));
            }
            return raw;
        };
        rows.sort((a: RevivePlayerRow, b: RevivePlayerRow) => {
            const av = resolveSortValue(a);
            const bv = resolveSortValue(b);
            if (typeof av === 'string' || typeof bv === 'string') {
                const diff = String(av).localeCompare(String(bv));
                return sort.dir === 'desc' ? -diff : diff;
            }
            const diff = av - bv;
            if (diff !== 0) return sort.dir === 'desc' ? -diff : diff;
            return String(a.account || '').localeCompare(String(b.account || ''));
        });
        return rows;
    }, [players, sort, viewMode, playerActiveMs]);

    const recoveredRatePercent = squad.downs > 0 ? Math.round((squad.recovered / squad.downs) * 100) : null;

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <HelpingHand className="w-4 h-4 shrink-0" style={{ color: 'var(--section-defense)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>
                    Revives
                </h3>
                {reviveDetail && (
                    <div className="ml-auto">
                        <PillToggleGroup
                            value={viewMode}
                            onChange={setViewMode}
                            options={[
                                { value: 'total', label: 'Total' },
                                { value: 'per1s', label: 'Stat/1s' },
                                { value: 'per60s', label: 'Stat/60s' },
                            ]}
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                    </div>
                )}
            </div>

            {!reviveDetail ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No revive data available for this selection.
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {coverage.logsWithoutData > 0 && (
                        <div
                            className="rounded-[var(--radius-md)] px-3 py-2 text-xs"
                            style={{ border: '1px dashed var(--border-default)', color: 'var(--text-secondary)' }}
                        >
                            {coverage.logsWithoutData} {coverage.logsWithoutData === 1 ? 'log' : 'logs'} predate revive tracking and are excluded from these counts.
                        </div>
                    )}

                    <div className="rounded-[var(--radius-md)] p-3" style={{ border: '1px solid var(--border-subtle)' }}>
                        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                            {`Downs ${squad.downs} · Recovered ${squad.recovered} (${recoveredRatePercent === null ? '—' : `${recoveredRatePercent}%`}) · Died ${squad.died}`}
                        </div>
                        <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                            {`Hand ${squad.hand} · Utility ${squad.utility} · Self ${squad.self} · Unattributed ${squad.unattributed}`}
                        </div>
                        <div className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                            Coverage: {coverage.logsWithData} {coverage.logsWithData === 1 ? 'log' : 'logs'} with revive data. Per-player totals below only sum the logs that carried revive data — there is no per-player denominator, so a player present for fewer covered logs is not on equal footing with one who attended more.
                        </div>
                    </div>

                    <div className="rounded-[var(--radius-md)] overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
                        <div className="px-3 py-2 text-xs uppercase tracking-widest" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)' }}>
                            Players
                        </div>
                        {sortedPlayers.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No player revive data available.</div>
                        ) : (
                            <>
                                <div className={`grid ${GRID_COLS} gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]`} style={{ borderBottom: '1px solid var(--border-default)' }}>
                                    {PLAYER_COLUMNS.map((col) => (
                                        <button
                                            key={col.id}
                                            type="button"
                                            onClick={() => toggleSort(col.id)}
                                            className={col.align === 'right' ? 'text-right' : 'text-left'}
                                            style={{ color: sort.key === col.id ? 'var(--brand-primary)' : 'var(--text-secondary)' }}
                                        >
                                            {col.label}{sort.key === col.id ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                        </button>
                                    ))}
                                </div>
                                <div className="max-h-96 overflow-y-auto">
                                    {sortedPlayers.map((row) => {
                                        const seconds = totalSecondsFor(row, playerActiveMs);
                                        return (
                                            <div
                                                key={row.key}
                                                className={`grid ${GRID_COLS} gap-2 px-3 py-2 text-xs`}
                                                style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                                            >
                                                <div className="min-w-0 truncate flex items-center gap-1.5">
                                                    {renderProfessionIcon(row.profession, undefined, 'w-4 h-4 flex-shrink-0')}
                                                    <span className="truncate">{row.account}</span>
                                                </div>
                                                <div className="text-right font-mono">{formatCountValue(row.attempts, viewMode, seconds)}</div>
                                                <div className="text-right font-mono">{formatSeconds(row.attemptTimeMs)}</div>
                                                <div className="text-right font-mono">{formatCountValue(row.handRevives, viewMode, seconds)}</div>
                                                <div className="text-right font-mono">{formatPercent(row.successRate, row.attempts === 0)}</div>
                                                <div className="text-right font-mono">{formatCountValue(row.utilityCasts, viewMode, seconds)}</div>
                                                <div className="text-right font-mono">{formatCountValue(row.utilityRevives, viewMode, seconds)}</div>
                                                <div className="text-right font-mono">{formatRatio(row.revivesPerCast, row.utilityCasts === 0)}</div>
                                                <div className="text-right font-mono">{formatCountValue(row.assists, viewMode, seconds)}</div>
                                                <div className="text-right font-mono">{formatCountValue(row.totalRevives, viewMode, seconds)}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="rounded-[var(--radius-md)] overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
                        <div className="px-3 py-2 text-xs uppercase tracking-widest" style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)' }}>
                            Utilities
                        </div>
                        {utilities.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No utility revives recorded.</div>
                        ) : (
                            <>
                                <div className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.9fr_1fr] gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]" style={{ borderBottom: '1px solid var(--border-default)' }}>
                                    <div>Utility</div>
                                    <div className="text-right">Casts</div>
                                    <div className="text-right">Revives</div>
                                    <div className="text-right">Revives per Cast</div>
                                    <div className="text-right">Top Caster</div>
                                </div>
                                {utilities.map((utility) => (
                                    <div
                                        key={utility.skillId}
                                        className="grid grid-cols-[1.6fr_0.7fr_0.7fr_0.9fr_1fr] gap-2 px-3 py-2 text-xs"
                                        style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
                                    >
                                        <div className="min-w-0 truncate">{utility.name}</div>
                                        <div className="text-right font-mono">{utility.casts}</div>
                                        <div className="text-right font-mono">{utility.revives}</div>
                                        <div className="text-right font-mono">{formatRatio(utility.revivesPerCast, utility.casts === 0)}</div>
                                        <div className="text-right font-mono truncate">{displayName(utility.topCasterKey)}</div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>

                    {iol && (
                        <div className="rounded-[var(--radius-md)] p-3" style={{ border: '1px solid var(--border-default)' }}>
                            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>
                                Illusion of Life
                            </div>
                            <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                                {`Revives ${iol.revives} · Survived ${iol.survived} · Re-downed ${iol.reDowned}`}
                                {iol.medianTimeToReDownMs !== null ? ` · Median time to re-down ${formatSeconds(iol.medianTimeToReDownMs)}` : ''}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
