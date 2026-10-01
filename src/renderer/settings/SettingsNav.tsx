import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SettingsCategory } from './settingsTaxonomy';

interface SettingsNavProps {
    categories: readonly SettingsCategory[];
    selectedCategoryId: string;
    /** The section the scroll position currently sits on, for the marker. */
    activeSectionId: string;
    /** Per-category count of sections matching the current search, or null when not searching. */
    matchCountsByCategory: Record<string, number> | null;
    /**
     * Section ids matching the current search, or null when not searching.
     * Filters the expanded category's subsection list the same way the
     * mobile stepper already filtered `FLATTENED_SECTIONS` — without this,
     * an expanded category during a search still lists every subsection,
     * including ones the query doesn't match.
     */
    matchedSectionIds: readonly string[] | null;
    onSelectCategory: (categoryId: string) => void;
    onSelectSection: (sectionId: string) => void;
}

/**
 * The nested Settings rail: five collapsible categories, one expanded at a
 * time. Expanding one collapses the others deliberately — with sixteen
 * subsections, letting all five expand reproduces the flat jump list this
 * design exists to remove.
 */
export function SettingsNav({
    categories,
    selectedCategoryId,
    activeSectionId,
    matchCountsByCategory,
    matchedSectionIds,
    onSelectCategory,
    onSelectSection
}: SettingsNavProps) {
    return (
        <nav className="flex flex-col gap-1.5" aria-label="Settings categories">
            {categories.map((category) => {
                const isExpanded = category.id === selectedCategoryId;
                const Icon = category.icon;
                const matchCount = matchCountsByCategory?.[category.id];
                return (
                    <div key={category.id}>
                        <button
                            type="button"
                            onClick={() => onSelectCategory(category.id)}
                            aria-expanded={isExpanded}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm transition-colors"
                            style={isExpanded
                                ? { background: 'var(--axi-surface-paint)', color: 'var(--axi-text-dim)' }
                                : { color: 'var(--axi-text-dim)' }}
                        >
                            {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                : <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{category.label}</span>
                            {matchCountsByCategory && (
                                <span
                                    className="ml-auto shrink-0 px-1.5 py-0.5 text-[9px] font-semibold"
                                    style={matchCount
                                        ? { background: 'var(--axi-surface-paint)', color: 'var(--axi-text-dim)' }
                                        : { color: 'var(--axi-text-faint)' }}
                                >
                                    {matchCount ?? 0}
                                </span>
                            )}
                        </button>
                        {isExpanded && (() => {
                            const sections = matchedSectionIds
                                ? category.sections.filter((section) => matchedSectionIds.includes(section.id))
                                : category.sections;
                            return (
                                <div className="ml-6 flex flex-col gap-1 py-1">
                                    {sections.length === 0 && (
                                        <div className="px-2 py-1 text-[11px]" style={{ color: 'var(--axi-text-faint)' }}>
                                            No matches
                                        </div>
                                    )}
                                    {sections.map((section) => (
                                        <button
                                            key={section.id}
                                            type="button"
                                            data-settings-nav-id={section.id}
                                            onClick={() => onSelectSection(section.id)}
                                            className={`axi-action text-left px-2 py-1 text-xs ${
                                                section.id === activeSectionId ? 'axi-ink-plain' : 'axi-ink-dim'
                                            }`}
                                        >
                                            {section.label}
                                        </button>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                );
            })}
        </nav>
    );
}
