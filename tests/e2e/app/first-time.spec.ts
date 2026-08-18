import { test, expect } from '@playwright/test';
import { setupAppPage, expectAPICalled } from './helpers/appTestHelpers';

test.describe('First-Time Experience (FTE-001–005)', () => {
    test('FTE-001: walkthrough shows on first launch', async ({ page }) => {
        await setupAppPage(page, { walkthroughSeen: false });
        await expect(page.getByText(/Collect your logs/i)).toBeVisible({ timeout: 5000 });
    });

    test('FTE-002: walkthrough shows all 3 steps', async ({ page }) => {
        await setupAppPage(page, { walkthroughSeen: false });
        await expect(page.getByText(/Collect your logs/i)).toBeVisible({ timeout: 5000 });
        await expect(page.getByText(/Understand performance/i)).toBeVisible();
        await expect(page.getByText(/Share your results/i)).toBeVisible();
    });

    // The button reads "How-To Guide"; it was labelled "Learn More" when this
    // was written. Same control — it still fires `onLearnMore` (WalkthroughModal).
    test('FTE-003: walkthrough has How-To Guide button', async ({ page }) => {
        await setupAppPage(page, { walkthroughSeen: false });
        await expect(page.getByText(/Collect your logs/i)).toBeVisible({ timeout: 5000 });
        await expect(page.getByRole('button', { name: /How-To Guide/i })).toBeVisible();
    });

    test('FTE-004: dismissing walkthrough calls saveSettings', async ({ page }) => {
        await setupAppPage(page, { walkthroughSeen: false });
        await expect(page.getByText(/Collect your logs/i)).toBeVisible({ timeout: 5000 });
        const getStarted = page.getByRole('button', { name: /Get Started/i });
        await getStarted.click();
        await expect(page.getByText(/Collect your logs/i)).not.toBeVisible({ timeout: 3000 });
        await expectAPICalled(page, 'saveSettings');
    });

    test('FTE-005: walkthrough does not show when already seen', async ({ page }) => {
        await setupAppPage(page, { walkthroughSeen: true });
        await page.waitForTimeout(1000);
        await expect(page.getByText(/Collect your logs/i)).not.toBeVisible();
    });
});
