import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviveDetailSection } from '../sections/ReviveDetailSection';

const summary: any = {
    coverage: { logsWithData: 3, logsWithoutData: 0 },
    squad: { downs: 44, recovered: 22, died: 22, hand: 14, utility: 6, self: 1, unattributed: 1 },
    players: [{ key: 'A|Firebrand', account: 'A', profession: 'Firebrand', attempts: 9, attemptTimeMs: 10945,
        handRevives: 3, successRate: 3 / 9, utilityCasts: 0, utilityRevives: 0, revivesPerCast: 0,
        assists: 1, totalRevives: 3 }],
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
        expect(screen.getAllByText('3').length).toBeGreaterThan(0);   // completed
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
});
