import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatsView } from '../StatsView';
import { DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';
import { useStatsStore } from '../stats/statsStore';
import { STATS_CATEGORIES } from '../stats/statsTaxonomy';

// Fixture/render scaffolding copied from StatsView.integration.test.tsx's first test.
// Rendered WITHOUT `embedded` (desktop mode): renderGroup only mounts the section
// content of the currently active category (inactive groups become zero-height
// placeholders), which is what lets the setActiveCategory loop below actually
// exercise the taxonomy's category -> section wiring. In embedded mode (used by
// the other StatsView integration tests), every section renders unconditionally
// regardless of category, which would make that loop a no-op.
function renderStatsViewWithFixtures() {
    const stats = {
        fightSummaries: [],
        playerSkillBreakdowns: [],
        apmBreakdowns: [],
        skillUsageBreakdowns: [],
        fightDiffMode: {},
    };

    return render(
        <StatsView
            logs={[]}
            onBack={() => {}}
            precomputedStats={stats as any}
            statsViewSettings={DEFAULT_STATS_VIEW_SETTINGS}
            dashboardTitle="Statistics Dashboard - Overview"
        />
    );
}

describe('StatsView taxonomy integrity', () => {
    it('renders every taxonomy section id in its category (desktop mode)', async () => {
        const { container } = renderStatsViewWithFixtures();

        for (const category of STATS_CATEGORIES) {
            useStatsStore.getState().setActiveCategory(category.id);
            await waitFor(() => {
                for (const section of category.sections) {
                    expect(
                        container.querySelector(`#${CSS.escape(section.id)}`),
                        `missing #${section.id} in category ${category.id}`
                    ).toBeTruthy();
                }
            });
        }
    });

    it('data map directory lists sections from every category, not just the active one (desktop mode)', async () => {
        // Regression test for a real bug: isDataMapSectionAllowed must not be
        // built on the active-category-scoped isSectionVisible. The data map
        // itself only ever renders while its host category ('overview') is
        // active, so a category-scoped predicate would make every OTHER
        // category's sections read as disallowed and the directory would
        // collapse to a single (Overview) card with zero cross-category jumps.
        useStatsStore.getState().setActiveCategory('overview');
        renderStatsViewWithFixtures();

        await waitFor(() => {
            // squad-cohesion section — nowhere near the active 'overview' category.
            expect(screen.getByRole('button', { name: 'On Tag Review' })).toBeInTheDocument();
            // boons-strips section.
            expect(screen.getByRole('button', { name: 'Boon Output' })).toBeInTheDocument();
        });

        // The commander category's own card (and its description) must render too,
        // not just a bare Overview card.
        const commander = STATS_CATEGORIES.find((c) => c.id === 'commander');
        expect(commander).toBeTruthy();
        expect(screen.getByText(commander!.description)).toBeInTheDocument();
    });
});
