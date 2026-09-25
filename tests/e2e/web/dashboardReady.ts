import type { Page, Locator } from '@playwright/test';

/**
 * The web report's "it rendered" signal, in one place.
 *
 * Every spec here needs to wait for the report to come up before it can test
 * anything, and they all used to do it by looking for a heading reading
 * "Statistics Dashboard". The axi-design header work then moved those words out
 * of the <h1> into an eyebrow above it, so the heading could carry the category
 * the reader is actually in — and all nine spec files started timing out on a
 * page that was rendering perfectly.
 *
 * So the signal is a testid on the report header's heading instead. It survives
 * copy changes, and it is the same element in both the multi-log and the
 * single-fight layouts, where the wording differs.
 */
export const dashboardReady = (page: Page): Locator => page.getByTestId('stats-header-title');
