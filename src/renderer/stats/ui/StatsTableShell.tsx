import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type StatsTableShellProps = {
    header?: ReactNode;
    /**
     * Column proportions, written the way the grid wrote them: `['0.4fr', '1.5fr', '1fr']`.
     * They become a `<colgroup>` of percentages, because that is the only place a
     * fixed-layout table will take them.
     */
    cols: string[];
    /** The `<th>` cells of the one header row. Not wrapped - this supplies the row's children. */
    head: ReactNode;
    /** The `<tr>` elements of the body. */
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

/**
 * `fr` units have no meaning to a table, but the ratio between them does. Sum the
 * weights and hand each column its share. A column written without a unit ('2')
 * counts the same as '2fr'; anything unparseable falls back to an equal share
 * rather than collapsing the column to nothing.
 */
const toPercents = (cols: string[]): string[] => {
    const weights = cols.map((c) => {
        const n = Number.parseFloat(c);
        return Number.isFinite(n) && n > 0 ? n : 1;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => `${((w / total) * 100).toFixed(4)}%`);
};

/**
 * A stats table. Rows used to be `grid-cols-[...]` divs, which meant `.axi-table`
 * had no `th`, `td` or `tbody tr` to select and every table in this app re-stated
 * its own padding, alignment and rules. They are real tables now.
 *
 * The head no longer sits in a box above the scrolling rows: `--sticky` keeps it
 * in place from inside the one scroll container, which is what made two regions
 * unnecessary. `--fixed` is what lets the `fr` proportions survive the move -
 * a table's `width: 100%` is a floor, not a cap, so without it these columns
 * would size to their content and push the table out of its pane.
 */
export const StatsTableShell = ({
    header,
    cols,
    head,
    rows,
    expanded,
    maxHeightClass = 'max-h-72',
    animationKey
}: StatsTableShellProps) => (
    <>
        {header ? <div className="stats-table-shell__header">{header}</div> : null}
        <AnimatePresence mode="wait">
            <motion.div
                key={animationKey}
                className={`axi-table__scroll ${expanded ? 'flex-1 min-h-0' : maxHeightClass}`}
                {...contentEnter}
            >
                <table className="axi-table axi-table--fixed axi-table--sticky axi-table--dense">
                    <colgroup>
                        {toPercents(cols).map((width, i) => (
                            <col key={i} style={{ width }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>{head}</tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </motion.div>
        </AnimatePresence>
    </>
);
