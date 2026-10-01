import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Users } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { ChartTooltip } from '../ui/ChartTooltip';

type SquadCompositionSectionProps = {
    sortedSquadClassData: any[];
    sortedEnemyClassData: any[];
    getProfessionIconPath: (profession: string) => string | null;
};

export const SquadCompositionSection = ({
    sortedSquadClassData,
    sortedEnemyClassData,
    getProfessionIconPath
}: SquadCompositionSectionProps) => {
    useStatsSharedContext();
    return (
        <div>
            <div className="flex items-center gap-2 mb-3.5">
                <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--axi-accent)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--axi-text)' }}>Squad Composition</h3>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <div className="text-xs font-semibold uppercase tracking-[0.25em] mb-3" style={{ color: 'var(--axi-text-dim)' }}>Classes</div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] sm:h-[300px] gap-4">
                    <div className="h-[240px] sm:h-full">
                        <ChartContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={sortedSquadClassData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius="45%"
                                    outerRadius="70%"
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {sortedSquadClassData.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" />
                                    ))}
                                </Pie>
                                <Tooltip
                                    content={<ChartTooltip />}
                                />
                            </PieChart>
                        </ChartContainer>
                    </div>
                    <div className="w-full sm:h-full overflow-y-auto pr-1">
                        <div className="w-full min-w-0 space-y-1.5 text-[11px] pb-2">
                            {sortedSquadClassData.map((entry: any) => (
                                <div key={entry.name} className="grid grid-cols-[12px_16px_minmax(0,1fr)_auto] items-center gap-2" style={{ color: 'var(--axi-text-dim)' }}>
                                    <span className="squad-comp-legend-swatch axi-diamond" style={{ backgroundColor: entry.color }} />
                                    {getProfessionIconPath(entry.name) ? (
                                        <img
                                            src={getProfessionIconPath(entry.name) as string}
                                            alt={entry.name}
                                            className="w-4 h-4 shrink-0 object-contain"
                                        />
                                    ) : (
                                        <span className="inline-block w-4 h-4" style={{ border: '1px solid var(--axi-rule)' }} />
                                    )}
                                    <span className="min-w-0 truncate">{entry.name}</span>
                                    <span className="shrink-0" style={{ color: 'var(--axi-text-dim)' }}>({entry.value})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <div className="text-xs font-semibold uppercase tracking-[0.25em] mb-3" style={{ color: 'var(--axi-text-dim)' }}>Enemy Composition</div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] sm:h-[300px] gap-4">
                    <div className="h-[240px] sm:h-full">
                        <ChartContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={sortedEnemyClassData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius="45%"
                                    outerRadius="70%"
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {sortedEnemyClassData.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" />
                                    ))}
                                </Pie>
                                <Tooltip
                                    content={<ChartTooltip />}
                                />
                            </PieChart>
                        </ChartContainer>
                    </div>
                    <div className="w-full sm:h-full overflow-y-auto pr-1">
                        <div className="w-full min-w-0 space-y-1.5 text-[11px] pb-2">
                            {sortedEnemyClassData.map((entry: any) => (
                                <div key={entry.name} className="grid grid-cols-[12px_16px_minmax(0,1fr)_auto] items-center gap-2" style={{ color: 'var(--axi-text-dim)' }}>
                                    <span className="squad-comp-legend-swatch axi-diamond" style={{ backgroundColor: entry.color }} />
                                    {getProfessionIconPath(entry.name) ? (
                                        <img
                                            src={getProfessionIconPath(entry.name) as string}
                                            alt={entry.name}
                                            className="w-4 h-4 shrink-0 object-contain"
                                        />
                                    ) : (
                                        <span className="inline-block w-4 h-4" style={{ border: '1px solid var(--axi-rule)' }} />
                                    )}
                                    <span className="min-w-0 truncate">{entry.name}</span>
                                    <span className="shrink-0" style={{ color: 'var(--axi-text-dim)' }}>({entry.value})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
};
