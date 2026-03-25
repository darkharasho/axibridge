import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Users } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

type TimelineSectionProps = {
    timelineData: any[];
    timelineFriendlyScope: 'squad' | 'squadAllies';
    setTimelineFriendlyScope: (value: 'squad' | 'squadAllies') => void;
};

export const TimelineSection = ({
    timelineData,
    timelineFriendlyScope,
    setTimelineFriendlyScope
}: TimelineSectionProps) => {
    useStatsSharedContext();
    return (
    <div>
        <div className="flex items-center gap-2 mb-3.5 flex-wrap">
            <Users className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Squad vs Enemy Size</h3>
            <div className="ml-auto flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>Friendly Count</span>
                <div className="flex items-center gap-1 rounded-full p-1" style={{ border: '1px solid var(--border-default)', background: 'transparent' }}>
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
                                    ? 'bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]'
                                    : 'text-[color:var(--text-secondary)] border border-transparent'
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
        {timelineData.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No timeline data available</div>
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
};
