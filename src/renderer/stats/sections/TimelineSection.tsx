import { Users } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type TimelineSectionProps = {
    timelineData: any[];
    timelineFriendlyScope: 'squad' | 'squadAllies';
    setTimelineFriendlyScope: (value: 'squad' | 'squadAllies') => void;
    isSectionVisible: (id: string) => boolean;
    isFirstVisibleSection: (id: string) => boolean;
    sectionClass: (id: string, base: string) => string;
};

export const TimelineSection = ({
    timelineData,
    timelineFriendlyScope,
    setTimelineFriendlyScope,
    isSectionVisible,
    isFirstVisibleSection,
    sectionClass
}: TimelineSectionProps) => (
    <div
        id="timeline"
        data-section-visible={isSectionVisible('timeline')}
        data-section-first={isFirstVisibleSection('timeline')}
        className={sectionClass('timeline', 'bg-white/5 border border-white/10 rounded-2xl p-6 page-break-avoid scroll-mt-24')}
    >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                <Users className="w-5 h-5 text-green-400" />
                Squad vs Enemy Size
            </h3>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-500">
                <span className="text-gray-400">Friendly Count</span>
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
                    {([
                        { value: 'squad', label: 'Squad' },
                        { value: 'squadAllies', label: 'Squad + Allies' }
                    ] as const).map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setTimelineFriendlyScope(option.value)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                timelineFriendlyScope === option.value
                                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                                    : 'border border-transparent text-gray-400 hover:text-gray-200'
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
        {timelineData.length === 0 ? (
            <div className="text-center text-gray-500 italic py-10">No timeline data available</div>
        ) : (
            <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                        <XAxis
                            dataKey="index"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                        />
                        <YAxis
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                            width={36}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem', color: '#fff' }}
                            labelFormatter={(_value, payload) => {
                                const point = payload?.[0]?.payload;
                                const predicted = point?.isWin === true
                                    ? 'Win'
                                    : point?.isWin === false
                                        ? 'Loss'
                                        : 'Unknown';
                                const logLabel = typeof point?.label === 'string' && point.label.trim().length > 0
                                    ? point.label
                                    : `Log ${_value}`;
                                return `${logLabel} • ${predicted}`;
                            }}
                            formatter={(value: any, name?: string) => [
                                value,
                                name === 'friendly'
                                    ? (timelineFriendlyScope === 'squad' ? 'Squad' : 'Squad + Allies')
                                    : 'Enemies'
                            ]}
                        />
                        <Line
                            type="monotone"
                            dataKey={timelineFriendlyScope === 'squad' ? 'squadCount' : 'friendlyCount'}
                            name="friendly"
                            stroke="#22c55e"
                            strokeWidth={2}
                            dot={{ r: 3, fill: '#22c55e' }}
                            activeDot={{ r: 5 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="enemies"
                            stroke="#ef4444"
                            strokeWidth={2}
                            dot={{ r: 3, fill: '#ef4444' }}
                            activeDot={{ r: 5 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        )}
    </div>
);
