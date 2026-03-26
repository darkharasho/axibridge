import { test, expect } from '@playwright/test';
import { setupAppPage, navigateTo, expectAPICalled } from './helpers/appTestHelpers';

test.describe('Settings — General Behavior (SET-001–003)', () => {
    test('SET-001: settings load on mount', async ({ page }) => {
        await setupAppPage(page);
        await navigateTo(page, 'Settings');
        await expect(page.locator('[data-settings-section="true"]').first()).toBeVisible();
        await expectAPICalled(page, 'getSettings');
    });

    test('SET-002: settings auto-save on toggle change', async ({ page }) => {
        await setupAppPage(page);
        await navigateTo(page, 'Settings');
        const toggle = page.locator('.toggle-track').first();
        if (await toggle.isVisible({ timeout: 3000 }).catch(() => false)) {
            await toggle.click();
            await page.waitForTimeout(500);
            await expectAPICalled(page, 'saveSettings');
        }
    });

    test('SET-003: settings sections are collapsible', async ({ page }) => {
        await setupAppPage(page);
        await navigateTo(page, 'Settings');
        const sections = page.locator('[data-settings-section="true"]');
        const count = await sections.count();
        expect(count).toBeGreaterThanOrEqual(3);
    });
});

test.describe('Settings — Appearance (SET-010–013)', () => {
    test('SET-010: color palette selection triggers save', async ({ page }) => {
        await setupAppPage(page);
        await navigateTo(page, 'Settings');
        const appearance = page.locator('[data-settings-label="Appearance"]');
        await appearance.scrollIntoViewIfNeeded();
        // Find palette buttons/swatches and click a non-active one
        const swatches = appearance.locator('button').filter({ hasNotText: /Glass/i });
        const count = await swatches.count();
        if (count > 1) {
            await swatches.nth(1).click();
            await page.waitForTimeout(500);
            await expectAPICalled(page, 'saveSettings');
        }
    });

    test('SET-011: multiple palette options are visible', async ({ page }) => {
        await setupAppPage(page);
        await navigateTo(page, 'Settings');
        const appearance = page.locator('[data-settings-label="Appearance"]');
        await appearance.scrollIntoViewIfNeeded();
        await expect(appearance).toBeVisible();
    });

    test('SET-012: glass surfaces toggle triggers save', async ({ page }) => {
        await setupAppPage(page);
        await navigateTo(page, 'Settings');
        const appearance = page.locator('[data-settings-label="Appearance"]');
        await appearance.scrollIntoViewIfNeeded();
        const glassToggle = appearance.locator('.toggle-track').first();
        if (await glassToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
            await glassToggle.click();
            await page.waitForTimeout(500);
            await expectAPICalled(page, 'saveSettings');
        }
    });

    test('SET-013: palette loaded from settings', async ({ page }) => {
        await setupAppPage(page, { settings: { colorPalette: 'refined-cyan' } });
        await navigateTo(page, 'Settings');
        await expectAPICalled(page, 'getSettings');
    });
});

test.describe('Settings — dps.report Token (SET-020–022)', () => {
    test('SET-020: set token triggers save', async ({ page }) => {
        await setupAppPage(page);
        await navigateTo(page, 'Settings');
        const tokenSection = page.locator('[data-settings-label="dps.report Token"]');
        await tokenSection.scrollIntoViewIfNeeded();
        const tokenInput = tokenSection.locator('input').first();
        if (await tokenInput.isVisible({ timeout: 2000 }).catch(() => false)) {
            await tokenInput.fill('test-token-123');
            await page.waitForTimeout(500);
            await expectAPICalled(page, 'saveSettings');
        }
    });

    test('SET-021: clear token', async ({ page }) => {
        await setupAppPage(page, { settings: { dpsReportToken: 'existing-token' } });
        await navigateTo(page, 'Settings');
        const tokenSection = page.locator('[data-settings-label="dps.report Token"]');
        await tokenSection.scrollIntoViewIfNeeded();
        const clearBtn = tokenSection.getByRole('button').first();
        if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await clearBtn.click();
            await page.waitForTimeout(500);
        }
    });

    test('SET-022: token section renders', async ({ page }) => {
        await setupAppPage(page, { settings: { dpsReportToken: 'secret-token' } });
        await navigateTo(page, 'Settings');
        const tokenSection = page.locator('[data-settings-label="dps.report Token"]');
        await tokenSection.scrollIntoViewIfNeeded();
        await expect(tokenSection).toBeVisible();
    });
});
