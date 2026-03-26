import { type Page, expect } from '@playwright/test';
import { createElectronAPIMock, type ElectronAPIMockOverrides } from '../fixtures/electronAPIMock';

/**
 * Initialize the app page with mocked electronAPI.
 * Must be called BEFORE page.goto().
 */
export async function setupAppPage(page: Page, overrides?: ElectronAPIMockOverrides) {
    await page.addInitScript(createElectronAPIMock, overrides);
    await page.goto('/');
    // Wait for React to mount — the app-titlebar is always present
    await page.locator('.app-titlebar').waitFor({ state: 'visible', timeout: 10_000 });
}

/** Navigate to a view tab and wait for it to become active. */
export async function navigateTo(page: Page, view: 'Dashboard' | 'Stats' | 'History' | 'Settings') {
    const tab = page.getByRole('button', { name: new RegExp(`^${view}$`, 'i') });
    await tab.click();
    // Brief wait for view transition
    await page.waitForTimeout(300);
}

/** Assert that the call log on the mock contains a call to `method`. */
export async function expectAPICalled(page: Page, method: string) {
    const called = await page.evaluate(
        (m) => (window as any).electronAPI._callLog.some((c: any) => c.method === m),
        method
    );
    expect(called).toBe(true);
}

/** Assert that the call log contains a call to `method` with args matching `predicate`. */
export async function expectAPICalledWith(
    page: Page,
    method: string,
    predicate: (args: unknown[]) => boolean
) {
    const match = await page.evaluate(
        ([m, predStr]) => {
            const pred = new Function('return ' + predStr)();
            return (window as any).electronAPI._callLog.some(
                (c: any) => c.method === m && pred(c.args)
            );
        },
        [method, predicate.toString()] as [string, string]
    );
    expect(match).toBe(true);
}

/** Get the full call log from the mock. */
export async function getAPICallLog(page: Page): Promise<Array<{ method: string; args: unknown[] }>> {
    return page.evaluate(() => (window as any).electronAPI._callLog);
}

/** Clear the call log (useful between interaction steps). */
export async function clearAPICallLog(page: Page) {
    await page.evaluate(() => { (window as any).electronAPI._callLog.length = 0; });
}
