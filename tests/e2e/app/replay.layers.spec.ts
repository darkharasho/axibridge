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
 * Uses the same app-mode infrastructure as replay.spec.ts.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createElectronAPIMock } from './fixtures/electronAPIMock';

// ── Fixture IDs (20260117 series — 7 real WvW fights) ─────────────────────────
const FIXTURE_IDS = [
    '20260117-175120',
    '20260117-180135',
    '20260117-180259',
    '20260117-180458',
    '20260117-180636',
    '20260117-180826',
    '20260117-181030',
];

const FIXTURE_DIR = path.resolve(process.cwd(), 'test-fixtures/boon');

/** Build metadata-only mock logs (no details field). */
function makeMockLogs() {
    return FIXTURE_IDS.map((id, i) => ({
        id: `log-${id}`,
        filePath: `/fake/logs/${id}.zevtc`,
        fightName: 'Green Alpine Borderlands',
        permalink: `https://dps.report/${id}`,
        uploadTime: Date.now() - (FIXTURE_IDS.length - i) * 60_000,
        encounterDuration: '60',
        status: 'success',
        dashboardSummary: {
            hasPlayers: true,
            hasTargets: true,
            squadCount: 35,
            enemyCount: 40,
            isWin: true,
            squadDeaths: 2,
            enemyDeaths: 5,
        },
    }));
}

/** Set up the page with mocked electronAPI and fixture route interception. */
async function setupReplayPage(page: Page) {
    await page.addInitScript(createElectronAPIMock, {
        logs: makeMockLogs(),
        detailsFixtureIds: FIXTURE_IDS,
        detailsDelayMs: 50,
    });

    // Intercept fixture requests and serve real EI JSON from disk
    await page.route('**/__test-fixtures__/*.json', async (route) => {
        const url = route.request().url();
        const match = url.match(/__test-fixtures__\/(.+)\.json/);
        if (!match) {
            await route.abort();
            return;
        }
        const fixtureId = match[1];
        const filePath = path.join(FIXTURE_DIR, `${fixtureId}.json`);
        if (!fs.existsSync(filePath)) {
            await route.fulfill({ status: 404, body: 'Not found' });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: fs.readFileSync(filePath, 'utf8'),
        });
    });

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

    // Select the first fight card
    const firstCard = page.getByRole('option').first();
    await expect(firstCard).toBeVisible({ timeout: 5_000 });
    await firstCard.click();

    // Wait for the replay canvas to appear
    await expect(page.locator('svg.replay-canvas')).toBeVisible({ timeout: 5_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Replay layer toggles (RPLY-002)', () => {
    test('RPLY-002-a: Centroid + spread ring overlay toggles on', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        // Open the Layers popover
        await page.getByRole('button', { name: /layers/i }).click();

        // Toggle "Centroid + spread ring"
        await page.getByLabel('Centroid + spread ring').check();

        // The centroid overlay should be present in the SVG
        await expect(page.locator('[data-overlay="centroid"]')).toBeVisible({ timeout: 3_000 });
    });

    test('RPLY-002-b: Tag range rings overlay toggles on', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        await page.getByRole('button', { name: /layers/i }).click();

        // Toggle "Tag range rings"
        await page.getByLabel('Tag range rings (600 / 1200)').check();

        await expect(page.locator('[data-overlay="tag-rings"]')).toBeVisible({ timeout: 3_000 });
    });

    test('RPLY-002-c: Squad health strip toggles on', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        await page.getByRole('button', { name: /layers/i }).click();

        // Toggle "Squad health strip"
        await page.getByLabel('Squad health strip').check();

        await expect(page.locator('.replay-health-strip')).toBeVisible({ timeout: 3_000 });
    });

    test('RPLY-002-d: Heatmap Deaths radio shows foreignObject canvas', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        await page.getByRole('button', { name: /layers/i }).click();

        // Select the "Deaths" heatmap radio
        await page.getByLabel(/deaths/i).check();

        // The heatmap renders inside a foreignObject element
        await expect(page.locator('svg.replay-canvas foreignObject')).toBeVisible({ timeout: 3_000 });
    });

    test('RPLY-002-e: All-parties panel, spotlight button, and spotlight dismiss', async ({ page }) => {
        await setupReplayPage(page);
        await navigateToReplayCanvas(page);

        await page.getByRole('button', { name: /layers/i }).click();

        // Toggle "All-parties panel"
        await page.getByLabel('All-parties panel').check();

        // The all-parties panel should appear
        await expect(page.locator('.replay-party-panel.all-parties')).toBeVisible({ timeout: 3_000 });

        // Click the first party button to trigger spotlight
        await page.locator('.replay-party-panel.all-parties button').first().click();

        // A "Spotlight: Party N" button should appear in the controls row
        const spotlightBtn = page.getByRole('button', { name: /spotlight:/i });
        await expect(spotlightBtn).toBeVisible({ timeout: 3_000 });

        // Clicking the spotlight button removes it
        await spotlightBtn.click();
        await expect(spotlightBtn).toBeHidden({ timeout: 3_000 });
    });
});
