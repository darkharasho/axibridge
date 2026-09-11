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
    players: [{ key: 'A|Firebrand', account: 'A', profession: 'Firebrand', activeMs: 180000, attempts: 9, attemptTimeMs: 10945,
        handRevives: 3, successRate: 3 / 9, utilityCasts: 2, utilityRevives: 2, revivesPerCast: 1,
        assists: 1, totalRevives: 5 }],
    utilities: [{
        skillId: 14419, name: 'Battle Standard', icon: 'https://example.test/banner.png',
        casts: 4, revives: 6, revivesPerCast: 1.5, topCasterKey: 'B|Berserker',
        casters: [
            // Per-caster casts (2 + 2) and revives (5 + 1) sum to the row's own 4 and 6.
            { key: 'B|Berserker', account: 'B', profession: 'Berserker', casts: 2, revives: 5, revivesPerCast: 2.5 },
            { key: 'C|Spellbreaker', account: 'C', profession: 'Spellbreaker', casts: 2, revives: 1, revivesPerCast: 0.5 },
        ],
    }],
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
        expect(screen.getByText('Illusion of Life')).toBeTruthy();
        expect(screen.getByText(/Survived the fight 3/)).toBeTruthy();
        expect(screen.getByText(/Re-downed 5 — median 6\.2s/)).toBeTruthy();
    });

    it('graphs the time-to-re-down histogram with one labelled bucket per boundary', () => {
        const withIol = { ...summary, iol: {
            revives: 8, survived: 3, reDowned: 5, medianTimeToReDownMs: 6200,
            timeToReDownBuckets: [2, 1, 1, 1, 0],
        } };
        render(<ReviveDetailSection reviveDetail={withIol} />);
        expect(screen.getByText('0–5s')).toBeTruthy();
        expect(screen.getByText('5–10s')).toBeTruthy();
        expect(screen.getByText('10–20s')).toBeTruthy();
        expect(screen.getByText('20–60s')).toBeTruthy();
        expect(screen.getByText('60s+')).toBeTruthy();
    });

    it('omits the histogram for a report published before the buckets existed', () => {
        const legacy = { ...summary, iol: { revives: 8, survived: 3, reDowned: 5, medianTimeToReDownMs: 6200 } };
        render(<ReviveDetailSection reviveDetail={legacy} />);
        expect(screen.queryByText('0–5s')).toBeNull();
        // The survived/re-downed split still renders — only the histogram is gone.
        expect(screen.getByText(/Survived the fight 3/)).toBeTruthy();
    });

    it('shows deaths under Illusion of Life as their own outcome', () => {
        const withDeaths = { ...summary, iol: {
            revives: 10, survived: 3, reDowned: 5, diedUnderIol: 2, medianTimeToReDownMs: 6200,
            timeToReDownBuckets: [2, 1, 1, 1, 0],
        } };
        render(<ReviveDetailSection reviveDetail={withDeaths} />);
        expect(screen.getByText(/Died under IoL 2/)).toBeTruthy();
        // Survived percentage is over all three outcomes: 3 of 10.
        expect(screen.getByText(/Survived the fight 3 \(30%\)/)).toBeTruthy();
        expect(screen.getByText(/mesmers outside the squad/i)).toBeTruthy();
    });

    it('omits the died-under-IoL outcome for a report published before it existed', () => {
        const legacy = { ...summary, iol: { revives: 8, survived: 3, reDowned: 5, medianTimeToReDownMs: 6200 } };
        render(<ReviveDetailSection reviveDetail={legacy} />);
        expect(screen.queryByText(/Died under IoL/)).toBeNull();
        expect(screen.getByText(/Survived the fight 3 \(38%\)/)).toBeTruthy();
    });

    it('renders the skill icon before the utility name', () => {
        const { container } = render(<ReviveDetailSection reviveDetail={summary} />);
        const icon = container.querySelector('img[src="https://example.test/banner.png"]');
        expect(icon).toBeTruthy();
        // Before the name, and decorative — the name is the accessible label.
        expect(icon!.compareDocumentPosition(screen.getByText('Battle Standard')))
            .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(icon!.getAttribute('alt')).toBe('');
    });

    it('reveals per-caster stats when a utility row is expanded, and hides them again', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        expect(screen.queryByText('B')).toBeNull();

        const expander = screen.getByRole('button', { name: /Expand Battle Standard casters/i });
        fireEvent.click(expander);

        expect(screen.getByText('B')).toBeTruthy();
        expect(screen.getByText('C')).toBeTruthy();
        // Each caster's own ratio, not the utility row's 1.50.
        expect(screen.getByText('2.50')).toBeTruthy();
        expect(screen.getByText('0.50')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: /Collapse Battle Standard casters/i }));
        expect(screen.queryByText('B')).toBeNull();
    });

    it('does not offer an expander for a report published without per-caster data', () => {
        const legacy = {
            ...summary,
            utilities: [{ skillId: 14419, name: 'Battle Standard', casts: 4, revives: 6, revivesPerCast: 1.5, topCasterKey: null }],
        };
        render(<ReviveDetailSection reviveDetail={legacy} />);
        expect(screen.getByText('Battle Standard')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Battle Standard casters/i })).toBeNull();
    });

    it('shows a profession icon for each player row', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        expect(screen.getByAltText('Firebrand')).toBeTruthy();
    });

    it('defaults to ascending order when sorting by player, matching sibling sections', () => {
        const twoPlayers: any = {
            ...summary,
            players: [
                { key: 'Bravo|Guardian', account: 'Bravo', profession: 'Guardian', activeMs: 60000, attempts: 1, attemptTimeMs: 1000,
                    handRevives: 1, successRate: 1, utilityCasts: 0, utilityRevives: 0, revivesPerCast: 0, assists: 0, totalRevives: 1 },
                { key: 'Alpha|Guardian', account: 'Alpha', profession: 'Guardian', activeMs: 60000, attempts: 1, attemptTimeMs: 1000,
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
        // The denominator rides on the row itself (activeMs: 180000), so it cannot
        // be missed by a key-convention mismatch between two separate tables.
        render(<ReviveDetailSection reviveDetail={summary} />);
        // 9 attempts over 3 minutes of active time = 3.00/min.
        fireEvent.click(screen.getByRole('button', { name: 'Stat/60s' }));
        expect(screen.getByText('3.00')).toBeTruthy();
        // Success Rate is a ratio, not a count — it must not be time-scaled.
        expect(screen.getByText('33%')).toBeTruthy();
    });

    it('renders a dash instead of a fabricated rate when a row carries no active time', () => {
        // A row published before `activeMs` existed. Flooring the denominator at
        // 1 second would print 9 attempts as "9.00/s" / "540.00/min" with nothing
        // on screen to say the number is meaningless.
        const noActiveTime: any = { ...summary, players: [{ ...summary.players[0], activeMs: 0 }] };
        render(<ReviveDetailSection reviveDetail={noActiveTime} />);
        fireEvent.click(screen.getByRole('button', { name: 'Stat/60s' }));
        expect(screen.queryByText('540.00')).toBeNull();
        expect(screen.queryByText('9.00')).toBeNull();
        // Success Rate is still a real ratio and still renders.
        expect(screen.getByText('33%')).toBeTruthy();
    });

    it('sorts rows with no measurable rate last in BOTH directions', () => {
        // A numeric sentinel for "no rate" ranks below every real rate, which is
        // correct descending and exactly backwards ascending — it would present
        // the one row that has no rate at all as the lowest rate in the squad.
        const mixed: any = {
            ...summary,
            players: [
                { ...summary.players[0], key: 'Alpha|Guardian', account: 'Alpha', activeMs: 0, attempts: 9 },
                { ...summary.players[0], key: 'Bravo|Guardian', account: 'Bravo', activeMs: 180000, attempts: 9 },
                { ...summary.players[0], key: 'Charlie|Guardian', account: 'Charlie', activeMs: 180000, attempts: 3 },
            ],
        };
        render(<ReviveDetailSection reviveDetail={mixed} />);
        fireEvent.click(screen.getByRole('button', { name: 'Stat/60s' }));
        const order = () => screen.getAllByText(/^(Alpha|Bravo|Charlie)$/).map((el) => el.textContent);

        fireEvent.click(screen.getByRole('button', { name: /^Resurrect Attempts/ }));
        expect(order()).toEqual(['Bravo', 'Charlie', 'Alpha']);

        fireEvent.click(screen.getByRole('button', { name: /^Resurrect Attempts/ }));
        expect(order()).toEqual(['Charlie', 'Bravo', 'Alpha']);
    });

    it('states the right coverage caveat for the active view mode', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        // Totals genuinely have no denominator...
        expect(screen.getByText(/Totals carry no per-player denominator/i)).toBeTruthy();

        // ...but rates do, so repeating the totals caveat there would be wrong.
        fireEvent.click(screen.getByRole('button', { name: 'Stat/60s' }));
        expect(screen.queryByText(/Totals carry no per-player denominator/i)).toBeNull();
        expect(screen.getByText(/each player.s own active time/i)).toBeTruthy();
    });

    it('notes that utility credit is time-window based with no proximity check', () => {
        render(<ReviveDetailSection reviveDetail={summary} />);
        expect(screen.getByText(/time-window based/i)).toBeTruthy();
        expect(screen.getByText(/no check on how far away it was/i)).toBeTruthy();
    });
});
