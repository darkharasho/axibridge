import { STATS_CATEGORIES } from '../statsTaxonomy';

export interface DataMapSectionProps {
    onNavigate: (categoryId: string, sectionId: string) => void;
    isSectionAllowed?: (id: string) => boolean;
}

export function DataMapSection({ onNavigate, isSectionAllowed }: DataMapSectionProps) {
    const allowed = isSectionAllowed ?? (() => true);
    return (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {STATS_CATEGORIES.map((category) => {
                const sections = category.sections.filter((s) => s.id !== 'data-map' && allowed(s.id));
                if (sections.length === 0) return null;
                const CategoryIcon = category.icon;
                return (
                    <div
                        key={category.id}
                        className="axi-panel [--axi-panel-pad:12px] flex flex-col gap-2"
                    >
                        <div className="flex items-center gap-2">
                            <CategoryIcon className="w-4 h-4 text-[color:var(--axi-accent)]" />
                            <span className="text-xs font-semibold uppercase tracking-[0.18em]">{category.label}</span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--axi-text-dim)' }}>{category.description}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {sections.map((section) => (
                                <button
                                    key={section.id}
                                    type="button"
                                    title={section.description}
                                    onClick={() => onNavigate(category.id, section.id)}
                                    className="axi-btn axi-btn--xs"
                                    style={{ borderColor: 'var(--axi-rule)', color: 'var(--axi-text)' }}
                                >
                                    {section.label}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
