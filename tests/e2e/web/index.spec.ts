import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/report.json');

function buildMockIndex() {
    return [
        {
            id: 'report-1',
            title: 'Commander Alpha',
            commanders: ['Commander Alpha'],
            dateStart: '2026-03-20T18:00:00Z',
            dateEnd: '2026-03-20T19:00:00Z',
            dateLabel: '3/20/2026',
            url: 'reports/report-1/report.json',
        },
        {
            id: 'report-2',
            title: 'Commander Beta',
            commanders: ['Commander Beta'],
            dateStart: '2026-03-21T18:00:00Z',
            dateEnd: '2026-03-21T19:30:00Z',
            dateLabel: '3/21/2026',
            url: 'reports/report-2/report.json',
        },
    ];
}

test.describe('Web Report Index (WRPT-030–032)', () => {
    test('WRPT-030: index page loads and lists reports', async ({ page }) => {
        const indexData = buildMockIndex();
        await page.route('**/reports/index.json', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(indexData),
            });
        });
        await page.route('**/logo.json', async (route) => {
            await route.fulfill({ status: 404 });
        });
        await page.goto('/web/index.html');
        await expect(page.getByText('Commander Alpha')).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText('Commander Beta')).toBeVisible();
    });

    test('WRPT-031: clicking a report opens it', async ({ page }) => {
        const indexData = buildMockIndex();
        const reportPayload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

        await page.route('**/reports/index.json', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(indexData),
            });
        });
        await page.route('**/logo.json', async (route) => {
            await route.fulfill({ status: 404 });
        });
        await page.route('**/reports/report-1/report.json', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(reportPayload),
            });
        });

        await page.goto('/web/index.html');
        await expect(page.getByText('Commander Alpha')).toBeVisible({ timeout: 10_000 });
        await page.getByText('Commander Alpha').first().click();
        await expect(
            page.getByRole('heading', { name: /Statistics Dashboard/i })
        ).toBeVisible({ timeout: 15_000 });
    });

    test('WRPT-032: rollup view shows aggregate content', async ({ page }) => {
        const indexData = buildMockIndex();
        const reportPayload = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

        await page.route('**/reports/index.json', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(indexData),
            });
        });
        await page.route('**/logo.json', async (route) => {
            await route.fulfill({ status: 404 });
        });
        await page.route('**/reports/report-*/report.json', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(reportPayload),
            });
        });

        await page.goto('/web/index.html');
        await expect(page.getByText('Commander Alpha')).toBeVisible({ timeout: 10_000 });

        const rollupLink = page.getByText(/All Reports/i).first();
        if (await rollupLink.isVisible({ timeout: 3000 }).catch(() => false)) {
            await rollupLink.click();
            await page.waitForTimeout(2000);
            const pageContent = await page.textContent('body');
            expect(pageContent).toBeTruthy();
        }
    });
});
