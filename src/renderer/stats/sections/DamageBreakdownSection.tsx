import { useEffect, useMemo, useState } from 'react';
import { Maximize2, X, BarChart3 } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { InlineIconLabel } from '../ui/StatsViewShared';
import type { PlayerSkillBreakdown } from '../statsTypes';
import { useStatsSharedContext } from '../StatsViewContext';

type DamageBreakdownSectionProps = {
    playerSkillBreakdowns: PlayerSkillBreakdown[];
};

type MetricMode = 'damage' | 'downContribution';

export const DamageBreakdownSection = ({
    playerSkillBreakdowns
}: DamageBreakdownSectionProps) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, renderProfessionIcon, formatWithCommas } = useStatsSharedContext();
    const sectionId = 'damage-breakdown';
    const isExpanded = expandedSection === sectionId;
    const [metricMode, setMetricMode] = useState<MetricMode>('damage');
    const [playerFilter, setPlayerFilter] = useState('');
    const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(null);

    const getSkillMetric = (skill: { damage: number; downContribution: number }) => (
        metricMode === 'damage' ? Number(skill.damage || 0) : Number(skill.downContribution || 0)
    );
    const getPlayerMetricTotal = (player: PlayerSkillBreakdown) => (
        (player.skills || []).reduce((sum, skill) => sum + getSkillMetric(skill), 0)
    );

    const filteredPlayers = useMemo(() => {
        const term = playerFilter.trim().toLowerCase();
        const source = !term
            ? playerSkillBreakdowns
            : playerSkillBreakdowns.filter((player) =>
                String(player.displayName || '').toLowerCase().includes(term)
                || String(player.account || '').toLowerCase().includes(term)
                || String(player.profession || '').toLowerCase().includes(term)
            );
        return [...source].sort((a, b) => {
            const delta = getPlayerMetricTotal(b) - getPlayerMetricTotal(a);
            if (delta !== 0) return delta;
            return String(a.displayName || '').localeCompare(String(b.displayName || ''));
        });
    }, [playerSkillBreakdowns, playerFilter, metricMode]);

    const selectedPlayer = useMemo(() => {
        if (!selectedPlayerKey) return null;
        return filteredPlayers.find((player) => player.key === selectedPlayerKey) || null;
    }, [filteredPlayers, selectedPlayerKey]);

    const skillRows = useMemo(() => {
        if (!selectedPlayer) return [];
        return [...(selectedPlayer.skills || [])]
            .filter((skill) => getSkillMetric(skill) > 0)
            .sort((a, b) => getSkillMetric(b) - getSkillMetric(a))
            .map((skill) => ({
                ...skill,
                value: getSkillMetric(skill)
            }));
    }, [selectedPlayer, metricMode]);
    const selectedPlayerMetricTotal = useMemo(() => {
        if (!selectedPlayer) return 0;
        return getPlayerMetricTotal(selectedPlayer);
    }, [selectedPlayer, metricMode]);

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
                <BarChart3 className="w-4 h-4 shrink-0" style={{ color: 'var(--section-offense)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Damage Breakdown</h3>
                <div className="ml-auto flex items-center gap-2">
                    <PillToggleGroup
                        value={metricMode}
                        onChange={(value) => setMetricMode(value as MetricMode)}
                        options={[
                            { value: 'damage', label: 'Damage' },
                            { value: 'downContribution', label: 'Down Contrib' }
                        ]}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
                    <button
                        type="button"
                        onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                        className="flex items-center justify-center w-[26px] h-[26px]"
                        style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                        aria-label={isExpanded ? 'Close Damage Breakdown' : 'Expand Damage Breakdown'}
                        title={isExpanded ? 'Close' : 'Expand'}
                    >
                        {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                    </button>
                </div>
            </div>

            {playerSkillBreakdowns.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No player skill damage data available for the current selection.
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[280px_1fr] items-stretch">
                    <div className="bg-[var(--bg-card-inner)] border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] px-3 pt-3 pb-2 flex flex-col min-h-0 h-[360px]">
                        <div className="text-xs uppercase tracking-widest text-[color:var(--text-secondary)] mb-3">
                            Squad Players
                        </div>
                        <div className="mb-2">
                                <input
                                    type="search"
                                    value={playerFilter}
                                    onChange={(event) => setPlayerFilter(event.target.value)}
                                    placeholder="Search player or account"
                                    className="w-full rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[var(--bg-card-inner)] px-2.5 py-1.5 text-xs text-[color:var(--text-primary)] placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500/60"
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
                                                    ? 'bg-sky-500/20 text-sky-200 border-sky-500/40'
                                                    : 'bg-[var(--bg-hover)] text-[color:var(--text-secondary)] border-[color:var(--border-default)] hover:text-[color:var(--text-primary)]'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(player.profession, player.professionList, 'w-3.5 h-3.5')}
                                                            <div className="truncate min-w-0">{player.displayName}</div>
                                                        </div>
                                                        <div className="text-[10px] text-[color:var(--text-secondary)] truncate">
                                                            {(player.skills || []).length} {(player.skills || []).length === 1 ? 'skill' : 'skills'}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs font-mono text-sky-200 shrink-0">
                                                        {formatWithCommas(getPlayerMetricTotal(player), 0)}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                    <div className="space-y-2 flex flex-col h-[360px]">
                        <div className="bg-[var(--bg-card-inner)] border border-[color:var(--border-subtle)] rounded-[var(--radius-md)] overflow-hidden stats-share-table flex-1 min-h-0 flex flex-col">
                            {!selectedPlayer ? (
                                <div className="h-full flex items-center justify-center text-xs text-[color:var(--text-muted)]">
                                    Select one player to view skill totals.
                                </div>
                            ) : (
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
                                                {(metricMode === 'damage' ? 'Damage' : 'Down Contrib')} / {skillRows.length} {skillRows.length === 1 ? 'skill' : 'skills'}
                                            </div>
                                        </div>
                                        <div className="stats-table-column-header grid grid-cols-[2fr_0.8fr_0.7fr] text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] px-4 py-2 border-b border-[color:var(--border-default)]">
                                            <div>Skill</div>
                                            <div className="text-right">{metricMode === 'damage' ? 'Damage' : 'Down Contrib'}</div>
                                            <div className="text-right">% Total</div>
                                        </div>
                                    </div>
                                    <div className="stats-table-shell__rows flex-1 min-h-0 overflow-y-auto">
                                        {skillRows.length === 0 ? (
                                            <div className="h-full flex items-center justify-center text-xs text-[color:var(--text-muted)]">
                                                No skill totals for this player and metric.
                                            </div>
                                        ) : (
                                            skillRows.map((row, idx) => (
                                                <div
                                                    key={`${row.id}-${idx}`}
                                                    className="grid grid-cols-[2fr_0.8fr_0.7fr] gap-2 px-4 py-2 text-xs text-[color:var(--text-primary)] border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)]"
                                                >
                                                    <div className="min-w-0">
                                                        <InlineIconLabel
                                                            name={row.name}
                                                            iconUrl={row.icon}
                                                            iconClassName="h-4 w-4"
                                                        />
                                                    </div>
                                                    <div className="text-right font-mono text-[color:var(--text-secondary)]">
                                                        {formatWithCommas(Number(row.value || 0), 0)}
                                                    </div>
                                                    <div className="text-right font-mono text-[color:var(--text-secondary)]">
                                                        {selectedPlayerMetricTotal > 0
                                                            ? `${formatWithCommas((Number(row.value || 0) / selectedPlayerMetricTotal) * 100, 1)}%`
                                                            : '0.0%'}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
