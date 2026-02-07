import type { ComponentProps } from 'react';
import { StatsTableCard } from './StatsTableCard';

type StatsTableLayoutProps = ComponentProps<typeof StatsTableCard>;

export const StatsTableLayout = (props: StatsTableLayoutProps) => (
    <StatsTableCard {...props} />
);
