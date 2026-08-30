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

    it('sets an explicit opaque background so the bar is not see-through over the map', () => {
        const { container } = render(<TransportBar fight={makeFight()} />);
        const bar = container.firstElementChild as HTMLElement;
        expect(bar.style.background).toBeTruthy();
    });
});
