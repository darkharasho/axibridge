import { useEffect, useMemo, useState } from 'react';
import { ListTree, Maximize2, X } from 'lucide-react';
import { InlineIconLabel } from '../ui/StatsViewShared';
import type { PlayerHealingBreakdown, PlayerHealingSkillEntry } from '../statsTypes';
import { useStatsSharedContext } from '../StatsViewContext';

type HealingBreakdownSectionProps = {
    healingBreakdownPlayers: PlayerHealingBreakdown[];
};

const SkillTable = ({
    title,
    skills,
    grandTotal,
    formatWithCommas,
    emptyMessage,
}: {
    title: string;
    skills: PlayerHealingSkillEntry[];
    grandTotal: number;
    formatWithCommas: (n: number, d: number) => string;
    emptyMessage: string;
}) => (
    <div className="bg-black/30 border border-white/5 rounded-xl overflow-hidden stats-share-table flex-1 min-h-0 flex flex-col">
        <div className="stats-table-shell__head-stack">
            <div className="flex items-center justify-between px-4 py-2 bg-white/5">
                <div className="text-[10px] uppercase tracking-[0.25em] text-gray-400">{title}</div>
                <div className="text-[10px] text-gray-500">{skills.length} {skills.length === 1 ? 'skill' : 'skills'}</div>
            </div>
            <div className="stats-table-column-header grid grid-cols-[2fr_0.6fr_0.8fr_0.6fr_0.6fr_0.5fr] text-[10px] uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-1.5">
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
                <div className="h-full flex items-center justify-center text-xs text-gray-500 py-6">
                    {emptyMessage}
                </div>
            ) : (
                skills.map((skill, idx) => {
                    const avg = skill.hits > 0 ? Math.round(skill.total / skill.hits) : 0;
                    const pct = grandTotal > 0 ? (skill.total / grandTotal) * 100 : 0;
                    return (
                        <div
                            key={`${skill.id}-${idx}`}
                            className="grid grid-cols-[2fr_0.6fr_0.8fr_0.6fr_0.6fr_0.5fr] gap-1 px-4 py-1.5 text-xs text-gray-200 border-t border-white/5"
                        >
                            <div className="min-w-0">
                                <InlineIconLabel name={skill.name} iconUrl={skill.icon} iconClassName="h-4 w-4" />
                            </div>
                            <div className="text-right font-mono text-gray-300">{formatWithCommas(skill.hits, 0)}</div>
                            <div className="text-right font-mono text-gray-300">{formatWithCommas(skill.total, 0)}</div>
                            <div className="text-right font-mono text-gray-300">{formatWithCommas(avg, 0)}</div>
                            <div className="text-right font-mono text-gray-300">{formatWithCommas(skill.max, 0)}</div>
                            <div className="text-right font-mono text-gray-300">{formatWithCommas(pct, 1)}%</div>
                        </div>
                    );
                })
            )}
        </div>
    </div>
);

export const HealingBreakdownSection = ({
    healingBreakdownPlayers
}: HealingBreakdownSectionProps) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, isSectionVisible, isFirstVisibleSection, sectionClass, renderProfessionIcon, formatWithCommas } = useStatsSharedContext();
    const sectionId = 'healing-breakdown';
    const isExpanded = expandedSection === sectionId;
    const [playerFilter, setPlayerFilter] = useState('');
    const [selectedPlayerKey, setSelectedPlayerKey] = useState<string | null>(null);

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
            const delta = b.totalHealing - a.totalHealing;
            if (delta !== 0) return delta;
            return String(a.displayName || '').localeCompare(String(b.displayName || ''));
        });
    }, [healingBreakdownPlayers, playerFilter]);

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
            id={sectionId}
            data-section-visible={isSectionVisible(sectionId)}
            data-section-first={isFirstVisibleSection(sectionId)}
            className={sectionClass(sectionId, `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${isExpanded
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}`
                : 'overflow-hidden'
                }`)}
        >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4 relative">
                <div className={isExpanded ? 'pr-10 md:pr-0' : ''}>
                    <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                        <ListTree className="w-5 h-5 text-emerald-300" />
                        Healing Breakdown
                    </h3>
                    <p className="text-xs text-gray-400">
                        Select a player to view healing and barrier output by skill.
                    </p>
                </div>
                <div className={`flex items-center gap-3 ${isExpanded ? 'pr-10 md:pr-0' : ''}`}>
                    <button
                        type="button"
                        onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                        className={`p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors ${isExpanded ? 'absolute top-2 right-2 md:static' : ''}`}
                        aria-label={isExpanded ? 'Close Healing Breakdown' : 'Expand Healing Breakdown'}
                        title={isExpanded ? 'Close' : 'Expand'}
                    >
                        {isExpanded ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {healingBreakdownPlayers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/20 px-4 py-6 text-center text-xs text-gray-400">
                    No healing breakdown data available for the current selection.
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[280px_1fr] items-stretch">
                    <div className="bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 h-[420px]">
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">
                            Squad Players
                        </div>
                        <div className="mb-2">
                            <input
                                type="search"
                                value={playerFilter}
                                onChange={(event) => setPlayerFilter(event.target.value)}
                                placeholder="Search player or account"
                                className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                            />
                        </div>
                        <div className="space-y-1 pr-1 flex-1 min-h-0 overflow-y-auto">
                            {filteredPlayers.length === 0 ? (
                                <div className="px-3 py-4 text-xs text-gray-500 italic">
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
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${isSelected
                                                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
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
                                                    {formatWithCommas(player.totalHealing, 0)}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="flex gap-3 h-[420px]">
                        {!selectedPlayer ? (
                            <div className="flex-1 bg-black/30 border border-white/5 rounded-xl flex items-center justify-center text-xs text-gray-500">
                                Select a player to view skill breakdown.
                            </div>
                        ) : (
                            <>
                                <SkillTable
                                    title="Total Healing"
                                    skills={selectedPlayer.healingSkills}
                                    grandTotal={selectedPlayer.totalHealing}
                                    formatWithCommas={formatWithCommas}
                                    emptyMessage="No healing skills."
                                />
                                <SkillTable
                                    title="Total Barrier"
                                    skills={selectedPlayer.barrierSkills}
                                    grandTotal={selectedPlayer.totalBarrier}
                                    formatWithCommas={formatWithCommas}
                                    emptyMessage="No barrier skills."
                                />
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
