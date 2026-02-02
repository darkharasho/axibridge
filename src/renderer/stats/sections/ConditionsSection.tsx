import { Maximize2, Skull, X } from 'lucide-react';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { StatsTableLayout } from '../ui/StatsTableLayout';
import { StatsTableShell } from '../ui/StatsTableShell';
import { SkillBreakdownTooltip } from '../ui/StatsViewShared';

type ConditionsSectionProps = {
    conditionSummary: any[];
    conditionPlayers: any[];
    conditionSearch: string;
    setConditionSearch: (value: string) => void;
    activeConditionName: string;
    setActiveConditionName: (value: string) => void;
    conditionDirection: 'outgoing' | 'incoming';
    setConditionDirection: (value: 'outgoing' | 'incoming') => void;
    conditionGridClass: string;
    effectiveConditionSort: { key: 'applications' | 'damage'; dir: 'asc' | 'desc' };
    setConditionSort: (value: { key: 'applications' | 'damage'; dir: 'asc' | 'desc' }) => void;
    showConditionDamage: boolean;
    renderProfessionIcon: (profession: string | undefined, professionList?: string[], className?: string) => JSX.Element | null;
    expandedSection: string | null;
    expandedSectionClosing: boolean;
    openExpandedSection: (id: string) => void;
    closeExpandedSection: () => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
    sidebarListClass: string;
};

