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
                        className="rounded-[4px] border p-3 flex flex-col gap-2"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}
                    >
                        <div className="flex items-center gap-2">
                            <CategoryIcon className="w-4 h-4 text-[color:var(--brand-primary)]" />
                            <span className="text-xs font-semibold uppercase tracking-[0.18em]">{category.label}</span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{category.description}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {sections.map((section) => (
                                <button
                                    key={section.id}
                                    type="button"
                                    title={section.description}
                                    onClick={() => onNavigate(category.id, section.id)}
                                    className="text-[11px] px-2 py-1 rounded-sm border hover:bg-[var(--bg-hover)]"
                                    style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
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
