import { motion } from 'framer-motion';
import type { StatsCategory } from './statsTaxonomy';

// Springs kept only for transform/opacity animations (GPU-composited, no layout cost)
const FAST_SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface SectionSubnavProps {
    category: StatsCategory;
    activeSectionId: string;
    onSelect: (sectionId: string) => void;
}

/**
 * Section list for the active category, rendered by CategoryBar. Unlike the old
 * sidebar's per-group accordion, this has no open/closed state of its own —
 * CategoryBar only ever mounts one SectionSubnav (for the active category), so
 * "shown" and "active" are the same thing now.
 */
export function SectionSubnav({ category, activeSectionId, onSelect }: SectionSubnavProps) {
    return (
        <div className="pt-1.5 pb-1.5 px-2 space-y-0.5 rounded-[4px] border border-[color:var(--border-subtle)]">
            {category.sections.map((section, index) => {
                const SectionIcon = section.icon;
                const isActive = activeSectionId === section.id;
                return (
                    <motion.div
                        key={section.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...FAST_SPRING, delay: index * 0.03 }}
                    >
                        <button
                            type="button"
                            onClick={() => onSelect(section.id)}
                            className={`w-full h-[34px] flex items-center justify-start gap-2 px-2 text-left rounded-md transition-colors duration-150 ${isActive ? 'text-white' : 'text-[color:var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                        >
                            <SectionIcon className="w-3.5 h-3.5 text-[color:var(--brand-primary)] shrink-0" />
                            <span className="text-xs leading-tight truncate overflow-hidden">
                                {section.label}
                            </span>
                        </button>
                    </motion.div>
                );
            })}
        </div>
    );
}
