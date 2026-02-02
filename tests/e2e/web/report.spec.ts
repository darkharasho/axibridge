import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('web report renders and navigates', async ({ page }) => {
    const fixturePath = path.resolve(process.cwd(), 'web/report.json');
    const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    await page.route('**/reports/test-report/report.json', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(payload)
        });
    });

    await page.goto('/web/index.html?report=test-report');

    await expect(page.getByRole('heading', { name: /Statistics Dashboard/i })).toBeVisible();

    await page.getByRole('button', { name: /Offensive Stats/i }).click();
    await page.waitForTimeout(200);
    await expect(page.getByRole('heading', { name: /Statistics Dashboard - Offensive Stats/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Offenses - Detailed/i })).toBeVisible();

    await page.getByRole('button', { name: /Defensive Stats/i }).click();
    await page.waitForTimeout(200);
    await expect(page.getByRole('heading', { name: /Statistics Dashboard - Defensive Stats/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Defenses - Detailed/i })).toBeVisible();

    await page.getByRole('button', { name: /Other Metrics/i }).click();
    await page.waitForTimeout(200);
    await expect(page.getByRole('heading', { name: /Skill Usage Tracker/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /APM Breakdown/i })).toBeVisible();

    await page.getByRole('button', { name: /^Overview$/i }).click();
    await page.waitForTimeout(200);
    await expect(page.getByRole('heading', { name: /Statistics Dashboard - Overview/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Fight Breakdown/i })).toBeVisible();
});
