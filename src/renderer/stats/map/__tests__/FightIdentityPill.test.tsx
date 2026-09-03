import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FightIdentityPill } from '../FightIdentityPill';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (id: string, label: string): ReplayFightPayload => ({
    fightId: id, fightIndex: 0, label, timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 5, deaths: 2,
    movementData: { pollingRate: 300, durationMs: 60_000, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null, tickRate: null,
});

const fights = [makeFight('a', 'Fight A'), makeFight('b', 'Fight B'), makeFight('c', 'Fight C')];

describe('FightIdentityPill', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('shows the active fight label', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect(screen.getByText('Fight B')).toBeTruthy();
    });

    it('shows the position in the fight list', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect(screen.getByText(/2 of 3/)).toBeTruthy();
    });

    it('shows squad size and duration', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect(screen.getByText(/20/)).toBeTruthy();
        expect(screen.getByText(/1:00/)).toBeTruthy();
    });

    it('▶ advances to the next fight', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        fireEvent.click(screen.getByTitle('Next fight'));
        expect(useStatsStore.getState().selectedReplayFightId).toBe('b');
    });

    it('◀ goes to the previous fight', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        fireEvent.click(screen.getByTitle('Previous fight'));
        expect(useStatsStore.getState().selectedReplayFightId).toBe('a');
    });

    it('disables ◀ on the first fight', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect((screen.getByTitle('Previous fight') as HTMLButtonElement).disabled).toBe(true);
    });

    it('disables ▶ on the last fight', () => {
        useStatsStore.getState().setSelectedReplayFight('c');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect((screen.getByTitle('Next fight') as HTMLButtonElement).disabled).toBe(true);
    });

    it('calls onOpenPicker when the label is clicked', () => {
        const onOpenPicker = vi.fn();
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightIdentityPill fights={fights} onOpenPicker={onOpenPicker} />);
        fireEvent.click(screen.getByTitle('Show all fights'));
        expect(onOpenPicker).toHaveBeenCalledOnce();
    });

    /**
     * The E2E specs open the picker through this button, and they used to reach
     * for it by role+name with the title text as the name. That matched nothing:
     * the opener has content, so its accessible name is the fight it is showing
     * and `title` never gets consulted. The click retried for the full 60s test
     * timeout instead of failing loudly, which is how it stayed broken across
     * three releases. Pin both halves of that contract.
     */
    it('is named by the fight it shows, and only findable by title', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        expect(screen.queryByRole('button', { name: /Show all fights/i })).toBeNull();
        expect(screen.getByTitle('Show all fights')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Fight A/ })).toBeTruthy();
    });

    it('renders nothing with an empty fight list', () => {
        const { container } = render(<FightIdentityPill fights={[]} onOpenPicker={() => {}} />);
        expect(container.firstChild).toBeNull();
    });

    it('sets an explicit opaque background so the pill is not see-through over the map', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        const { container } = render(<FightIdentityPill fights={fights} onOpenPicker={() => {}} />);
        const pill = container.firstChild as HTMLElement;
        expect(pill.style.background).not.toBe('');
    });
});
