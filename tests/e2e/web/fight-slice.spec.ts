import { test, expect } from '@playwright/test';

test.describe('published report fight slicer', () => {
    test('a cold report load issues no sidecar request', async ({ page }) => {
        // The feature must be free for the overwhelming majority of views.
        const sidecarRequests: string[] = [];
        page.on('request', (req) => {
            if (req.url().includes('slice.json')) sidecarRequests.push(req.url());
        });
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        expect(sidecarRequests).toEqual([]);
    });

    test('a report without slice data shows no slice pill', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expect(page.getByRole('button', { name: /slice fights/i })).toHaveCount(0);
    });
});
