import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CrashRecoveryBanner } from '../CrashRecoveryBanner';

const noop = () => {};

describe('CrashRecoveryBanner', () => {
    it('renders nothing on a normal boot', () => {
        const { container } = render(
            <CrashRecoveryBanner notice={null} onRecompute={noop} onDismiss={noop} />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('names out-of-memory as the cause and reports the restored count', () => {
        render(<CrashRecoveryBanner notice={{ reason: 'oom', logCount: 33 }} onRecompute={noop} onDismiss={noop} />);
        expect(screen.getByText(/Recovered from a crash/i)).toBeInTheDocument();
        expect(screen.getByText(/ran out of memory/i)).toBeInTheDocument();
        expect(screen.getByText(/Your 33 logs were restored/i)).toBeInTheDocument();
    });

    it('names a non-OOM reason rather than blaming memory', () => {
        render(<CrashRecoveryBanner notice={{ reason: 'crashed', logCount: 2 }} onRecompute={noop} onDismiss={noop} />);
        expect(screen.getByText(/stopped unexpectedly \(crashed\)/i)).toBeInTheDocument();
        expect(screen.queryByText(/ran out of memory/i)).not.toBeInTheDocument();
    });

    it('uses singular wording for a single log', () => {
        render(<CrashRecoveryBanner notice={{ reason: 'oom', logCount: 1 }} onRecompute={noop} onDismiss={noop} />);
        expect(screen.getByText(/Your 1 log was restored/i)).toBeInTheDocument();
    });

    /** Recompute is the thing that can crash again, so it must be a deliberate act. */
    it('offers recompute and dismiss, and reports which was pressed', async () => {
        const onRecompute = vi.fn();
        const onDismiss = vi.fn();
        render(<CrashRecoveryBanner notice={{ reason: 'oom', logCount: 33 }} onRecompute={onRecompute} onDismiss={onDismiss} />);

        await userEvent.click(screen.getByRole('button', { name: /recompute stats/i }));
        expect(onRecompute).toHaveBeenCalledTimes(1);

        await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('offers no recompute when nothing was restored', () => {
        render(<CrashRecoveryBanner notice={{ reason: 'oom', logCount: 0 }} onRecompute={noop} onDismiss={noop} />);
        expect(screen.queryByRole('button', { name: /recompute stats/i })).not.toBeInTheDocument();
        expect(screen.getByText(/No logs were in the list/i)).toBeInTheDocument();
    });
});
