import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransportBar } from '../TransportBar';
import { useStatsStore } from '../../statsStore';
import { TIMELINE_HEIGHT_PX } from '../SyncedTimeline';
import { REPLAY_TRANSPORT_HEIGHT } from '../replayLayoutConstants';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (): ReplayFightPayload => ({
    fightId: 'x', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 90_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: 90_000, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }, { timeMs: 90_000, squadDps: 5000 }],
    killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null, tickRate: null,
});

describe('TransportBar', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('starts with the lanes band collapsed', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        expect(container.querySelector('[data-testid="timeline-lanes"]')).toBeNull();
    });

    it('expands the lanes band on click', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByTitle(/show cc and strip lanes/i));
        expect(container.querySelector('[data-testid="timeline-lanes"]')).not.toBeNull();
    });

    it('collapses the band again on a second click', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByTitle(/show cc and strip lanes/i));
        fireEvent.click(screen.getByTitle(/hide cc and strip lanes/i));
        expect(container.querySelector('[data-testid="timeline-lanes"]')).toBeNull();
    });

    it('reflects lane expansion state in the store', () => {
        render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByTitle(/show cc and strip lanes/i));
        expect(useStatsStore.getState().replayLanesExpanded).toBe(true);
    });

    // The bar absorbed a separate timeline header that printed its own clock;
    // this guards against the duplicate coming back. The elapsed half sits in
    // its own span so it can be brighter than the total, so this reads the
    // whole readout rather than matching one text node.
    it('prints the clock exactly once', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        expect(screen.getAllByTestId('transport-clock')).toHaveLength(1);
        expect(screen.getByTestId('transport-clock').textContent).toBe('0:00 / 1:30');
        expect(container.textContent!.split('0:00 / 1:30')).toHaveLength(2);
    });

    it('toggles playback', () => {
        render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByLabelText('Play'));
        expect(useStatsStore.getState().replayPlayhead.playing).toBe(true);
    });

    // The chip opens the ladder; it never steps the speed itself. Cycling
    // made the chip's label the only way to find out where a click landed you.
    it('opens the ladder from the chip instead of changing speed', () => {
        render(<TransportBar fight={makeFight()} />);
        expect(screen.queryByTestId('speed-ladder')).toBeNull();
        fireEvent.click(screen.getByTestId('speed-chip'));
        expect(screen.getByTestId('speed-ladder')).toBeTruthy();
        expect(useStatsStore.getState().replayPlayhead.speed).toBe(1);
    });

    it('reaches any speed directly from the hover ladder', () => {
        render(<TransportBar fight={makeFight()} />);
        expect(screen.queryByTestId('speed-ladder')).toBeNull();
        fireEvent.mouseEnter(screen.getByTestId('speed-chip').parentElement!);
        fireEvent.click(screen.getByText('0.5×'));
        expect(useStatsStore.getState().replayPlayhead.speed).toBe(0.5);
    });

    /**
     * The ladder floats above the chip with a 6px gap. If that gap is an
     * offset, the pointer crosses bare transport bar on its way up, the
     * wrapper takes a mouseleave, and the ladder closes before you reach it.
     * The gap has to be transparent padding on a bridging span instead — no
     * layout in jsdom, so assert the structure rather than the geometry.
     */
    it('bridges the gap between chip and ladder so hovering across it holds', () => {
        render(<TransportBar fight={makeFight()} />);
        fireEvent.mouseEnter(screen.getByTestId('speed-chip').parentElement!);
        const bridge = screen.getByTestId('speed-ladder').parentElement as HTMLElement;
        expect(bridge.style.bottom).toBe('100%');
        expect(bridge.style.paddingBottom).toBe('6px');
        expect(screen.getByTestId('speed-ladder').style.bottom).toBe('');
    });

    // Quarter speed is the reason the ladder is worth opening: a rally or a
    // spike resolves inside a couple of polls and 1x walks straight past it.
    it('offers quarter speed', () => {
        render(<TransportBar fight={makeFight()} />);
        fireEvent.mouseEnter(screen.getByTestId('speed-chip').parentElement!);
        fireEvent.click(screen.getByText('0.25×'));
        expect(useStatsStore.getState().replayPlayhead.speed).toBe(0.25);
    });

    // Everything readable or pressable sits before the plot, which then takes
    // whatever is left. Nothing is parked to the plot's right except the lanes
    // toggle, so no fixed-width cell reserves chart space it does not use.
    it('puts the whole control cluster ahead of the plot', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        const kids = Array.from((container.firstElementChild as HTMLElement).children);
        const plotIndex = kids.findIndex(k => k.getAttribute('data-testid') === 'transport-plot');
        const instrumentIndex = kids.findIndex(k => k.getAttribute('data-testid') === 'transport-instrument');
        expect(plotIndex).toBeGreaterThan(instrumentIndex);
        expect(instrumentIndex).toBeGreaterThan(-1);
        // ...and the plot takes the remaining width rather than a fixed slice.
        expect((kids[plotIndex] as HTMLElement).style.flexGrow).toBe('1');
    });

    // The lanes and the scrubber used to be two charts in two grid rows with
    // two independently sized 1000-unit x-axes, which is how they once drifted
    // ~190px apart. Superimposed in one box, drift is not expressible.
    it('draws the lanes in the scrubber\'s own box rather than a second chart', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByTestId('lanes-toggle'));
        const plot = screen.getByTestId('transport-plot');
        const lanes = container.querySelector('[data-testid="timeline-lanes"]') as SVGElement;
        expect(plot.contains(lanes)).toBe(true);
        expect(plot.contains(container.querySelector('svg.replay-timeline'))).toBe(true);
        expect(lanes.style.position).toBe('absolute');
        expect(lanes.style.inset).toBe('0');
    });

    // The overlay covers the entire scrub surface, so it has to be invisible
    // to the mouse or it would swallow clicks and drags meant for the
    // scrubber underneath.
    it('lets clicks fall through the lanes overlay to the scrubber', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByTestId('lanes-toggle'));
        const lanes = container.querySelector('[data-testid="timeline-lanes"]') as SVGElement;
        expect(lanes.style.pointerEvents).toBe('none');
    });

    // The DPS wash disappears entirely behind two lanes of bars; the line
    // survives. Guarding the swap because a silently-filled path under the
    // overlay reads as "the squad did nothing" rather than as a rendering bug.
    it('restrokes the DPS series when the lanes are drawn over it', () => {
        render(<TransportBar fight={makeFight()} />);
        const series = () => screen.getByTestId('dps-series');
        expect(series().style.fill).not.toBe('transparent');
        fireEvent.click(screen.getByTestId('lanes-toggle'));
        expect(series().style.fill).toBe('transparent');
    });

    it('omits the tick readout when the log carried no CBTS_TICK block', () => {
        render(<TransportBar fight={makeFight()} />);
        expect(screen.queryByTestId('tick-readout')).toBeNull();
        // The clock must survive the tick block being absent.
        expect(screen.getByText('0:00')).toBeTruthy();
    });

    it('shows the tick rate at the playhead when the block is present', () => {
        const fight = makeFight();
        fight.tickRate = { avg: 25.006, min: 16.5, perSecond: [0, 25.1, 24.9, 16.5, 25.2] };
        useStatsStore.getState().setReplayPlayhead({ timeMs: 3_000 });
        render(<TransportBar fight={fight} />);
        const readout = screen.getByTestId('tick-readout');
        expect(readout.textContent).toContain('16.5');
        expect(readout.dataset.tone).toBe('bad');
    });

    // jsdom does not run layout, so `getBoundingClientRect()` on the bar
    // would always read 0 — a real pixel-height assertion is not available
    // here. Instead we assert the svg `height` that drives it: 44 (the
    // timeline) + 8 padding + 2 border = the 54px `REPLAY_TRANSPORT_HEIGHT`
    // every HUD child positions against.
    it('renders the timeline at the height the bar is built from', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        const svg = container.querySelector('svg.replay-timeline') as SVGElement;
        expect(svg.style.height).toBe(`${TIMELINE_HEIGHT_PX}px`);
        expect(REPLAY_TRANSPORT_HEIGHT).toBe(TIMELINE_HEIGHT_PX + 10);
    });

    // The lanes cost no height at all now: the bar is the same size whether
    // they are on or off, which is what stopped the surrounding HUD from
    // reflowing every time the toggle was pressed.
    it('adds no height when the lanes are turned on', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        const height = () => (container.querySelector('svg.replay-timeline') as SVGElement).style.height;
        const before = height();
        fireEvent.click(screen.getByTestId('lanes-toggle'));
        expect(height()).toBe(before);
        const lanesSvg = container.querySelector('[data-testid="timeline-lanes"]') as SVGElement;
        expect(lanesSvg.style.height).toBe('100%');
    });

    it('sets an explicit opaque background so the bar is not see-through over the map', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        const bar = container.firstElementChild as HTMLElement;
        expect(bar.style.background).toBeTruthy();
    });
});
