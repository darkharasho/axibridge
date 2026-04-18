/**
 * Mobile Layout Tests (MOBL-001–009)
 *
 * Playwright tests that detect layout violations at iPhone 16 resolution (393×852).
 * Each section scrolls its target into view, then runs a JS scan for elements that
 * overflow their parent, overlap siblings, or extend past the viewport width.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const VIEWPORT = { width: 393, height: 852 };
const fixturePath = path.resolve(process.cwd(), 'tests/fixtures/report.json');

// ─── Shared violation scanner ────────────────────────────────────────────────

type Violation = {
    type: 'overflow-x' | 'overflow-y' | 'viewport-overflow' | 'overlap';
    element: string;
    parent?: string;
    sibling?: string;
    details: string;
};

/**
 * Runs inside the browser. Scans all descendants of `rootSelector` for:
 *  1. Elements whose right/bottom edge extends past their parent's bounds
 *  2. Elements whose right edge extends past the viewport width
 *  3. Sibling elements that overlap each other (non-trivially)
 *
 * Skips elements inside scroll containers (overflow-x: auto/scroll/hidden) since
 * those are intentionally scrollable and their children are expected to exceed bounds.
 */
async function scanForViolations(page: Page, rootSelector: string): Promise<Violation[]> {
    return page.evaluate((selector) => {
        const TOLERANCE = 2; // px
        const OVERLAP_TOLERANCE = 4; // px — siblings may legitimately share a border
        const root = document.querySelector(selector);
        if (!root) return [];

        const violations: Violation[] = [];
        const viewportWidth = document.documentElement.clientWidth;

        function describe(el: Element): string {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            const cls = el.className && typeof el.className === 'string'
                ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
                : '';
            return `${tag}${id}${cls}`;
        }

        /** Returns true if el or any ancestor (up to root) has overflow scrolling */
        function isInsideScrollContainer(el: Element): boolean {
            let cursor = el.parentElement;
            while (cursor && cursor !== root) {
                const s = getComputedStyle(cursor);
                if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden' ||
                    s.overflowY === 'auto' || s.overflowY === 'scroll' || s.overflowY === 'hidden') {
                    return true;
                }
                cursor = cursor.parentElement;
            }
            return false;
        }

        const allEls = root.querySelectorAll('*');
        for (const el of allEls) {
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;

            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            // Skip elements that are themselves scroll containers
            if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
            // Skip elements inside a scroll container — their overflow is managed
            if (isInsideScrollContainer(el)) continue;
            // Skip position:absolute/fixed — they escape normal flow
            if (style.position === 'absolute' || style.position === 'fixed') continue;

            // 1. Element extends past viewport width
            if (rect.right > viewportWidth + TOLERANCE) {
                violations.push({
                    type: 'viewport-overflow',
                    element: describe(el),
                    details: `right edge ${Math.round(rect.right)}px > viewport ${viewportWidth}px (overflow: ${Math.round(rect.right - viewportWidth)}px)`
                });
            }

            // 2. Element overflows its parent's content box
            const parent = el.parentElement;
            if (parent && parent !== document.body && parent !== document.documentElement) {
                const parentRect = parent.getBoundingClientRect();
                const parentStyle = getComputedStyle(parent);
                // Skip if parent has overflow handling (already checked ancestors, but parent itself)
                if (parentStyle.overflowX === 'auto' || parentStyle.overflowX === 'scroll' ||
                    parentStyle.overflowX === 'hidden') continue;

                const overflowX = rect.right - parentRect.right;
                if (overflowX > TOLERANCE) {
                    violations.push({
                        type: 'overflow-x',
                        element: describe(el),
                        parent: describe(parent),
                        details: `overflows parent right by ${Math.round(overflowX)}px`
                    });
                }
            }
        }

        // 3. Check sibling overlap (only direct children of flex/grid containers)
        for (const container of allEls) {
            if (isInsideScrollContainer(container)) continue;
            const containerStyle = getComputedStyle(container);
            const display = containerStyle.display;
            if (!display.includes('flex') && !display.includes('grid')) continue;

            const children = Array.from(container.children).filter(c => {
                const s = getComputedStyle(c);
                return s.display !== 'none' && s.position !== 'absolute' && s.position !== 'fixed';
            });

            for (let i = 0; i < children.length; i++) {
                const a = children[i].getBoundingClientRect();
                if (a.width === 0 || a.height === 0) continue;
                for (let j = i + 1; j < children.length; j++) {
                    const b = children[j].getBoundingClientRect();
                    if (b.width === 0 || b.height === 0) continue;

                    const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                    const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                    if (overlapX > OVERLAP_TOLERANCE && overlapY > OVERLAP_TOLERANCE) {
                        violations.push({
                            type: 'overlap',
                            element: describe(children[i]),
                            sibling: describe(children[j]),
                            details: `siblings overlap by ${Math.round(overlapX)}×${Math.round(overlapY)}px`
                        });
                    }
                }
            }
        }

        return violations;
    }, rootSelector);
}

