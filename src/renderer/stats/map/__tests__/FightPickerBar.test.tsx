import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FightPickerBar } from '../FightPickerBar';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (id: string, label: string): ReplayFightPayload => ({
    fightId: id, fightIndex: 0, label, timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 5, deaths: 2,
    movementData: { pollingRate: 300, durationMs: 60_000, inchToPixel: 1, members: [], boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
});

const fights = [makeFight('a', 'Fight A'), makeFight('b', 'Fight B'), makeFight('c', 'Fight C')];

describe('FightPickerBar', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('shows fight cards when expanded', () => {
        render(<FightPickerBar fights={fights} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('Fight A')).toBeTruthy();
        expect(screen.getByText('Fight B')).toBeTruthy();
    });

    it('hides fight cards when collapsed', () => {
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={() => {}} />);
        expect(screen.queryByText('Fight A')).toBeNull();
    });

    it('collapsed bar shows active fight name', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={() => {}} />);
        expect(screen.getByText('Fight B')).toBeTruthy();
    });

    it('collapsed bar shows fight count', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={() => {}} />);
        expect(screen.getByText('2 of 3')).toBeTruthy();
    });

    it('collapsed ▶ button advances to next fight', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Next fight'));
        expect(useStatsStore.getState().selectedReplayFightId).toBe('b');
    });

    it('collapsed ◀ button goes to previous fight', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Previous fight'));
        expect(useStatsStore.getState().selectedReplayFightId).toBe('a');
    });

    it('calls onToggle when toggle button is clicked (expanded)', () => {
        const onToggle = vi.fn();
        render(<FightPickerBar fights={fights} collapsed={false} onToggle={onToggle} />);
        fireEvent.click(screen.getByTitle('Collapse fight picker'));
        expect(onToggle).toHaveBeenCalledOnce();
    });

    it('calls onToggle when "Show all fights" is clicked (collapsed)', () => {
        const onToggle = vi.fn();
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={onToggle} />);
        fireEvent.click(screen.getByText(/show all fights/i));
        expect(onToggle).toHaveBeenCalledOnce();
    });
});
