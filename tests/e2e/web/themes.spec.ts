import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { dashboardReady } from './dashboardReady';

const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/report.json');

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
            dashboardReady(page)
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
                dashboardReady(page)
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
            dashboardReady(page)
        ).toBeVisible({ timeout: 15_000 });
        // The accent is no longer a body class. applyAxiTheme puts it on the
        // root element as data-axi-accent, which is the attribute every
        // axi-design token block is keyed on — assert the thing that actually
        // selects the palette rather than a class the old theme system wrote.
        await expect(page.locator('html')).toHaveAttribute('data-axi-accent', 'refined-cyan');
    });
});