function formatViolations(violations: Violation[]): string {
    return violations.map((v, i) =>
        `  ${i + 1}. [${v.type}] ${v.element}${v.parent ? ` → parent: ${v.parent}` : ''}${v.sibling ? ` ↔ ${v.sibling}` : ''}\n     ${v.details}`
    ).join('\n');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadReportFixture() {
    return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

/** Open the mobile TOC drawer and click a nav group to switch sections */
async function navigateToGroup(page: Page, groupPattern: RegExp) {
    await page.locator('.mobile-action-bar').getByText(/contents/i).click();
    // The mobile drawer is inside a fixed aside that slides in via translate-x.
    // Wait for the translate to complete (aside becomes translate-x-0).
    const drawerAside = page.locator('aside.fixed.translate-x-0');
    await expect(drawerAside).toBeVisible({ timeout: 3000 });
    await drawerAside.locator('.report-nav-group-btn', { hasText: groupPattern }).click();
    // Wait for section to load and animate in
    await page.waitForTimeout(2500);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Mobile Layout (MOBL-001–009)', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize(VIEWPORT);
        const payload = loadReportFixture();
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
        // Wait for section load animations
        await page.waitForTimeout(2000);
    });

    // ── Overview group ───────────────────────────────────────────────────────

    test('MOBL-001: KDR section has no layout violations', async ({ page }) => {
        const section = page.locator('#kdr');
        if (await section.count() === 0) { test.skip(); return; }
        await section.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const violations = await scanForViolations(page, '#kdr');
        expect(violations, `Layout violations:\n${formatViolations(violations)}`).toHaveLength(0);
    });

    test('MOBL-002: Fight Breakdown section has no layout violations', async ({ page }) => {
        const section = page.locator('#fight-breakdown');
        if (await section.count() === 0) { test.skip(); return; }
        await section.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const violations = await scanForViolations(page, '#fight-breakdown');
        expect(violations, `Layout violations:\n${formatViolations(violations)}`).toHaveLength(0);
    });

    test('MOBL-003: Top Players section has no layout violations', async ({ page }) => {
        const section = page.locator('#top-players');
        if (await section.count() === 0) { test.skip(); return; }
        await section.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const violations = await scanForViolations(page, '#top-players');
        expect(violations, `Layout violations:\n${formatViolations(violations)}`).toHaveLength(0);
    });

    test('MOBL-004: Top Skills section has no layout violations', async ({ page }) => {
        const section = page.locator('#top-skills-outgoing');
        if (await section.count() === 0) { test.skip(); return; }
        await section.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const violations = await scanForViolations(page, '#top-skills-outgoing');
        expect(violations, `Layout violations:\n${formatViolations(violations)}`).toHaveLength(0);
    });

    // ── Offensive Stats ──────────────────────────────────────────────────────

    test('MOBL-005: Offense Detailed section has no layout violations', async ({ page }) => {
        await navigateToGroup(page, /Offensive/i);
        const section = page.locator('#offense-detailed');
        if (await section.count() === 0) { test.skip(); return; }
        await section.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const violations = await scanForViolations(page, '#offense-detailed');
        expect(violations, `Layout violations:\n${formatViolations(violations)}`).toHaveLength(0);
    });

    // ── Defensive Stats ──────────────────────────────────────────────────────

    test('MOBL-006: Defense Detailed section has no layout violations', async ({ page }) => {
        await navigateToGroup(page, /Defensive/i);
        const section = page.locator('#defense-detailed');
        if (await section.count() === 0) { test.skip(); return; }
        await section.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const violations = await scanForViolations(page, '#defense-detailed');
        expect(violations, `Layout violations:\n${formatViolations(violations)}`).toHaveLength(0);
    });

    test('MOBL-007: Boon Output section has no layout violations', async ({ page }) => {
        await navigateToGroup(page, /Defensive/i);
        const section = page.locator('#boon-output');
        if (await section.count() === 0) { test.skip(); return; }
        await section.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const violations = await scanForViolations(page, '#boon-output');
        expect(violations, `Layout violations:\n${formatViolations(violations)}`).toHaveLength(0);
    });

    // ── Mobile action bar ────────────────────────────────────────────────────

    test('MOBL-008: mobile action bar has no layout violations', async ({ page }) => {
        const bar = page.locator('.mobile-action-bar');
        if (await bar.count() === 0) { test.skip(); return; }
        const violations = await scanForViolations(page, '.mobile-action-bar');
        expect(violations, `Layout violations:\n${formatViolations(violations)}`).toHaveLength(0);
    });

    // ── Full-page horizontal overflow check ──────────────────────────────────

    test('MOBL-009: no page-level horizontal scroll at mobile width', async ({ page }) => {
        const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHorizontalScroll, 'Page has horizontal scrollbar at mobile width').toBe(false);
    });
});
