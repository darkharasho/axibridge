import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SquadDistanceToTagSection } from '../SquadDistanceToTagSection';
import type { DistanceToTagResult } from '../../computeDistanceToTag';

vi.mock('../../StatsViewContext', () => ({
    useStatsSharedContext: () => ({
        formatWithCommas: (n: number, d: number) => Number(n).toFixed(d),
        expandedSection: null,
        expandedSectionClosing: false,
        openExpandedSection: () => {},
        closeExpandedSection: () => {},
    }),
}));

const result = (rows: DistanceToTagResult['rows']): DistanceToTagResult => ({ rows, commanderCount: 1 });

describe('SquadDistanceToTagSection', () => {
    it('renders empty state when no rows', () => {
        render(<SquadDistanceToTagSection result={result([])} />);
        expect(screen.getByText(/no distance data/i)).toBeInTheDocument();
    });

    it('renders one row per player with avg/median/p95', () => {
        render(<SquadDistanceToTagSection result={result([
            {
                account: 'Player.1',
                profession: 'Guardian',
                professionList: ['Guardian'],
                fightCount: 5,
                sampleCount: 5,
                avg: 250,
                p25: 150,
                median: 200,
                p75: 400,
                p95: 600,
                source: 'fightAvg',
                isCommander: false,
            },
            {
                account: 'Player.2',
                profession: 'Necromancer',
                professionList: ['Necromancer'],
                fightCount: 3,
                sampleCount: 3000,
                avg: 100,
                p25: 60,
                median: 90,
                p75: 120,
                p95: 350,
                source: 'replay',
                isCommander: false,
            },
        ])} />);
        expect(screen.getByText('Player.1')).toBeInTheDocument();
        expect(screen.getByText('Player.2')).toBeInTheDocument();
        expect(screen.getByText('250')).toBeInTheDocument();
        expect(screen.getByText('600')).toBeInTheDocument();
    });
});
