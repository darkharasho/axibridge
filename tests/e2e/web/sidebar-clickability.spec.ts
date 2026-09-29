import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { dashboardReady } from './dashboardReady';

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
            dashboardReady(page)
        ).toBeVisible({ timeout: 15_000 });
    });

    test('WRPT-040: offense sub-items are clickable', async ({ page }) => {
        const sidebar = page.locator('aside.axi-rail');
        await sidebar.locator('.axi-rail__item', { hasText: /^Offense$/i }).click();

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
            const btn = sidebar.locator('.axi-rail__subitem', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            // After the click the item is the current one. Assert that through
            // aria-current — which is also what upstream's
            // .axi-rail__subitem[aria-current] paints from. The old assertion
            // pinned a literal white, which the rail's current colour is not.
            await expect(btn).toHaveAttribute('aria-current', 'location');
        }
    });

    test('WRPT-041: defense sub-items are clickable', async ({ page }) => {
        // Boons and Support/Healing split out of "Defensive Stats" into their own
        // categories (WRPT-041b/041c below) — Defense now only covers incoming
        // damage/mitigation.
        const sidebar = page.locator('aside.axi-rail');
        await sidebar.locator('.axi-rail__item', { hasText: /^Defense$/i }).click();

        const subItems = [
            'Defense Detailed',
            'Incoming Modifiers',
            'Incoming Strike Damage',
            'Damage Mitigation',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.axi-rail__subitem', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            await expect(btn).toHaveAttribute('aria-current', 'location');
        }
    });

    test('WRPT-041b: boons & strips sub-items are clickable', async ({ page }) => {
        // Carved out of the old "Defensive Stats" group.
        const sidebar = page.locator('aside.axi-rail');
        await sidebar.locator('.axi-rail__item', { hasText: /^Boons & Strips$/i }).click();

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
            const btn = sidebar.locator('.axi-rail__subitem', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            await expect(btn).toHaveAttribute('aria-current', 'location');
        }
    });

    test('WRPT-041c: support & healing sub-items are clickable', async ({ page }) => {
        // Carved out of the old "Defensive Stats" group.
        const sidebar = page.locator('aside.axi-rail');
        await sidebar.locator('.axi-rail__item', { hasText: /^Support & Healing$/i }).click();

        const subItems = [
            'Support Detailed',
            'Healing Stats',
            'Healing Breakdown',
            'Heal Effectiveness',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.axi-rail__subitem', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            await expect(btn).toHaveAttribute('aria-current', 'location');
        }
    });

    test('WRPT-042: overview sub-items are clickable', async ({ page }) => {
        const sidebar = page.locator('aside.axi-rail');
        // Overview is the default active group and already expanded.
        // Switch away first so we can re-expand it cleanly without toggling it closed.
        await sidebar.locator('.axi-rail__item', { hasText: /^Offense$/i }).click();
        await page.waitForTimeout(300);
        await sidebar.locator('.axi-rail__item', { hasText: /^Overview$/i }).click();

        // 'KDR' is now labelled 'Overview' (its section id is unchanged; see the
        // legacy '#kdr' alias test in navigation-search.spec.ts). 'Classes' moved
        // to the new "Roster" category (WRPT-048 below); 'Fight Comparison' is new
        // in this category. ('Data Map' is its own category, not an Overview item.)
        const subItems = [
            'Overview',
            'Fight Breakdown',
            'Fight Comparison',
            'Top Players',
            'Top Skills',
            'Classes',
            'Map Distribution',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.axi-rail__subitem', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click({ timeout: 5_000 });
            await expect(btn).toHaveAttribute('aria-current', 'location');
        }
    });

    test('WRPT-043: players sub-items are clickable', async ({ page }) => {
        // The old catch-all "Other Metrics" group no longer exists. Its
        // Special Buffs / Sigil-Relic Uptime / Skill Usage / APM Breakdown
        // members now live under the new "Players" category (its other old
        // member, Fight Comparison, moved into Overview — covered by WRPT-042).
        const sidebar = page.locator('aside.axi-rail');
        await sidebar.locator('.axi-rail__item', { hasText: /^Players$/i }).click();

        const subItems = [
            'Player Breakdown',
            'Special Buffs',
            'Sigil/Relic Uptime',
            'Skill Usage',
            'APM Breakdown',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.axi-rail__subitem', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            await expect(btn).toHaveAttribute('aria-current', 'location');
        }
    });

    test('WRPT-048: roster sub-items are clickable', async ({ page }) => {
        // 'Classes' (squad + enemy comp) is back in Overview per user request —
        // see the WRPT-042 list. Roster keeps the attendance/per-fight comps.
        const sidebar = page.locator('aside.axi-rail');
        await sidebar.locator('.axi-rail__item', { hasText: /^Roster$/i }).click();

        const subItems = [
            'Attendance Ledger',
            'Squad Comp by Fight',
            'Fight Comp',
        ];

        for (const label of subItems) {
            const btn = sidebar.locator('.axi-rail__subitem', { hasText: new RegExp(label, 'i') });
            await expect(btn).toBeVisible({ timeout: 5_000 });
            await btn.click();
            await expect(btn).toHaveAttribute('aria-current', 'location');
        }
    });

    test('WRPT-044: clicking sub-item scrolls its section into view', async ({ page }) => {
        const sidebar = page.locator('aside.axi-rail');

        // Navigate to Boons & Strips > Boon Output (moved out of "Defensive Stats")
        await sidebar.locator('.axi-rail__item', { hasText: /^Boons & Strips$/i }).click();
        const boonBtn = sidebar.locator('.axi-rail__subitem', { hasText: /Boon Output/i });
        await expect(boonBtn).toBeVisible({ timeout: 5_000 });
        await boonBtn.click();

        // Allow smooth scroll to settle
        await page.waitForTimeout(1000);
        const section = page.locator('#boon-output');
        if (await section.count() > 0) {
            await expect(section).toBeInViewport({ timeout: 5_000 });
        }

        // Navigate to Offense > Conditions
        await sidebar.locator('.axi-rail__item', { hasText: /^Offense$/i }).click();
        const conditionsBtn = sidebar.locator('.axi-rail__subitem', { hasText: /Conditions/i });
        await expect(conditionsBtn).toBeVisible({ timeout: 5_000 });
        await conditionsBtn.click();

        await page.waitForTimeout(1000);
        const condSection = page.locator('#conditions-outgoing');
        if (await condSection.count() > 0) {
            await expect(condSection).toBeInViewport({ timeout: 5_000 });
        }
    });
});
