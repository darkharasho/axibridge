import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Maximize2, X, Waves } from 'lucide-react';
import { InlineIconLabel } from '../ui/StatsViewShared';
import type { HealEffectivenessFight, HealEffectivenessSkillRow } from '../computeHealEffectivenessData';
import { useStatsSharedContext } from '../StatsViewContext';

type HealEffectivenessSectionProps = {
    fights: HealEffectivenessFight[];
};

const SkillTable = ({
    title,
    metricLabel,
    rows,
    colorClass
}: {
    title: string;
    metricLabel: string;
    rows: HealEffectivenessSkillRow[];
    colorClass: string;
}) => (
    <div className="rounded-[var(--radius-md)] overflow-hidden border border-[color:var(--border-default)] flex flex-col">
        <div className="px-4 py-3 border-b border-[color:var(--border-default)] flex items-center justify-between flex-shrink-0">
            <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">{title}</div>
            <div className="text-[10px] text-[color:var(--text-muted)]">{rows.length} {rows.length === 1 ? 'skill' : 'skills'}</div>
        </div>
        {rows.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No skill data available for this fight.</div>
        ) : (
            <>
                <div className="grid grid-cols-[2fr_0.9fr_0.7fr] gap-2 px-4 py-2 text-[10px] uppercase tracking-widest text-[color:var(--text-secondary)] border-b border-[color:var(--border-default)]">
                    <div>Skill</div>
                    <div className="text-right">{metricLabel}</div>
                    <div className="text-right">Hits</div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {rows.map((row, index) => (
                        <div
                            key={`${row.skillName}-${index}`}
                            className="grid grid-cols-[2fr_0.9fr_0.7fr] gap-2 px-4 py-2.5 text-sm text-[color:var(--text-primary)] border-b border-[color:var(--border-subtle)] hover:bg-[var(--bg-hover)] last:border-b-0"
                        >
                            <div className="min-w-0">
                                <InlineIconLabel
                                    name={row.skillName}
                                    iconUrl={row.icon}
                                    iconClassName="h-4 w-4"
                                    className="min-w-0"
                                    textClassName="truncate leading-[1.45] pt-[1px] pb-[2px]"
                                />
                            </div>
                            <div className={`text-right font-mono ${colorClass}`}>{Math.round(row.amount).toLocaleString()}</div>
                            <div className="text-right font-mono text-[color:var(--text-secondary)]">{Math.round(row.hits || 0).toLocaleString()}</div>
                        </div>
                    ))}
                </div>
            </>
        )}
    </div>
);

