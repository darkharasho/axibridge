import { type ComponentProps } from 'react';
import { ResponsiveContainer } from 'recharts';

type ChartContainerProps = ComponentProps<typeof ResponsiveContainer>;

export function ChartContainer({ children, minWidth = 0, minHeight = 0, ...props }: ChartContainerProps) {
    return (
        <ResponsiveContainer minWidth={minWidth} minHeight={minHeight} {...props}>
            {children}
        </ResponsiveContainer>
    );
}
