import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OnTagReviewSection } from '../OnTagReviewSection';
import type { OnTagReviewResult, OnTagReviewRow } from '../../computeOnTagReview';

vi.mock('../../StatsViewContext', () => ({
    useStatsSharedContext: () => ({
        formatWithCommas: (n: number, d: number) => Number(n).toFixed(d),
        expandedSection: null,
        expandedSectionClosing: false,
        openExpandedSection: () => {},
        closeExpandedSection: () => {},
    }),
}));

const makeRow = (overrides: Partial<OnTagReviewRow> = {}): OnTagReviewRow => ({
    account: 'Player.1',
    profession: 'Guardian',
    professionList: ['Guardian'],
    fightCount: 5,
    avgDist: 345,
    onTag: 2,
    offTag: 1,
    afterTag: 0,
    runBack: 0,
    total: 3,
    offTagRanges: [1064],
    isCommander: false,
    ...overrides,
});

const result = (rows: OnTagReviewRow[], usableFightCount = 1): OnTagReviewResult =>
    ({ rows, usableFightCount });

describe('OnTagReviewSection', () => {
    it('renders empty state when no rows', () => {
        render(<OnTagReviewSection result={result([], 0)} />);
        expect(screen.getByText(/no replay data/i)).toBeInTheDocument();
    });

    it('renders player rows with counts and off-tag range chips', () => {
        render(<OnTagReviewSection result={result([
            makeRow({ account: 'Pikachu.1234', avgDist: 570, onTag: 1, offTag: 2, afterTag: 1, total: 3, offTagRanges: [3070, 1097] }),
            makeRow({ account: 'Runner.5678', avgDist: 1199, onTag: 2, offTag: 0, runBack: 1, total: 3, offTagRanges: [] }),
        ])} />);
        expect(screen.getByText('Pikachu.1234')).toBeInTheDocument();
        expect(screen.getByText('Runner.5678')).toBeInTheDocument();
        expect(screen.getByText('3070')).toBeInTheDocument();
        expect(screen.getByText('1097')).toBeInTheDocument();
        expect(screen.getByText('570')).toBeInTheDocument();
    });

    it('marks the commander row with a star', () => {
        render(<OnTagReviewSection result={result([
            makeRow({ account: 'Cmdr.9999', isCommander: true, avgDist: 0 }),
        ])} />);
        expect(screen.getByTitle('Commander')).toBeInTheDocument();
    });

    it('sorts rows by total deaths descending by default', () => {
        render(<OnTagReviewSection result={result([
            makeRow({ account: 'Low.1111', total: 1, onTag: 1, offTag: 0, offTagRanges: [] }),
            makeRow({ account: 'High.2222', total: 4, onTag: 4, offTag: 0, offTagRanges: [] }),
        ])} />);
        const cells = screen.getAllByRole('row').map(r => r.textContent || '');
        const lowIdx = cells.findIndex(t => t.includes('Low.1111'));
        const highIdx = cells.findIndex(t => t.includes('High.2222'));
        expect(highIdx).toBeGreaterThan(-1);
        expect(highIdx).toBeLessThan(lowIdx);
    });

    it('shows a dash when Avg Dist is unknown', () => {
        render(<OnTagReviewSection result={result([
            makeRow({ account: 'NoData.1234', avgDist: null, total: 0, onTag: 0, offTag: 0, offTagRanges: [] }),
        ])} />);
        expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });
});
