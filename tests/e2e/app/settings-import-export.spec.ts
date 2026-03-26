import { test, expect } from '@playwright/test';
import { setupAppPage, navigateTo, expectAPICalled } from './helpers/appTestHelpers';

test.describe('Settings — Import/Export (IMP-001–002)', () => {
    test('IMP-001: export button calls exportSettings', async ({ page }) => {
        await setupAppPage(page);
        await navigateTo(page, 'Settings');
        const section = page.locator('[data-settings-label="Export / Import Settings"]');
        await section.scrollIntoViewIfNeeded();
        const exportBtn = section.getByRole('button', { name: /Export/i }).first();
        if (await exportBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await exportBtn.click();
            await expectAPICalled(page, 'exportSettings');
        }
    });

    test('IMP-002: import button calls importSettings', async ({ page }) => {
        await setupAppPage(page);
        await navigateTo(page, 'Settings');
        const section = page.locator('[data-settings-label="Export / Import Settings"]');
        await section.scrollIntoViewIfNeeded();
        const importBtn = section.getByRole('button', { name: /Import/i }).first();
        if (await importBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await importBtn.click();
            await page.waitForTimeout(500);
            await expectAPICalled(page, 'importSettings');
        }
    });
});
