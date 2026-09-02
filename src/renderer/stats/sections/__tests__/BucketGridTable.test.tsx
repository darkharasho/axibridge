import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BucketGridTable, type BucketGridRow } from '../BucketGridTable';

const rows: BucketGridRow[] = [
    { key: 'a', displayName: 'Alice', group: 1, profession: 'Firebrand', buckets: [8, 1, 0] },
    { key: 'b', displayName: 'Bob', group: 2, profession: 'Scourge', buckets: [0, 2, 0] },
];

/** One row past the cap threshold — the smallest roster that must scroll. */
const bigRoster: BucketGridRow[] = Array.from({ length: 13 }, (_, i) => ({
    key: `p${i}`, displayName: `Player ${i}`, group: 1, buckets: [i, 0, 0],
}));

const renderGrid = (extra: Partial<React.ComponentProps<typeof BucketGridTable>> = {}) =>
    render(
        <BucketGridTable
            rows={rows}
            bucketCount={3}
            bucketMs={5000}
            accent="#e879f9"
            recorded
            {...extra}
        />,
    );

const cells = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('[data-bucket-cell]'));

describe('BucketGridTable shading', () => {
    /**
     * The regression this guards: shading with the cell's `opacity` composites
     * the whole element, so the digit fades with its backdrop and the
     * low-intensity cells a reader is scanning for become unreadable.
     */
    it('shades with background alpha and never with cell opacity', () => {
        const { container } = renderGrid();
        for (const cell of cells(container)) {
            expect(cell.style.opacity).toBe('');
        }
        // jsdom normalises a full-alpha rgba() back to rgb(), so accept either.
        const [peak] = cells(container);
        expect(peak.style.backgroundColor).toMatch(/^rgba?\(232, 121, 249[,)]/);
    });

    it('keeps a minimum alpha so the smallest non-zero value stays visible', () => {
        const { container } = renderGrid();
        const alphaOf = (el: HTMLElement) => {
            const bg = el.style.backgroundColor;
            if (!bg) return 0;
            // rgb() means jsdom dropped a fully opaque alpha.
            return Number(/rgba\([^)]*,\s*([0-9.]+)\)/.exec(bg)?.[1] ?? '1');
        };

        const all = cells(container);
        const peak = all[0];          // 8 of 8
        const faintest = all[1];      // 1 of 8 — would be opacity 0.125 under the old scheme
        expect(alphaOf(peak)).toBeCloseTo(1, 3);
        expect(alphaOf(faintest)).toBeGreaterThanOrEqual(0.1);
        expect(alphaOf(faintest)).toBeLessThan(alphaOf(peak));
    });

    it('leaves zero buckets unpainted', () => {
        const { container } = renderGrid();
        expect(cells(container)[2].style.backgroundColor).toBe('');
    });
});

describe('BucketGridTable labelling', () => {
    it('labels every 30s rather than every bucket', () => {
        // 5s buckets over 3 minutes: 0:00, 0:30, 1:00 ... never 0:05.
        renderGrid({ bucketCount: 36 });
        expect(screen.getByText('0:00')).toBeTruthy();
        expect(screen.getByText('0:30')).toBeTruthy();
        expect(screen.queryByText('0:05')).toBeNull();
    });

    it('renders a class icon per row when a renderer is supplied', () => {
        renderGrid({
            renderIcon: (profession) => <span data-testid="icon">{profession}</span>,
        });
        const icons = screen.getAllByTestId('icon');
        expect(icons.map((n) => n.textContent)).toEqual(['Firebrand', 'Scourge']);
    });

    it('renders without icons when no renderer is supplied', () => {
        const { container } = renderGrid();
        expect(cells(container)).toHaveLength(6);
        expect(screen.getByText('Alice')).toBeTruthy();
    });
});

describe('BucketGridTable ruling', () => {
    /**
     * The regression this guards, verified against the Tailwind 3 compiler:
     * `border-[color:var(--x)]/40` emits NO rule at all, because an opacity
     * modifier needs bare channel values and our theme vars hold full
     * `rgba()` strings. The width utility still applies, so the border falls
     * back to `currentColor` — a near-white gridline over every cell, which
     * is what made this grid look like a spreadsheet. Tailwind fails
     * silently here, so nothing but a source check catches it.
     */
    it('never applies an opacity modifier to a CSS-variable border colour', async () => {
        const { readFileSync, readdirSync } = await import('node:fs');
        const { join } = await import('node:path');
        const dir = join(__dirname, '..');
        const offenders: string[] = [];
        for (const file of readdirSync(dir).filter(f => f.endsWith('.tsx'))) {
            const src = readFileSync(join(dir, file), 'utf-8');
            for (const m of src.matchAll(/(?:border|bg|text)-\[color:var\(--[a-z-]+\)\]\/\d+/g)) {
                offenders.push(`${file}: ${m[0]}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('rules only the 30s ticks, not every column', () => {
        const { container } = renderGrid({ bucketCount: 14, bucketMs: 5000 });
        const ruled = cells(container).filter(c => c.className.includes('border-l'));
        // 14 buckets at a 6-bucket stride: ticks at 6 and 12, per row, and
        // never at column 0 (the pinned name column already bounds it).
        expect(ruled).toHaveLength(2 * rows.length);
    });
});

describe('FightPicker', () => {
    it('uses the app select treatment rather than native chrome', async () => {
        const { FightPicker } = await import('../BucketGridTable');
        const { container } = render(
            <FightPicker
                fights={[{ id: 'a.zevtc', durationMs: 1000 }, { id: 'b.zevtc', durationMs: 2000 }]}
                selectedId="a.zevtc"
                onChange={() => {}}
            />,
        );
        const select = container.querySelector('select');
        expect(select).not.toBeNull();
        expect(select?.className).toContain('fight-diff-select');
    });
    it('caps its height and sticks the header once the roster outgrows the cap', () => {
        const { container } = render(
            <BucketGridTable
                rows={bigRoster}
                bucketCount={3}
                bucketMs={5000}
                accent="#e879f9"
                recorded
            />,
        );
        const scroller = container.querySelector('div');
        expect(scroller?.className).toContain('overflow-y-auto');
        expect((scroller as HTMLElement).style.maxHeight).toBe('30rem');
        // Without the sticky header the timestamps scroll away, leaving the
        // reader with a wall of numbers and no time axis.
        expect(container.querySelector('thead th')?.className).toContain('bucket-grid__head');
    });

    it('leaves a roster that fits below the cap uncapped and unstuck', () => {
        const { container } = renderGrid();
        const scroller = container.querySelector('div');
        expect(scroller?.className).not.toContain('overflow-y-auto');
        expect((scroller as HTMLElement).style.maxHeight).toBe('');
        expect(container.querySelector('thead th')?.className).not.toContain('bucket-grid__head');
    });

    it('never caps when the section turns capHeight off, however long the roster', () => {
        const { container } = render(
            <BucketGridTable
                rows={bigRoster}
                bucketCount={3}
                bucketMs={5000}
                accent="#e879f9"
                recorded
                capHeight={false}
            />,
        );
        const scroller = container.querySelector('div');
        expect(scroller?.className).not.toContain('overflow-y-auto');
        expect((scroller as HTMLElement).style.maxHeight).toBe('');
    });
});
