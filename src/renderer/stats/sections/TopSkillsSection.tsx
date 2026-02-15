import { useMemo } from 'react';
import { ArrowBigDown, ArrowBigUp } from 'lucide-react';
import { InlineIconLabel } from '../ui/StatsViewShared';

type TopSkillsSectionProps = {
    stats: any;
    topSkillsMetric?: 'damage' | 'downContribution';
    onTopSkillsMetricChange?: (metric: 'damage' | 'downContribution') => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

export const TopSkillsSection = ({
    stats,
    topSkillsMetric,
    onTopSkillsMetricChange,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: TopSkillsSectionProps) => {
    const resolvedMetric = (topSkillsMetric || stats.topSkillsMetric) === 'downContribution' ? 'downContribution' : 'damage';
    const isDownContrib = resolvedMetric === 'downContribution';
    const metricLabel = isDownContrib ? 'Down Contrib' : 'Damage';
    const metricKey = resolvedMetric;
    const precomputedByDamage = Array.isArray(stats.topSkillsByDamage) ? stats.topSkillsByDamage : null;
    const precomputedByDownContribution = Array.isArray(stats.topSkillsByDownContribution) ? stats.topSkillsByDownContribution : null;
    const sortedTopSkills = useMemo(
        () => {
            if (isDownContrib && precomputedByDownContribution) return precomputedByDownContribution;
            if (!isDownContrib && precomputedByDamage) return precomputedByDamage;
            return [...(Array.isArray(stats.topSkills) ? stats.topSkills : [])].sort((a: any, b: any) => {
            const aVal = Number(a?.[metricKey] || 0);
            const bVal = Number(b?.[metricKey] || 0);
            return bVal - aVal || Number(b?.hits || 0) - Number(a?.hits || 0) || String(a?.name || '').localeCompare(String(b?.name || ''));
            });
        },
        [isDownContrib, precomputedByDamage, precomputedByDownContribution, stats.topSkills, metricKey]
    );
    const topSkillsPeak = useMemo(
        () => Math.max(1, ...sortedTopSkills.map((skill: any) => Number(skill?.[metricKey] || 0))),
        [sortedTopSkills, metricKey]
    );
    const showMetricToggle = typeof onTopSkillsMetricChange === 'function';

    return (
        <div
            data-section-visible={isSectionVisible('top-skills-outgoing')}
            data-section-first={isFirstVisibleSection('top-skills-outgoing')}
            className={sectionClass('top-skills-outgoing', 'grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8')}
        >
        <div
            id="top-skills-outgoing"
            data-section-visible={isSectionVisible('top-skills-outgoing')}
            className={sectionClass('top-skills-outgoing', 'bg-white/5 border border-white/10 rounded-2xl p-6 scroll-mt-24')}
        >
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                        <ArrowBigUp className="top-skills-outgoing-icon w-5 h-5 text-orange-400" />
                        Top Outgoing Skills
                    </h3>
                    <div className="text-xs text-gray-500 mt-1">{metricLabel}</div>
                </div>
                {showMetricToggle && (
                    <div className="pill-toggle-group flex items-center gap-1 rounded-full bg-white/5 border border-white/10 p-1">
                        {([
                            { id: 'damage', label: 'Damage' },
                            { id: 'downContribution', label: 'Down Contrib' }
                        ] as const).map((option) => {
                            const isActive = (topSkillsMetric || stats.topSkillsMetric) === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => onTopSkillsMetricChange?.(option.id)}
                            className={`pill-toggle-option px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                        isActive
                                            ? 'pill-toggle-option--active bg-orange-500/30 text-orange-200'
                                            : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            <div className="max-h-80 overflow-y-auto overflow-x-hidden space-y-4">
                {sortedTopSkills.map((skill: { name: string; icon?: string; damage: number; hits: number }, i: number) => (
                    <div key={`outgoing-${skill.name || 'unknown'}-${i}`} className="flex items-center gap-4">
                        <div className="w-8 text-center text-xl font-bold text-gray-600">#{i + 1}</div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between gap-3 text-sm mb-1 py-0.5 leading-normal">
                                <span className="text-white font-bold flex-1 min-w-0 py-[1px]">
                                    <InlineIconLabel
                                        name={skill.name}
                                        iconUrl={skill.icon}
                                        iconClassName="h-6 w-6"
                                        className="min-w-0"
                                        textClassName="truncate leading-[1.35] py-[1px]"
                                    />
                                </span>
                                <div className="text-right shrink-0">
                                    <span className="top-skills-outgoing-value text-orange-400 font-mono font-bold">{Math.round((skill as any)[metricKey] || 0).toLocaleString()}</span>
                                    <span className="text-gray-500 text-xs ml-2">({skill.hits.toLocaleString()} hits)</span>
                                </div>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="top-skills-outgoing-bar h-full bg-orange-500 rounded-full"
                                    style={{ width: `${(Number((skill as any)[metricKey] || 0) / topSkillsPeak) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                {sortedTopSkills.length === 0 && (
                    <div className="text-center text-gray-500 italic py-4">No skill data available</div>
                )}
            </div>
        </div>

        <div
            id="top-skills-incoming"
            data-section-visible={isSectionVisible('top-skills-incoming')}
            className={sectionClass('top-skills-incoming', 'bg-white/5 border border-white/10 rounded-2xl p-6 scroll-mt-24')}
        >
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                        <ArrowBigDown className="w-5 h-5 text-red-500" />
                        Top Incoming Skills
                    </h3>
                    <div className="text-xs text-gray-500 mt-1">Damage</div>
                </div>
            </div>
            <div className="max-h-80 overflow-y-auto overflow-x-hidden space-y-4">
                {(stats.topIncomingSkills || []).map((skill: { name: string; icon?: string; damage: number; hits: number }, i: number) => (
                    <div key={`incoming-${skill.name || 'unknown'}-${i}`} className="flex items-center gap-4">
                        <div className="w-8 text-center text-xl font-bold text-gray-600">#{i + 1}</div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between gap-3 text-sm mb-1 py-0.5 leading-normal">
                                <span className="text-white font-bold flex-1 min-w-0 py-[1px]">
                                    <InlineIconLabel
                                        name={skill.name}
                                        iconUrl={skill.icon}
                                        iconClassName="h-6 w-6"
                                        className="min-w-0"
                                        textClassName="truncate leading-[1.35] py-[1px]"
                                    />
                                </span>
                                <div className="text-right shrink-0">
                                    <span className="text-red-400 font-mono font-bold">{Math.round(skill.damage).toLocaleString()}</span>
                                    <span className="text-gray-500 text-xs ml-2">({skill.hits.toLocaleString()} hits)</span>
                                </div>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-red-500 rounded-full"
                                    style={{ width: `${(skill.damage / (stats.topIncomingSkills[0]?.damage || 1)) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                {stats.topIncomingSkills.length === 0 && (
                    <div className="text-center text-gray-500 italic py-4">No incoming damage data available</div>
                )}
            </div>
        </div>
        </div>
    );
};
