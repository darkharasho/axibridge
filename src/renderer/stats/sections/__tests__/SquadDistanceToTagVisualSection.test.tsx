import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SquadDistanceToTagVisualSection } from '../SquadDistanceToTagVisualSection';
import type { DistanceToTagResult, DistanceToTagRow } from '../../computeDistanceToTag';

vi.mock('../../StatsViewContext', () => ({
    useStatsSharedContext: () => ({
        formatWithCommas: (n: number, d: number) => Number(n).toFixed(d),
        expandedSection: null,
        expandedSectionClosing: false,
        openExpandedSection: () => {},
        closeExpandedSection: () => {},
    }),
}));

const row = (overrides: Partial<DistanceToTagRow> = {}): DistanceToTagRow => ({
    account: 'Player.1',
    profession: 'Guardian',
    professionList: ['Guardian'],
    fightCount: 5,
    sampleCount: 5,
    avg: 250,
    p25: 200,
    median: 240,
    p75: 280,
    p95: 600,
    source: 'fightAvg',
    isCommander: false,
    ...overrides,
});

const result = (rows: DistanceToTagRow[]): DistanceToTagResult => ({ rows, commanderCount: 0 });

describe('SquadDistanceToTagVisualSection', () => {
    it('renders empty state when no rows', () => {
        render(<SquadDistanceToTagVisualSection result={result([])} />);
        expect(screen.getByText(/no distance data/i)).toBeInTheDocument();
    });

    it('renders one chip per player', () => {
        render(<SquadDistanceToTagVisualSection result={result([
            row({ account: 'A.1' }),
            row({ account: 'B.2' }),
            row({ account: 'C.3' }),
        ])} />);
        const chips = document.querySelectorAll('[data-chip-account]');
        expect(chips).toHaveLength(3);
    });

    it('starts on Avg metric and switches when toggle clicked', () => {
        render(<SquadDistanceToTagVisualSection result={result([row({ account: 'A.1' })])} />);
        const avgBtn = screen.getByRole('button', { name: /avg/i });
        const p95Btn = screen.getByRole('button', { name: /p95/i });
        expect(avgBtn).toHaveAttribute('aria-pressed', 'true');
        expect(p95Btn).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(p95Btn);
        expect(avgBtn).toHaveAttribute('aria-pressed', 'false');
        expect(p95Btn).toHaveAttribute('aria-pressed', 'true');
    });

    it('places a player with avg=300 inside the green zone radius', () => {
        // outerRadius=190, scale 1500 → r = 300/1500 * 190 = 38. Green zone runs 0..76 (600/1500*190).
        render(<SquadDistanceToTagVisualSection result={result([row({ account: 'A.1', avg: 300 })])} />);
        const chip = document.querySelector('[data-chip-account="A.1"]') as SVGGElement | null;
        expect(chip).not.toBeNull();
        const r = Number(chip!.getAttribute('data-chip-radius'));
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThanOrEqual(76);
    });

    it('clamps a player with very high distance to outer radius', () => {
        render(<SquadDistanceToTagVisualSection result={result([row({ account: 'A.1', avg: 9999 })])} />);
        const chip = document.querySelector('[data-chip-account="A.1"]') as SVGGElement | null;
        expect(chip).not.toBeNull();
        const r = Number(chip!.getAttribute('data-chip-radius'));
        expect(r).toBeCloseTo(190, 0);
    });
});
