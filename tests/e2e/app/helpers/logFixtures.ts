import fs from 'fs';
import path from 'path';
import { type Page } from '@playwright/test';

/**
 * Shared fixture plumbing for the app-mode specs that need REAL parsed logs
 * rather than hand-written stubs — replay, replay layers, stats hydration.
 *
 * All three used to carry their own byte-identical copy of the id list, the
 * directory constant and the route handler below. That is how they came to
 * disagree with the app: they were all still pointed at `test-fixtures/boon/`,
 * which holds hosted EI-shaped JSON pulled from dps.report and therefore
 * carries no `details.native`. Since the axilog cutover the replay reader is
 * native-only — `buildMovementData` returns null without it (see
 * `src/shared/movementData.ts`) — so those specs were feeding the app a shape
 * it can no longer render and timing out on a canvas that would never appear.
 *
 * One definition now, pointed at `test-fixtures/native/`, which
 * `scripts/generate-native-fixtures.mjs` produces from the same logs through
 * the app's own parse path.
 */

/** The 20260117 series — seven real consecutive WvW fights from one raid. */
export const FIXTURE_IDS = [
    '20260117-175120',
    '20260117-180135',
    '20260117-180259',
    '20260117-180458',
    '20260117-180636',
    '20260117-180826',
    '20260117-181030',
];

export const FIXTURE_DIR = path.resolve(process.cwd(), 'test-fixtures/native');

/** Build metadata-only mock logs — no `details`, so the app has to hydrate. */
export function makeFixtureLogs(overrides: { squadCountBase?: number; enemyCountBase?: number } = {}) {
    const { squadCountBase = 35, enemyCountBase = 40 } = overrides;
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
            squadCount: squadCountBase,
            enemyCount: enemyCountBase,
            isWin: true,
            squadDeaths: 2,
            enemyDeaths: 5,
        },
    }));
}

/**
 * Serve `/__test-fixtures__/<id>.json` off disk.
 *
 * A missing fixture 404s rather than aborting, so the failure surfaces as the
 * app's own "details unavailable" path instead of a bare network error — and
 * the message points at the generator.
 */
export async function serveLogFixtures(page: Page, dir: string = FIXTURE_DIR) {
    await page.route('**/__test-fixtures__/*.json', async (route) => {
        const match = route.request().url().match(/__test-fixtures__\/(.+)\.json/);
        if (!match) {
            await route.abort();
            return;
        }
        const filePath = path.join(dir, `${match[1]}.json`);
        if (!fs.existsSync(filePath)) {
            await route.fulfill({
                status: 404,
                body: `Missing fixture ${match[1]}.json — run: npm run generate:fixtures:native`,
            });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: fs.readFileSync(filePath, 'utf8'),
        });
    });
}
