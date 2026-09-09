import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviveDetailSection } from '../sections/ReviveDetailSection';

// handRevives (3), utilityCasts/utilityRevives (2) and totalRevives (5 = 3 + 2) are
// deliberately distinct from each other and from attempts (9) and assists (1), so
// each assertion below can target one specific cell instead of any cell that
// happens to share a value.
const summary: any = {
    coverage: { logsWithData: 3, logsWithoutData: 0 },
    squad: { downs: 44, recovered: 22, died: 22, hand: 14, utility: 6, self: 1, unattributed: 1 },
    players: [{ key: 'A|Firebrand', account: 'A', profession: 'Firebrand', attempts: 9, attemptTimeMs: 10945,
        handRevives: 3, successRate: 3 / 9, utilityCasts: 2, utilityRevives: 2, revivesPerCast: 1,
        assists: 1, totalRevives: 5 }],
    utilities: [{ skillId: 14419, name: 'Battle Standard', casts: 4, revives: 6, revivesPerCast: 1.5, topCasterKey: 'B|Berserker' }],
    iol: null,
};

describe('ReviveDetailSection', () => {
    it('shows the squad recovery split', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        expect(screen.getByText(/22/)).toBeTruthy();
        expect(screen.getByText(/Unattributed/i)).toBeTruthy();
    });

    it('shows attempts alongside completed revives', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        expect(screen.getByText('9')).toBeTruthy();   // attempts
        expect(screen.getByText('5')).toBeTruthy();   // total revives (hand 3 + utility 2)
    });

    it('renders a coverage notice when some logs lack the data', () => {
        const partial = { ...summary, coverage: { logsWithData: 2, logsWithoutData: 5 } };
        render(<ReviveDetailSection reviveDetail={partial} />);
        expect(screen.getByText(/5 logs/i)).toBeTruthy();
    });

    it('omits the Illusion of Life panel when there were none', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        expect(screen.queryByText(/Illusion of Life/i)).toBeNull();
    });

    it('shows Illusion of Life survival when present', () => {
        const withIol = { ...summary, iol: { revives: 8, survived: 3, reDowned: 5, medianTimeToReDownMs: 6200 } };
        render(<ReviveDetailSection reviveDetail={withIol} />);
        expect(screen.getByText(/Illusion of Life/i)).toBeTruthy();
        expect(screen.getByText(/6\.2s/)).toBeTruthy();
    });

    it('shows a profession icon for each player row', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        expect(screen.getByAltText('Firebrand')).toBeTruthy();
    });

    it('defaults to ascending order when sorting by player, matching sibling sections', () => {
        const twoPlayers: any = {
            ...summary,
            players: [
                { key: 'Bravo|Guardian', account: 'Bravo', profession: 'Guardian', attempts: 1, attemptTimeMs: 1000,
                    handRevives: 1, successRate: 1, utilityCasts: 0, utilityRevives: 0, revivesPerCast: 0, assists: 0, totalRevives: 1 },
                { key: 'Alpha|Guardian', account: 'Alpha', profession: 'Guardian', attempts: 1, attemptTimeMs: 1000,
                    handRevives: 1, successRate: 1, utilityCasts: 0, utilityRevives: 0, revivesPerCast: 0, assists: 0, totalRevives: 1 },
            ],
        };
        render(<ReviveDetailSection reviveDetail={twoPlayers} />);
        // First click on a never-before-sorted column defaults to descending for
        // every numeric column, but ascending for the Player (account) column.
        fireEvent.click(screen.getByRole('button', { name: 'Player' }));
        const accounts = screen.getAllByText(/^(Alpha|Bravo)$/).map((el) => el.textContent);
        expect(accounts).toEqual(['Alpha', 'Bravo']);
    });

    it('normalizes the count columns into a per-minute rate via the toggle, leaving ratios untouched', () => {
        render(<ReviveDetailSection reviveDetail={summary} playerActiveMs={{ 'A|Firebrand': 180000 }} />);
        // 9 attempts over 3 minutes of active time = 3.00/min.
        fireEvent.click(screen.getByRole('button', { name: 'Stat/60s' }));
        expect(screen.getByText('3.00')).toBeTruthy();
        // Success Rate is a ratio, not a count — it must not be time-scaled.
        expect(screen.getByText('33%')).toBeTruthy();
    });
});
