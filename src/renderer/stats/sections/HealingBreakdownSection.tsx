import { useEffect, useMemo, useState } from 'react';
import { Maximize2, X, ListTree } from 'lucide-react';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { InlineIconLabel } from '../ui/StatsViewShared';
import type { PlayerHealingBreakdown } from '../statsTypes';
import { useStatsSharedContext } from '../StatsViewContext';

type HealingBreakdownSectionProps = {
    healingBreakdownPlayers: PlayerHealingBreakdown[];
};

type MetricMode = 'healing' | 'barrier';

export const HealingBreakdownSection = ({
    healingBreakdownPlayers
}: HealingBreakdownSectionProps) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, renderProfessionIcon, formatWithCommas } = useStatsSharedContext();
    const sectionId = 'healing-breakdown';
    const isExpanded = expandedSection === sectionId;
    const [metricMode, setMetricMode] = useState<MetricMode>('healing');
    const [playerFilter, setPlayerFilter] = useState('');
    const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(null);
    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: 'asc' | 'desc' }>({ columnId: 'total', dir: 'desc' });

    const getPlayerTotal = (player: PlayerHealingBreakdown) =>
        metricMode === 'healing' ? player.totalHealing : player.totalBarrier;
    const getPlayerSkills = (player: PlayerHealingBreakdown) =>
        metricMode === 'healing' ? player.healingSkills : player.barrierSkills;

    const filteredPlayers = useMemo(() => {
        const term = playerFilter.trim().toLowerCase();
        const source = !term
            ? healingBreakdownPlayers
            : healingBreakdownPlayers.filter((player) =>
                String(player.displayName || '').toLowerCase().includes(term)
                || String(player.account || '').toLowerCase().includes(term)
                || String(player.profession || '').toLowerCase().includes(term)
            );
        return [...source].sort((a, b) => {
            const delta = getPlayerTotal(b) - getPlayerTotal(a);
            if (delta !== 0) return delta;
            return String(a.displayName || '').localeCompare(String(b.displayName || ''));
        });
    }, [healingBreakdownPlayers, playerFilter, metricMode]);

    const selectedPlayer = useMemo(() => {
        if (!selectedPlayerKey) return null;
        return filteredPlayers.find((player) => player.key === selectedPlayerKey) || null;
    }, [filteredPlayers, selectedPlayerKey]);

    useEffect(() => {
        if (filteredPlayers.length === 0) {
            if (selectedPlayerKey !== null) setSelectedPlayerKey(null);
            return;
        }
        if (selectedPlayerKey && !filteredPlayers.some((player) => player.key === selectedPlayerKey)) {
            setSelectedPlayerKey(null);
        }
    }, [filteredPlayers, selectedPlayerKey]);

    return (
        <div
            className={`stats-share-exclude ${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex items-center gap-2 mb-3.5">
                <ListTree className="w-4 h-4 shrink-0" style={{ color: 'var(--section-healing)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Healing Breakdown</h3>
                <div className="ml-auto flex items-center gap-2">
                    <PillToggleGroup
                        value={metricMode}
                        onChange={(value) => setMetricMode(value as MetricMode)}
                        options={[
                            { value: 'healing', label: 'Healing' },
                            { value: 'barrier', label: 'Barrier' }
                        ]}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
                    <button
                        type="button"
                        onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                        className="flex items-center justify-center w-[26px] h-[26px]"
                        style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                        aria-label={isExpanded ? 'Close Healing Breakdown' : 'Expand Healing Breakdown'}
                        title={isExpanded ? 'Close' : 'Expand'}
                    >
                        {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                    </button>
                </div>
            </div>

            {healingBreakdownPlayers.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No healing breakdown data available for the current selection.
                </div>
            ) : isExpanded ? (
                <div className="rounded-[var(--radius-md)] overflow-hidden">
                    {(() => {
                        const modeLabel = metricMode === 'healing' ? 'Healing' : 'Barrier';
                        const denseColumns = [
                            { id: 'total', label: 'Total', align: 'right' as const, minWidth: 90 },
                            { id: 'hits', label: 'Hits', align: 'right' as const, minWidth: 70 },
                            { id: 'avg', label: 'Avg', align: 'right' as const, minWidth: 70 },
                            { id: 'max', label: 'Max', align: 'right' as const, minWidth: 70 },
                            { id: 'pct', label: 'Pct', align: 'right' as const, minWidth: 60 },
                        ];
                        const rows = filteredPlayers
                            .filter((player) => getPlayerTotal(player) > 0)
                            .map((player) => {
                                const total = getPlayerTotal(player);
                                const skills = getPlayerSkills(player);
                                const totalHits = skills.reduce((sum, s) => sum + s.hits, 0);
                                const maxHit = skills.reduce((best, s) => Math.max(best, s.max), 0);
                                const avg = totalHits > 0 ? Math.round(total / totalHits) : 0;
                                const grandTotal = filteredPlayers.reduce((sum, p) => sum + getPlayerTotal(p), 0);
                                const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
                                return {
                                    player,
                                    numericValues: { total, hits: totalHits, avg, max: maxHit, pct },
                                    values: {
                                        total: formatWithCommas(total, 0),
                                        hits: formatWithCommas(totalHits, 0),
                                        avg: formatWithCommas(avg, 0),
                                        max: formatWithCommas(maxHit, 0),
                                        pct: `${formatWithCommas(pct, 1)}%`,
                                    }
                                };
                            })
                            .sort((a, b) => {
                                const aVal = a.numericValues[denseSort.columnId as keyof typeof a.numericValues] ?? 0;
                                const bVal = b.numericValues[denseSort.columnId as keyof typeof b.numericValues] ?? 0;
                                const diff = denseSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
                                return diff || String(a.player.displayName || '').localeCompare(String(b.player.displayName || ''));
                            });
                        return (
                            <DenseStatsTable
                                title={`Healing Breakdown - ${modeLabel}`}
                                subtitle={modeLabel}
                                sortColumnId={denseSort.columnId}
                                sortDirection={denseSort.dir}
                                onSortColumn={(columnId) => {
                                    setDenseSort((prev) => ({
                                        columnId,
                                        dir: prev.columnId === columnId ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                    }));
                                }}
                                columns={denseColumns}
                                rows={rows.map((entry, idx) => ({
                                    id: `${entry.player.key}-${idx}`,
                                    label: (
                                        <>
                                            <span className="text-[color:var(--text-muted)] font-mono">{idx + 1}</span>
                                            {renderProfessionIcon(entry.player.profession, entry.player.professionList, 'w-4 h-4')}
                                            <span className="truncate">{entry.player.displayName}</span>
                                        </>
                                    ),
                                    values: entry.values
                                }))}
                            />
                        );
                    })()}
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[280px_1fr] items-stretch">
                    <div className="px-3 pt-3 pb-2 flex flex-col min-h-0 h-[420px]">
                        <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-3">
                            Squad Players
                        </div>
                        <div className="mb-2">
                            <input
                                type="search"
                                value={playerFilter}
                                onChange={(event) => setPlayerFilter(event.target.value)}
                                placeholder="Search player or account"
                                className="w-full rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-2.5 py-1.5 text-xs text-[color:var(--text-primary)] placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                            />
                        </div>
                        <div className="space-y-1 pr-1 flex-1 min-h-0 overflow-y-auto">
                            {filteredPlayers.length === 0 ? (
                                <div className="px-3 py-4 text-xs text-[color:var(--text-muted)] italic">
                                    No players match the filter.
                                </div>
                            ) : (
                                filteredPlayers.map((player) => {
                                    const isSelected = selectedPlayerKey === player.key;
                                    return (
                                        <button
                                            key={player.key}
                                            type="button"
                                            onClick={() => setSelectedPlayerKey(player.key)}
                                            className={`w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-xs font-semibold border transition-colors ${isSelected
                                                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                : 'bg-[var(--bg-hover)] text-[color:var(--text-secondary)] border-[color:var(--border-default)] hover:text-[color:var(--text-primary)]'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {renderProfessionIcon(player.profession, player.professionList, 'w-3.5 h-3.5')}
                                                        <div className="truncate min-w-0">{player.displayName}</div>
                                                    </div>
                                                </div>
                                                <div className="text-xs font-mono text-emerald-200 shrink-0">
                                                    {formatWithCommas(getPlayerTotal(player), 0)}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="space-y-2 flex flex-col h-[420px]">
                        <div className="overflow-hidden stats-share-table flex-1 min-h-0 flex flex-col">
                            {!selectedPlayer ? (
                                <div className="h-full flex items-center justify-center text-xs text-[color:var(--text-muted)]">
                                    Select a player to view skill breakdown.
                                </div>
                            ) : (() => {
                                const skills = getPlayerSkills(selectedPlayer);
                                const grandTotal = getPlayerTotal(selectedPlayer);
                                const modeLabel = metricMode === 'healing' ? 'Healing' : 'Barrier';
                                return (
                                    <div className="h-full flex flex-col">
                                        <div className="stats-table-shell__head-stack">
                                            <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-hover)]">
                                                <div className="min-w-0 text-sm text-[color:var(--text-primary)]">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--text-secondary)] shrink-0">Skill Totals /</span>
                                                        {renderProfessionIcon(selectedPlayer.profession, selectedPlayer.professionList, 'w-4 h-4')}
                                                        <span className="truncate font-semibold">{selectedPlayer.displayName}</span>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-[color:var(--text-secondary)] uppercase tracking-[0.18em]">
                                                    {modeLabel} / {skills.length} {skills.length === 1 ? 'skill' : 'skills'}
                                                </div>
                                            </div>
                                            <div className="stats-table-column-header grid grid-cols-[2fr_0.6fr_0.8fr_0.6fr_0.6fr_0.5fr] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] px-4 py-2 border-b border-[color:var(--border-default)]">
                                                <div>Skill</div>
                                                <div className="text-right">Hits</div>
                                                <div className="text-right">Total</div>
                                                <div className="text-right">Avg</div>
                                                <div className="text-right">Max</div>
                                                <div className="text-right">Pct</div>
                                            </div>
                                        </div>
                                        <div className="stats-table-shell__rows flex-1 min-h-0 overflow-y-auto">
                                            {skills.length === 0 ? (
                                                <div className="h-full flex items-center justify-center text-xs text-[color:var(--text-muted)]">
                                                    No {modeLabel.toLowerCase()} skills for this player.
                                                </div>
                                            ) : (
                                                skills.map((skill, idx) => {
                                                    const avg = skill.hits > 0 ? Math.round(skill.total / skill.hits) : 0;
                                                    const pct = grandTotal > 0 ? (skill.total / grandTotal) * 100 : 0;
                                                    return (
                                                        <div
                                                            key={`${skill.id}-${idx}`}
                                                            className="grid grid-cols-[2fr_0.6fr_0.8fr_0.6fr_0.6fr_0.5fr] gap-1 px-4 py-2 text-xs text-[color:var(--text-primary)] border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]"
                                                        >
                                                            <div className="min-w-0">
                                                                <InlineIconLabel name={skill.name} iconUrl={skill.icon} iconClassName="h-4 w-4" />
                                                            </div>
                                                            <div className="text-right font-mono text-[color:var(--text-secondary)]">{formatWithCommas(skill.hits, 0)}</div>
                                                            <div className="text-right font-mono text-[color:var(--text-secondary)]">{formatWithCommas(skill.total, 0)}</div>
                                                            <div className="text-right font-mono text-[color:var(--text-secondary)]">{formatWithCommas(avg, 0)}</div>
                                                            <div className="text-right font-mono text-[color:var(--text-secondary)]">{formatWithCommas(skill.max, 0)}</div>
                                                            <div className="text-right font-mono text-[color:var(--text-secondary)]">{formatWithCommas(pct, 1)}%</div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
