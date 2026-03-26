import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type StatsTableShellProps = {
    header: ReactNode;
    columns: ReactNode;
    rows: ReactNode;
    expanded?: boolean;
    maxHeightClass?: string;
    animationKey?: string;
};

const contentEnter = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] } },
    exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const StatsTableShell = ({
    header,
    columns,
    rows,
    expanded,
    maxHeightClass = 'max-h-72',
    animationKey
}: StatsTableShellProps) => (
    <>
        <div className="stats-table-shell__head-stack">
            <div className="stats-table-shell__header">{header}</div>
            <div className="stats-table-shell__columns">{columns}</div>
        </div>
        <AnimatePresence mode="wait">
            <motion.div
                key={animationKey}
                className={`stats-table-shell__rows ${expanded ? 'flex-1 min-h-0 overflow-y-auto' : `${maxHeightClass} overflow-y-auto`}`}
                {...contentEnter}
            >
                {rows}
            </motion.div>
        </AnimatePresence>
    </>
);
