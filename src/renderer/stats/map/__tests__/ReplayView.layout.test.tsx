import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ReplayView } from '../ReplayView';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

let nextId = 1;
const mkMember = (o: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    id: nextId++,
    name: 'Cmdr', account: 'C.1', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: true, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [[100, 100], [110, 110]], downRanges: [], deadRanges: [], ...o,
});

const mkFight = (): ReplayFightPayload => ({
    fightId: 'f1', fightIndex: 0, label: 'Fight A', timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 1, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 60_000, pixelsPerInch: { x: 1, y: 1 }, members: [mkMember()], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }], killEvents: [], damageSpikeEvents: [],
    rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null,
});

/** jsdom reports 0x0 for everything; stub the observed width the HUD reads. */
function stubContainerWidth(width: number) {
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ width, height: 700, left: 0, top: 0, right: width, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }),
    });
}

describe('ReplayView layout', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
        stubContainerWidth(1400);
    });

    it('renders the fight identity pill instead of a picker bar', () => {
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByText('Fight A')).toBeTruthy();
        expect(screen.getByTitle('Show all fights')).toBeTruthy();
    });

    it('renders the map legend and the transport bar', () => {
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByText(/on the map/i)).toBeTruthy();
        expect(screen.getByTitle(/show cc and strip lanes/i)).toBeTruthy();
    });

    it('renders the scale bar while the scaleBar layer is on', () => {
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByTestId('scale-bar')).toBeTruthy();
    });

    it('hides the scale bar when the layer is off', () => {
        useStatsStore.getState().setReplayLayer('scaleBar', false);
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.queryByTestId('scale-bar')).toBeNull();
    });

    it('shows the squad roster at a wide container size', () => {
        render(<ReplayView fights={[mkFight()]} />);
        fireEvent.click(screen.getByTitle('Expand squad panel'));
        expect(screen.getByText('Cmdr')).toBeTruthy();
    });

    it('forces the layers card collapsed below 1100px', () => {
        stubContainerWidth(1000);
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByTitle('Show layers')).toBeTruthy();
    });

    it('forces the squad card collapsed below 900px', () => {
        stubContainerWidth(800);
        render(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByTitle('Expand squad panel')).toBeTruthy();
        expect(screen.queryByText('Cmdr')).toBeNull();
    });

    it('restores the user choice when the container widens again', () => {
        const { rerender } = render(<ReplayView fights={[mkFight()]} />);
        fireEvent.click(screen.getByTitle('Expand squad panel'));
        expect(screen.getByText('Cmdr')).toBeTruthy();
        act(() => { stubContainerWidth(800); window.dispatchEvent(new Event('resize')); });
        rerender(<ReplayView fights={[mkFight()]} />);
        act(() => { stubContainerWidth(1400); window.dispatchEvent(new Event('resize')); });
        rerender(<ReplayView fights={[mkFight()]} />);
        expect(screen.getByText('Cmdr')).toBeTruthy();
    });
});
