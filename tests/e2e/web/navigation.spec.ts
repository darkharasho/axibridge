import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixturePath = path.resolve(process.cwd(), 'web/report.json');

test.describe('Web Report Navigation (WRPT-010–015)', () => {
    test.beforeEach(async ({ page }) => {
        const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
        await page.route('**/reports/test-report/report.json', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(payload),
            });
        });
        await page.goto('/web/index.html?report=test-report');
        await expect(
            page.getByRole('heading', { name: /Statistics Dashboard/i })
        ).toBeVisible({ timeout: 15_000 });
    });

    test('WRPT-010: navigate to Overview group', async ({ page }) => {
        const overviewBtn = page.locator('.report-nav-group-btn', { hasText: /Overview/i }).first();
        await overviewBtn.click();
        await expect(page.locator('#kdr')).toBeAttached();
    });

    test('WRPT-011: navigate to Offense group', async ({ page }) => {
        const offenseBtn = page.locator('.report-nav-group-btn', { hasText: /Offense/i }).first();
        await offenseBtn.click();
        await expect(page.locator('#offense-detailed')).toBeAttached();
    });

    test('WRPT-012: navigate to Defense group', async ({ page }) => {
        const defenseBtn = page.locator('.report-nav-group-btn', { hasText: /Defense/i }).first();
        await defenseBtn.click();
        await expect(page.locator('#defense-detailed')).toBeAttached();
    });

    test('WRPT-013: navigate to Other Metrics group', async ({ page }) => {
        const otherBtn = page.locator('.report-nav-group-btn', { hasText: /Other/i }).first();
        await otherBtn.click();
        await expect(page.locator('#sigil-relic-uptime, #skill-usage, #apm-stats')).toBeAttached();
    });

    test('WRPT-014: metrics spec search works', async ({ page }) => {
        const proofOfWorkLink = page.locator('a[href="#proof-of-work"]').first();
        await proofOfWorkLink.click();
        await expect(page.getByText(/Metrics Specification/i)).toBeVisible();

        const searchInput = page.getByPlaceholder(/Search spec/i);
        await searchInput.fill('sigil');
        const result = page.locator('.proof-of-work-search-results')
            .getByRole('button', { name: /Sigil/i }).first();
        await expect(result).toBeVisible();
    });

    test('WRPT-015: spec sidebar TOC navigation', async ({ page }) => {
        const proofOfWorkLink = page.locator('a[href="#proof-of-work"]').first();
        await proofOfWorkLink.click();
        await expect(page.getByText(/Metrics Specification/i)).toBeVisible();

        const tocItem = page.locator('.proof-of-work-sidebar')
            .getByRole('button', { name: /Sigil\/Relic Uptime/i });
        await expect(tocItem).toBeVisible();
        await tocItem.click();
        await expect(tocItem).toHaveAttribute('data-toc-active', 'true');
    });
});
