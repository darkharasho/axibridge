import { useEffect, useMemo, useState } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { ListTree, AlertTriangle } from 'lucide-react';
import { DenseStatsTable } from '../ui/DenseStatsTable';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { InlineIconLabel } from '../ui/StatsViewShared';
import type { PlayerHealingBreakdown } from '../statsTypes';
import { useStatsSharedContext } from '../StatsViewContext';
import { expandedPaneProps } from './expandedPane';

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

    const PARTIAL_TOOLTIP = 'Partial value — this player did not have the arcdps heal addon loaded. The number reflects only heals that addon-equipped squadmates received from them (cross-referenced with cast events) plus combo/boon healing tracked natively. Heals delivered to other non-addon players are not counted.';

    const PartialMarker = ({ className = '' }: { className?: string }) => (
        <AlertTriangle
            className={`w-3 h-3 shrink-0 ${className}`}
            style={{ color: 'rgba(245, 158, 11, 0.85)' }}
            aria-label="Partial data — no heal addon"
        />
    );

    const playersWithoutAddon = useMemo(
        () => healingBreakdownPlayers.filter((player) => !player.hasHealAddon).length,
        [healingBreakdownPlayers]
    );

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
        <div {...expandedPaneProps(isExpanded, expandedSectionClosing)}>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <ListTree className="w-4 h-4 shrink-0" style={{ color: 'var(--section-healing)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Healing Breakdown</h3>
                {playersWithoutAddon > 0 && (
                    <span
                        className="inline-flex items-center gap-1 text-[10px] font-medium"
                        style={{ color: 'rgba(245, 158, 11, 0.75)' }}
                        title={`${playersWithoutAddon} squad ${playersWithoutAddon === 1 ? 'member did' : 'members did'} not have the arcdps heal addon loaded. Their numbers are partial — only buff healing observed by addon-equipped squadmates is counted.`}
                    >
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {playersWithoutAddon} partial
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <PillToggleGroup
                        value={metricMode}
                        onChange={(value) => setMetricMode(value as MetricMode)}
                        options={[
                            { value: 'healing', label: 'Healing' },
                            { value: 'barrier', label: 'Barrier' }
                        ]}
                    />
                    <SectionExpandButton
                        expanded={isExpanded}
                        onToggle={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                        section="Healing Breakdown"
                    />
                </div>
            </div>

            {healingBreakdownPlayers.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No healing breakdown data available for the current selection.
                </div>
            ) : isExpanded ? (
                (() => {
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
                                            {!entry.player.hasHealAddon && (
                                                <span title={PARTIAL_TOOLTIP}><PartialMarker /></span>
                                            )}
                                        </>
                                    ),
                                    values: entry.values
                                }))}
                            />
                        );
                    })()
            ) : (
                <div className="grid lg:grid-cols-[280px_1fr] gap-0 h-[500px]">
                    <div className="pr-3 flex flex-col min-h-0" style={{ borderRight: '1px solid var(--border-subtle)' }}>
                        <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-3">
                            Squad Players
                        </div>
                        <div className="mb-2">
                            <input
                                type="search"
                                value={playerFilter}
                                onChange={(event) => setPlayerFilter(event.target.value)}
                                placeholder="Search player or account"
                                className="axi-input"
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
                                            className="axi-rail__item"
                                            aria-current={isSelected ? 'location' : undefined}
                                        >
                                            <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                                <div className="min-w-0 flex items-center gap-2">
                                                    {renderProfessionIcon(player.profession, player.professionList, 'w-3.5 h-3.5')}
                                                    <div className="truncate min-w-0">{player.displayName}</div>
                                                </div>
                                                <div
                                                    className="shrink-0 flex items-center justify-end gap-1.5 text-xs font-mono"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                    title={!player.hasHealAddon ? PARTIAL_TOOLTIP : undefined}
                                                >
                                                    <span>{formatWithCommas(getPlayerTotal(player), 0)}</span>
                                                    {!player.hasHealAddon && <PartialMarker />}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="pl-3 flex flex-col min-h-0">
                        <div className="overflow-hidden flex-1 min-h-0 flex flex-col">
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
                                        <div className="stats-table-shell__header">
                                            <div className="flex items-center justify-between px-4 py-3">
                                                <div className="min-w-0 text-sm text-[color:var(--text-primary)]">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--text-secondary)] shrink-0">Skill Totals /</span>
                                                        {renderProfessionIcon(selectedPlayer.profession, selectedPlayer.professionList, 'w-4 h-4')}
                                                        <span className="truncate font-semibold">{selectedPlayer.displayName}</span>
                                                        {!selectedPlayer.hasHealAddon && (
                                                            <span title={PARTIAL_TOOLTIP}><PartialMarker /></span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="text-xs text-[color:var(--text-secondary)] uppercase tracking-[0.18em]">
                                                    {modeLabel} / {skills.length} {skills.length === 1 ? 'skill' : 'skills'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="axi-table__scroll flex-1 min-h-0">
                                            <table className="axi-table axi-table--fixed axi-table--sticky axi-table--dense">
                                                <colgroup>
                                                    <col style={{ width: '38.0952%' }} />
                                                    <col style={{ width: '11.4286%' }} />
                                                    <col style={{ width: '15.2381%' }} />
                                                    <col style={{ width: '11.4286%' }} />
                                                    <col style={{ width: '11.4286%' }} />
                                                    <col style={{ width: '9.5238%' }} />
                                                </colgroup>
                                                <thead>
                                                    <tr>
                                                        <th scope="col">Skill</th>
                                                        <th scope="col">Hits</th>
                                                        <th scope="col">Total</th>
                                                        <th scope="col">Avg</th>
                                                        <th scope="col">Max</th>
                                                        <th scope="col">Pct</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {skills.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={6} className="axi-ink-muted text-center">
                                                                No {modeLabel.toLowerCase()} skills for this player.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        skills.map((skill, idx) => {
                                                            const avg = skill.hits > 0 ? Math.round(skill.total / skill.hits) : 0;
                                                            const pct = grandTotal > 0 ? (skill.total / grandTotal) * 100 : 0;
                                                            return (
                                                                <tr key={`${skill.id}-${idx}`}>
                                                                    <th scope="row">
                                                                        <span className="axi-table__who">
                                                                            <InlineIconLabel name={skill.name} iconUrl={skill.icon} iconClassName="h-4 w-4" />
                                                                        </span>
                                                                    </th>
                                                                    <td>{formatWithCommas(skill.hits, 0)}</td>
                                                                    <td className="axi-table__num">{formatWithCommas(skill.total, 0)}</td>
                                                                    <td>{formatWithCommas(avg, 0)}</td>
                                                                    <td>{formatWithCommas(skill.max, 0)}</td>
                                                                    <td>{formatWithCommas(pct, 1)}%</td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
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
