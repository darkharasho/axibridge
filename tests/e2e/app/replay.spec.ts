/**
 * E2E smoke test for the Map Replay feature (RPLY-001).
 *
 * Verifies that after stats aggregation completes:
 *   1. Navigating to the Map group shows the FightPicker listbox.
 *   2. Clicking a fight card causes the replay canvas (svg.replay-canvas) to appear.
 *   3. The Play button is present and toggles to Pause after being clicked.
 *
 * Uses the app-mode test infrastructure (served React build + mocked electronAPI).
 * Real EI JSON fixtures from test-fixtures/boon/ are served via Playwright route
 * interception.  The boon fixtures include combatReplayMetaData and player
 * combatReplayData.positions, so they produce non-empty replayFights.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { createElectronAPIMock } from './fixtures/electronAPIMock';

// ── Fixture IDs (20260117 series — 7 real WvW fights) ─────────────────────────
const FIXTURE_IDS = [
    '20260117-175120',
    '20260117-180135',
    '20260117-180259',
    '20260117-180458',
    '20260117-180636',
    '20260117-180826',
    '20260117-181030',
];

const FIXTURE_DIR = path.resolve(process.cwd(), 'test-fixtures/boon');

/** Build metadata-only mock logs (no details field). */
function makeMockLogs() {
    return FIXTURE_IDS.map((id, i) => ({
        id: `log-${id}`,
        filePath: `/fake/logs/${id}.zevtc`,
        fightName: 'Green Alpine Borderlands',
        permalink: `https://dps.report/${id}`,
        uploadTime: Date.now() - (FIXTURE_IDS.length - i) * 60_000,
        encounterDuration: '60',
        status: 'success',
        dashboardSummary: {
            hasPlayers: true,
            hasTargets: true,
            squadCount: 35,
            enemyCount: 40,
            isWin: true,
            squadDeaths: 2,
            enemyDeaths: 5,
        },
    }));
}

/** Set up the page with mocked electronAPI and fixture route interception. */
async function setupReplayPage(page: Page) {
    await page.addInitScript(createElectronAPIMock, {
        logs: makeMockLogs(),
        detailsFixtureIds: FIXTURE_IDS,
        detailsDelayMs: 50,
    });

    // Intercept fixture requests and serve real EI JSON from disk
    await page.route('**/__test-fixtures__/*.json', async (route) => {
        const url = route.request().url();
        const match = url.match(/__test-fixtures__\/(.+)\.json/);
        if (!match) {
            await route.abort();
            return;
        }
        const fixtureId = match[1];
        const filePath = path.join(FIXTURE_DIR, `${fixtureId}.json`);
        if (!fs.existsSync(filePath)) {
            await route.fulfill({ status: 404, body: 'Not found' });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: fs.readFileSync(filePath, 'utf8'),
        });
    });

    await page.goto('/');
    await page.locator('.app-titlebar').waitFor({ state: 'visible', timeout: 10_000 });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Replay smoke test (RPLY-001)', () => {
    test('RPLY-001: fight picker renders and canvas appears after fight selection', async ({ page }) => {
        await setupReplayPage(page);

        // Navigate to the Stats tab
        await page.getByRole('button', { name: /^Stats$/i }).click();

        // Wait for aggregation to complete (particle spinner clears)
        await expect(
            page.locator('.stats-particle-spinner')
        ).toBeHidden({ timeout: 45_000 });

        // Navigate to the Map nav group (contains the Replay section)
        await page.getByRole('button', { name: /^Map$/i }).click();

        // The FightPicker listbox should be visible
        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible({ timeout: 5_000 });

        // There should be at least one fight card
        const firstCard = page.getByRole('option').first();
        await expect(firstCard).toBeVisible({ timeout: 5_000 });

        // Click the first fight card to select it
        await firstCard.click();

        // The replay canvas should render after a fight is selected
        await expect(page.locator('svg.replay-canvas')).toBeVisible({ timeout: 5_000 });

        // The Play button should be present
        const playBtn = page.getByRole('button', { name: /play/i }).first();
        await expect(playBtn).toBeVisible();

        // Click play — the Pause button should appear
        await playBtn.click();
        const pauseBtn = page.getByRole('button', { name: /pause/i }).first();
        await expect(pauseBtn).toBeVisible({ timeout: 3_000 });

        // Pause playback
        await pauseBtn.click();
    });
});
