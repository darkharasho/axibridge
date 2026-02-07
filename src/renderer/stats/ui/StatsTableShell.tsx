import type { ComponentProps } from 'react';
import { StatsTableCardTable } from './StatsTableCard';

type StatsTableShellProps = ComponentProps<typeof StatsTableCardTable>;

export const StatsTableShell = (props: StatsTableShellProps) => (
    <StatsTableCardTable {...props} />
);
