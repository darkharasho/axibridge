import { Cell, Legend as ChartLegend, Pie, PieChart, Tooltip } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Map as MapIcon } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

type MapDistributionSectionProps = {
    mapData: any[];
};

export const MapDistributionSection = ({
    mapData
}: MapDistributionSectionProps) => {
    useStatsSharedContext();
    return (
    <div>
        <div className="flex items-center gap-2 mb-3.5">
            <MapIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Map Distribution</h3>
        </div>
        <div className="h-[260px] sm:h-[300px] w-full">
            <ChartContainer width="100%" height="100%">
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
                            <span className="text-[color:var(--text-secondary)] font-medium ml-1">
                                {value} <span className="text-[color:var(--text-secondary)]">({entry.payload.value})</span>
                            </span>
                        )}
                    />
                </PieChart>
            </ChartContainer>
        </div>
    </div>
    );
};
