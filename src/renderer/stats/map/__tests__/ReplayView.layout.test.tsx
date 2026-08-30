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

describe('ReplayView HUD geometry regressions', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
        stubContainerWidth(1400);
    });

    /**
     * The collapsed rail has no internal scroll, so if the left column runs short
     * and the rail is allowed to shrink, its box squashes while the vertical
     * "Layers" label overflows past it — leaving ink that looks clickable but
     * sits outside the button. It must never shrink.
     */
    it('never lets the collapsed layers rail shrink', () => {
        render(<ReplayView fights={[mkFight()]} />);
        const rail = screen.getByTitle('Show layers');
        const wrapper = rail.parentElement as HTMLElement;
        expect(wrapper.style.flexShrink).toBe('0');
        expect(wrapper.style.minHeight).toBe('');
    });

    it('lets the open layers panel shrink so it scrolls instead of overrunning the legend', () => {
        render(<ReplayView fights={[mkFight()]} />);
        fireEvent.click(screen.getByTitle('Show layers'));
        const panel = document.querySelector('[data-layers-panel]') as HTMLElement;
        const wrapper = panel.parentElement as HTMLElement;
        expect(wrapper.style.minHeight).toBe('0');
        expect(wrapper.style.flexShrink).toBe('');
    });

    /**
     * The squad card yields to the transport vertically (`aboveTransportBottom`),
     * so the two never share a row. The transport therefore must not reserve
     * horizontal space for it — doing so made the play bar visibly shrink every
     * time the roster was opened.
     */
    /**
     * Both cards default to collapsed, so the width rule can never change a
     * default — all it can do is veto a click. Vetoing one made the Layers rail
     * a button that visibly did nothing under 1100px, which is what the user hit.
     */
    it('still opens the layers panel on click below the 1100px threshold', () => {
        stubContainerWidth(1000);
        render(<ReplayView fights={[mkFight()]} />);
        fireEvent.click(screen.getByTitle('Show layers'));
        expect(document.querySelector('[data-layers-panel]')).toBeTruthy();
    });

    it('still opens the squad panel on click below the 900px threshold', () => {
        stubContainerWidth(800);
        render(<ReplayView fights={[mkFight()]} />);
        fireEvent.click(screen.getByTitle('Expand squad panel'));
        expect(screen.getByText('Cmdr')).toBeTruthy();
    });

    it('re-applies the narrow-width collapse when the container crosses the threshold again', () => {
        stubContainerWidth(1000);
        const { rerender } = render(<ReplayView fights={[mkFight()]} />);
        fireEvent.click(screen.getByTitle('Show layers'));
        expect(document.querySelector('[data-layers-panel]')).toBeTruthy();

        act(() => { stubContainerWidth(1400); window.dispatchEvent(new Event('resize')); });
        rerender(<ReplayView fights={[mkFight()]} />);
        act(() => { stubContainerWidth(1000); window.dispatchEvent(new Event('resize')); });
        rerender(<ReplayView fights={[mkFight()]} />);
        expect(document.querySelector('[data-layers-panel]')).toBeNull();
    });

    it('keeps the scale bar clear of the follow chips by stacking them in one column', () => {
        useStatsStore.getState().setReplayFollowTarget('C.1');
        render(<ReplayView fights={[mkFight()]} />);
        const scaleBar = screen.getByTestId('scale-bar');
        const chip = screen.getByText(/C\.1/).closest('button') as HTMLElement;
        // Same stacking column => neither is absolutely positioned over the other.
        const column = scaleBar.parentElement as HTMLElement;
        expect(column.contains(chip)).toBe(true);
    });

    it('keeps the transport the same width whether the squad card is open or collapsed', () => {
        render(<ReplayView fights={[mkFight()]} />);
        const transport = () => document.querySelector('[data-hud="transport"]') as HTMLElement;
        const collapsedRight = transport().style.right;

        fireEvent.click(screen.getByTitle('Expand squad panel'));
        expect(screen.getByTitle('Collapse squad panel')).toBeTruthy();
        expect(transport().style.right).toBe(collapsedRight);
    });

    it('lifts the squad card clear of the transport when the lanes band expands', () => {
        render(<ReplayView fights={[mkFight()]} />);
        const card = () => document.querySelector('[data-hud="squad"]') as HTMLElement;
        const resting = parseInt(card().style.bottom, 10);

        act(() => { useStatsStore.getState().setReplayLanesExpanded(true); });
        expect(parseInt(card().style.bottom, 10)).toBeGreaterThan(resting);
    });
});
