import { describe, expect, it } from 'vitest';
import { buildTopListRows, TOP_LIST_MAX_LINE_WIDTH } from '../discord';

/** A bridged row is split into inline code spans around a `{{spec:x}}` token,
 *  so its rendered width is not its string length: the token stands in for one
 *  emoji glyph, and the backticks are markup Discord does not draw. */
const renderedWidth = (row: string): number => {
    const tokens = row.match(/\{\{spec:[a-z0-9]+\}\}/g) ?? [];
    return row.replace(/\{\{spec:[a-z0-9]+\}\}/g, '').replace(/`/g, '').length + tokens.length;
};

const entry = (rank: number, name: string, value: string, classToken = '') =>
    ({ rank, name, classToken, value });

describe('buildTopListRows', () => {
    it('never renders a row wider than the column cap', () => {
        const rows = buildTopListRows(
            [
                entry(1, 'Darkravenofthenight.4821', '1,234,567', '🟢'),
                entry(2, 'Bob.1', '10', '🟣'),
            ],
            { useSpanLayout: false, classDisplay: 'emoji' }
        );
        for (const row of rows) expect(renderedWidth(row)).toBeLessThanOrEqual(TOP_LIST_MAX_LINE_WIDTH);
    });

    it('never renders a span-layout row wider than the column cap', () => {
        const rows = buildTopListRows(
            [
                entry(1, 'Darkravenofthenight.4821', '1,234,567', '{{spec:hb}}'),
                entry(2, 'Bob.1', '10', '{{spec:sc}}'),
            ],
            { useSpanLayout: true, classDisplay: 'emoji' }
        );
        for (const row of rows) expect(renderedWidth(row)).toBeLessThanOrEqual(TOP_LIST_MAX_LINE_WIDTH);
    });

    // The bug this file exists for: names were padded to the widest name the
    // cap ALLOWS rather than the widest name actually present, so a board of
    // short names still emitted full-cap rows and wrapped for no reason.
    it('shrinks a board of short names below the cap instead of padding to it', () => {
        const rows = buildTopListRows(
            [entry(1, 'Keltö', '739,368', '🟩'), entry(2, 'Bob', '12,000', '🟩')],
            { useSpanLayout: false, classDisplay: 'emoji' }
        );
        expect(rows).toHaveLength(2);
        for (const row of rows) expect(renderedWidth(row)).toBeLessThan(TOP_LIST_MAX_LINE_WIDTH);
    });

    it('shrinks a short-name span-layout board below the cap too', () => {
        const rows = buildTopListRows(
            [entry(1, 'Keltö', '739', '{{spec:dr}}'), entry(2, 'Bob', '120', '{{spec:dr}}')],
            { useSpanLayout: true, classDisplay: 'emoji' }
        );
        for (const row of rows) expect(renderedWidth(row)).toBeLessThan(TOP_LIST_MAX_LINE_WIDTH);
    });

    it('keeps every row the same width so the value column lines up', () => {
        const rows = buildTopListRows(
            [
                entry(1, 'Averyveryverylongname.1234', '900', '🔵'),
                entry(2, 'Al', '8', '🔵'),
                entry(3, 'Mediumname', '77', '🔵'),
            ],
            { useSpanLayout: false, classDisplay: 'emoji' }
        );
        const widths = new Set(rows.map(renderedWidth));
        expect(widths.size).toBe(1);
        // Values are right-aligned into a common column.
        for (const row of rows) expect(row).toMatch(/( {2}8|900| 77)$/);
    });

    it('keeps the trailing span at a uniform offset on every bridged row', () => {
        const rows = buildTopListRows(
            [
                entry(1, 'Averyveryverylongname.1234', '900', '{{spec:hb}}'),
                entry(2, 'Al', '8', '{{spec:sc}}'),
            ],
            { useSpanLayout: true, classDisplay: 'emoji' }
        );
        const offsets = rows.map((row) => row.indexOf('{{spec:'));
        expect(new Set(offsets).size).toBe(1);
        const widths = new Set(rows.map(renderedWidth));
        expect(widths.size).toBe(1);
    });

    it('truncates a long name rather than overflowing the cap', () => {
        const rows = buildTopListRows(
            [entry(1, 'Averyveryveryverylongaccountname.1234', '1,234,567', '🔵')],
            { useSpanLayout: false, classDisplay: 'emoji' }
        );
        expect(rows[0]).not.toContain('1234');
        expect(renderedWidth(rows[0])).toBeLessThanOrEqual(TOP_LIST_MAX_LINE_WIDTH);
    });

    it('brackets a short-form class token and still fits the cap', () => {
        const rows = buildTopListRows(
            [entry(1, 'Darkravenofthenight.4821', '1,234', 'FB'), entry(2, 'Bob.1', '10', 'SCG')],
            { useSpanLayout: false, classDisplay: 'short' }
        );
        expect(rows[0]).toContain('[FB]');
        for (const row of rows) expect(renderedWidth(row)).toBeLessThanOrEqual(TOP_LIST_MAX_LINE_WIDTH);
    });

    it('renders rank gaps as given rather than renumbering', () => {
        const rows = buildTopListRows(
            [entry(1, 'Aaa', '5'), entry(4, 'Bbb', '3')],
            { useSpanLayout: false, classDisplay: 'off' }
        );
        expect(rows[1].trimStart().startsWith('4')).toBe(true);
    });

    it('returns no rows for an empty board', () => {
        expect(buildTopListRows([], { useSpanLayout: false, classDisplay: 'off' })).toEqual([]);
    });
});
