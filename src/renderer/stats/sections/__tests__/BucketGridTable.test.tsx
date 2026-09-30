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
     * The fill is the language's, not the component's. `.axi-table--matrix`
     * bands each occupied cell in four opaque steps from `data-heat`, and the
     * digit is printed on every band - which is the condition rule 9 admits
     * intensity under. The regression this guards is the old continuous alpha
     * ramp painted inline: a second encoding of the same number, at partial
     * opacity over the ground, that the bands then had to out-rank.
     */
    it('paints nothing inline: no background, no opacity', () => {
        const { container } = renderGrid();
        for (const cell of cells(container)) {
            expect(cell.style.opacity).toBe('');
            expect(cell.style.backgroundColor).toBe('');
            expect(cell.hasAttribute('data-intensity')).toBe(false);
        }
    });

    it('steps the band from the fight peak, and the smallest value still gets a band', () => {
        const all = cells(renderGrid().container);
        expect(all[0].getAttribute('data-heat')).toBe('4'); // 8 of 8
        expect(all[1].getAttribute('data-heat')).toBe('1'); // 1 of 8
        expect(all[4].getAttribute('data-heat')).toBe('1'); // 2 of 8
    });

    it('leaves zero buckets unbanded and prints no digit in them', () => {
        const all = cells(renderGrid().container);
        expect(all[2].hasAttribute('data-heat')).toBe(false);
        expect(all[2].textContent).toBe('');
        // And every banded cell carries its number.
        expect(all[0].textContent).toBe('8');
        expect(all[1].textContent).toBe('1');
    });

    it('is a matrix of the language, with the ruler and the pinned names', () => {
        const table = renderGrid().container.querySelector('table');
        for (const m of ['axi-table', 'axi-table--matrix', 'axi-table--ruler', 'axi-table--pinned', 'axi-table--fixed', 'axi-table--dense']) {
            expect(table?.className).toContain(m);
        }
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
        // The tick is an attribute; `.axi-table--ruler` draws the line from it.
        const ruled = cells(container).filter(c => c.hasAttribute('data-tick'));
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
        expect(select?.className).toContain('axi-select');
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
        expect(container.querySelector('table')?.className).toContain('axi-table--sticky');
    });

    it('leaves a roster that fits below the cap uncapped and unstuck', () => {
        const { container } = renderGrid();
        const scroller = container.querySelector('div');
        expect(scroller?.className).not.toContain('overflow-y-auto');
        expect((scroller as HTMLElement).style.maxHeight).toBe('');
        expect(container.querySelector('table')?.className).not.toContain('axi-table--sticky');
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
