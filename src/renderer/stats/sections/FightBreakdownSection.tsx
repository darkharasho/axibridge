import { useMemo, type ReactNode } from 'react';
import { Maximize2, X, Swords } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { CountClassTooltip } from '../ui/StatsViewShared';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { parseTimestamp } from '../utils/timestampUtils';
import { useStatsSharedContext } from '../StatsViewContext';

type FightBreakdownSectionProps = {
    fightBreakdownTab: 'sizes' | 'outcomes' | 'damage' | 'barrier';
    setFightBreakdownTab: (value: 'sizes' | 'outcomes' | 'damage' | 'barrier') => void;
};

export const FightBreakdownSection = ({
    fightBreakdownTab,
    setFightBreakdownTab
}: FightBreakdownSectionProps) => {
    const { stats, expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection } = useStatsSharedContext();
    const sectionId = 'fight-breakdown';
    const isExpanded = expandedSection === sectionId;
    const fights = Array.isArray(stats?.fightBreakdown) ? stats.fightBreakdown : [];

    const teamColumnIds = useMemo(() => {
        const totals = new Map<string, number>();
        fights.forEach((fight: any) => {
            const rows = Array.isArray(fight?.teamBreakdown) ? fight.teamBreakdown : [];
            rows.forEach((entry: any) => {
                const id = String(entry?.teamId ?? '').trim();
                const count = Number(entry?.count || 0);
                if (!id || !Number.isFinite(count) || count <= 0) return;
                totals.set(id, (totals.get(id) || 0) + count);
            });
        });
        return Array.from(totals.entries())
            .sort((a, b) => {
                const countDelta = b[1] - a[1];
                if (countDelta !== 0) return countDelta;
                return a[0].localeCompare(b[0], undefined, { numeric: true });
            })
            .map(([id]) => id);
    }, [fights]);

    const formatReportLabel = (fight: any) => {
        const tsMs = parseTimestamp(fight?.timestamp);
        const dateLabel = tsMs > 0
            ? new Date(tsMs).toLocaleDateString(undefined, {
                month: '2-digit',
                day: '2-digit'
            }) + ' ' + new Date(tsMs).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit'
            })
            : '--';
        const rawMap = fight?.mapName || fight?.map || 'Unknown Map';
        const mapLabel = String(rawMap)
            .replace(/^Detailed\s*WvW\s*-\s*/i, '')
            .replace(/^World\s*vs\s*World\s*-\s*/i, '')
            .replace(/^WvW\s*-\s*/i, '')
            .trim();
        return `${dateLabel} • ${mapLabel}`;
    };

    const renderReportCell = (fight: any): ReactNode => {
        const label = formatReportLabel(fight);
        if (!fight?.permalink) return <span className="text-[color:var(--text-muted)]">Pending</span>;
        return (
            <button
                onClick={() => {
                    if (fight.permalink && window.electronAPI?.openExternal) {
                        window.electronAPI.openExternal(fight.permalink);
                    } else if (fight.permalink) {
                        window.open(fight.permalink, '_blank');
                    }
                }}
                className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2 block truncate"
            >
                {label}
            </button>
        );
    };

    const denseColumns = useMemo(() => {
        const base = [
            { id: 'duration', label: 'Duration', align: 'left' as const, minWidth: 72 },
            { id: 'outcome', label: 'Outcome', align: 'left' as const, minWidth: 72 },
            { id: 'squad', label: 'Squad', align: 'right' as const, minWidth: 72 },
            { id: 'allies', label: 'Allies', align: 'right' as const, minWidth: 72 },
            { id: 'enemies', label: 'Enemies', align: 'right' as const, minWidth: 72 },
            ...teamColumnIds.map((teamId) => ({
                id: `team-${teamId}`,
                label: `Team ${teamId}`,
                align: 'right' as const,
                minWidth: 72
            })),
            { id: 'alliesDown', label: 'Allies Down', align: 'right' as const, minWidth: 88 },
            { id: 'alliesDead', label: 'Allies Dead', align: 'right' as const, minWidth: 88 },
            { id: 'alliesRevived', label: 'Allies Revived', align: 'right' as const, minWidth: 102 },
            { id: 'rallies', label: 'Rallies', align: 'right' as const, minWidth: 72 },
            { id: 'enemyDowns', label: 'Enemy Downs', align: 'right' as const, minWidth: 88 },
            { id: 'enemyDeaths', label: 'Enemy Deaths', align: 'right' as const, minWidth: 88 },
            { id: 'outgoingDmg', label: 'Outgoing Dmg', align: 'right' as const, minWidth: 110 },
            { id: 'incomingDmg', label: 'Incoming Dmg', align: 'right' as const, minWidth: 110 },
            { id: 'damageDelta', label: 'Damage Delta', align: 'right' as const, minWidth: 98 },
            { id: 'barrierIn', label: 'Barrier Absorb', align: 'right' as const, minWidth: 110 },
            { id: 'barrierOut', label: 'Enemy Barrier Absorb', align: 'right' as const, minWidth: 146 },
            { id: 'barrierDelta', label: 'Barrier Delta', align: 'right' as const, minWidth: 98 }
        ];
        return base;
    }, [teamColumnIds]);

    const denseRows = useMemo(() => {
        return fights.map((fight: any, idx: number) => {
            const damageDelta = Number((fight.totalOutgoingDamage || 0) - (fight.totalIncomingDamage || 0));
            const barrierDelta = Number((fight.outgoingBarrierAbsorbed || 0) - (fight.incomingBarrierAbsorbed || 0));
            const values: Record<string, ReactNode> = {
                duration: fight.duration || '--:--',
                outcome: (
                    <span className={`font-semibold ${
                        fight.isWin === true ? 'text-emerald-300' : fight.isWin === false ? 'text-red-300' : 'text-amber-200'
                    }`}
                    >
                        {fight.isWin === true ? 'Win' : fight.isWin === false ? 'Loss' : 'Unknown'}
                    </span>
                ),
                squad: (
                    <CountClassTooltip
                        count={fight.squadCount ?? 0}
                        classCounts={fight.squadClassCountsFight}
                        label="Squad Classes"
                        className="text-[color:var(--text-primary)]"
                    />
                ),
                allies: (
                    <CountClassTooltip
                        count={fight.allyCount ?? 0}
                        classCounts={fight.allyClassCountsFight}
                        label="Ally Classes"
                        className="text-[color:var(--text-primary)]"
                    />
                ),
                enemies: (
                    <CountClassTooltip
                        count={fight.enemyCount ?? 0}
                        classCounts={fight.enemyClassCounts}
                        label="Enemy Classes"
                        className="text-[color:var(--text-primary)]"
                    />
                ),
                alliesDown: Number(fight.alliesDown ?? 0),
                alliesDead: Number(fight.alliesDead ?? 0),
                alliesRevived: Number(fight.alliesRevived ?? 0),
                rallies: Number(fight.rallies ?? 0),
                enemyDowns: Number(fight.enemyDowns ?? 0),
                enemyDeaths: Number(fight.enemyDeaths ?? 0),
                outgoingDmg: Number(fight.totalOutgoingDamage || 0).toLocaleString(),
                incomingDmg: Number(fight.totalIncomingDamage || 0).toLocaleString(),
                damageDelta: (
                    <span className={damageDelta < 0 ? 'text-red-300' : 'text-emerald-300'}>
                        {damageDelta.toLocaleString()}
                    </span>
                ),
                barrierIn: Number(fight.incomingBarrierAbsorbed || 0).toLocaleString(),
                barrierOut: Number(fight.outgoingBarrierAbsorbed || 0).toLocaleString(),
                barrierDelta: (
                    <span className={barrierDelta < 0 ? 'text-emerald-300' : 'text-red-300'}>
                        {barrierDelta.toLocaleString()}
                    </span>
                )
            };

            teamColumnIds.forEach((teamId) => {
                const rows = Array.isArray(fight.teamBreakdown) ? fight.teamBreakdown : [];
                const entry = rows.find((row: any) => String(row?.teamId ?? '') === teamId);
                values[`team-${teamId}`] = Number(entry?.count || 0);
            });

            return {
                id: String(fight.id || `${fight.label}-${idx}`),
                label: (
                    <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">{idx + 1}</div>
                        {renderReportCell(fight)}
                    </div>
                ),
                values
            };
        });
    }, [fights, teamColumnIds]);

    return (
        <div
            className={`${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div>
                <div className="flex items-center gap-2 mb-3.5">
                    <Swords className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Fight Breakdown</h3>
                    <div className="ml-auto flex items-center gap-2">
                        {!isExpanded && (
                            <PillToggleGroup
                                value={fightBreakdownTab}
                                onChange={setFightBreakdownTab}
                                options={[
                                    { value: 'sizes', label: 'Sizes' },
                                    { value: 'outcomes', label: 'Outcome' },
                                    { value: 'damage', label: 'Damage' },
                                    { value: 'barrier', label: 'Barrier' }
                                ]}
                                activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                                inactiveClassName="text-[color:var(--text-secondary)]"
                            />
                        )}
                        <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                            {fights.length} Fights
                        </span>
                        <button
                            type="button"
                            onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                            className="flex items-center justify-center w-[26px] h-[26px]"
                            style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                            aria-label={isExpanded ? 'Close Fight Breakdown' : 'Expand Fight Breakdown'}
                            title={isExpanded ? 'Close' : 'Expand'}
                        >
                            {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                        </button>
                    </div>
                </div>
                {fights.length === 0 ? (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No fight data available</div>
                ) : isExpanded ? (
                    <DenseStatsTable
                        title="Fight Breakdown (All Columns)"
                        subtitle="Fullscreen dense view combining Sizes, Outcome, Damage, and Barrier metrics."
                        className="fight-breakdown-dense"
                        columns={denseColumns}
                        rows={denseRows}
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <div className="max-h-[360px] overflow-y-auto">
                            <table className="w-full text-xs table-auto min-w-[720px]">
                                <thead>
                                    <tr className="text-[color:var(--text-secondary)] uppercase tracking-widest text-[10px] border-b border-[color:var(--border-default)]">
                                        <th className="text-right py-2 px-2 w-8">#</th>
                                        <th className="text-left py-2 px-3 w-[240px]">Report</th>
                                        <th className="text-left py-2 px-3 w-20">Duration</th>
                                        <th className="text-left py-2 px-3 w-20">Outcome</th>
                                        {fightBreakdownTab === 'sizes' && (
                                            <>
                                                <th className="text-right py-2 px-3">Squad</th>
                                                <th className="text-right py-2 px-3">Allies</th>
                                                <th className="text-right py-2 px-3">Enemies</th>
                                                {teamColumnIds.length === 0 ? (
                                                    <th className="text-right py-2 px-3">Teams</th>
                                                ) : (
                                                    teamColumnIds.map((teamId) => (
                                                        <th key={teamId} className="text-right py-2 px-3">{`Team ${teamId}`}</th>
                                                    ))
                                                )}
                                            </>
                                        )}
                                        {fightBreakdownTab === 'outcomes' && (
                                            <>
                                                <th className="text-right py-2 px-3">Allies Down</th>
                                                <th className="text-right py-2 px-3">Allies Dead</th>
                                                <th className="text-right py-2 px-3">Allies Revived</th>
                                                <th className="text-right py-2 px-3">Rallies</th>
                                                <th className="text-right py-2 px-3">Enemy Downs</th>
                                                <th className="text-right py-2 px-3">Enemy Deaths</th>
                                            </>
                                        )}
                                        {fightBreakdownTab === 'damage' && (
                                            <>
                                                <th className="text-right py-2 px-3">Outgoing Dmg</th>
                                                <th className="text-right py-2 px-3">Incoming Dmg</th>
                                                <th className="text-right py-2 px-3">Delta</th>
                                            </>
                                        )}
                                        {fightBreakdownTab === 'barrier' && (
                                            <>
                                                <th
                                                    className="text-right py-2 px-3"
                                                    title="Incoming damage mitigated by your squad's barrier"
                                                >
                                                    Barrier Absorption
                                                </th>
                                                <th
                                                    className="text-right py-2 px-3"
                                                    title="Outgoing damage mitigated by enemy barrier"
                                                >
                                                    Enemy Barrier Absorption
                                                </th>
                                                <th className="text-right py-2 px-3">Delta</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {fights.map((fight: any, idx: number) => (
                                        <tr key={fight.id || `${fight.label}-${idx}`} className="border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]">
                                            <td className="py-2 px-2 text-right font-mono text-[color:var(--text-muted)] w-8">{idx + 1}</td>
                                            <td className="py-2 px-3 w-[240px]">{renderReportCell(fight)}</td>
                                            <td className="py-2 px-3 text-[color:var(--text-primary)] w-20">{fight.duration || '--:--'}</td>
                                            <td
                                                className={`py-2 px-3 font-semibold ${
                                                    fight.isWin === true
                                                        ? 'text-emerald-300'
                                                        : fight.isWin === false
                                                            ? 'text-red-300'
                                                            : 'text-amber-200'
                                                }`}
                                            >
                                                {fight.isWin === true ? 'Win' : fight.isWin === false ? 'Loss' : 'Unknown'}
                                            </td>
                                            {fightBreakdownTab === 'sizes' && (
                                                <>
                                                    <td className="py-2 px-3 text-right font-mono">
                                                        <CountClassTooltip
                                                            count={fight.squadCount ?? 0}
                                                            classCounts={fight.squadClassCountsFight}
                                                            label="Squad Classes"
                                                            className="text-[color:var(--text-primary)]"
                                                        />
                                                    </td>
                                                    <td className="py-2 px-3 text-right font-mono">
                                                        <CountClassTooltip
                                                            count={fight.allyCount ?? 0}
                                                            classCounts={fight.allyClassCountsFight}
                                                            label="Ally Classes"
                                                            className="text-[color:var(--text-primary)]"
                                                        />
                                                    </td>
                                                    <td className="py-2 px-3 text-right font-mono">
                                                        <CountClassTooltip
                                                            count={fight.enemyCount ?? 0}
                                                            classCounts={fight.enemyClassCounts}
                                                            label="Enemy Classes"
                                                            className="text-[color:var(--text-primary)]"
                                                        />
                                                    </td>
                                                    {teamColumnIds.length === 0 ? (
                                                        <td className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">0</td>
                                                    ) : (
                                                        teamColumnIds.map((teamId) => {
                                                            const rows = Array.isArray(fight.teamBreakdown) ? fight.teamBreakdown : [];
                                                            const entry = rows.find((row: any) => String(row?.teamId ?? '') === teamId);
                                                            return (
                                                                <td key={teamId} className="py-2 px-3 text-right font-mono text-[color:var(--text-primary)]">
                                                                    {Number(entry?.count || 0)}
                                                                </td>
                                                            );
                                                        })
                                                    )}
                                                </>
                                            )}
                                            {fightBreakdownTab === 'outcomes' && (
                                                <>
                                                    <td className="py-2 px-3 text-right font-mono">{fight.alliesDown ?? 0}</td>
                                                    <td className="py-2 px-3 text-right font-mono">{fight.alliesDead ?? 0}</td>
                                                    <td className="py-2 px-3 text-right font-mono">{fight.alliesRevived ?? 0}</td>
                                                    <td className="py-2 px-3 text-right font-mono">{fight.rallies ?? 0}</td>
                                                    <td className="py-2 px-3 text-right font-mono">{fight.enemyDowns ?? 0}</td>
                                                    <td className="py-2 px-3 text-right font-mono">{fight.enemyDeaths ?? 0}</td>
                                                </>
                                            )}
                                            {fightBreakdownTab === 'damage' && (
                                                <>
                                                    <td className="py-2 px-3 text-right font-mono">{Number(fight.totalOutgoingDamage || 0).toLocaleString()}</td>
                                                    <td className="py-2 px-3 text-right font-mono">{Number(fight.totalIncomingDamage || 0).toLocaleString()}</td>
                                                    {(() => {
                                                        const delta = Number((fight.totalOutgoingDamage || 0) - (fight.totalIncomingDamage || 0));
                                                        return (
                                                            <td className={`py-2 px-3 text-right font-mono ${delta < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                                                                {delta.toLocaleString()}
                                                            </td>
                                                        );
                                                    })()}
                                                </>
                                            )}
                                            {fightBreakdownTab === 'barrier' && (
                                                <>
                                                    <td className="py-2 px-3 text-right font-mono">{Number(fight.incomingBarrierAbsorbed || 0).toLocaleString()}</td>
                                                    <td className="py-2 px-3 text-right font-mono">{Number(fight.outgoingBarrierAbsorbed || 0).toLocaleString()}</td>
                                                    {(() => {
                                                        const delta = Number((fight.outgoingBarrierAbsorbed || 0) - (fight.incomingBarrierAbsorbed || 0));
                                                        return (
                                                            <td className={`py-2 px-3 text-right font-mono ${delta < 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                                                {delta.toLocaleString()}
                                                            </td>
                                                        );
                                                    })()}
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
