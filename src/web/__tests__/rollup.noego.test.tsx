/**
 * No Ego Mode rollup display tests.
 *
 * Tests the NoEgoRollup component (exported from reportApp.tsx) which renders
 * MetricDistributionCard grids instead of ranked tables when noEgoMode is true.
 *
 * Strategy: we import and render NoEgoRollup directly rather than spinning up
 * the full ReportApp (which requires network/fetch mocks). This keeps tests fast
 * and isolated. The re-export surface check (noEgoMode field) lives in
 * rollup.noego.test.ts alongside the plain TypeScript tests.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoEgoRollup } from '../reportApp';
import type { RollupCommanderRow, RollupPlayerRow } from '../rollup';

// ── helpers ───────────────────────────────────────────────────────────────────
function makeCommanderRow(account: string): RollupCommanderRow {
    return {
        account,
        characterNames: [],
        profession: 'Guardian',
        professionBreakdown: [],
        runs: 5,
        fightsLed: 20,
        kills: 100,
        downs: 5,
        commanderDeaths: 2,
        alliesDead: 10,
        wins: 15,
        losses: 5,
        kdr: 50,
        lastSeenTs: Date.now(),
    };
}

function makePlayerRow(account: string): RollupPlayerRow {
    return {
        account,
        characterNames: [],
        profession: 'Mesmer',
        professionBreakdown: [],
        runs: 8,
        combatTimeMs: 3_600_000, // 60 min
        squadTimeMs: 0,
        lastSeenTs: Date.now(),
    };
}

const commanderRows: RollupCommanderRow[] = [
    makeCommanderRow('Alpha.1234'),
    makeCommanderRow('Bravo.5678'),
    makeCommanderRow('Charlie.9012'),
    makeCommanderRow('Delta.3456'),
];

const playerRows: RollupPlayerRow[] = [
    makePlayerRow('Player.0001'),
    makePlayerRow('Player.0002'),
    makePlayerRow('Player.0003'),
    makePlayerRow('Player.0004'),
];

// ── NoEgoRollup component tests ───────────────────────────────────────────────
describe('NoEgoRollup', () => {
    it('renders rollup-no-ego-commanders container with MetricDistributionCard mean values', () => {
        render(<NoEgoRollup commanderRows={commanderRows} playerRows={[]} />);

        const commanderSection = screen.getByTestId('rollup-no-ego-commanders');
        expect(commanderSection).toBeInTheDocument();

        // MetricDistributionCard renders metric-card-mean elements inside
        const meanEls = commanderSection.querySelectorAll('[data-testid="metric-card-mean"]');
        expect(meanEls.length).toBe(5);
    });

    it('renders rollup-no-ego-players container with MetricDistributionCard mean values', () => {
        render(<NoEgoRollup commanderRows={[]} playerRows={playerRows} />);

        const playerSection = screen.getByTestId('rollup-no-ego-players');
        expect(playerSection).toBeInTheDocument();

        const meanEls = playerSection.querySelectorAll('[data-testid="metric-card-mean"]');
        expect(meanEls.length).toBe(2);
    });

    it('renders both sections when both row arrays are populated', () => {
        render(<NoEgoRollup commanderRows={commanderRows} playerRows={playerRows} />);

        expect(screen.getByTestId('rollup-no-ego-commanders')).toBeInTheDocument();
        expect(screen.getByTestId('rollup-no-ego-players')).toBeInTheDocument();
    });

    it('omits commanders section when commanderRows is empty', () => {
        render(<NoEgoRollup commanderRows={[]} playerRows={playerRows} />);

        expect(screen.queryByTestId('rollup-no-ego-commanders')).not.toBeInTheDocument();
        expect(screen.getByTestId('rollup-no-ego-players')).toBeInTheDocument();
    });

    it('omits players section when playerRows is empty', () => {
        render(<NoEgoRollup commanderRows={commanderRows} playerRows={[]} />);

        expect(screen.getByTestId('rollup-no-ego-commanders')).toBeInTheDocument();
        expect(screen.queryByTestId('rollup-no-ego-players')).not.toBeInTheDocument();
    });
});
