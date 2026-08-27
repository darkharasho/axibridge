/**
 * The banner exists to end a SILENT failure, so the tests that matter are the
 * ones about what it says and when it stays quiet. Two silences are correct
 * (nothing missing, and the published web report, whose reader cannot act) and
 * every other case must produce a visible count. The re-parse button is gated
 * on both the engine and the source files, because offering a repair that
 * cannot run is the same lie in a different place.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxilogCoverageBanner } from '../AxilogCoverageBanner';
import { summarizeAxilogCoverage, EMPTY_AXILOG_COVERAGE } from '../../utils/axilogCoverage';
import type { AxilogHealState } from '../../hooks/useAxilogHeal';

const IDLE: AxilogHealState = { running: false, done: 0, total: 0, healed: 0, failures: [] };

const coverageMissing = (logs: Array<{ id: string; filePath: string; parseSource?: any }>) =>
    summarizeAxilogCoverage(logs.map((log) => ({ log, hasAxilog: false })));

const renderBanner = (props: Partial<React.ComponentProps<typeof AxilogCoverageBanner>> = {}) =>
    render(
        <AxilogCoverageBanner
            embedded={false}
            coverage={coverageMissing([{ id: 'a', filePath: '/a.zevtc', parseSource: 'dps.report' }])}
            healState={IDLE}
            onHeal={() => {}}
            {...props}
        />,
    );

describe('AxilogCoverageBanner', () => {
    it('renders nothing when every log has Axilog data', () => {
        const { container } = renderBanner({ coverage: EMPTY_AXILOG_COVERAGE });
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing in the embedded web report, which cannot act on it', () => {
        const { container } = renderBanner({ embedded: true });
        expect(container).toBeEmptyDOMElement();
    });

    it('names the count and what is missing from the totals', () => {
        renderBanner({
            coverage: coverageMissing([
                { id: 'a', filePath: '/a.zevtc', parseSource: 'dps.report' },
                { id: 'b', filePath: '/b.zevtc', parseSource: 'dps.report' },
            ]),
        });
        expect(screen.getByText(/Incomplete data/i)).toBeTruthy();
        expect(screen.getByText(/These 2 logs were/)).toBeTruthy();
        expect(screen.getByText(/missing from every total below/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Re-parse 2' })).toBeTruthy();
    });


    it('offers no re-parse when no source file survives, and says why', () => {
        renderBanner({ coverage: coverageMissing([{ id: 'a', filePath: '' }]) });
        expect(screen.queryByRole('button', { name: /Re-parse/ })).toBeNull();
        expect(screen.getByText(/no longer on disk/)).toBeTruthy();
    });

    it('counts only the repairable ones when the selection is mixed', () => {
        renderBanner({
            coverage: coverageMissing([
                { id: 'a', filePath: '/a.zevtc' },
                { id: 'b', filePath: '' },
            ]),
        });
        expect(screen.getByRole('button', { name: 'Re-parse 1' })).toBeTruthy();
        expect(screen.getByText(/1 of them can be repaired/)).toBeTruthy();
    });

    it('lists the affected logs on demand, flagging the unrepairable ones', async () => {
        renderBanner({
            coverage: coverageMissing([
                { id: 'a', filePath: '/a.zevtc' },
                { id: 'b', filePath: '' },
            ]),
        });
        await userEvent.click(screen.getByRole('button', { name: 'Show 2' }));
        expect(screen.getByText('/a.zevtc')).toBeTruthy();
        expect(screen.getByText('source file missing')).toBeTruthy();
    });

    it('hands the repair request to its owner rather than doing it itself', async () => {
        const onHeal = vi.fn();
        renderBanner({ onHeal });
        await userEvent.click(screen.getByRole('button', { name: 'Re-parse 1' }));
        expect(onHeal).toHaveBeenCalledTimes(1);
    });

    it('reports progress while running and hides the button', () => {
        renderBanner({ healState: { running: true, done: 1, total: 3, healed: 1, failures: [] } });
        expect(screen.getByText(/Re-parsing 2 of 3/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^Re-parse \d/ })).toBeNull();
    });

    it('confirms success once the gap is actually closed', () => {
        renderBanner({
            coverage: EMPTY_AXILOG_COVERAGE,
            healState: { running: false, done: 2, total: 2, healed: 2, failures: [] },
        });
        expect(screen.getByText(/Re-parsed 2 logs\. Axilog data restored\./)).toBeTruthy();
    });

    it('still warns when a repair run left some logs unhealed', () => {
        renderBanner({
            coverage: coverageMissing([{ id: 'a', filePath: '/a.zevtc' }]),
            healState: { running: false, done: 2, total: 2, healed: 1, failures: [{ label: 'a', error: 'boom' }] },
        });
        expect(screen.getByText(/Incomplete data/i)).toBeTruthy();
        expect(screen.getByText(/1 could not be re-parsed/)).toBeTruthy();
    });
});
