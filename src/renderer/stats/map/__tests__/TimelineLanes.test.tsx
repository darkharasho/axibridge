import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { TimelineLanes } from '../TimelineLanes';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (over: Partial<ReplayFightPayload> = {}): ReplayFightPayload => ({
    fightId: 'x', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: 60_000, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null,
    ...over,
});

describe('TimelineLanes', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('renders a CC lane when samples are present', () => {
        const { container } = render(<TimelineLanes fight={makeFight({ ccSamples: [0, 2, 1, 0] })} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).not.toBeNull();
    });

    it('renders the not-recorded baseline when the CC series is absent', () => {
        const { container } = render(<TimelineLanes fight={makeFight()} />);
        expect(container.querySelector('[data-testid="cc-lane-not-recorded"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="cc-lane"]')).toBeNull();
    });

    it('renders the not-recorded baseline for each of the four lanes', () => {
        const { container } = render(<TimelineLanes fight={makeFight()} />);
        for (const id of ['cc-lane-not-recorded', 'cc-in-lane-not-recorded', 'strip-lane-not-recorded', 'strip-in-lane-not-recorded']) {
            expect(container.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
        }
    });

    it('distinguishes an all-zero series from an absent one', () => {
        const { container } = render(<TimelineLanes fight={makeFight({ ccSamples: [0, 0, 0, 0] })} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="cc-lane-not-recorded"]')).toBeNull();
    });

    it('drops a lane entirely when its layer toggle is off', () => {
        useStatsStore.getState().setReplayLayer('ccLane', false);
        const { container } = render(<TimelineLanes fight={makeFight({ ccSamples: [0, 2, 1] })} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).toBeNull();
        expect(container.querySelector('[data-testid="cc-lane-not-recorded"]')).toBeNull();
    });

    it('draws the zero rule for a measure whose lanes are on', () => {
        const { container } = render(<TimelineLanes fight={makeFight()} />);
        expect(container.querySelector('[data-testid="cc-zero-rule"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="strip-zero-rule"]')).not.toBeNull();
    });

    it('puts the lane labels in an HTML gutter, not inside the plotting SVG', () => {
        const { container } = render(<TimelineLanes fight={makeFight()} />);
        const label = container.querySelector('[data-testid="cc-lane-label"]')!;
        expect(label).not.toBeNull();
        expect(label.closest('svg')).toBeNull();
    });
});
