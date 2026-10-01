import type { CSSProperties } from 'react';
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
        <>
            <tr>
                <td className="axi-table__who">
                    {expandable ? (
                        <button
                            type="button"
                            onClick={onToggle}
                            aria-expanded={expanded}
                            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${utility.name} casters`}
                            className="axi-action flex items-center gap-1.5 min-w-0 text-left"
                        >
                            <ChevronRight
                                className="w-3 h-3 flex-shrink-0 transition-transform axi-ink-dim"
                                style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
                            />
                            <UtilityName utility={utility} />
                        </button>
                    ) : (
                        <span className="flex items-center gap-1.5 min-w-0 pl-[calc(0.75rem+0.375rem)]">
                            <UtilityName utility={utility} />
                        </span>
                    )}
                </td>
                <td className="axi-table__num">{utility.casts}</td>
                <td className="axi-table__num">{utility.revives}</td>
                <td className="axi-table__num">{formatRatio(utility.revivesPerCast, utility.casts === 0)}</td>
            </tr>
            {expanded && expandable && (
                <>
                    <tr className="axi-ink-faint">
                        <th scope="col" className="pl-8 font-normal">Caster</th>
                        <th scope="col" className="axi-table__num font-normal">Casts</th>
                        <th scope="col" className="axi-table__num font-normal">Revives</th>
                        <th scope="col" className="axi-table__num font-normal">Revives per Cast</th>
                    </tr>
                    {casters.map((caster) => (
                        <tr key={caster.key} className="axi-ink-dim">
                            <td className="axi-table__who">
                                <span className="flex items-center gap-1.5 min-w-0 pl-5">
                                    {renderProfessionIcon(caster.profession, undefined, 'w-3.5 h-3.5 flex-shrink-0')}
                                    <span className="truncate">{caster.account}</span>
                                </span>
                            </td>
                            <td className="axi-table__num">{caster.casts}</td>
                            <td className="axi-table__num">{caster.revives}</td>
                            <td className="axi-table__num">{formatRatio(caster.revivesPerCast, caster.casts === 0)}</td>
                        </tr>
                    ))}
                </>
            )}
        </>
    );
};

const UtilityName = ({ utility }: { utility: ReviveUtilityRow }) => (
    <>
        {utility.icon && (
            <img
                src={utility.icon}
                alt=""
                aria-hidden="true"
                className="w-5 h-5 flex-shrink-0"
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
        <div className="revive-iol axi-panel [--axi-panel-pad:12px]">
            <div className="flex items-baseline gap-2 mb-2.5">
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--axi-text-dim)' }}>
                    Illusion of Life
                </div>
                <div className="text-[11px] font-mono" style={{ color: 'var(--axi-text-faint)' }}>
                    {iol.revives} {iol.revives === 1 ? 'revive' : 'revives'}
                </div>
            </div>

            {total > 0 && (
                <>
                    <div className="revive-iol__bar axi-meter">
                        <div className="axi-meter__fill" style={{ '--axi-meter-v': `${(iol.survived / total) * 100}%`, '--axi-series': 'var(--axi-ok)' } as CSSProperties} />
                        <div className="axi-meter__fill" style={{ '--axi-meter-v': `${(iol.reDowned / total) * 100}%`, '--axi-series': 'var(--axi-danger)' } as CSSProperties} />
                        <div className="axi-meter__fill" style={{ '--axi-meter-v': `${(diedUnderIol / total) * 100}%`, '--axi-series': DIED_UNDER_IOL_COLOR } as CSSProperties} />
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs" style={{ color: 'var(--axi-text-dim)' }}>
                        <span className="flex items-center gap-1.5">
                            <span className="axi-diamond axi-diamond--ok" />
                            Survived the fight {iol.survived}{survivedPercent === null ? '' : ` (${survivedPercent}%)`}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="axi-diamond axi-diamond--danger" />
                            Re-downed {iol.reDowned}
                            {iol.medianTimeToReDownMs !== null ? ` — median ${formatSeconds(iol.medianTimeToReDownMs)}` : ''}
                        </span>
                        {hasDeathOutcome && (
                            <span className="flex items-center gap-1.5">
                                <span className="axi-diamond" style={{ background: DIED_UNDER_IOL_COLOR }} />
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
                            <div className="text-[10px] font-mono" style={{ color: 'var(--axi-text-dim)' }}>{count}</div>
                            {/* Heights are relative to the tallest bucket, so a
                                histogram of small counts is still readable. */}
                            <div
                                className="revive-iol__hist-bar w-full"
                                style={{
                                    border: 'var(--axi-border-hairline) solid var(--axi-ink-line)',
                                    height: `${peak > 0 ? Math.max(2, (count / peak) * 56) : 2}px`,
                                    background: count > 0 ? 'var(--axi-danger)' : 'var(--axi-rule)',
                                }}
                            />
                            <div className="text-[10px]" style={{ color: 'var(--axi-text-faint)' }}>{RE_DOWN_BUCKET_LABELS[index]}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="text-[11px] mt-3" style={{ color: 'var(--axi-text-faint)' }}>
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
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>
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
                        />
                    </div>
                )}
            </div>

            {!reviveDetail ? (
                <div className="axi-empty">
                    No revive data available for this selection.
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {coverage.logsWithoutData > 0 && (
                        <div
                            className="revive-note axi-well axi-well--sm text-xs axi-ink-dim"
                        >
                            {coverage.logsWithoutData} {coverage.logsWithoutData === 1 ? 'log' : 'logs'} predate revive tracking and are excluded from these counts.
                        </div>
                    )}

                    <div className="revive-summary axi-well">
                        <div className="text-sm" style={{ color: 'var(--axi-text)' }}>
                            {`Downs ${squad.downs} · Recovered ${squad.recovered} (${recoveredRatePercent === null ? '—' : `${recoveredRatePercent}%`}) · Died ${squad.died}`}
                        </div>
                        <div className="text-sm mt-1" style={{ color: 'var(--axi-text-dim)' }}>
                            {`Hand ${squad.hand} · Utility ${squad.utility} · Self ${squad.self} · Unattributed ${squad.unattributed}`}
                        </div>
                        <div className="text-[11px] mt-2" style={{ color: 'var(--axi-text-faint)' }}>
                            Coverage: {coverage.logsWithData} {coverage.logsWithData === 1 ? 'log' : 'logs'} with revive data. Per-player numbers below only count the logs that carried revive data. {viewMode === 'total'
                                ? 'Totals carry no per-player denominator, so a player present for fewer covered logs is not on equal footing with one who attended more — switch to a rate to compare them.'
                                : 'Rates divide by each player’s own active time over those same logs, so players who attended different numbers of fights are comparable.'}
                        </div>
                        <div className="text-[11px] mt-1.5" style={{ color: 'var(--axi-text-faint)' }}>
                            Utility credit is time-window based: a utility is credited with a stand-up that happens inside its window, with no check on how far away it was. One long-window utility can therefore be credited with several stand-ups, so Utility Revives and Revives per Cast read on the generous side.
                        </div>
                    </div>

                    <div className="revive-table axi-panel [--axi-panel-pad:0] overflow-hidden">
                        <div className="axi-eyebrow px-3 py-2 border-b axi-edge-rule">Players</div>
                        {sortedPlayers.length === 0 ? (
                            <div className="axi-empty m-3">No player revive data available.</div>
                        ) : (
                            <div className="axi-table__scroll max-h-96 overflow-y-auto">
                                <table className="axi-table axi-table--dense axi-table--sticky w-full">
                                    <thead>
                                        <tr>
                                            {PLAYER_COLUMNS.map((col) => (
                                                <th
                                                    key={col.id}
                                                    scope="col"
                                                    aria-sort={sort.key === col.id ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                                                    className={`${col.align === 'right' ? 'axi-table__num' : ''}${sort.key === col.id ? ' axi-table__cell--sorted' : ''}`}
                                                >
                                                    <button type="button" onClick={() => toggleSort(col.id)} className="axi-table__sort">
                                                        {col.label}{sort.key === col.id ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                                                    </button>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedPlayers.map((row) => {
                                            const seconds = totalSecondsFor(row);
                                            return (
                                                <tr key={row.key}>
                                                    <td className="axi-table__who">
                                                        <span className="flex items-center gap-1.5 min-w-0">
                                                            {renderProfessionIcon(row.profession, undefined, 'w-4 h-4 flex-shrink-0')}
                                                            <span className="truncate">{row.account}</span>
                                                        </span>
                                                    </td>
                                                    <td className="axi-table__num">{formatCountValue(row.attempts, viewMode, seconds)}</td>
                                                    <td className="axi-table__num">{formatSeconds(row.attemptTimeMs)}</td>
                                                    <td className="axi-table__num">{formatCountValue(row.handRevives, viewMode, seconds)}</td>
                                                    <td className="axi-table__num">{formatPercent(row.successRate, row.attempts === 0)}</td>
                                                    <td className="axi-table__num">{formatCountValue(row.utilityCasts, viewMode, seconds)}</td>
                                                    <td className="axi-table__num">{formatCountValue(row.utilityRevives, viewMode, seconds)}</td>
                                                    <td className="axi-table__num">{formatRatio(row.revivesPerCast, row.utilityCasts === 0)}</td>
                                                    <td className="axi-table__num">{formatCountValue(row.assists, viewMode, seconds)}</td>
                                                    <td className="axi-table__num">{formatCountValue(row.totalRevives, viewMode, seconds)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="revive-table axi-panel [--axi-panel-pad:0] overflow-hidden">
                        <div className="axi-eyebrow px-3 py-2 border-b axi-edge-rule">Utilities</div>
                        {utilities.length === 0 ? (
                            <div className="axi-empty m-3">No utility revives recorded.</div>
                        ) : (
                            <div className="axi-table__scroll">
                                <table className="axi-table axi-table--dense w-full">
                                    <thead>
                                        <tr>
                                            <th scope="col">Utility</th>
                                            <th scope="col" className="axi-table__num">Casts</th>
                                            <th scope="col" className="axi-table__num">Revives</th>
                                            <th scope="col" className="axi-table__num">Revives per Cast</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {utilities.map((utility) => (
                                            <UtilityRow
                                                key={utility.skillId}
                                                utility={utility}
                                                expanded={expandedUtilities.has(utility.skillId)}
                                                onToggle={() => toggleUtility(utility.skillId)}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {iol && <IllusionOfLifeCard iol={iol} />}
                </div>
            )}
        </div>
    );
};
