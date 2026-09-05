import { useMemo, useState } from 'react';
import { ArrowBigUp, Shield } from 'lucide-react';
import { InlineIconLabel } from '../ui/StatsViewShared';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';

type TopSkillsSectionProps = {
    topSkillsMetric?: 'damage' | 'downContribution';
    onTopSkillsMetricChange?: (metric: 'damage' | 'downContribution') => void;
    /** Which column(s) to render. Defaults to 'both' (legacy two-column layout). */
    mode?: 'outgoing' | 'incoming' | 'both';
};

export const TopSkillsSection = ({
    topSkillsMetric,
    onTopSkillsMetricChange,
    mode = 'both'
}: TopSkillsSectionProps) => {
    const { stats } = useStatsSharedContext();
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
    const showOutgoing = mode !== 'incoming';
    const showIncoming = mode !== 'outgoing';

    // Incoming damage can be shown in full or narrowed to what players and
    // their minions dealt — the same distinction the arcdps in-game filters
    // make. The data comes from axilog's `playerTotal`, a refinement of each
    // skill's total rather than a partition of it.
    const [incomingSource, setIncomingSource] = useState<'all' | 'players'>('all');
    const incomingRows: any[] = Array.isArray(stats.topIncomingSkills) ? stats.topIncomingSkills : [];
    // Offer the toggle only under FULL coverage. `splitDamage` is the portion of
    // `damage` that came from rows carrying the field, so anything less means
    // some log was parsed by an axilog predating it and the player figure would
    // read low without saying so. Old reports land here and degrade to the
    // plain total, which is exactly what they used to show.
    const hasPlayerSplit = useMemo(
        () => incomingRows.length > 0 && incomingRows.every(r => typeof r?.splitDamage === 'number' && r.splitDamage === r.damage),
        [incomingRows]
    );
    const incomingKey = hasPlayerSplit && incomingSource === 'players' ? 'playerDamage' : 'damage';
    const incomingValue = (skill: any) => Number(skill?.[incomingKey] || 0);
    // Re-rank for the active metric and only then cut to 25. The aggregator
    // hands over the union of both top-25s precisely so this slice is honest
    // in either view rather than inheriting the damage ordering's truncation.
    const sortedIncoming = useMemo(
        () => [...incomingRows]
            .sort((a, b) => incomingValue(b) - incomingValue(a) || Number(b?.hits || 0) - Number(a?.hits || 0) || String(a?.name || '').localeCompare(String(b?.name || '')))
            .slice(0, 25),
        [incomingRows, incomingKey]
    );
    const incomingPeak = useMemo(
        () => Math.max(1, ...sortedIncoming.map(incomingValue)),
        [sortedIncoming, incomingKey]
    );

    return (
        <div className={mode === 'both' ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}>
        {showOutgoing && (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-3.5 min-h-[28px]">
                <ArrowBigUp className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="top-skills-outgoing-icon text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Top Outgoing Skills</h3>
                <div className="ml-auto flex items-center gap-2">
                    {showMetricToggle && (
                        <PillToggleGroup
                            value={(topSkillsMetric || stats.topSkillsMetric) as 'damage' | 'downContribution'}
                            onChange={(v) => onTopSkillsMetricChange?.(v)}
                            options={[
                                { value: 'damage' as const, label: 'Damage' },
                                { value: 'downContribution' as const, label: 'Down Contrib' }
                            ]}
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                    )}
                    {!showMetricToggle && <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>{metricLabel}</span>}
                </div>
            </div>
            <div className="max-h-80 overflow-y-auto overflow-x-hidden space-y-4">
                {sortedTopSkills.map((skill: { name: string; icon?: string; damage: number; hits: number }, i: number) => (
                    <div key={`outgoing-${skill.name || 'unknown'}-${i}`} className="flex items-center gap-4">
                        <div className="w-8 text-center text-xl font-bold text-[color:var(--text-muted)]">#{i + 1}</div>
                        <div className="flex-1">
                            <div className="text-sm mb-1 py-0.5 leading-normal">
                                <div className="sm:flex sm:items-center sm:justify-between sm:gap-3">
                                    <div className="text-white font-bold min-w-0 truncate py-[1px]">
                                        <InlineIconLabel
                                            name={skill.name}
                                            iconUrl={skill.icon}
                                            iconClassName="h-6 w-6"
                                            className="min-w-0"
                                            textClassName="truncate leading-[1.5] pt-[1px] pb-[2px]"
                                        />
                                    </div>
                                    <div className="shrink-0">
                                        <span className="top-skills-outgoing-value text-orange-400 font-mono font-bold">{Math.round((skill as any)[metricKey] || 0).toLocaleString()}</span>
                                        <span className="text-[color:var(--text-secondary)] text-xs ml-2">({skill.hits.toLocaleString()} hits)</span>
                                    </div>
                                </div>
                            </div>
                            <div className="h-1.5 w-full bg-[var(--bg-hover)] rounded-sm overflow-hidden">
                                <div
                                    className="top-skills-outgoing-bar h-full bg-orange-500 rounded-sm"
                                    style={{ width: `${(Number((skill as any)[metricKey] || 0) / topSkillsPeak) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                {sortedTopSkills.length === 0 && (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No skill data available</div>
                )}
            </div>
        </div>
        )}

        {showIncoming && (
        // In the combined two-column layout the incoming column carries its own
        // anchor so taxonomy/search/deep-links can target #top-skills-incoming
        // even though it is not a standalone SectionPanel. In standalone
        // 'incoming' mode the SectionPanel wrapper owns the id — omit it here
        // to avoid duplicate DOM ids.
        <div id={mode === 'both' ? 'top-skills-incoming' : undefined}>
            <div className="flex flex-wrap items-center gap-2 mb-3.5 min-h-[28px]">
                <Shield className="w-4 h-4 shrink-0" style={{ color: 'var(--section-defense)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Top Incoming Skills</h3>
                <div className="ml-auto flex items-center gap-2">
                    {hasPlayerSplit ? (
                        <PillToggleGroup
                            value={incomingSource}
                            onChange={(v) => setIncomingSource(v)}
                            options={[
                                { value: 'all' as const, label: 'All' },
                                { value: 'players' as const, label: 'Players' }
                            ]}
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="text-[color:var(--text-secondary)]"
                        />
                    ) : (
                        <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Damage</span>
                    )}
                </div>
            </div>
            <div className="max-h-80 overflow-y-auto overflow-x-hidden space-y-4">
                {sortedIncoming.map((skill: { name: string; icon?: string; damage: number; hits: number }, i: number) => (
                    <div key={`incoming-${skill.name || 'unknown'}-${i}`} className="flex items-center gap-4">
                        <div className="w-8 text-center text-xl font-bold text-[color:var(--text-muted)]">#{i + 1}</div>
                        <div className="flex-1">
                            <div className="text-sm mb-1 py-0.5 leading-normal">
                                <div className="sm:flex sm:items-center sm:justify-between sm:gap-3">
                                    <div className="text-white font-bold min-w-0 truncate py-[1px]">
                                        <InlineIconLabel
                                            name={skill.name}
                                            iconUrl={skill.icon}
                                            iconClassName="h-6 w-6"
                                            className="min-w-0"
                                            textClassName="truncate leading-[1.5] pt-[1px] pb-[2px]"
                                        />
                                    </div>
                                    <div className="shrink-0">
                                        <span className="text-red-400 font-mono font-bold">{Math.round(incomingValue(skill)).toLocaleString()}</span>
                                        <span className="text-[color:var(--text-secondary)] text-xs ml-2">({skill.hits.toLocaleString()} hits)</span>
                                    </div>
                                </div>
                            </div>
                            <div className="h-1.5 w-full bg-[var(--bg-hover)] rounded-sm overflow-hidden">
                                <div
                                    className="h-full bg-red-500 rounded-sm"
                                    style={{ width: `${(incomingValue(skill) / incomingPeak) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
                {sortedIncoming.length === 0 && (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No incoming damage data available</div>
                )}
            </div>
        </div>
        )}
        </div>
    );
};
