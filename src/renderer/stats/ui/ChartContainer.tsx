import { type ComponentProps } from 'react';
import { ResponsiveContainer } from 'recharts';

type ChartContainerProps = ComponentProps<typeof ResponsiveContainer>;

/* Every recharts chart in the app comes through here, which is what makes it
   the one place the chart opts into the language. `.axi-chart` is upstream's
   binding for a library chart's furniture - grid, axis, ticks, hover band,
   brush, the ink edge on every point, bar and slice - so the twenty-seven
   rules that used to draw all of that in axi-design.css are gone, and a
   section that wants the furniture asks for nothing. */
export function ChartContainer({ children, minWidth = 0, minHeight = 0, className, ...props }: ChartContainerProps) {
    return (
        <ResponsiveContainer minWidth={minWidth} minHeight={minHeight} className={`axi-chart${className ? ` ${className}` : ''}`} {...props}>
            {children}
        </ResponsiveContainer>
    );
}
