import { useMemo, useState } from 'react';
import { ChevronRight, HelpingHand } from 'lucide-react';
import { renderProfessionIcon } from '../ui/StatsViewShared';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { REVIVE_RE_DOWN_BUCKETS_MS } from '../statsTypes';
import type { ReviveDetailSummary, RevivePlayerRow, ReviveUtilityRow } from '../statsTypes';

type ReviveDetailSectionProps = {
    reviveDetail: ReviveDetailSummary | null | undefined;
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

/** Labels for `REVIVE_RE_DOWN_BUCKETS_MS` plus its trailing unbounded bucket.
 *  Derived from the boundaries rather than written out, so the histogram cannot
 *  claim a range the accumulator does not actually bucket by. */
const RE_DOWN_BUCKET_LABELS = REVIVE_RE_DOWN_BUCKETS_MS.map((bound, index) => {
    const lower = index === 0 ? 0 : REVIVE_RE_DOWN_BUCKETS_MS[index - 1] / 1000;
    return `${lower}–${bound / 1000}s`;
}).concat(`${REVIVE_RE_DOWN_BUCKETS_MS[REVIVE_RE_DOWN_BUCKETS_MS.length - 1] / 1000}s+`);

const UTILITY_GRID = 'grid-cols-[2.3fr_0.7fr_0.7fr_0.9fr]';

/** Player's total active seconds over the covered logs, or `null` when the row
 *  carries no active time at all (a report published before `activeMs` was
 *  recorded). A rate needs a real denominator: inventing one — a 1-second floor,
 *  say — turns 9 attempts over three minutes into "9.00/s" with nothing on
 *  screen to say it is wrong, so those rows render a dash instead. */
const totalSecondsFor = (row: RevivePlayerRow): number | null => {
    const seconds = Number(row.activeMs || 0) / 1000;
    return seconds > 0 ? seconds : null;
};

const resolveCountValue = (raw: number, viewMode: ViewMode, seconds: number | null): number | null => {
    if (viewMode === 'total') return raw;
    if (seconds === null) return null;
    const perSecond = raw / seconds;
    return viewMode === 'per1s' ? perSecond : perSecond * 60;
};

const formatCountValue = (raw: number, viewMode: ViewMode, seconds: number | null): string => {
    const value = resolveCountValue(raw, viewMode, seconds);
    if (value === null) return '—';
    return viewMode === 'total' ? String(value) : value.toFixed(2);
};

/** One utility row, expandable into its per-caster breakdown.
 *
 *  Reports published before the breakdown shipped carry no `casters` array at
 *  all. Those rows render exactly as they always did and simply do not expand —
 *  the alternative, an expander that opens onto nothing, reads as a bug. */
const UtilityRow = ({ utility, expanded, onToggle }: {
    utility: ReviveUtilityRow;
    expanded: boolean;
    onToggle: () => void;
}) => {
    const casters = utility.casters ?? [];
    const expandable = casters.length > 0;

    return (
        <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div
                className={`grid ${UTILITY_GRID} gap-2 px-3 py-2 text-xs`}
                style={{ color: 'var(--text-primary)' }}
            >
                <div className="min-w-0 flex items-center gap-1.5">
                    {expandable ? (
                        <button
                            type="button"
                            onClick={onToggle}
                            aria-expanded={expanded}
                            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${utility.name} casters`}
                            className="flex items-center gap-1.5 min-w-0 text-left"
                        >
                            <ChevronRight
                                className="w-3 h-3 flex-shrink-0 transition-transform"
                                style={{ color: 'var(--text-secondary)', transform: expanded ? 'rotate(90deg)' : undefined }}
                            />
                            <UtilityName utility={utility} />
                        </button>
                    ) : (
                        <span className="flex items-center gap-1.5 min-w-0 pl-[calc(0.75rem+0.375rem)]">
                            <UtilityName utility={utility} />
                        </span>
                    )}
                </div>
                <div className="text-right font-mono">{utility.casts}</div>
                <div className="text-right font-mono">{utility.revives}</div>
                <div className="text-right font-mono">{formatRatio(utility.revivesPerCast, utility.casts === 0)}</div>
            </div>

            {expanded && expandable && (
                <div className="pb-2" style={{ background: 'var(--bg-elevated)' }}>
                    <div className={`grid ${UTILITY_GRID} gap-2 pl-8 pr-3 py-1.5 text-[10px] uppercase tracking-widest`} style={{ color: 'var(--text-muted)' }}>
                        <div>Caster</div>
                        <div className="text-right">Casts</div>
                        <div className="text-right">Revives</div>
                        <div className="text-right">Revives per Cast</div>
                    </div>
                    {casters.map((caster) => (
                        <div
                            key={caster.key}
                            className={`grid ${UTILITY_GRID} gap-2 pl-8 pr-3 py-1 text-xs`}
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <div className="min-w-0 truncate flex items-center gap-1.5">
                                {renderProfessionIcon(caster.profession, undefined, 'w-3.5 h-3.5 flex-shrink-0')}
                                <span className="truncate">{caster.account}</span>
                            </div>
                            <div className="text-right font-mono">{caster.casts}</div>
                            <div className="text-right font-mono">{caster.revives}</div>
                            <div className="text-right font-mono">{formatRatio(caster.revivesPerCast, caster.casts === 0)}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const UtilityName = ({ utility }: { utility: ReviveUtilityRow }) => (
    <>
        {utility.icon && (
            <img
                src={utility.icon}
                alt=""
                aria-hidden="true"
                className="w-5 h-5 flex-shrink-0 rounded-sm"
                style={{ objectFit: 'contain' }}
            />
        )}
        <span className="truncate">{utility.name}</span>
    </>
);

/** Mesmer purple, matching the Illusion of Life buff. No theme token is purple,
 *  and reusing the error red would read as another shade of "re-downed". */
const DIED_UNDER_IOL_COLOR = '#b679d5';

/** Illusion of Life outcomes: the survived/re-downed/died-under-IoL split as one
 *  stacked bar, and how quickly the re-downs happened as a histogram. */
const IllusionOfLifeCard = ({ iol }: {
    iol: NonNullable<ReviveDetailSummary['iol']>;
}) => {
    // Absent on reports published before the outcome existed; those rendered
    // the deaths inside `reDowned`, so the card simply shows two outcomes.
    const hasDeathOutcome = typeof iol.diedUnderIol === 'number';
    const diedUnderIol = iol.diedUnderIol ?? 0;
    const total = iol.survived + iol.reDowned + diedUnderIol;
    const survivedPercent = total > 0 ? Math.round((iol.survived / total) * 100) : null;
    const buckets = iol.timeToReDownBuckets ?? null;
    const peak = buckets ? Math.max(...buckets) : 0;

    return (
        <div className="rounded-[var(--radius-md)] p-3" style={{ border: '1px solid var(--border-default)' }}>
            <div className="flex items-baseline gap-2 mb-2.5">
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                    Illusion of Life
                </div>
                <div className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {iol.revives} {iol.revives === 1 ? 'revive' : 'revives'}
                </div>
            </div>

            {total > 0 && (
                <>
                    <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-subtle)' }}>
                        <div style={{ width: `${(iol.survived / total) * 100}%`, background: 'var(--status-success)' }} />
                        <div style={{ width: `${(iol.reDowned / total) * 100}%`, background: 'var(--status-error)' }} />
                        <div style={{ width: `${(diedUnderIol / total) * 100}%`, background: DIED_UNDER_IOL_COLOR }} />
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--status-success)' }} />
                            Survived the fight {iol.survived}{survivedPercent === null ? '' : ` (${survivedPercent}%)`}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: 'var(--status-error)' }} />
                            Re-downed {iol.reDowned}
                            {iol.medianTimeToReDownMs !== null ? ` — median ${formatSeconds(iol.medianTimeToReDownMs)}` : ''}
                        </span>
                        {hasDeathOutcome && (
                            <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: DIED_UNDER_IOL_COLOR }} />
                                Died under IoL {diedUnderIol}
                            </span>
                        )}
                    </div>
                </>
            )}

            {buckets && iol.reDowned > 0 && (
                <div className="mt-3.5 flex items-end gap-2">
                    {buckets.map((count, index) => (
                        <div key={RE_DOWN_BUCKET_LABELS[index]} className="flex-1 flex flex-col items-center gap-1">
                            <div className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{count}</div>
                            {/* Heights are relative to the tallest bucket, so a
                                histogram of small counts is still readable. */}
                            <div
                                className="w-full rounded-sm"
                                style={{
                                    height: `${peak > 0 ? Math.max(2, (count / peak) * 56) : 2}px`,
                                    background: count > 0 ? 'var(--status-error)' : 'var(--border-subtle)',
                                }}
                            />
                            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{RE_DOWN_BUCKET_LABELS[index]}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
                Time from standing up under Illusion of Life to going down again. Players who never went down again count as survived and are not in the histogram.
                {hasDeathOutcome && ' Died under IoL means the player skipped the downed state and died outright before going down again. Only IoL cast by squad members is seen — IoL from mesmers outside the squad is not counted.'}
            </div>
        </div>
    );
};

export const ReviveDetailSection = ({ reviveDetail }: ReviveDetailSectionProps) => {
    const [sort, setSort] = useState<{ key: PlayerSortKey; dir: 'asc' | 'desc' }>({ key: 'totalRevives', dir: 'desc' });
    const [viewMode, setViewMode] = useState<ViewMode>('total');
    const [expandedUtilities, setExpandedUtilities] = useState<ReadonlySet<number>>(() => new Set());

    const toggleUtility = (skillId: number) => {
        setExpandedUtilities((prev) => {
            const next = new Set(prev);
            if (!next.delete(skillId)) next.add(skillId);
            return next;
        });
    };

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
        // `null` means "no rate to compare" — a row with no known active time in
        // a rate mode. Those rows sort last in BOTH directions, handled ahead of
        // the direction flip below: a numeric sentinel would put them first
        // ascending, presenting unmeasurable rows as the lowest rates.
        const resolveSortValue = (row: RevivePlayerRow): number | string | null => {
            if (sort.key === 'account') return row.account;
            const raw = Number((row as any)[sort.key] || 0);
            if (RATE_FIELDS.has(sort.key) && viewMode !== 'total') {
                return resolveCountValue(raw, viewMode, totalSecondsFor(row)) ?? null;
            }
            return raw;
        };
        rows.sort((a: RevivePlayerRow, b: RevivePlayerRow) => {
            const av = resolveSortValue(a);
            const bv = resolveSortValue(b);
            if (av === null || bv === null) {
                if (av !== null) return -1;
                if (bv !== null) return 1;
                return String(a.account || '').localeCompare(String(b.account || ''));
            }
            if (typeof av === 'string' || typeof bv === 'string') {
                const diff = String(av).localeCompare(String(bv));
                return sort.dir === 'desc' ? -diff : diff;
            }
            const diff = av - bv;
            if (diff !== 0) return sort.dir === 'desc' ? -diff : diff;
            return String(a.account || '').localeCompare(String(b.account || ''));
        });
        return rows;
    }, [players, sort, viewMode]);

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
                            Coverage: {coverage.logsWithData} {coverage.logsWithData === 1 ? 'log' : 'logs'} with revive data. Per-player numbers below only count the logs that carried revive data. {viewMode === 'total'
                                ? 'Totals carry no per-player denominator, so a player present for fewer covered logs is not on equal footing with one who attended more — switch to a rate to compare them.'
                                : 'Rates divide by each player’s own active time over those same logs, so players who attended different numbers of fights are comparable.'}
                        </div>
                        <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                            Utility credit is time-window based: a utility is credited with a stand-up that happens inside its window, with no check on how far away it was. One long-window utility can therefore be credited with several stand-ups, so Utility Revives and Revives per Cast read on the generous side.
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
                                        const seconds = totalSecondsFor(row);
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
                                <div className={`grid ${UTILITY_GRID} gap-2 px-3 py-2 text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)]`} style={{ borderBottom: '1px solid var(--border-default)' }}>
                                    <div>Utility</div>
                                    <div className="text-right">Casts</div>
                                    <div className="text-right">Revives</div>
                                    <div className="text-right">Revives per Cast</div>
                                </div>
                                {utilities.map((utility) => (
                                    <UtilityRow
                                        key={utility.skillId}
                                        utility={utility}
                                        expanded={expandedUtilities.has(utility.skillId)}
                                        onToggle={() => toggleUtility(utility.skillId)}
                                    />
                                ))}
                            </>
                        )}
                    </div>

                    {iol && <IllusionOfLifeCard iol={iol} />}
                </div>
            )}
        </div>
    );
};