export const ConditionsSection = ({
    conditionSummary,
    conditionPlayers,
    conditionSearch,
    setConditionSearch,
    activeConditionName,
    setActiveConditionName,
    conditionDirection,
    setConditionDirection,
    conditionGridClass,
    effectiveConditionSort,
    setConditionSort,
    showConditionDamage,
    renderProfessionIcon,
    expandedSection,
    expandedSectionClosing,
    openExpandedSection,
    closeExpandedSection,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass,
    sidebarListClass
}: ConditionsSectionProps) => (
    <div
        id="conditions-outgoing"
        data-section-visible={isSectionVisible('conditions-outgoing')}
        data-section-first={isFirstVisibleSection('conditions-outgoing')}
        className={sectionClass('conditions-outgoing', `bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid stats-share-exclude scroll-mt-24 ${
            expandedSection === 'conditions-outgoing'
                ? `fixed inset-0 z-50 overflow-y-auto h-screen shadow-2xl rounded-none modal-pane flex flex-col pb-10 ${
                    expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'
                }`
                : ''
        }`)}
    >
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Skull className="w-5 h-5 text-amber-300" />
                Conditions
            </h3>
            <button
                type="button"
                onClick={() => (expandedSection === 'conditions-outgoing' ? closeExpandedSection() : openExpandedSection('conditions-outgoing'))}
                className="p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 transition-colors"
                aria-label={expandedSection === 'conditions-outgoing' ? 'Close Outgoing Conditions' : 'Expand Outgoing Conditions'}
                title={expandedSection === 'conditions-outgoing' ? 'Close' : 'Expand'}
            >
                {expandedSection === 'conditions-outgoing' ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
        </div>
        {conditionSummary && conditionSummary.length > 0 ? (
            <StatsTableLayout
                expanded={expandedSection === 'conditions-outgoing'}
                sidebarClassName={`bg-black/20 border border-white/5 rounded-xl px-3 pt-3 pb-2 flex flex-col min-h-0 ${expandedSection === 'conditions-outgoing' ? 'h-full flex-1' : 'self-start'}`}
                contentClassName={`bg-black/30 border border-white/5 rounded-xl overflow-hidden ${expandedSection === 'conditions-outgoing' ? 'flex flex-col min-h-0' : ''}`}
                sidebar={
                    <>
                        <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">Conditions</div>
                        <input
                            value={conditionSearch}
                            onChange={(e) => setConditionSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-200 focus:outline-none mb-2"
                        />
                        <div className={`${sidebarListClass} ${expandedSection === 'conditions-outgoing' ? 'max-h-none flex-1 min-h-0' : ''}`}>
                            {(() => {
                                const entries = [...(conditionSummary || [])].sort((a: any, b: any) => (b.damage || 0) - (a.damage || 0));
                                const filtered = entries.filter((entry: any) =>
                                    entry.name.toLowerCase().includes(conditionSearch.trim().toLowerCase())
                                );
                                if (filtered.length === 0) {
                                    return <div className="text-center text-gray-500 italic py-6 text-xs">No conditions match this filter</div>;
                                }
                                return (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setActiveConditionName('all')}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeConditionName === 'all'
                                                ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                                                : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                }`}
                                        >
                                            All Conditions
                                        </button>
                                        {filtered.map((entry: any) => (
                                            <button
                                                key={entry.name}
                                                type="button"
                                                onClick={() => setActiveConditionName(entry.name)}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${activeConditionName === entry.name
                                                    ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                                                    : 'bg-white/5 text-gray-300 border-white/10 hover:text-white'
                                                    }`}
                                            >
                                                {entry.name}
                                            </button>
                                        ))}
                                    </>
                                );
                            })()}
                        </div>
                    </>
                }
                content={
                    <StatsTableShell
                        expanded={expandedSection === 'conditions-outgoing'}
                        header={
                            <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-white/5">
                                <div className="text-sm font-semibold text-gray-200">
                                    {activeConditionName === 'all' ? 'All Conditions' : activeConditionName}
                                </div>
                                <div className="flex flex-col items-end gap-2 text-right ml-auto mt-2">
                                    <div className="text-xs uppercase tracking-widest text-gray-500">Squad Totals</div>
                                    <PillToggleGroup
                                        value={conditionDirection}
                                        onChange={setConditionDirection}
                                        options={[
                                            { value: 'outgoing', label: 'Outgoing' },
                                            { value: 'incoming', label: 'Incoming' }
                                        ]}
                                        activeClassName="bg-amber-500/20 text-amber-200 border border-amber-500/40"
                                        inactiveClassName="border border-transparent text-gray-400 hover:text-white"
                                    />
                                </div>
                            </div>
                        }
                        columns={
                            <div className={`grid ${conditionGridClass} text-xs uppercase tracking-wider text-gray-400 bg-white/5 px-4 py-2`}>
                                <div className="text-center">#</div>
                                <div>Player</div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setConditionSort({
                                            key: 'applications',
                                            dir: effectiveConditionSort.key === 'applications' ? (effectiveConditionSort.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                        });
                                    }}
                                    className={`text-right transition-colors ${effectiveConditionSort.key === 'applications' ? 'text-amber-200' : 'text-gray-400 hover:text-gray-200'}`}
                                >
                                    Applications {effectiveConditionSort.key === 'applications' ? (effectiveConditionSort.dir === 'desc' ? '↓' : '↑') : ''}
                                </button>
                                {showConditionDamage ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setConditionSort({
                                                key: 'damage',
                                                dir: effectiveConditionSort.key === 'damage' ? (effectiveConditionSort.dir === 'desc' ? 'asc' : 'desc') : 'desc'
                                            });
                                        }}
                                        className={`text-right transition-colors ${effectiveConditionSort.key === 'damage' ? 'text-amber-200' : 'text-gray-400 hover:text-gray-200'}`}
                                    >
                                        Damage {effectiveConditionSort.key === 'damage' ? (effectiveConditionSort.dir === 'desc' ? '↓' : '↑') : ''}
                                    </button>
                                ) : null}
                            </div>
                        }
                        rows={
                            <>
                                {(() => {
                                    const entries = conditionPlayers || [];
                                    const rows = entries
                                        .map((player: any) => {
                                            const conditionTotals = player.conditions || {};
                                            if (activeConditionName === 'all') {
                                                const totals = Object.values(conditionTotals).reduce(
                                                    (acc: { applications: number; damage: number }, condition: any) => {
                                                        const applications = (conditionDirection === 'outgoing'
                                                            && condition?.applicationsFromBuffs
                                                            && condition.applicationsFromBuffs > 0)
                                                            ? condition.applicationsFromBuffs
                                                            : condition?.applications;
                                                        acc.applications += Number(applications || 0);
                                                        acc.damage += Number(condition?.damage || 0);
                                                        return acc;
                                                    },
                                                    { applications: 0, damage: 0 }
                                                );
                                                return {
                                                    ...player,
                                                    applications: totals.applications,
                                                    damage: totals.damage
                                                };
                                            }
                                            const condition = conditionTotals[activeConditionName];
                                            const applications = conditionDirection === 'outgoing' && condition?.applicationsFromBuffs && condition.applicationsFromBuffs > 0
                                                ? condition.applicationsFromBuffs
                                                : condition?.applications;
                                            return {
                                                ...player,
                                                applications: Number(applications || 0),
                                                damage: Number(condition?.damage || 0)
                                            };
                                        })
                                        .filter((row: any) => row.applications > 0 || row.damage > 0)
                                        .sort((a: any, b: any) => {
                                            const aVal = effectiveConditionSort.key === 'applications' ? (a.applications || 0) : (a.damage || 0);
                                            const bVal = effectiveConditionSort.key === 'applications' ? (b.applications || 0) : (b.damage || 0);
                                            const primary = effectiveConditionSort.dir === 'desc' ? bVal - aVal : aVal - bVal;
                                            if (primary !== 0) return primary;
                                            const secondary = effectiveConditionSort.key === 'applications'
                                                ? (b.damage || 0) - (a.damage || 0)
                                                : (b.applications || 0) - (a.applications || 0);
                                            if (secondary !== 0) return secondary;
                                            return String(a.account || '').localeCompare(String(b.account || ''));
                                        });
                                    if (rows.length === 0) {
                                        return <div className="text-center text-gray-500 italic py-6">No condition data available</div>;
                                    }
                                    return rows.map((entry: any, idx: number) => {
                                        const conditionTotals = entry.conditions || {};
                                        let skillsMap: Record<string, { name: string; hits: number; damage: number }> = {};
                                        if (activeConditionName === 'all') {
                                            Object.values(conditionTotals).forEach((cond: any) => {
                                                const skills = cond?.skills || {};
                                                Object.values(skills).forEach((skill: any) => {
                                                    const name = skill?.name || 'Unknown';
                                                    const hits = Number(skill?.hits || 0);
                                                    const damage = Number(skill?.damage || 0);
                                                    if ((!Number.isFinite(hits) || hits <= 0) && (!Number.isFinite(damage) || damage <= 0)) {
                                                        return;
                                                    }
                                                    const existing = skillsMap[name] || { name, hits: 0, damage: 0 };
                                                    existing.hits += Number.isFinite(hits) ? hits : 0;
                                                    existing.damage += Number.isFinite(damage) ? damage : 0;
                                                    skillsMap[name] = existing;
                                                });
                                            });
                                        } else {
                                            skillsMap = conditionTotals[activeConditionName]?.skills || {};
                                        }
                                        const skillsList = Object.values(skillsMap)
                                            .filter((skill: any) => Number.isFinite(skill.hits) && skill.hits > 0)
                                            .sort((a: any, b: any) => b.hits - a.hits || a.name.localeCompare(b.name));
                                        const skillsDamageList = Object.values(skillsMap)
                                            .filter((skill: any) => Number.isFinite(skill.damage) && skill.damage > 0)
                                            .sort((a: any, b: any) => b.damage - a.damage || a.name.localeCompare(b.name));
                                        const showTooltip = activeConditionName === 'all' && skillsList.length > 0;
                                        const showDamageTooltip = activeConditionName === 'all' && skillsDamageList.length > 0;
                                        const applicationsValue = Math.round(entry.applications || 0).toLocaleString();
                                        const damageValue = Math.round(entry.damage || 0).toLocaleString();
                                        return (
                                            <div key={`${entry.account}-${idx}`} className={`grid ${conditionGridClass} px-4 py-2 text-sm text-gray-200 border-t border-white/5`}>
                                                <div className="text-center text-gray-500 font-mono">{idx + 1}</div>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {renderProfessionIcon(entry.profession, entry.professionList, 'w-4 h-4')}
                                                    <span className="truncate">{entry.account}</span>
                                                </div>
                                                <div className="text-right font-mono text-gray-300">
                                                    {showTooltip ? (
                                                        <SkillBreakdownTooltip
                                                            value={applicationsValue}
                                                            label="Condition Sources"
                                                            items={skillsList.map((skill: any) => ({
                                                                name: skill.name,
                                                                value: Math.round(skill.hits).toLocaleString()
                                                            }))}
                                                            className="justify-end"
                                                        />
                                                    ) : (
                                                        applicationsValue
                                                    )}
                                                </div>
                                                {showConditionDamage ? (
                                                    <div className="text-right font-mono text-gray-300">
                                                        {showDamageTooltip ? (
                                                            <SkillBreakdownTooltip
                                                                value={damageValue}
                                                                label="Condition Damage Sources"
                                                                items={skillsDamageList.map((skill: any) => ({
                                                                    name: skill.name,
                                                                    value: Math.round(skill.damage).toLocaleString()
                                                                }))}
                                                                className="justify-end"
                                                            />
                                                        ) : (
                                                            damageValue
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    });
                                })()}
                            </>
                        }
                    />
                }
            />
        ) : (
            <div className="text-center text-gray-500 italic py-8">No condition data available</div>
        )}
    </div>
);
