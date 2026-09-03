import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SyncedTimeline } from '../SyncedTimeline';
import { TimelineLaneOverlay } from '../TimelineLanes';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (over: Partial<ReplayFightPayload> = {}): ReplayFightPayload => ({
    fightId: 'x', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 90_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: 90_000, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }, { timeMs: 90_000, squadDps: 5000 }],
    killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null, tickRate: null,
    ...over,
});

/**
 * `SyncedTimeline` (the scrubber, in TransportBar's row 1) and
 * `TimelineLanes` (the CC/strip band, row 2) sit in the same grid column and
 * must both map `timeMs` to x via `timeMs / durationMs * 1000` — not
 * `index / samples.length` for the lanes, which is a subtly different curve
 * once a native series' sample count doesn't evenly divide the fight
 * duration. If either drifts, a CC spike renders at a different x than the
 * tick directly above it.
 */
describe('scrubber and lanes share one x-axis', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('places both playheads at the identical x for the same timeMs', () => {
        const fight = makeFight({ durationMs: 90_000 });
        useStatsStore.getState().setReplayPlayhead({ timeMs: 37_000 });

        const scrubber = render(<SyncedTimeline fight={fight} />);
        const lanes = render(<TimelineLaneOverlay fight={fight} />);

        const scrubberPlayhead = scrubber.container.querySelector('[data-testid="scrubber-playhead"]') as SVGLineElement;
        const lanesPlayhead = lanes.container.querySelector('[data-testid="lanes-playhead"]') as SVGLineElement;
        expect(scrubberPlayhead).toBeTruthy();
        expect(lanesPlayhead).toBeTruthy();

        const scrubberX = Number(scrubberPlayhead.getAttribute('x1'));
        const lanesX = Number(lanesPlayhead.getAttribute('x1'));
        expect(scrubberX).toBeCloseTo((37_000 / 90_000) * 1000, 5);
        expect(lanesX).toBeCloseTo(scrubberX, 5);
    });

    it('keeps agreeing at a duration that does not evenly divide the native 1s sample interval', () => {
        // 49_714ms is the same inclusive-endpoint-style mismatch exercised in
        // TimelineLanes.test.tsx's index-vs-timeMs regression case.
        const fight = makeFight({ durationMs: 49_714 });
        useStatsStore.getState().setReplayPlayhead({ timeMs: 12_345 });

        const scrubber = render(<SyncedTimeline fight={fight} />);
        const lanes = render(<TimelineLaneOverlay fight={fight} />);

        const scrubberX = Number(scrubber.container.querySelector('[data-testid="scrubber-playhead"]')!.getAttribute('x1'));
        const lanesX = Number(lanes.container.querySelector('[data-testid="lanes-playhead"]')!.getAttribute('x1'));
        expect(lanesX).toBeCloseTo(scrubberX, 5);
    });
});
