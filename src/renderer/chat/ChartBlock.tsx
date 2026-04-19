import { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
    LineChart, Line, Legend,
} from 'recharts';

interface ChartSeries {
    key: string;
    color?: string;
    label?: string;
}

export interface ChartSpec {
    type: 'bar' | 'line';
    title?: string;
    data: Array<Record<string, string | number>>;
    xKey: string;
    series: ChartSeries[];
    unit?: string;        // appended to tooltip values e.g. "%" or ""
    horizontal?: boolean; // horizontal bar chart (flip axes)
}

const DEFAULT_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#eab308'];

function abbreviate(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
}

function ChartTooltip({ active, payload, label, unit = '' }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs shadow-lg">
            <p className="text-gray-300 mb-0.5">{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} style={{ color: p.color }}>
                    {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('en-US') : p.value}{unit}
                </p>
            ))}
        </div>
    );
}

export function ChartBlock({ content }: { content: string }) {
    const spec = useMemo<ChartSpec | null>(() => {
        try { return JSON.parse(content.trim()); }
        catch { return null; }
    }, [content]);

    if (!spec || !spec.data?.length || !spec.series?.length) {
        return <pre className="bg-gray-900 rounded p-2 my-1 text-xs overflow-x-auto"><code>{content}</code></pre>;
    }

    const { type, title, data, xKey, series, unit = '', horizontal = false } = spec;
    const axisStyle = { fill: '#9ca3af', fontSize: 11 };

    if (type === 'bar' && horizontal) {
        const barHeight = Math.min(Math.max(data.length * 28 + 50, 120), 400);
        return (
            <div className="my-2">
                {title && <p className="text-xs text-gray-400 mb-1 font-medium">{title}</p>}
                <ResponsiveContainer width="100%" height={barHeight}>
                    <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                        <YAxis dataKey={xKey} type="category" tick={axisStyle} width={140} />
                        <XAxis type="number" tick={axisStyle} tickFormatter={abbreviate} />
                        <Tooltip content={<ChartTooltip unit={unit} />} />
                        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                        {series.map((s, i) => (
                            <Bar
                                key={s.key}
                                dataKey={s.key}
                                name={s.label ?? s.key}
                                fill={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                                radius={[0, 3, 3, 0]}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        );
    }

    if (type === 'bar') {
        return (
            <div className="my-2">
                {title && <p className="text-xs text-gray-400 mb-1 font-medium">{title}</p>}
                <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey={xKey} tick={axisStyle} />
                        <YAxis tick={axisStyle} tickFormatter={abbreviate} />
                        <Tooltip content={<ChartTooltip unit={unit} />} />
                        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                        {series.map((s, i) => (
                            <Bar
                                key={s.key}
                                dataKey={s.key}
                                name={s.label ?? s.key}
                                fill={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                                radius={[3, 3, 0, 0]}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        );
    }

    // Line chart
    return (
        <div className="my-2">
            {title && <p className="text-xs text-gray-400 mb-1 font-medium">{title}</p>}
            <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey={xKey} tick={axisStyle} />
                    <YAxis tick={axisStyle} tickFormatter={abbreviate} />
                    <Tooltip content={<ChartTooltip unit={unit} />} />
                    {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
                    {series.map((s, i) => (
                        <Line
                            key={s.key}
                            type="monotone"
                            dataKey={s.key}
                            name={s.label ?? s.key}
                            stroke={s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                            strokeWidth={2}
                            dot={false}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
