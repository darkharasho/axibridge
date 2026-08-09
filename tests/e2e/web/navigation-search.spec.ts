/**
 * E2E tests for the taxonomy-driven web report navigation and universal search
 * palette (report-navigation redesign, Task 10).
 *
 * Bootstrap copied verbatim from tests/e2e/web/navigation.spec.ts: mock
 * `reports/test-report/report.json` with the shared fixture and load
 * `/web/index.html?report=test-report`.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/report.json');

function loadReportFixture() {
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

/** Registers the report.json mock and navigates, optionally with a starting hash. */
async function gotoReport(page: Page, payload: unknown, hash = '') {
    await page.route('**/reports/test-report/report.json', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(payload),
        });
    });
    await page.goto(`/web/index.html?report=test-report${hash}`);
    await expect(
        page.getByRole('heading', { name: /Statistics Dashboard/i })
    ).toBeVisible({ timeout: 15_000 });
}

test.describe('Web Report Taxonomy Navigation + Search', () => {
    test.beforeEach(async ({ page }) => {
        // Desktop-sidebar / non-compact chrome, matching the other web nav specs.
        await page.setViewportSize({ width: 1920, height: 1080 });
    });

    test('legacy section deep link activates its new category', async ({ page }) => {
        const payload = loadReportFixture();
        // 'boon-uptime' is a real section id that moved from the old "Defensive
        // Stats" group into the new "Boons & Strips" category (Task 1 taxonomy).
        // NOTE: BoonUptimeSection is built on the shared FightMetricSection card,
        // which independently renders its own root with id="boon-uptime" —
        // pre-existing (unrelated to this redesign) and shared by boon-timeline /
        // stab-performance too, so the id is not unique on the page. .first()
        // resolves to the outer SectionPanel wrapper, the same node
        // document.getElementById (and thus the app's own scroll/flash logic) sees.
        await gotoReport(page, payload, '#boon-uptime');
        await expect(page.locator('#boon-uptime').first()).toBeVisible();
    });

    test('legacy kdr anchor still lands on overview', async ({ page }) => {
        const payload = loadReportFixture();
        await gotoReport(page, payload, '#kdr');
        await expect(page.locator('#overview')).toBeVisible();
    });

    test('data map chip navigates to a non-overview section', async ({ page }) => {
        const payload = loadReportFixture();
        await gotoReport(page, payload);
        // The web report opens on Overview, whose data map (section #data-map) lists a
        // clickable chip per section of EVERY category. Regression: on embedded hosts
        // this used to collapse to a single Overview card, and cross-category chips
        // wrote the zustand store the web ignores. Click the "On Tag Review" chip
        // (Squad Cohesion) — scoped to #data-map so we hit the chip, not a nav item.
        await page.locator('#data-map').getByRole('button', { name: 'On Tag Review' }).click();
        // The chip routes through onRequestCategory → the web activates Squad Cohesion,
        // mounts the section, and scrolls it into view.
        await expect(page.locator('#on-tag-review').first()).toBeVisible();
    });

    test('search palette jumps to a section and flashes it', async ({ page }) => {
        const payload = loadReportFixture();
        await gotoReport(page, payload);
        await page.keyboard.press('Control+k');
        await page.getByRole('textbox').fill('stab');
        await page.keyboard.press('Enter');
        // Same pre-existing duplicate-id card (see above) — .first() is the
        // SectionPanel wrapper, which is also the element useSearchJump flashes.
        await expect(page.locator('#stab-performance').first()).toBeVisible();
        await expect(page.locator('.axi-search-flash')).toHaveCount(1);
    });

    test('player search lands on their breakdown row', async ({ page }) => {
        const payload = loadReportFixture();
        // tests/fixtures/report.json predates the playerSkillBreakdowns field
        // (captured at appVersion 1.18.0 — see payload.meta.appVersion); the
        // array is absent, so the Player Breakdown search category would
        // otherwise have zero entries to match against. Inject one real player
        // (an existing offensePlayers account, so the query is a real e2e
        // account, obfuscated per repo convention) purely so the search index
        // has something to find. No production code or shared fixture file changes.
        const account: string = payload.stats.offensePlayers[0].account;
        payload.stats.playerSkillBreakdowns = [{
            key: 'e2e-search-player',
            account,
            displayName: account,
            profession: payload.stats.offensePlayers[0].profession,
            professionList: payload.stats.offensePlayers[0].professionList ?? [payload.stats.offensePlayers[0].profession],
            totalFightMs: 60_000,
            skills: [],
        }];
        await gotoReport(page, payload);
        await page.keyboard.press('Control+k');
        const input = page.getByRole('textbox');
        // account names contain ".NNNN" — search by that suffix, the same way a
        // player would look themselves up.
        const suffix = account.includes('.') ? account.slice(account.indexOf('.')) : account;
        await input.fill(suffix);
        await page.keyboard.press('Enter');
        await expect(page.locator(`#player-breakdown [data-player-account="${account}"]`).first()).toBeVisible();
    });

    test('mobile nav lists the ten categories', async ({ page }) => {
        const payload = loadReportFixture();
        await page.setViewportSize({ width: 390, height: 844 });
        await gotoReport(page, payload);
        // The mobile drawer toggle's accessible name is its own visible text,
        // "Contents" (PanelLeft icon + label, no aria-label needed). A loose
        // /contents/i match would also catch the drawer's unrelated "Close table
        // of contents" button, so match the exact label.
        await page.getByRole('button', { name: 'Contents', exact: true }).click();
        const drawer = page.locator('aside.fixed.translate-x-0');
        await expect(drawer).toBeVisible();
        const categories = [
            'Overview', 'Offense', 'Defense', 'Boons & Strips', 'Support & Healing',
            'Squad Cohesion', 'Commander', 'Players', 'Roster', 'Replay',
        ];
        for (const label of categories) {
            // Scope to the group-level buttons (.report-nav-group-btn), the same
            // convention used by the other web nav specs. A bare role query would
            // also match the "Overview" *section* item nested in the expanded
            // "Overview" *category* (their labels happen to coincide).
            const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            await expect(
                drawer.locator('.report-nav-group-btn', { hasText: new RegExp(`^${escaped}$`, 'i') })
            ).toBeVisible();
        }
    });
});
