import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useStatsSharedContext } from '../StatsViewContext';
import { EASE } from '../../motion';

type SectionPanelProps = {
    sectionId: string;
    children: ReactNode;
    isLast?: boolean;
    index?: number;
};

const sectionVariants = {
    sectionHidden: { opacity: 0, y: -20 },
    sectionVisible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: {
            delay: i * 0.25,
            duration: 0.8,
            ease: EASE.outExpo,
        },
    }),
};

export function SectionPanel({
    sectionId,
    children,
    isLast = false,
    index = 0,
}: SectionPanelProps) {
    const { expandedSection, expandedPortalRef } = useStatsSharedContext();
    const isExpanded = expandedSection === sectionId;

    // When expanded, portal the entire section to the StatsView root level
    // so position:fixed escapes ancestor transforms/filters/backdrop-filters.
    if (isExpanded && expandedPortalRef?.current) {
        return (
            <>
                <div
                    id={sectionId}
                    className="scroll-mt-24 page-break-avoid"
                    style={{ padding: '18px', borderBottom: isLast ? 'none' : '1px solid var(--axi-rule)' }}
                />
                {createPortal(children, expandedPortalRef.current)}
            </>
        );
    }

    return (
        <motion.div
            id={sectionId}
            className="scroll-mt-24 page-break-avoid"
            style={{
                padding: '18px',
                borderBottom: isLast ? 'none' : '1px solid var(--axi-rule)',
                position: 'relative',
            }}
            custom={index}
            variants={sectionVariants}
            initial="sectionHidden"
            animate="sectionVisible"
        >
            {children}
        </motion.div>
    );
}
