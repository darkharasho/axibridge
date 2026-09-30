import { useEffect, useMemo, useState } from 'react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { BarChart3 } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { InlineIconLabel } from '../ui/StatsViewShared';
import type { PlayerSkillBreakdown } from '../statsTypes';
import { useStatsSharedContext } from '../StatsViewContext';
import { expandedPaneProps } from './expandedPane';

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
        <div {...expandedPaneProps(isExpanded, expandedSectionClosing)}>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
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
                    />
                    <SectionExpandButton
                        expanded={isExpanded}
                        onToggle={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                        section="Damage Breakdown"
                    />
                </div>
            </div>

            {playerSkillBreakdowns.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No player skill damage data available for the current selection.
                </div>
            ) : (
                /* The same picker-beside-a-table shape `StatsTableLayout` renders,
                   hand-rolled here for the fixed 480px height. It wears that
                   component's class hooks so the picker treatment - the well, the
                   search control, the picked row - reaches it too. */
                <div className="stats-table-layout grid lg:grid-cols-[280px_1fr] gap-0 h-[480px]">
                    <div className="axi-well stats-table-layout__sidebar flex flex-col overflow-y-auto">
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
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            {renderProfessionIcon(player.profession, player.professionList, 'w-3.5 h-3.5')}
                                                            <div className="truncate min-w-0">{player.displayName}</div>
                                                        </div>
                                                        <div className="text-[10px] text-[color:var(--text-secondary)] truncate">
                                                            {(player.skills || []).length} {(player.skills || []).length === 1 ? 'skill' : 'skills'}
                                                        </div>
                                                    </div>
                                                    <div className="text-xs font-mono shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                                        {formatWithCommas(getPlayerMetricTotal(player), 0)}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                    <div className="stats-table-layout__content pl-3 flex flex-col min-h-0 overflow-y-auto">
                        <div className="overflow-hidden flex-1 min-h-0 flex flex-col">
                            {!selectedPlayer ? (
                                <div className="h-full flex items-center justify-center text-xs text-[color:var(--text-muted)]">
                                    Select one player to view skill totals.
                                </div>
                            ) : (
                                <div className="h-full flex flex-col">
                                    <div className="stats-table-shell__header">
                                        <div className="flex items-center justify-between px-4 py-3">
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
                                    </div>
                                    <div className="axi-table__scroll flex-1 min-h-0">
                                        <table className="axi-table axi-table--fixed axi-table--sticky axi-table--dense">
                                            <colgroup>
                                                <col style={{ width: '57.1429%' }} />
                                                <col style={{ width: '22.8571%' }} />
                                                <col style={{ width: '20%' }} />
                                            </colgroup>
                                            <thead>
                                                <tr>
                                                    <th scope="col">Skill</th>
                                                    <th scope="col">{metricMode === 'damage' ? 'Damage' : 'Down Contrib'}</th>
                                                    <th scope="col">% Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {skillRows.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={3} className="axi-ink-muted text-center">
                                                            No skill totals for this player and metric.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    skillRows.map((row, idx) => (
                                                        <tr key={`${row.id}-${idx}`}>
                                                            <th scope="row">
                                                                <span className="axi-table__who">
                                                                    <InlineIconLabel
                                                                        name={row.name}
                                                                        iconUrl={row.icon}
                                                                        iconClassName="h-4 w-4"
                                                                    />
                                                                </span>
                                                            </th>
                                                            <td className="axi-table__num">
                                                                {formatWithCommas(Number(row.value || 0), 0)}
                                                            </td>
                                                            <td>
                                                                {selectedPlayerMetricTotal > 0
                                                                    ? `${formatWithCommas((Number(row.value || 0) / selectedPlayerMetricTotal) * 100, 1)}%`
                                                                    : '0.0%'}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
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
