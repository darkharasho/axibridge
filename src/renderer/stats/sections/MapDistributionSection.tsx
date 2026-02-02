import { Map as MapIcon } from 'lucide-react';
import { Cell, Legend as ChartLegend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

type MapDistributionSectionProps = {
    mapData: any[];
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

export const MapDistributionSection = ({
    mapData,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: MapDistributionSectionProps) => (
    <div
        id="map-distribution"
        data-section-visible={isSectionVisible('map-distribution')}
        data-section-first={isFirstVisibleSection('map-distribution')}
        className={sectionClass('map-distribution', 'bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid scroll-mt-24')}
    >
        <h3 className="text-lg font-bold text-gray-200 mb-6 flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-blue-400" />
            Map Distribution
        </h3>
        <div className="h-[260px] sm:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={mapData}
                        cx="50%"
                        cy="50%"
                        innerRadius="45%"
                        outerRadius="70%"
                        paddingAngle={5}
                        dataKey="value"
                    >
                        {mapData.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.5)" />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                    />
                    <ChartLegend
                        verticalAlign="bottom"
                        height={36}
                        // @ts-ignore
                        payload={mapData.map(item => ({
                            id: item.name,
                            type: 'square',
                            value: item.name,
                            color: item.color,
                            payload: item
                        }))}
                        formatter={(value: any, entry: any) => (
                            <span className="text-gray-300 font-medium ml-1">
                                {value} <span className="text-gray-500">({entry.payload.value})</span>
                            </span>
                        )}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    </div>
);
