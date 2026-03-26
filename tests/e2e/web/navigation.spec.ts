import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixturePath = path.resolve(process.cwd(), 'web/report.json');

test.describe('Web Report Navigation (WRPT-010–015)', () => {
    test.beforeEach(async ({ page }) => {
        // Sidebar nav requires viewport >= 1024px wide
        await page.setViewportSize({ width: 1920, height: 1080 });
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
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /Overview/i }).click();
        await expect(page.locator('#overview')).toBeAttached();
    });

    test('WRPT-011: navigate to Offensive Stats group', async ({ page }) => {
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /Offensive/i }).click();
        await expect(page.locator('#group-offense')).toBeAttached();
    });

    test('WRPT-012: navigate to Defensive Stats group', async ({ page }) => {
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /Defensive/i }).click();
        await expect(page.locator('#group-defense')).toBeAttached();
    });

    test('WRPT-013: navigate to Other Metrics group', async ({ page }) => {
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /Other/i }).click();
        await expect(page.locator('#group-other')).toBeAttached();
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
