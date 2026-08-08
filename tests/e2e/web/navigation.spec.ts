import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/report.json');

test.describe('Web Report Navigation (WRPT-010–015, 045–046)', () => {
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

    test('WRPT-011: navigate to Offense group', async ({ page }) => {
        // Regrouped from "Offensive Stats" to "Offense" under the 10-category
        // taxonomy (report-navigation redesign) — same category, new label.
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Offense$/i }).click();
        await expect(page.locator('#group-offense')).toBeAttached();
    });

    test('WRPT-012: navigate to Defense group', async ({ page }) => {
        // Regrouped from "Defensive Stats" to "Defense". Boons/support content
        // that used to live in this group now has its own categories (Boons &
        // Strips, Support & Healing) — see WRPT-045/046 below.
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Defense$/i }).click();
        await expect(page.locator('#group-defense')).toBeAttached();
    });

    test('WRPT-013: navigate to Players group', async ({ page }) => {
        // The old catch-all "Other Metrics" group no longer exists — its
        // sections (Special Buffs, Sigil/Relic Uptime, Skill Usage, APM
        // Breakdown) now live under the new "Players" category (Fight
        // Comparison, its other old member, moved into Overview instead).
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Players$/i }).click();
        await expect(page.locator('#group-players')).toBeAttached();
    });

    test('WRPT-045: navigate to Boons & Strips group', async ({ page }) => {
        // New category carved out of the old "Defensive Stats" group.
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Boons & Strips$/i }).click();
        await expect(page.locator('#group-boons-strips')).toBeAttached();
    });

    test('WRPT-046: navigate to Support & Healing group', async ({ page }) => {
        // New category carved out of the old "Defensive Stats" group.
        const sidebar = page.locator('aside.report-nav-sidebar:visible');
        await sidebar.locator('.report-nav-group-btn', { hasText: /^Support & Healing$/i }).click();
        await expect(page.locator('#group-support-healing')).toBeAttached();
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
