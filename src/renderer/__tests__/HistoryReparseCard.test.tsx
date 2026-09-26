/**
 * The full-history re-parse is the one action that touches every stored log at
 * once, so the tests are mostly about what it refuses to touch: logs that were
 * already parsed by Axilog (re-parsing them is pure waste), and logs whose
 * source is a hand-imported `.json` (Axilog cannot read one, so including them
 * only manufactures failure lines).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HistoryReparseCard } from '../settings/HistoryReparseCard';

const setApi = (over: Record<string, unknown> = {}) => {
    (window as any).electronAPI = {
        reparseLogAxilog: vi.fn().mockResolvedValue({ success: true, details: { native: {} } }),
        ...over,
    };
    return (window as any).electronAPI;
};

/** The card reads the session's logs from the renderer, never over IPC. */
const stored = (...logs: unknown[]) => () => logs as any[];

const log = (over: Record<string, unknown> = {}) => ({
    id: 'log-1',
    filePath: '/logs/one.zevtc',
    fightLabel: 'One',
    ...over,
});

describe('HistoryReparseCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('counts only the logs a re-parse could actually change', async () => {
        setApi();

        render(<HistoryReparseCard getStoredLogs={stored(
            log({ id: 'a', filePath: '/logs/a.zevtc' }),
            log({ id: 'b', filePath: '/logs/b.evtc', parseSource: 'elite-insights' }),
            // Already Axilog — nothing to gain.
            log({ id: 'c', filePath: '/logs/c.zevtc', parseSource: 'axilog' }),
            // A hand-imported EI JSON: Axilog cannot read it.
            log({ id: 'd', filePath: '/logs/d.json', parseSource: 'json-import' }),
            // Source file no longer named at all.
            log({ id: 'e', filePath: '' }),
        )} />);
        fireEvent.click(screen.getByTestId('history-reparse-scan'));

        await waitFor(() => {
            expect(screen.getByTestId('history-reparse-run').textContent).toContain('Re-parse 2 logs');
        });
        expect(screen.getByTestId('history-reparse-scan-result').textContent).toContain('2 of 5');
    });

    it('says so plainly when there is nothing to re-parse', async () => {
        setApi();

        render(<HistoryReparseCard getStoredLogs={stored(log({ parseSource: 'axilog' }))} />);
        fireEvent.click(screen.getByTestId('history-reparse-scan'));

        await waitFor(() => {
            expect(screen.getByTestId('history-reparse-scan-result').textContent).toContain('Nothing to re-parse');
        });
        expect(screen.queryByTestId('history-reparse-run')).toBeNull();
    });

    it('re-parses each candidate and reports the ones that failed', async () => {
        const reparse = vi.fn()
            .mockResolvedValueOnce({ success: true, details: { native: {} } })
            .mockResolvedValueOnce({ success: false, reason: 'source-missing', error: 'File is gone.' });
        const api = setApi({ reparseLogAxilog: reparse });
        const onLogsHealed = vi.fn();

        render(
            <HistoryReparseCard
                onLogsHealed={onLogsHealed}
                getStoredLogs={stored(
                    log({ id: 'a', filePath: '/logs/a.zevtc', fightLabel: 'Alpha' }),
                    log({ id: 'b', filePath: '/logs/b.zevtc', fightLabel: 'Bravo' }),
                )}
            />
        );
        fireEvent.click(screen.getByTestId('history-reparse-scan'));
        await waitFor(() => screen.getByTestId('history-reparse-run'));
        fireEvent.click(screen.getByTestId('history-reparse-run'));

        await waitFor(() => {
            expect(screen.getByTestId('history-reparse-result').textContent).toContain('Re-parsed 1 of 2');
        });
        expect(reparse).toHaveBeenCalledTimes(2);
        expect(api.reparseLogAxilog.mock.calls.map((c: any[]) => c[0].filePath))
            .toEqual(['/logs/a.zevtc', '/logs/b.zevtc']);
        expect(onLogsHealed).toHaveBeenCalledWith(['/logs/a.zevtc']);
        expect(screen.getByText(/Bravo — File is gone\./)).toBeTruthy();
    });

    it('scans the in-memory list, not the removed get-logs IPC', async () => {
        // Regression: log persistence was deleted, taking main's `get-logs`
        // handler with it, so the invoke this card used to await simply
        // rejected. It sat in a try/finally with no catch, so `setTargets`
        // never ran and "Check history" was permanently dead. The card now
        // reads the live renderer list it is rendered beside.
        setApi();
        expect((window as any).electronAPI.getLogs).toBeUndefined();

        render(
            <HistoryReparseCard
                getStoredLogs={() => [log({ id: 'a', filePath: '/logs/a.zevtc' })]}
            />
        );
        fireEvent.click(screen.getByTestId('history-reparse-scan'));

        await waitFor(() => {
            expect(screen.getByTestId('history-reparse-run').textContent).toContain('Re-parse 1 log');
        });
        expect(screen.getByTestId('history-reparse-scan-result').textContent).toContain('1 of 1');
    });

});
