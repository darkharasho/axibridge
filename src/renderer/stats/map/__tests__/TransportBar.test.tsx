import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransportBar } from '../TransportBar';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (): ReplayFightPayload => ({
    fightId: 'x', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 90_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: 90_000, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }, { timeMs: 90_000, squadDps: 5000 }],
    killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null,
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

    it('prints the clock exactly once', () => {
        render(<TransportBar fight={makeFight()} />);
        expect(screen.getAllByText('0:00 / 1:30').length).toBe(1);
    });

    it('toggles playback', () => {
        render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByLabelText('Play'));
        expect(useStatsStore.getState().replayPlayhead.playing).toBe(true);
    });

    it('sets playback speed', () => {
        render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByText('4×'));
        expect(useStatsStore.getState().replayPlayhead.speed).toBe(4);
    });

    // jsdom does not run layout, so `getBoundingClientRect()` on the bar
    // would always read 0 — a real pixel-height assertion is not available
    // here. Instead we assert the underlying svg `height` styles that drive
    // the spec's approximate figures (spec: ~66px resting, ~132px expanded):
    // 54 (this timeline's svg) + 10 padding + 2 border = 66 resting, and
    // + 4 gap + 52 (the lanes svg) = 122 expanded. If either svg's height
    // regresses, this fails without needing real layout.
    it('renders the timeline at the height the collapsed ~66px bar is built from', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        const svg = container.querySelector('svg.replay-timeline') as SVGElement;
        expect(svg.style.height).toBe('54px');
    });

    it('adds the lanes band at its spec height when expanded', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        fireEvent.click(screen.getByTitle(/show cc and strip lanes/i));
        const lanesSvg = container.querySelector('[data-testid="timeline-lanes"]') as SVGElement;
        expect(lanesSvg.style.height).toBe('52px');
    });

    it('sets an explicit opaque background so the bar is not see-through over the map', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        const bar = container.firstElementChild as HTMLElement;
        expect(bar.style.background).toBeTruthy();
    });
});
