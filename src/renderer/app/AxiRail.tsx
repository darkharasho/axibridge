import { STATS_CATEGORIES } from '../stats/statsTaxonomy';
import { useCategoryNavigation } from '../stats/useCategoryNavigation';

export interface AxiRailProps {
    /** Categories a web upload would leave out, marked so the omission is
     *  visible before publishing rather than after. */
    unpublishedCategoryIds?: ReadonlySet<string>;
}

/**
 * The axi-design stats nav: the eleven categories as a fixed left rail, with
 * the active category's sections nested under it.
 *
 * Only Stats carries a rail. The other views have a handful of things to say
 * and the top tab strip says them; eleven categories plus their sections is
 * more than a strip holds, which is why this replaces the hover-expand
 * CategoryBar here and nowhere else. Exactly one item is ever gold: the
 * category you are reading. A section is where that category happens to be
 * scrolled to — a smaller claim, so it gets brightened text, not a fill.
 */
export function AxiRail({ unpublishedCategoryIds }: AxiRailProps) {
    const { activeCategory, activeSectionId, handleCategoryClick, handleSectionClick } = useCategoryNavigation();

    return (
        <aside className="axi-rail">
            <nav className="axi-rail__nav">
                {STATS_CATEGORIES.map((category) => {
                    const isActiveCategory = category.id === activeCategory;
                    return (
                        <div key={category.id}>
                            <button
                                type="button"
                                className="axi-rail__item"
                                aria-current={isActiveCategory ? 'page' : undefined}
                                onClick={() => handleCategoryClick(category.id)}
                            >
                                {category.label}
                                {unpublishedCategoryIds?.has(category.id) && (
                                    <span className="axi-rail__mark" title="Left out of published reports">Local</span>
                                )}
                            </button>
                            {isActiveCategory && category.sections.length > 1 && (
                                <div className="axi-rail__sections">
                                    {category.sections.map((section) => (
                                        <button
                                            key={section.id}
                                            type="button"
                                            className="axi-rail__section"
                                            data-on={activeSectionId === section.id ? '' : undefined}
                                            onClick={() => handleSectionClick(section.id)}
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
        </aside>
    );
}
