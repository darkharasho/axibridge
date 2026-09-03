/**
 * E2E smoke test for the Map Replay feature (RPLY-001).
 *
 * Verifies that after stats aggregation completes:
 *   1. Navigating to the Replay category shows the FightPicker listbox.
 *   2. Clicking a fight card causes the replay canvas (svg.replay-canvas) to appear.
 *   3. The Play button is present and toggles to Pause after being clicked.
 *
 * Uses the app-mode test infrastructure (served React build + mocked electronAPI),
 * over real natively-parsed fixtures served from disk — see `helpers/logFixtures`
 * for why hosted EI JSON cannot drive this feature.
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

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Replay smoke test (RPLY-001)', () => {
    test('RPLY-001: fight picker renders and canvas appears after fight selection', async ({ page }) => {
        await setupReplayPage(page);

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

        // The FightPicker listbox should be visible
        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible({ timeout: 5_000 });

        // There should be at least one fight card
        const firstCard = page.getByRole('option').first();
        await expect(firstCard).toBeVisible({ timeout: 5_000 });

        // Click the first fight card to select it
        await firstCard.click();

        // The replay canvas should render after a fight is selected
        await expect(page.locator('svg.replay-canvas')).toBeVisible({ timeout: 5_000 });

        // The Play button should be present. The name must be anchored: /play/i
        // also matches "Expand Player Breakdown", "Expand Player Comparison" and
        // the other section headers further down the Stats page, so `.first()`
        // picked one of those and expanded a section instead of starting
        // playback — leaving no Pause button to find.
        const playBtn = page.getByRole('button', { name: 'Play', exact: true });
        await expect(playBtn).toBeVisible();

        // Click play — the same button relabels itself to Pause.
        await playBtn.click();
        const pauseBtn = page.getByRole('button', { name: 'Pause', exact: true });
        await expect(pauseBtn).toBeVisible({ timeout: 3_000 });

        // Pause playback
        await pauseBtn.click();
    });
});
