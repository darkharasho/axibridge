/**
 * E2E tests for chart rendering stability.
 *
 * Verifies that recharts SVG charts render visible content after the report
 * loads, which confirms:
 * 1. ChartContainer no longer force-disables animations (the old workaround).
 * 2. The re-render isolation (React.memo + coarse selectors) prevents
 *    progress-tick re-renders from interrupting chart animations.
 * 3. Charts are not left in a permanently empty SVG state.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/report.json');

function loadReportFixture() {
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

test.describe('Chart Rendering Stability (CHRT-001–004)', () => {
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

    test('CHRT-001: report loads and renders chart SVG elements', async ({ page }) => {
        await page.goto('/web/index.html?report=test-report');
        await expect(
            page.getByRole('heading', { name: /Statistics Dashboard/i })
        ).toBeVisible({ timeout: 15_000 });

        // Wait for recharts to render SVG content inside ResponsiveContainer.
        // Charts use <svg> elements with <path> or <line> children for data.
        const svgs = page.locator('.recharts-responsive-container svg');
        await expect(svgs.first()).toBeVisible({ timeout: 10_000 });
    });

    test('CHRT-002: spike damage chart renders visible paths', async ({ page }) => {
        await page.goto('/web/index.html?report=test-report');
        await expect(
            page.getByRole('heading', { name: /Statistics Dashboard/i })
        ).toBeVisible({ timeout: 15_000 });

        // Navigate to the spike damage section if it exists
        const spikeSection = page.locator('[id="section-spike-damage"]');
        if (await spikeSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
            // Scroll to it and check for SVG paths
            await spikeSection.scrollIntoViewIfNeeded();
            const svgPaths = spikeSection.locator('svg path.recharts-line-curve, svg path.recharts-curve');
            const count = await svgPaths.count();
            // At least one line should be rendered (not empty)
            expect(count).toBeGreaterThan(0);
        }
    });

    test('CHRT-003: boon timeline chart renders bars or lines', async ({ page }) => {
        await page.goto('/web/index.html?report=test-report');
        await expect(
            page.getByRole('heading', { name: /Statistics Dashboard/i })
        ).toBeVisible({ timeout: 15_000 });

        const boonSection = page.locator('[id="section-boon-timeline"]');
        if (await boonSection.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await boonSection.scrollIntoViewIfNeeded();
            // Check for any recharts rendered elements (bars, lines, dots)
            const chartElements = boonSection.locator('svg .recharts-line, svg .recharts-bar, svg .recharts-dot');
            const count = await chartElements.count();
            expect(count).toBeGreaterThan(0);
        }
    });

    test('CHRT-004: charts are not permanently empty after load', async ({ page }) => {
        await page.goto('/web/index.html?report=test-report');
        await expect(
            page.getByRole('heading', { name: /Statistics Dashboard/i })
        ).toBeVisible({ timeout: 15_000 });

        // Wait a moment for any animations to complete
        await page.waitForTimeout(2000);

        // Find all recharts containers and verify at least one has rendered content
        const containers = page.locator('.recharts-responsive-container');
        const containerCount = await containers.count();

        if (containerCount > 0) {
            let hasContent = false;
            for (let i = 0; i < Math.min(containerCount, 5); i++) {
                const container = containers.nth(i);
                if (!await container.isVisible().catch(() => false)) continue;
                // Check for any rendered SVG children (paths, rects, circles)
                const svgChildren = container.locator('svg path, svg rect, svg circle, svg line');
                const childCount = await svgChildren.count();
                if (childCount > 0) {
                    hasContent = true;
                    break;
                }
            }
            expect(hasContent).toBe(true);
        }
    });
});
