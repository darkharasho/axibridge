import { Children, cloneElement, isValidElement, type ReactElement } from 'react';
import { ResponsiveContainer } from 'recharts';
import type { ComponentProps } from 'react';

type ChartContainerProps = ComponentProps<typeof ResponsiveContainer>;

/**
 * Wrapper around recharts ResponsiveContainer that disables animations on all
 * Bar, Line, Scatter, Area, and Pie children. Recharts animations get interrupted
 * by React re-renders and never complete, leaving charts permanently empty.
 */
function disableAnimations(children: React.ReactNode): React.ReactNode {
    return Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const displayName = (child.type as any)?.displayName || (child.type as any)?.name || '';
        const isChartSeries = /^(Line|Bar|Area|Scatter|Pie|Radar)$/.test(displayName);
        const newProps: Record<string, any> = {};
        if (isChartSeries) {
            newProps.isAnimationActive = false;
        }
        const newChildren = child.props.children
            ? disableAnimations(child.props.children)
            : child.props.children;
        if (Object.keys(newProps).length > 0 || newChildren !== child.props.children) {
            return cloneElement(child as ReactElement<any>, newProps, newChildren);
        }
        return child;
    });
}

export function ChartContainer({ children, ...props }: ChartContainerProps) {
    return (
        <ResponsiveContainer {...props}>
            {isValidElement(children)
                ? (cloneElement(children as ReactElement<any>, {}, disableAnimations((children as ReactElement<any>).props.children)) as ReactElement)
                : children}
        </ResponsiveContainer>
    );
}
