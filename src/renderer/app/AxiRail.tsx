import { BarChart3, Clock3, LayoutDashboard, Settings as SettingsIcon } from 'lucide-react';
import { CommanderIcon } from '../commander/CommanderIcon';
import { STATS_CATEGORIES } from '../stats/statsTaxonomy';
import { useCategoryNavigation } from '../stats/useCategoryNavigation';

export type NavView = 'dashboard' | 'stats' | 'commander' | 'history' | 'settings';

const VIEWS = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
    { id: 'commander' as const, label: 'Commander', icon: CommanderIcon },
    { id: 'history' as const, label: 'History', icon: Clock3 },
    { id: 'settings' as const, label: 'Settings', icon: SettingsIcon },
];

export interface AxiRailProps {
    activeView: NavView;
    onSelectView: (view: NavView) => void;
    /** Categories a web upload would leave out, marked so the omission is
     *  visible before publishing rather than after. */
    unpublishedCategoryIds?: ReadonlySet<string>;
}

/**
 * The axi-design nav: one left rail carrying the five app views, with the
 * eleven stats categories nested under Stats while you are inside it.
 *
 * Eleven categories on top of five views is more than a horizontal tab strip
 * holds, which is why this replaces both the top strip and the hover-expand
 * CategoryBar rather than sitting beside them. Exactly one item is ever gold:
 * the category you are reading. The view that contains it is brightened text
 * only — an ancestor is context, not a selection, and a second gold item would
 * be a second answer to "where am I".
 */
export function AxiRail({ activeView, onSelectView, unpublishedCategoryIds }: AxiRailProps) {
    const { activeCategory, activeSectionId, handleCategoryClick, handleSectionClick } = useCategoryNavigation();
    const statsOpen = activeView === 'stats';

    return (
        <aside className="axi-rail">
            <nav className="axi-rail__nav">
                {VIEWS.map(({ id, label, icon: Icon }) => {
                    const isStats = id === 'stats';
                    // Stats is never the gold item while its categories are showing:
                    // one of them is, and it is the more specific answer.
                    const isOn = activeView === id && !(isStats && statsOpen);
                    return (
                        <div key={id}>
                            <button
                                type="button"
                                className="axi-rail__item"
                                aria-current={isOn ? 'page' : undefined}
                                data-open={isStats && statsOpen ? '' : undefined}
                                onClick={() => onSelectView(id)}
                            >
                                <Icon className="w-3.5 h-3.5 shrink-0" />
                                {label}
                            </button>

                            {isStats && statsOpen && (
                                <div className="axi-rail__sub">
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
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>
        </aside>
    );
}
