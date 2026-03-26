import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixturePath = path.resolve(process.cwd(), 'web/report.json');

const LEGACY_THEMES = ['crt', 'matte', 'kinetic'];

function loadReportWithPalette(palette: string) {
    const report = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    report.stats = report.stats || {};
    if (LEGACY_THEMES.includes(palette)) {
        report.stats.uiTheme = palette;
    } else {
        report.stats.colorPalette = palette;
    }
    return report;
}

test.describe('Web Report Themes (WRPT-020–022)', () => {
    test('WRPT-020: default theme loads correctly', async ({ page }) => {
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
        await expect(page.locator('body')).toHaveClass(/web-report/);
    });

    test('WRPT-021: all themes render without JS errors', async ({ page }) => {
        const palettes = ['electric-blue', 'refined-cyan', 'amber-warm', 'emerald-mint', 'crt', 'matte', 'kinetic'];
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));

        for (const palette of palettes) {
            const payload = loadReportWithPalette(palette);
            await page.route('**/reports/theme-test/report.json', async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(payload),
                });
            });
            await page.goto('/web/index.html?report=theme-test');
            await expect(
                page.getByRole('heading', { name: /Statistics Dashboard/i })
            ).toBeVisible({ timeout: 15_000 });
        }
        expect(errors).toHaveLength(0);
    });

    test('WRPT-022: non-default theme CSS class applied to body', async ({ page }) => {
        const payload = loadReportWithPalette('refined-cyan');
        await page.route('**/reports/cyan-test/report.json', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(payload),
            });
        });
        await page.goto('/web/index.html?report=cyan-test');
        await expect(
            page.getByRole('heading', { name: /Statistics Dashboard/i })
        ).toBeVisible({ timeout: 15_000 });
        const bodyClasses = await page.locator('body').getAttribute('class');
        expect(bodyClasses).toMatch(/palette-|theme-|refined-cyan/);
    });
});
