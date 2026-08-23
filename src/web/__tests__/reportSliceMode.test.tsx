import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatsView } from '../../renderer/StatsView';
import { useStatsStore, type FightRosterEntry } from '../../renderer/stats/statsStore';

const ROSTER: FightRosterEntry[] = [
    { id: 'a', label: 'EBG: Klovan', timestamp: 1_000, duration: '2:41', isWin: true, enemyClassCounts: {} },
    { id: 'b', label: 'Red BL: Bravost', timestamp: 2_000, duration: '1:20', isWin: false, enemyClassCounts: {} },
];

beforeEach(() => {
    useStatsStore.setState((useStatsStore as any).getInitialState());
    useStatsStore.getState().mergeFightRoster(ROSTER, ['a', 'b']);
});

const renderEmbedded = (sliceEnabled: boolean) => render(
    <StatsView
        logs={[]}
        onBack={() => {}}
        mvpWeights={undefined}
        precomputedStats={{ statsViewSettings: {} }}
        embedded
        sliceEnabled={sliceEnabled}
    />
);

describe('published report slice mode', () => {
    it('shows the slice banner in an embedded view when slicing is enabled', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        renderEmbedded(true);
        expect(screen.getByText(/1 of 2 fights/i)).toBeInTheDocument();
    });

    it('shows no slice banner in an embedded view when slicing is not enabled', () => {
        // A historical FightReportHistoryView must never surface the live slice.
        useStatsStore.getState().setFightsExcluded(['b'], true);
        renderEmbedded(false);
        expect(screen.queryByText(/1 of 2 fights/i)).not.toBeInTheDocument();
    });

    it('clears the slice from the embedded banner', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        renderEmbedded(true);
        fireEvent.click(screen.getByRole('button', { name: /clear slice/i }));
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });
});
