/**
 * E2E smoke test for Map Replay layer toggles (RPLY-002).
 *
 * Verifies that the Layers popover controls correctly toggle overlays on/off:
 *   1. Centroid + spread ring → [data-overlay="centroid"]
 *   2. Tag range rings → [data-overlay="tag-rings"]
 *   3. Squad health strip → .replay-health-strip
 *   4. Heatmap Deaths radio → foreignObject canvas
 *   5. All-parties panel → .replay-party-panel.all-parties
 *      → click first party button → Spotlight: button appears
 *      → click spotlight button → it disappears
 *
 * Uses the same app-mode infrastructure and fixtures as replay.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import { createElectronAPIMock } from './fixtures/electronAPIMock';
import { FIXTURE_IDS, makeFixtureLogs, serveLogFixtures } from './helpers/logFixtures';

/** Set up the page with mocked electronAPI and fixture route interception. */
async function setupReplayPage(page: Page) {
    await page.addInitScript(createElectronAPIMock, {
        logs: makeFixtureLogs(),
        detailsFixtureIds: FIXTURE_IDS,
        detailsDelayMs: 50,
    });
    await serveLogFixtures(page);

    await page.goto('/');
    await page.locator('.app-titlebar').waitFor({ state: 'visible', timeout: 10_000 });
}

/** Navigate to Stats → wait for aggregation → Map → select first fight → wait for canvas. */
async function navigateToReplayCanvas(page: Page) {
    // Navigate to the Stats tab
    await page.getByRole('button', { name: /^Stats$/i }).click();

    // Wait for aggregation to complete (particle spinner clears)
    await expect(
        page.locator('.stats-particle-spinner')
    ).toBeHidden({ timeout: 45_000 });

    // Navigate to the Replay nav category (renamed from "Map" in the taxonomy redesign)
    await page.getByRole('button', { name: /^Replay$/i }).click();

    // Clicking the nav entry leaves the pointer over the sidebar, which expands
    // on hover and overlays the picker bar — the click below then retries until
    // the test times out. Park the pointer over the content area first.
    await page.mouse.move(900, 500);

    // The fight picker starts collapsed (`pickerCollapsed` defaults to true in
    // ReplayView), so the listbox is not in the DOM until the identity pill is
    // asked to open it. Located by title, not by role+name: the pill's opener
    // shows the fight it is on, so its accessible name is that label
    // ("Fight A · 1:00 · 20 · 1 of 3") and `title` is only an accname fallback
    // for an element with no content. Matching on the title text as a name
    // silently matched nothing and clicked until the test timed out.
    await page.getByTitle('Show all fights').click();

    // Select the first fight card
    const firstCard = page.getByRole('option').first();
    await expect(firstCard).toBeVisible({ timeout: 5_000 });
    await firstCard.click();

    // Wait for the replay canvas to appear
    await expect(page.locator('svg.replay-canvas')).toBeVisible({ timeout: 5_000 });
}

/**
 * Turn a layer on by its chip.
 *
 * `.check()` on the input cannot work here and never will: `LayerToggle`
 * renders a real checkbox (so screen readers and `getByRole('checkbox')` keep
 * working) but sizes it 1x1 at `opacity: 0, pointerEvents: 'none'` inside the
 * styled `<label>` that is the actual chip. Playwright aims at the input and
 * reports the label's own text as intercepting the click — which is the
 * markup working as designed, not a defect. Click the chip like a person
 * does, then assert the input agreed.
 */
async function enableLayer(page: Page, label: string) {
    await page.getByText(label, { exact: true }).click();
    await expect(page.getByLabel(label)).toBeChecked({ timeout: 3_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Replay layer toggles (RPLY-002)', () => {
    test('RPLY-002-a: Centroid + spread ring overlay toggles on', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        // Open the Layers popover
        await page.getByTitle('Show layers').click();

        // Toggle "Centroid + spread ring"
        await enableLayer(page, 'Centroid + spread ring');

        // The centroid overlay should be present in the SVG
        await expect(page.locator('[data-overlay="centroid"]')).toBeVisible({ timeout: 3_000 });
    });

    test('RPLY-002-b: Tag range rings overlay toggles on', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        await page.getByTitle('Show layers').click();

        // Toggle "Tag range rings"
        await enableLayer(page, 'Tag range rings (600 / 1200)');

        await expect(page.locator('[data-overlay="tag-rings"]')).toBeVisible({ timeout: 3_000 });
    });

    test('RPLY-002-c: Squad health strip toggles on', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        await page.getByTitle('Show layers').click();

        // Toggle "Squad health strip"
        await enableLayer(page, 'Squad health strip');

        // The strip used to be an absolute overlay across the top of the map. It
        // is banded above the roster it summarises now, so it only mounts once
        // the squad panel is open — the layer toggle alone renders nothing.
        await page.getByTitle('Expand squad panel').click();
        await expect(page.locator('.replay-health-strip')).toBeVisible({ timeout: 3_000 });
    });

    test('RPLY-002-d: Heatmap Deaths radio shows foreignObject canvas', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        await page.getByTitle('Show layers').click();

        // Select the "Deaths" heatmap radio
        await page.getByLabel(/deaths/i).check();

        // The heatmap renders inside a foreignObject element
        await expect(page.locator('svg.replay-canvas foreignObject')).toBeVisible({ timeout: 3_000 });
    });

    /**
     * Was "All-parties panel, spotlight button, and spotlight dismiss".
     *
     * Neither the "All-parties panel" layer toggle nor `.replay-party-panel`
     * exists in the renderer any more, so the original test could not pass.
     * The spotlight itself survived that removal. It now lives on a crosshair
     * button beside each "Party N" heading in the squad panel — the heading row
     * itself took over collapse/expand, being the more frequent action. These
     * two tests cover the grouping, and the spotlight round trip.
     */
    test('RPLY-002-e: squad panel opens and groups members by party', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        // The squad panel starts collapsed (`panelCollapsed` defaults to true).
        await page.getByTitle('Expand squad panel').click();

        // Header is a bare count now ("Squad · 12"); it never said "members".
        const header = page.getByText(/Squad · \d+$/);
        await expect(header).toBeVisible({ timeout: 3_000 });

        // Members are bucketed under "Party N" headings, which carry a member
        // count in a trailing span — so the name does not end at the number.
        await expect(page.getByRole('button', { name: /^Party \d+/ }).first()).toBeVisible({ timeout: 3_000 });
    });

    test('RPLY-002-f: the party crosshair toggles the spotlight on and the chip dismisses it', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        await page.getByTitle('Expand squad panel').click();

        // The crosshair beside the heading is the spotlight control; the heading
        // row itself collapses the party. Only the crosshair is aria-pressed.
        // Located by `aria-pressed`, not by title: the title flips to "Clear
        // spotlight on Party N" the moment it is pressed, so a title locator
        // stops resolving on exactly the assertion that matters. The crosshair
        // is the only pressable button in the panel.
        const crosshair = page.locator('[data-hud="squad"] button[aria-pressed]').first();
        await expect(crosshair).toBeVisible({ timeout: 3_000 });
        await crosshair.click();

        const chip = page.getByRole('button', { name: /^Spotlight: Party \d+/ });
        await expect(chip).toBeVisible({ timeout: 3_000 });
        await expect(crosshair).toHaveAttribute('aria-pressed', 'true');

        // The chip clears it.
        await chip.click();
        await expect(chip).toBeHidden({ timeout: 3_000 });
        await expect(crosshair).toHaveAttribute('aria-pressed', 'false');
    });
});