export const HealEffectivenessSection = ({ fights }: HealEffectivenessSectionProps) => {
    const {
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection
    } = useStatsSharedContext();
    const sectionId = 'heal-effectiveness';
    const isExpanded = expandedSection === sectionId;
    const [selectedFightIndex, setSelectedFightIndex] = useState<number | null>(null);

    const chartData = useMemo(() => {
        return fights.map((fight, index) => ({
            index,
            shortLabel: fight.shortLabel,
            fullLabel: fight.fullLabel,
            incomingDamage: fight.incomingDamage,
            healing: fight.healing,
            healingPlusBarrier: fight.healing + fight.barrier
        }));
    }, [fights]);

    const chartMaxY = useMemo(() => {
        return Math.max(
            1,
            ...chartData.map((fight) => Math.max(
                Number(fight.incomingDamage || 0),
                Number(fight.healing || 0),
                Number(fight.healingPlusBarrier || 0)
            ))
        );
    }, [chartData]);

    const selectedFight = selectedFightIndex !== null ? fights[selectedFightIndex] : null;

    return (
        <div
            className={`${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex items-center gap-2 mb-3.5">
                <Waves className="w-4 h-4 shrink-0" style={{ color: 'var(--section-healing)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Heal Effectiveness</h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Heal Effectiveness' : 'Expand Heal Effectiveness'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>
            {fights.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No heal effectiveness data available</div>
            ) : (
                <>
                    <div className="rounded-[var(--radius-md)] p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--text-secondary)]">Per Fight Totals</div>
                                <div className="text-[11px] text-[color:var(--text-secondary)] mt-1">
                                    Click a point to view skill breakdown
                                </div>
                            </div>
                            <div className="text-[11px] text-[color:var(--text-secondary)] shrink-0">
                                {fights.length} {fights.length === 1 ? 'fight' : 'fights'}
                            </div>
                        </div>
                        <div className={`${isExpanded ? 'h-[360px]' : 'h-[300px]'}`}>
                            <ChartContainer width="100%" height="100%">
                                <LineChart
                                    data={chartData}
                                    onClick={(state: any) => {
                                        const idx = Number(state?.activeTooltipIndex);
                                        if (!Number.isFinite(idx)) return;
                                        setSelectedFightIndex(selectedFightIndex === idx ? null : idx);
                                    }}
                                >
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="shortLabel" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                    <YAxis
                                        tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                        domain={[0, chartMaxY]}
                                        tickFormatter={(value: number) => formatWithCommas(value, 0)}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any, name: any) => [formatWithCommas(Number(value || 0), 0), String(name || '')]}
                                        labelFormatter={(_, payload?: readonly any[]) => String(payload?.[0]?.payload?.fullLabel || '')}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="incomingDamage"
                                        name="Incoming Damage"
                                        stroke="#fb7185"
                                        strokeWidth={2.5}

                                        dot={(props: any) => {
                                            const idx = Number(props?.payload?.index);
                                            if (!Number.isFinite(idx)) return null;
                                            const isSelected = selectedFightIndex === idx;
                                            return (
                                                <g
                                                    style={{ cursor: 'pointer', pointerEvents: 'all' }}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setSelectedFightIndex(isSelected ? null : idx);
                                                    }}
                                                >
                                                    <circle cx={props.cx} cy={props.cy} r={10} fill="transparent" />
                                                    <circle
                                                        cx={props.cx}
                                                        cy={props.cy}
                                                        r={isSelected ? 4 : 3}
                                                        fill="#fb7185"
                                                        stroke={isSelected ? 'rgba(251,191,36,0.95)' : 'rgba(15,23,42,0.9)'}
                                                        strokeWidth={isSelected ? 2 : 1}
                                                    />
                                                </g>
                                            );
                                        }}
                                        activeDot={{ r: 4 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="healing"
                                        name="Healing"
                                        stroke="#86efac"
                                        strokeWidth={2.5}

                                        dot={false}
                                        activeDot={{ r: 4 }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="healingPlusBarrier"
                                        name="Healing + Barrier"
                                        stroke="#ffffff"
                                        strokeWidth={2.5}

                                        dot={false}
                                        activeDot={{ r: 4 }}
                                    />
                                </LineChart>
                            </ChartContainer>
                        </div>
                    </div>

                    <div className={`mt-4 px-4 py-3 ${isExpanded ? 'flex-1 min-h-0 flex flex-col' : ''}`}
                    >
                        <div className="grid gap-3 md:grid-cols-4 mb-3">
                            <div>
                                <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">Incoming</div>
                                <div className="mt-1 text-lg font-black font-mono text-rose-200">
                                    {selectedFight ? formatWithCommas(selectedFight.incomingDamage, 0) : '—'}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">Healing</div>
                                <div className="mt-1 text-lg font-black font-mono" style={{ color: '#86efac' }}>
                                    {selectedFight ? formatWithCommas(selectedFight.healing, 0) : '—'}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">Barrier</div>
                                <div className="mt-1 text-lg font-black font-mono text-[color:var(--text-primary)]">
                                    {selectedFight ? formatWithCommas(selectedFight.barrier, 0) : '—'}
                                </div>
                            </div>
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">
                                        {selectedFight ? 'Selected Fight' : 'Fight Details'}
                                    </div>
                                    <div className="mt-1 text-sm text-[color:var(--text-primary)] truncate">
                                        {selectedFight ? selectedFight.fullLabel : 'Select a fight to view details'}
                                    </div>
                                </div>
                                {selectedFight && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedFightIndex(null)}
                                        className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] shrink-0"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        {selectedFight ? (
                            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${isExpanded ? 'flex-1 min-h-0' : 'items-start'}`}>
                                <SkillTable
                                    title="Outgoing Healing Skills"
                                    metricLabel="Healing"
                                    rows={selectedFight.healingSkills}
                                    colorClass="text-[color:var(--text-primary)]"
                                />
                                <SkillTable
                                    title="Incoming Damage Skills"
                                    metricLabel="Damage"
                                    rows={selectedFight.incomingDamageSkills}
                                    colorClass="text-rose-200"
                                />
                            </div>
                        ) : null}
                    </div>
                </>
            )}
        </div>
    );
};
