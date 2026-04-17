import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { FightPicker } from '../FightPicker';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (o: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'x', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 5, deaths: 2,
    movementData: { pollingRate: 300, durationMs: 60_000, inchToPixel: 1, members: [], boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [], ...o,
});

describe('FightPicker', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
    });

    it('renders empty state when there are no fights', () => {
        render(<FightPicker fights={[]} />);
        expect(screen.getByText(/no replay data/i)).toBeTruthy();
    });

    it('renders one card per fight with the fight label', () => {
        render(<FightPicker fights={[makeFight({ fightId: 'a', label: 'Green BL: Bay (2:30)' })]} />);
        expect(screen.getByText('Green BL: Bay (2:30)')).toBeTruthy();
    });

    it('clicking a card selects that fight', () => {
        render(<FightPicker fights={[makeFight({ fightId: 'a', label: 'A' }), makeFight({ fightId: 'b', label: 'B' })]} />);
        fireEvent.click(screen.getByText('B'));
        expect(useStatsStore.getState().selectedReplayFightId).toBe('b');
    });

    it('ArrowRight advances to the next fight', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        const fights = [
            makeFight({ fightId: 'a', label: 'A' }),
            makeFight({ fightId: 'b', label: 'B' }),
        ];
        render(<FightPicker fights={fights} />);
        const container = screen.getByRole('listbox');
        container.focus();
        fireEvent.keyDown(container, { key: 'ArrowRight' });
        expect(useStatsStore.getState().selectedReplayFightId).toBe('b');
    });

    it('ArrowLeft goes to previous fight and stops at start', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        const fights = [
            makeFight({ fightId: 'a', label: 'A' }),
            makeFight({ fightId: 'b', label: 'B' }),
        ];
        render(<FightPicker fights={fights} />);
        const container = screen.getByRole('listbox');
        container.focus();
        fireEvent.keyDown(container, { key: 'ArrowLeft' });
        expect(useStatsStore.getState().selectedReplayFightId).toBe('a');
        fireEvent.keyDown(container, { key: 'ArrowLeft' });
        expect(useStatsStore.getState().selectedReplayFightId).toBe('a');
    });
});
