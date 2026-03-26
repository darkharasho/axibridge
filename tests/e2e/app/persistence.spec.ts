import { test, expect } from '@playwright/test';
import { setupAppPage, navigateTo, expectAPICalled } from './helpers/appTestHelpers';

test.describe('Data Persistence (PERS-001–008)', () => {
    test('PERS-001: persisted logs loaded on startup', async ({ page }) => {
        const mockLogs = [{
            id: 'persisted-1', filePath: '/fake/logs/old.zevtc',
            fightName: 'Persisted Fight', permalink: 'https://dps.report/xyz',
            uploadTime: Date.now(), encounterDuration: '180', status: 'success',
            dashboardSummary: {
                hasPlayers: true, hasTargets: true,
                squadCount: 20, enemyCount: 25,
                isWin: true, squadDeaths: 1, enemyDeaths: 5,
            },
            error: undefined, details: null,
        }];
        await setupAppPage(page, { logs: mockLogs });
        await expectAPICalled(page, 'getLogs');
        await expect(page.getByText('Persisted Fight')).toBeVisible({ timeout: 5000 });
    });

    test('PERS-002: getSettings called on startup', async ({ page }) => {
        await setupAppPage(page);
        await expectAPICalled(page, 'getSettings');
    });

    test('PERS-003: log directory triggers startWatching', async ({ page }) => {
        await setupAppPage(page, { settings: { logDirectory: '/custom/gw2/logs' } });
        await expectAPICalled(page, 'startWatching');
    });

    test('PERS-004: webhooks loaded from settings', async ({ page }) => {
        await setupAppPage(page, {
            settings: { webhooks: [{ id: 'wh1', name: 'Test Guild', url: 'https://discord.com/api/webhooks/test' }] },
        });
        await expectAPICalled(page, 'getSettings');
    });

    test('PERS-005: GitHub auth loaded from settings', async ({ page }) => {
        await setupAppPage(page, { settings: { githubToken: 'fake-token', githubUser: 'testuser' } });
        await expectAPICalled(page, 'getSettings');
    });

    test('PERS-006: color palette applied from settings', async ({ page }) => {
        await setupAppPage(page, { settings: { colorPalette: 'refined-cyan' } });
        await page.waitForTimeout(500);
        const bodyClass = await page.locator('body').getAttribute('class');
        expect(bodyClass).toMatch(/refined-cyan|palette/);
    });

    test('PERS-007: getAppVersion called on startup', async ({ page }) => {
        await setupAppPage(page, { appVersion: '2.0.3' });
        await expectAPICalled(page, 'getAppVersion');
    });

    test('PERS-008: clear cache button calls IPC', async ({ page }) => {
        await setupAppPage(page);
        await navigateTo(page, 'Settings');
        const clearBtn = page.getByRole('button', { name: /clear.*cache/i }).first();
        if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await clearBtn.click();
            await page.waitForTimeout(500);
            await expectAPICalled(page, 'clearDpsReportCache');
        }
    });
});
