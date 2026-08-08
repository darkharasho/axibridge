import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/report.json');

test.describe('Sidebar sub-item clickability (WRPT-040–048)', () => {
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
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Offense$/i }).click();

        // 'Player Breakdown' moved to the new "Players" category (WRPT-043 below)
        // under the 10-category taxonomy; 'All Damage' is a new sibling section here.
        const subItems = [
            'Offense Detailed',
            'Damage Modifiers',
            'All Damage',
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
        // Boons and Support/Healing split out of "Defensive Stats" into their own
        // categories (WRPT-041b/041c below) — Defense now only covers incoming
        // damage/mitigation.
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Defense$/i }).click();

        const subItems = [
            'Defense Detailed',
            'Incoming Modifiers',
            'Incoming Strike Damage',
            'Damage Mitigation',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.report-nav-item-btn', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            await expect(btn).toHaveCSS('color', /rgb\(255,\s*255,\s*255\)/);
        }
    });

    test('WRPT-041b: boons & strips sub-items are clickable', async ({ page }) => {
        // Carved out of the old "Defensive Stats" group.
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Boons & Strips$/i }).click();

        const subItems = [
            'Boon Output',
            'Boon Uptime',
            'All Boons',
            'Boon Timeline',
            'Stab Performance',
            'Boon Strips',
            'Strip Spikes',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.report-nav-item-btn', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            await expect(btn).toHaveCSS('color', /rgb\(255,\s*255,\s*255\)/);
        }
    });

    test('WRPT-041c: support & healing sub-items are clickable', async ({ page }) => {
        // Carved out of the old "Defensive Stats" group.
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Support & Healing$/i }).click();

        const subItems = [
            'Support Detailed',
            'Healing Stats',
            'Healing Breakdown',
            'Heal Effectiveness',
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
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Offense$/i }).click();
        await page.waitForTimeout(300);
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Overview$/i }).click();

        // 'KDR' is now labelled 'Overview' (its section id is unchanged; see the
        // legacy '#kdr' alias test in navigation-search.spec.ts). 'Classes' moved
        // to the new "Roster" category (WRPT-048 below); 'Data Map' and 'Fight
        // Comparison' are new sections in this category.
        const subItems = [
            'Data Map',
            'Overview',
            'Fight Breakdown',
            'Fight Comparison',
            'Top Players',
            'Top Skills',
            'Map Distribution',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.report-nav-item-btn', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click({ timeout: 5_000 });
            await expect(btn).toHaveCSS('color', /rgb\(255,\s*255,\s*255\)/);
        }
    });

    test('WRPT-043: players sub-items are clickable', async ({ page }) => {
        // The old catch-all "Other Metrics" group no longer exists. Its
        // Special Buffs / Sigil-Relic Uptime / Skill Usage / APM Breakdown
        // members now live under the new "Players" category (its other old
        // member, Fight Comparison, moved into Overview — covered by WRPT-042).
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Players$/i }).click();

        const subItems = [
            'Player Breakdown',
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

    test('WRPT-048: roster sub-items are clickable', async ({ page }) => {
        // New category — 'Classes' used to live under the old "Overview" group
        // (as part of the WRPT-042 list); it moved here along with the other
        // squad-composition sections.
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Roster$/i }).click();

        const subItems = [
            'Attendance Ledger',
            'Classes',
            'Squad Comp by Fight',
            'Fight Comp',
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

        // Navigate to Boons & Strips > Boon Output (moved out of "Defensive Stats")
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Boons & Strips$/i }).click();
        const boonBtn = sidebar.locator('.report-nav-item-btn', { hasText: /Boon Output/i });
        await expect(boonBtn).toBeVisible({ timeout: 5_000 });
        await boonBtn.click();

        // Allow smooth scroll to settle
        await page.waitForTimeout(1000);
        const section = page.locator('#boon-output');
        if (await section.count() > 0) {
            await expect(section).toBeInViewport({ timeout: 5_000 });
        }

        // Navigate to Offense > Conditions
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Offense$/i }).click();
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
