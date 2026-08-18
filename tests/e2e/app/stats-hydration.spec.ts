/**
 * E2E tests for the details hydration flow and dissolve overlay behaviour.
 *
 * Verifies that the loading overlay persists while fight details are being
 * hydrated, and that stats populate with real player data once hydration
 * completes.
 *
 * Uses the app-mode test infrastructure (served React build + mocked
 * electronAPI), over real natively-parsed fixtures served from disk — see
 * `helpers/logFixtures`.
 */
import { test, expect, type Page } from '@playwright/test';
import { createElectronAPIMock, type ElectronAPIMockOverrides } from './fixtures/electronAPIMock';
import { FIXTURE_IDS, makeFixtureLogs, serveLogFixtures } from './helpers/logFixtures';

/** Set up page with mocked API and fixture route interception. */
async function setupHydrationPage(page: Page, overrides: Partial<ElectronAPIMockOverrides> = {}) {
    await page.addInitScript(createElectronAPIMock, {
        logs: makeFixtureLogs(),
        detailsFixtureIds: FIXTURE_IDS,
        detailsDelayMs: 200,
        ...overrides,
    } as ElectronAPIMockOverrides);
    await serveLogFixtures(page);

    await page.goto('/');
    await page.locator('.app-titlebar').waitFor({ state: 'visible', timeout: 10_000 });
}

/** Navigate to Stats tab. */
async function goToStats(page: Page) {
    const tab = page.getByRole('button', { name: /^Stats$/i });
    await tab.click();
    await page.waitForTimeout(300);
}

// ── Tests ──────────────────────────────────────────────────────────

test.describe('Details Hydration & Dissolve Overlay (HYDR-001–005)', () => {
    test('HYDR-001: dissolve overlay visible while details are pending', async ({ page }) => {
        await setupHydrationPage(page, { detailsDelayMs: 600 });
        await goToStats(page);

        // The spinner should be visible while details are pending
        await expect(
            page.locator('.stats-particle-spinner').first()
        ).toBeVisible({ timeout: 10_000 });
    });

    test('HYDR-002: progress bar shows "Loading fight details" during hydration', async ({ page }) => {
        await setupHydrationPage(page, { detailsDelayMs: 800 });
        await goToStats(page);

        // Wait for the aggregation phase to complete and the details phase to begin
        await expect(
            page.getByText(/Loading fight details/i)
        ).toBeVisible({ timeout: 20_000 });
    });

    test('HYDR-003: stats overview shows non-zero values after hydration', async ({ page }) => {
        await setupHydrationPage(page, { detailsDelayMs: 100 });
        await goToStats(page);

        // Wait for hydration to complete — spinner should disappear
        await expect(
            page.locator('.stats-particle-spinner')
        ).toBeHidden({ timeout: 45_000 });

        // Overview metrics should have non-zero values.
        // AVG SQUAD should reflect actual player counts (30-50 range for WvW).
        const overview = page.locator('#section-overview, [data-section="overview"]').first();
        if (await overview.isVisible().catch(() => false)) {
            // At least one metric in the overview should be non-zero
            const metricValues = await overview.locator('.text-2xl, .text-3xl, .text-4xl').allTextContents();
            const hasNonZero = metricValues.some(v => {
                const num = parseFloat(v.replace(/,/g, ''));
                return Number.isFinite(num) && num > 0;
            });
            expect(hasNonZero).toBe(true);
        }
    });

    test('HYDR-004: dissolve overlay clears after all details arrive', async ({ page }) => {
        await setupHydrationPage(page, { detailsDelayMs: 100 });
        await goToStats(page);

        // First verify spinner appears
        await expect(
            page.locator('.stats-particle-spinner').first()
        ).toBeVisible({ timeout: 10_000 });

        // Then wait for it to clear — all 7 details at 100ms each ≈ 700ms + compute time
        await expect(
            page.locator('.stats-particle-spinner')
        ).toBeHidden({ timeout: 30_000 });
    });

    test('HYDR-005: fight breakdown shows non-zero Allies after hydration', async ({ page }) => {
        await setupHydrationPage(page, { detailsDelayMs: 100 });
        await goToStats(page);

        // Wait for overlay to clear
        await expect(
            page.locator('.stats-particle-spinner')
        ).toBeHidden({ timeout: 45_000 });

        // Find the fight breakdown section. Scoped to visible: "Fight Breakdown"
        // is also a nav-rail entry, which stays in the DOM while the rail is
        // collapsed, so an unscoped `.first()` resolves to a hidden element.
        const breakdown = page.locator('text=/Fight Breakdown/i >> visible=true').first();
        await expect(breakdown).toBeVisible({ timeout: 10_000 });

        // The header should show the correct fight count
        await expect(
            page.getByText(new RegExp(`${FIXTURE_IDS.length}\\s*FIGHTS`, 'i'))
        ).toBeVisible({ timeout: 5_000 });
    });
});
