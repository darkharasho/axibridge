import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SettingsCategory } from './settingsTaxonomy';

interface SettingsNavProps {
    categories: readonly SettingsCategory[];
    selectedCategoryId: string;
    /** The section the scroll position currently sits on, for the marker. */
    activeSectionId: string;
    /** Per-category count of sections matching the current search, or null when not searching. */
    matchCountsByCategory: Record<string, number> | null;
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
    onSelectCategory,
    onSelectSection
}: SettingsNavProps) {
    return (
        <nav className="flex flex-col gap-0.5" aria-label="Settings categories">
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
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[4px] text-sm transition-colors"
                            style={isExpanded
                                ? { background: 'var(--accent-bg)', color: 'var(--brand-primary)' }
                                : { color: 'var(--text-secondary)' }}
                        >
                            {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                : <ChevronRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{category.label}</span>
                            {matchCountsByCategory && (
                                <span
                                    className="ml-auto shrink-0 px-1.5 py-0.5 rounded-[3px] text-[9px] font-semibold"
                                    style={matchCount
                                        ? { background: 'var(--accent-bg)', color: 'var(--brand-primary)' }
                                        : { color: 'var(--text-muted)' }}
                                >
                                    {matchCount ?? 0}
                                </span>
                            )}
                        </button>
                        {isExpanded && (
                            <div className="ml-6 flex flex-col gap-0.5 py-0.5">
                                {category.sections.map((section) => (
                                    <button
                                        key={section.id}
                                        type="button"
                                        data-settings-nav-id={section.id}
                                        onClick={() => onSelectSection(section.id)}
                                        className={`text-left px-2 py-1 rounded-[4px] text-xs transition-colors ${
                                            section.id === activeSectionId ? 'text-white' : 'text-gray-400'
                                        }`}
                                    >
                                        {section.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
