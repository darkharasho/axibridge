import { Skull, Users } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

type SquadCompositionSectionProps = {
    sortedSquadClassData: any[];
    sortedEnemyClassData: any[];
    getProfessionIconPath: (profession: string) => string | null;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

export const SquadCompositionSection = ({
    sortedSquadClassData,
    sortedEnemyClassData,
    getProfessionIconPath,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: SquadCompositionSectionProps) => (
    <div
        id="squad-composition"
        data-section-visible={isSectionVisible('squad-composition')}
        data-section-first={isFirstVisibleSection('squad-composition')}
        className={sectionClass('squad-composition', 'grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 page-break-avoid')}
    >
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                <Users className="w-5 h-5 text-green-400" />
                Squad Composition
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] sm:h-[300px] gap-4">
                <div className="h-[240px] sm:h-full">
                    <ResponsiveContainer width="100%" height="100%">
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
                                contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="w-full sm:h-full overflow-y-auto pr-1 flex items-center">
                    <div className="space-y-1.5 text-[11px] mx-auto pb-2">
                        {sortedSquadClassData.map((entry: any) => (
                            <div key={entry.name} className="flex items-center gap-2 text-gray-300">
                                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                                {getProfessionIconPath(entry.name) ? (
                                    <img
                                        src={getProfessionIconPath(entry.name) as string}
                                        alt={entry.name}
                                        className="w-4 h-4 shrink-0 object-contain"
                                    />
                                ) : (
                                    <span className="inline-block w-4 h-4 rounded-sm border border-white/10" />
                                )}
                                <span className="truncate">{entry.name}</span>
                                <span className="text-gray-500">({entry.value})</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
                <Skull className="w-5 h-5 text-red-400" />
                Enemy Composition
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px] sm:h-[300px] gap-4">
                <div className="h-[240px] sm:h-full">
                    <ResponsiveContainer width="100%" height="100%">
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
                                contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="w-full sm:h-full overflow-y-auto pr-1 flex items-center">
                    <div className="space-y-1.5 text-[11px] mx-auto pb-2">
                        {sortedEnemyClassData.map((entry: any) => (
                            <div key={entry.name} className="flex items-center gap-2 text-gray-300">
                                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: entry.color }} />
                                {getProfessionIconPath(entry.name) ? (
                                    <img
                                        src={getProfessionIconPath(entry.name) as string}
                                        alt={entry.name}
                                        className="w-4 h-4 shrink-0 object-contain"
                                    />
                                ) : (
                                    <span className="inline-block w-4 h-4 rounded-sm border border-white/10" />
                                )}
                                <span className="truncate">{entry.name}</span>
                                <span className="text-gray-500">({entry.value})</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </div>
);
