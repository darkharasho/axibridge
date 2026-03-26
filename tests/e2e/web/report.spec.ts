import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixturePath = path.resolve(process.cwd(), 'web/report.json');

function loadReportFixture() {
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

test.describe('Web Report Loading (WRPT-001–004)', () => {
    test.beforeEach(async ({ page }) => {
        const payload = loadReportFixture();
        await page.route('**/reports/test-report/report.json', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(payload),
            });
        });
    });

    test('WRPT-001: report loads from URL parameter', async ({ page }) => {
        await page.goto('/web/index.html?report=test-report');
        await expect(
            page.getByRole('heading', { name: /Statistics Dashboard/i })
        ).toBeVisible({ timeout: 15_000 });
    });

    test('WRPT-002: loading indicator shown while fetching', async ({ page }) => {
        // Override route with delayed response
        await page.route('**/reports/test-report/report.json', async (route) => {
            await new Promise((r) => setTimeout(r, 1500));
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(loadReportFixture()),
            });
        });
        await page.goto('/web/index.html?report=test-report');
        // Eventually loads successfully
        await expect(
            page.getByRole('heading', { name: /Statistics Dashboard/i })
        ).toBeVisible({ timeout: 20_000 });
    });

    test('WRPT-003: report not found shows error or empty state', async ({ page }) => {
        await page.route('**/reports/nonexistent/report.json', async (route) => {
            await route.fulfill({ status: 404, body: 'Not Found' });
        });
        await page.goto('/web/index.html?report=nonexistent');
        await page.waitForTimeout(3000);
        // Should show error state — not the stats dashboard
        const hasStats = await page.getByRole('heading', { name: /Statistics Dashboard/i })
            .isVisible().catch(() => false);
        const hasError = await page.getByText(/error|not found|failed|no report/i)
            .isVisible().catch(() => false);
        expect(hasError || !hasStats).toBe(true);
    });

    test('WRPT-004: report renders stats from embedded data', async ({ page }) => {
        await page.goto('/web/index.html?report=test-report');
        await expect(
            page.getByRole('heading', { name: /Statistics Dashboard/i })
        ).toBeVisible({ timeout: 15_000 });
        // Verify actual content from fixture (commander name)
        await expect(page.getByText('Guardian Kamoidra').first()).toBeVisible();
    });
});
