import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SyncedTimeline } from '../SyncedTimeline';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (duration = 60_000): ReplayFightPayload => ({
    fightId: 'x', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: duration,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: duration, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }, { timeMs: 30_000, squadDps: 5000 }, { timeMs: 60_000, squadDps: 10_000 }],
    killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null,
    ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null, tickRate: null,
});

describe('SyncedTimeline', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
    });

    it('clicking 50% across scrubs to midpoint', () => {
        const fight = makeFight(60_000);
        const { container } = render(<SyncedTimeline fight={fight} />);
        const svg = container.querySelector('svg.replay-timeline') as SVGElement;
        expect(svg).toBeTruthy();
        Object.defineProperty(svg, 'getBoundingClientRect', {
            value: () => ({ left: 0, top: 0, width: 600, height: 120, right: 600, bottom: 120, x: 0, y: 0, toJSON: () => ({}) }),
            configurable: true,
        });
        fireEvent.click(svg, { clientX: 300, clientY: 60 });
        const t = useStatsStore.getState().replayPlayhead.timeMs;
        expect(t).toBeGreaterThanOrEqual(29_000);
        expect(t).toBeLessThanOrEqual(31_000);
    });
});
