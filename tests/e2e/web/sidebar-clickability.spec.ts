import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/report.json');

test.describe('Sidebar sub-item clickability (WRPT-040–044)', () => {
    test.beforeEach(async ({ page }) => {
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

    test('WRPT-040: offense sub-items are clickable', async ({ page }) => {
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /Offensive/i }).click();

        const subItems = [
            'Offense Detailed',
            'Damage Modifiers',
            'Player Breakdown',
            'Damage Breakdown',
            'Spike Damage',
            'Conditions',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.report-nav-item-btn', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            // After click the item should become the active (white text) item
            await expect(btn).toHaveCSS('color', /rgb\(255,\s*255,\s*255\)/);
        }
    });

    test('WRPT-041: defense sub-items are clickable', async ({ page }) => {
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /Defensive/i }).click();

        const subItems = [
            'Defense Detailed',
            'Incoming Damage Modifiers',
            'Incoming Strike Damage',
            'Damage Mitigation',
            'Boon Output',
            'Boon Timeline',
            'Boon Uptime',
            'Support Detailed',
            'Healing Stats',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.report-nav-item-btn', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            await expect(btn).toHaveCSS('color', /rgb\(255,\s*255,\s*255\)/);
        }
    });

    test('WRPT-042: overview sub-items are clickable', async ({ page }) => {
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        // Overview is the default active group and already expanded.
        // Switch away first so we can re-expand it cleanly without toggling it closed.
        await sidebar.locator('.report-nav-group-btn', { hasText: /Offensive/i }).click();
        await page.waitForTimeout(300);
        await sidebar.locator('.report-nav-group-btn', { hasText: /Overview/i }).click();

        const subItems = [
            'KDR',
            'Fight Breakdown',
            'Top Players',
            'Top Skills',
            'Classes',
            'Map Distribution',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.report-nav-item-btn', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click({ timeout: 5_000 });
            await expect(btn).toHaveCSS('color', /rgb\(255,\s*255,\s*255\)/);
        }
    });

    test('WRPT-043: other metrics sub-items are clickable', async ({ page }) => {
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /Other/i }).click();

        const subItems = [
            'Fight Comparison',
            'Special Buffs',
            'Sigil/Relic Uptime',
            'Skill Usage',
            'APM Breakdown',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.report-nav-item-btn', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            await expect(btn).toHaveCSS('color', /rgb\(255,\s*255,\s*255\)/);
        }
    });

    test('WRPT-044: clicking sub-item scrolls its section into view', async ({ page }) => {
        const sidebar = page.locator('aside.report-nav-sidebar:visible');

        // Navigate to Defensive Stats > Boon Output
        await sidebar.locator('.report-nav-group-btn', { hasText: /Defensive/i }).click();
        const boonBtn = sidebar.locator('.report-nav-item-btn', { hasText: /Boon Output/i });
        await expect(boonBtn).toBeVisible({ timeout: 5_000 });
        await boonBtn.click();

        // Allow smooth scroll to settle
        await page.waitForTimeout(1000);
        const section = page.locator('#boon-output');
        if (await section.count() > 0) {
            await expect(section).toBeInViewport({ timeout: 5_000 });
        }

        // Navigate to Offensive Stats > Conditions
        await sidebar.locator('.report-nav-group-btn', { hasText: /Offensive/i }).click();
        const conditionsBtn = sidebar.locator('.report-nav-item-btn', { hasText: /Conditions/i });
        await expect(conditionsBtn).toBeVisible({ timeout: 5_000 });
        await conditionsBtn.click();

        await page.waitForTimeout(1000);
        const condSection = page.locator('#conditions-outgoing');
        if (await condSection.count() > 0) {
            await expect(condSection).toBeInViewport({ timeout: 5_000 });
        }
    });
});
