import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StatsView } from '../StatsView';
import { DEFAULT_STATS_VIEW_SETTINGS } from '../global.d';
import { useStatsStore } from '../stats/statsStore';
import { STATS_CATEGORIES } from '../stats/statsTaxonomy';

// jsdom doesn't implement scrollIntoView; useSearchJump calls it on the jump
// target. Stub in the test env, not src (see SearchPalette.test.tsx).
beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
});

// Fixture/render scaffolding copied from StatsView.integration.test.tsx's first test.
// Rendered WITHOUT `embedded` (desktop mode): renderGroup only mounts the section
// content of the currently active category (inactive groups become zero-height
// placeholders), which is what lets the setActiveCategory loop below actually
// exercise the taxonomy's category -> section wiring. In embedded mode (used by
// the other StatsView integration tests), every section renders unconditionally
// regardless of category, which would make that loop a no-op.
//
// The five metric-home sections (and player-breakdown) gate their interactive
// content on `stats.<x>Players.length > 0` / `playerSkillBreakdowns.length > 0` —
// with none of those populated they fall back to a "No X stats available"
// placeholder and render zero per-metric/per-player elements. IncrementalAggregator
// only derives those arrays from ingested logs; when `precomputedStats` is passed
// (as here, with `logs=[]`) and has no `fightBreakdown`, `enrichPrecomputedStats`
// is an identity passthrough — so precomputedStats.offensePlayers etc. flow straight
// through to `stats.offensePlayers` unchanged. That's what the fixture rows below
// rely on, to exercise the data-metric-key/data-player-account tests further down.
const FIXTURE_ACCOUNT = 'test.1234';
const FIXTURE_PROFESSION = 'Guardian';
const FIXTURE_PROFESSION_LIST = [FIXTURE_PROFESSION];
const FIXTURE_SKILL = { id: 's1', name: 'Skill 1', damage: 10000, downContribution: 150 };

