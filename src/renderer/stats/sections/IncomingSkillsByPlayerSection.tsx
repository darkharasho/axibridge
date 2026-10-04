import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import { SectionExpandButton } from '../ui/SectionExpandButton';
import { InlineIconLabel } from '../ui/StatsViewShared';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import type { IncomingSkillsByPlayerResult, IncomingSkillsPlayer } from '../computeIncomingSkillsByPlayer';
import { expandedPaneProps } from './expandedPane';

type Props = { result: IncomingSkillsByPlayerResult };

type Metric = 'damage' | 'casts';

export const IncomingSkillsByPlayerSection = ({ result }: Props) => {
    const {
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
        sidebarListClass,
        renderProfessionIcon,
        formatWithCommas,
    } = useStatsSharedContext();
    const sectionId = 'incoming-skills-by-player';
    const isExpanded = expandedSection === sectionId;

    const [metric, setMetric] = useState<Metric>('damage');
    const [playerSearch, setPlayerSearch] = useState('');
    const [activeAccount, setActiveAccount] = useState<string | null>(null);

    const players = result?.players ?? [];
    const castMeasured = result?.castMeasuredFightCount ?? 0;
    const castUnmeasured = result?.castUnmeasuredFightCount ?? 0;
    const playerTotal = (p: IncomingSkillsPlayer) => (metric === 'damage' ? p.totalDamage : p.totalCasts);

    const sortedPlayers = useMemo(() => {
        const query = playerSearch.trim().toLowerCase();
        return players
            .filter(p => !query || p.account.toLowerCase().includes(query))
            .sort((a, b) => playerTotal(b) - playerTotal(a) || a.account.localeCompare(b.account));
    }, [players, playerSearch, metric]);

    const activePlayer = useMemo(
        () => players.find(p => p.account === activeAccount) ?? sortedPlayers[0] ?? null,
        [players, sortedPlayers, activeAccount]
    );

    const skillRows = useMemo(() => {
        if (!activePlayer) return [];
        return activePlayer.skills
            .filter(s => s[metric] > 0)
            .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name));
    }, [activePlayer, metric]);
    const peak = Math.max(1, ...skillRows.map(s => s[metric]));

    const listBodyClass = isExpanded
        ? 'axi-rail__nav axi-rail__nav--quiet overflow-y-auto pr-1 flex-1 min-h-0'
        : `${sidebarListClass} max-h-80 overflow-y-auto`;

    // Casts mode has its own empty states, and they are deliberately different
    // sentences: a fight that cannot measure casts is not a fight with none.
    const castsEmptyMessage = castMeasured === 0
        ? (castUnmeasured > 0
            ? `None of the ${castUnmeasured} loaded ${castUnmeasured === 1 ? 'fight carries' : 'fights carry'} enemy cast data. It needs an arcdps build from May 2026 or later, and logs parsed before this version of AxiBridge need re-parsing.`
            : 'No enemy cast data for the loaded fights.')
        : activePlayer && activePlayer.castFightCount === 0
            ? 'None of this player’s fights carry enemy cast data.'
            : 'No enemy casts were aimed at this player.';

    return (
        <div {...expandedPaneProps(isExpanded, expandedSectionClosing)}>
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Target className="w-4 h-4 shrink-0" style={{ color: 'var(--section-defense)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Incoming Skills by Player</h3>
                <div className="ml-auto flex items-center gap-2">
                    <PillToggleGroup
                        value={metric}
                        onChange={setMetric}
                        options={[
                            { value: 'damage' as const, label: 'Damage', title: 'Damage taken from each enemy skill.' },
                            { value: 'casts' as const, label: 'Casts', title: 'Enemy casts aimed at this player, by skill. Untargeted ground AoE leaves no cast row.' },
                        ]}
                    />
                    <SectionExpandButton
                        expanded={isExpanded}
                        onToggle={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                        section="Incoming Skills by Player"
                    />
                </div>
            </div>

            {players.length === 0 ? (
                <div className="axi-empty">No incoming skill data for the loaded fights.</div>
            ) : (
                <div className={isExpanded ? 'flex-1 min-h-0 flex flex-col' : ''}>
                    <div className={`grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-0 ${isExpanded ? 'flex-1 min-h-0 h-full' : ''}`}>
                        <div className={`pr-3 flex flex-col ${isExpanded ? 'h-full min-h-0' : ''}`} style={{ borderRight: '1px solid var(--axi-rule)' }}>
                            <input
                                type="text"
                                value={playerSearch}
                                onChange={(event) => setPlayerSearch(event.target.value)}
                                placeholder="Search players..."
                                aria-label="Search players"
                                className="axi-input mb-2"
                                style={{ '--axi-input-pad': '5px 8px', '--axi-input-size': '12px' } as CSSProperties}
                            />
                            <div className={listBodyClass}>
                                {sortedPlayers.map(p => (
                                    <button
                                        key={p.account}
                                        type="button"
                                        onClick={() => setActiveAccount(p.account)}
                                        className="axi-rail__item"
                                        aria-current={activePlayer?.account === p.account ? 'location' : undefined}
                                        title={p.account}
                                    >
                                        <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {renderProfessionIcon(p.profession, p.professionList, 'w-4 h-4')}
                                                <span className="truncate min-w-0">{p.account}</span>
                                            </div>
                                            <span className="text-[10px] font-mono whitespace-nowrap shrink-0 text-[color:var(--axi-text-dim)]">
                                                {metric === 'casts' && p.castFightCount === 0 ? '—' : formatWithCommas(playerTotal(p), 0)}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                                {sortedPlayers.length === 0 && (
                                    <div className="axi-empty">No players match.</div>
                                )}
                            </div>
                        </div>

                        <div className={`pl-0 lg:pl-4 pt-3 lg:pt-0 ${isExpanded ? 'min-h-0 overflow-y-auto' : ''}`}>
                            {activePlayer && (
                                <div className="flex flex-wrap items-baseline gap-2 mb-3">
                                    <span className="text-sm font-semibold" style={{ color: 'var(--axi-text)' }}>{activePlayer.account}</span>
                                    <span className="text-[10px]" style={{ color: 'var(--axi-text-dim)' }}>
                                        {metric === 'damage'
                                            ? `${formatWithCommas(activePlayer.totalDamage, 0)} damage taken across ${activePlayer.fightCount} ${activePlayer.fightCount === 1 ? 'fight' : 'fights'}`
                                            : `${formatWithCommas(activePlayer.totalCasts, 0)} aimed casts across ${activePlayer.castFightCount} measurable ${activePlayer.castFightCount === 1 ? 'fight' : 'fights'}`}
                                    </span>
                                </div>
                            )}
                            <div className={`space-y-3 ${isExpanded ? '' : 'max-h-80 overflow-y-auto overflow-x-hidden'}`}>
                                {skillRows.map((skill, i) => (
                                    <div key={skill.id} className="flex items-center gap-3">
                                        <div className="w-7 text-center text-sm font-bold text-[color:var(--axi-text-faint)]">#{i + 1}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm mb-1 leading-normal sm:flex sm:items-center sm:justify-between sm:gap-3">
                                                <div className="axi-ink-plain font-bold min-w-0 truncate py-[1px]">
                                                    <InlineIconLabel
                                                        name={skill.name}
                                                        iconUrl={skill.icon}
                                                        iconClassName="h-5 w-5"
                                                        className="min-w-0"
                                                        textClassName="truncate leading-[1.5] pt-[1px] pb-[2px]"
                                                    />
                                                </div>
                                                <div className="shrink-0">
                                                    <span className="axi-ink-danger font-mono font-bold">{formatWithCommas(skill[metric], 0)}</span>
                                                    <span className="text-[color:var(--axi-text-dim)] text-xs ml-2">
                                                        {metric === 'damage'
                                                            ? `(${formatWithCommas(skill.hits, 0)} hits)`
                                                            : skill.damage > 0 ? `(${formatWithCommas(skill.damage, 0)} dmg)` : '(no damage)'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="axi-meter" style={{ '--axi-meter-h': '6px' } as CSSProperties}>
                                                <div
                                                    className="axi-meter__fill"
                                                    style={{ '--axi-meter-v': `${(skill[metric] / peak) * 100}%`, '--axi-series': 'var(--axi-danger)' } as CSSProperties}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {skillRows.length === 0 && (
                                    <div className="axi-empty">
                                        {metric === 'casts' ? castsEmptyMessage : 'No incoming damage recorded for this player.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {metric === 'casts' && castMeasured > 0 && (
                        <p className="mt-2.5 text-[10px] leading-relaxed" style={{ color: 'var(--axi-text-dim)' }}>
                            Casts count enemy players’ cast-starts that named this player as their target. Untargeted ground
                            AoE and casts at minions are not included, so a skill can hit hard here with few casts, or be cast
                            often and never land.
                            {castUnmeasured > 0 && <>
                                {' '}<strong>{castUnmeasured} of {castMeasured + castUnmeasured} loaded {castMeasured + castUnmeasured === 1 ? 'fight' : 'fights'}</strong> carry
                                no per-skill cast data (an arcdps build older than May 2026, or a log parsed by an older
                                AxiBridge) and are left out of the cast counts rather than counted as zero.
                            </>}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