function renderStatsViewWithFixtures() {
    const stats = {
        fightSummaries: [],
        playerSkillBreakdowns: [
            {
                key: `${FIXTURE_ACCOUNT}|${FIXTURE_PROFESSION}`,
                account: FIXTURE_ACCOUNT,
                displayName: FIXTURE_ACCOUNT,
                profession: FIXTURE_PROFESSION,
                professionList: FIXTURE_PROFESSION_LIST,
                totalFightMs: 60000,
                skills: [FIXTURE_SKILL],
                skillMap: { s1: FIXTURE_SKILL },
            },
        ],
        apmBreakdowns: [],
        skillUsageBreakdowns: [],
        fightDiffMode: {},
        offensePlayers: [
            {
                account: FIXTURE_ACCOUNT,
                profession: FIXTURE_PROFESSION,
                professionList: FIXTURE_PROFESSION_LIST,
                offenseTotals: { downContribution: 500 },
                offenseRateWeights: {},
                totalFightMs: 60000,
            },
        ],
        defensePlayers: [
            {
                account: FIXTURE_ACCOUNT,
                profession: FIXTURE_PROFESSION,
                professionList: FIXTURE_PROFESSION_LIST,
                defenseTotals: { damageTaken: 1000 },
                activeMs: 60000,
            },
        ],
        damageMitigationPlayers: [
            {
                account: FIXTURE_ACCOUNT,
                profession: FIXTURE_PROFESSION,
                professionList: FIXTURE_PROFESSION_LIST,
                mitigationTotals: { totalMitigation: 800 },
                activeMs: 60000,
            },
        ],
        supportPlayers: [
            {
                account: FIXTURE_ACCOUNT,
                profession: FIXTURE_PROFESSION,
                professionList: FIXTURE_PROFESSION_LIST,
                supportTotals: { condiCleanse: 10 },
                activeMs: 60000,
            },
        ],
        healingPlayers: [
            {
                account: FIXTURE_ACCOUNT,
                profession: FIXTURE_PROFESSION,
                professionList: FIXTURE_PROFESSION_LIST,
                healingTotals: { healing: 5000 },
                activeMs: 60000,
                hasHealAddon: true,
            },
        ],
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

    it('Ctrl+K opens the search palette; selecting a section result switches category and jumps to it', async () => {
        useStatsStore.getState().setActiveCategory('overview');
        renderStatsViewWithFixtures();

        // Every section is always mounted in desktop mode (renderGroup CSS-collapses
        // inactive categories rather than unmounting them), so "On Tag Review" already
        // exists as a heading elsewhere on the page — scope queries to the palette
        // dialog throughout, or they'd be ambiguous against that heading.
        expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        const dialog = await screen.findByRole('dialog', { name: 'Search' });

        const input = within(dialog).getByRole('textbox');
        fireEvent.change(input, { target: { value: 'on tag review' } });
        const result = within(dialog).getByText('On Tag Review');
        fireEvent.click(result);

        // Palette closes synchronously on selection.
        expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
        // Category activation happens inside useSearchJump's requestAnimationFrame tick.
        await waitFor(() => {
            expect(useStatsStore.getState().activeCategory).toBe('squad-cohesion');
        });
        await waitFor(() => {
            expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
        });
    });

    it('Ctrl+K toggles the palette closed on a second press', async () => {
        renderStatsViewWithFixtures();
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        await screen.findByRole('dialog', { name: 'Search' });
        fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
        expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
    });

    it('exposes data-metric-key targets in the five metric-home sections', async () => {
        const { container } = renderStatsViewWithFixtures();
        const cases: Array<[string, string, string]> = [
            ['offense', 'offense-detailed', 'downContribution'],
            ['defense', 'defense-detailed', 'damageTaken'],
            ['defense', 'defense-mitigation', 'totalMitigation'],
            ['support-healing', 'support-detailed', 'condiCleanse'],
            ['support-healing', 'healing-stats', 'healing'],
        ];
        for (const [categoryId, sectionId, metricId] of cases) {
            useStatsStore.getState().setActiveCategory(categoryId);
            await waitFor(() => {
                const section = container.querySelector(`#${CSS.escape(sectionId)}`);
                expect(section?.querySelector(`[data-metric-key="${metricId}"]`),
                    `missing data-metric-key=${metricId} in #${sectionId}`).toBeTruthy();
            });
        }
    });

    it('exposes data-player-account rows in player breakdown', async () => {
        const { container } = renderStatsViewWithFixtures();
        useStatsStore.getState().setActiveCategory('players');
        await waitFor(() => {
            expect(container.querySelector('#player-breakdown [data-player-account]')).toBeTruthy();
        });
    });

    // The two tests above only exercise each section's non-expanded sidebar
    // tab-list / row (expandedSection defaults to null, and every metric-home
    // section + player-breakdown gates its DenseStatsTable-based dense view on
    // isExpanded). That leaves DenseStatsTable's own data-metric-key/
    // data-player-account wiring — and the per-section dense `columns`/`rows`
    // builders that feed it — completely uncovered. These two tests drive the
    // real "Expand" interaction to reach that branch.
    it('exposes data-metric-key on the offense DenseStatsTable column header when the section is expanded', async () => {
        useStatsStore.getState().setActiveCategory('offense');
        renderStatsViewWithFixtures();

        // Pre-expand, #offense-detailed holds the real (non-portalled) content,
        // including the expand toggle — see SectionPanel.tsx. The category
        // switch mounts it asynchronously (see the first test in this file),
        // so wait for it before clicking.
        await waitFor(() => {
            expect(document.getElementById('offense-detailed')).not.toBeNull();
        });
        const offenseSection = document.getElementById('offense-detailed') as HTMLElement;
        fireEvent.click(within(offenseSection).getByRole('button', { name: /Expand Offense Detailed/i }));

        // Once expanded, SectionPanel portals the section's real children to a
        // ref div at the StatsView root (see StatsView.tsx's `expandedPortalRef`)
        // and leaves #offense-detailed as an empty placeholder — so the expanded
        // content must be queried via the modal pane, not the section id. Same
        // pattern StatsView.integration.test.tsx's "shows fullscreen Player
        // Breakdown dense-table controls" test uses for player-breakdown.
        await waitFor(() => {
            const modalPane = document.querySelector('.modal-pane');
            expect(
                modalPane?.querySelector('[data-metric-key="downContribution"]'),
                'missing data-metric-key=downContribution in the expanded offense DenseStatsTable'
            ).toBeTruthy();
        });
    });

    it('exposes data-player-account on player breakdown DenseStatsTable rows when the section is expanded', async () => {
        useStatsStore.getState().setActiveCategory('players');
        renderStatsViewWithFixtures();

        await waitFor(() => {
            expect(document.getElementById('player-breakdown')).not.toBeNull();
        });
        const playerBreakdownSection = document.getElementById('player-breakdown') as HTMLElement;
        fireEvent.click(within(playerBreakdownSection).getByRole('button', { name: /Expand Player Breakdown/i }));

        // Expanding forces class mode (PlayerBreakdownSection.tsx:
        // `(isExpanded ? 'class' : viewMode) === 'player'` is never true while
        // expanded), so the sidebar becomes the class-bucket list. Select the one
        // bucket the fixture player belongs to — that's what makes
        // activeClassBreakdown non-null and renders the class-mode dense table
        // (the `playerAccount: entry.player.account` row builder).
        await waitFor(() => {
            expect(screen.getByText(/Squad Classes/i)).toBeInTheDocument();
        });
        const modalPane = document.querySelector('.modal-pane') as HTMLElement;
        fireEvent.click(within(modalPane).getByRole('button', { name: new RegExp(FIXTURE_PROFESSION, 'i') }));

        await waitFor(() => {
            expect(
                modalPane.querySelector(`[data-player-account="${FIXTURE_ACCOUNT}"]`),
                `missing data-player-account=${FIXTURE_ACCOUNT} in the expanded player breakdown DenseStatsTable`
            ).toBeTruthy();
        });
    });
});
