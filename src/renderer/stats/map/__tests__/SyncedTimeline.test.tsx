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
    ccSamples: null, stripSamples: null,
});

describe('SyncedTimeline', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
    });

    it('renders the duration and current time', () => {
        const { getByText } = render(<SyncedTimeline fight={makeFight(90_000)} />);
        expect(getByText('0:00 / 1:30')).toBeTruthy();
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

describe('SyncedTimeline CC and strip lanes', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
    });

    it('renders a CC sub-lane when samples are present', () => {
        const fight = makeFight();
        const { container } = render(<SyncedTimeline fight={{ ...fight, ccSamples: [0, 2, 1, 0] }} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).not.toBeNull();
    });

    it('renders no CC sub-lane when the series was not recorded', () => {
        const fight = makeFight();
        const { container } = render(<SyncedTimeline fight={fight} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).toBeNull();
    });

    it('renders a strip sub-lane when samples are present', () => {
        const fight = makeFight();
        const { container } = render(<SyncedTimeline fight={{ ...fight, stripSamples: [0, 3, 0, 1] }} />);
        expect(container.querySelector('[data-testid="strip-lane"]')).not.toBeNull();
    });

    it('renders no strip sub-lane when the series was not recorded', () => {
        const fight = makeFight();
        const { container } = render(<SyncedTimeline fight={fight} />);
        expect(container.querySelector('[data-testid="strip-lane"]')).toBeNull();
    });

    it('does not render the CC lane when the ccLane layer is toggled off', () => {
        useStatsStore.getState().setReplayLayer('ccLane', false);
        const fight = makeFight();
        const { container } = render(<SyncedTimeline fight={{ ...fight, ccSamples: [0, 2, 1, 0] }} />);
        expect(container.querySelector('[data-testid="cc-lane"]')).toBeNull();
    });

    it('does not render the strip lane when the stripLane layer is toggled off', () => {
        useStatsStore.getState().setReplayLayer('stripLane', false);
        const fight = makeFight();
        const { container } = render(<SyncedTimeline fight={{ ...fight, stripSamples: [0, 3, 0, 1] }} />);
        expect(container.querySelector('[data-testid="strip-lane"]')).toBeNull();
    });

    it('renders a distinct not-recorded affordance for CC when samples are null and the toggle is on, rather than nothing', () => {
        // null (never captured) must not look pixel-identical to a
        // genuinely all-zero series -- both used to render nothing at all.
        const fight = makeFight();
        const { container } = render(<SyncedTimeline fight={fight} />);
        expect(container.querySelector('[data-testid="cc-lane-not-recorded"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="cc-lane"]')).toBeNull();
    });

    it('renders a distinct not-recorded affordance for strips when samples are null and the toggle is on', () => {
        const fight = makeFight();
        const { container } = render(<SyncedTimeline fight={fight} />);
        expect(container.querySelector('[data-testid="strip-lane-not-recorded"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="strip-lane"]')).toBeNull();
    });

    it('does not render the not-recorded affordance for a genuinely all-zero series', () => {
        const fight = makeFight();
        const { container } = render(<SyncedTimeline fight={{ ...fight, ccSamples: [0, 0, 0, 0] }} />);
        expect(container.querySelector('[data-testid="cc-lane-not-recorded"]')).toBeNull();
    });

    it('positions the CC lane by timeMs / durationMs, matching the DPS area and playhead, not index / samples.length', () => {
        // len=50 at a 1000ms-per-sample interval spans 50_000ms; a
        // durationMs of 49_714ms (an inclusive-endpoint-style mismatch)
        // must not skew the lane's x-axis against the rest of the SVG.
        const durationMs = 49_714;
        const samples = new Array(50).fill(0).map((_, i) => (i === 10 ? 5 : 0));
        const fight = makeFight(durationMs);
        const { container } = render(<SyncedTimeline fight={{ ...fight, ccSamples: samples }} />);
        const path = container.querySelector('[data-testid="cc-lane"] path') as SVGPathElement;
        expect(path).toBeTruthy();
        const d = path.getAttribute('d') || '';
        // Sample index 10 at 1000ms/sample -> timeMs = 10_000.
        const expectedX = (10_000 / durationMs) * 1000;
        const match = d.match(/M ([\d.]+),/g) || [];
        const xs = match.map((m) => Number(m.replace('M ', '').replace(',', '')));
        expect(xs[10]).toBeCloseTo(expectedX, 1);
        // The stale index/samples.length formula would have placed it at
        // (10 / 50) * 1000 = 200, which is measurably different here.
        expect(xs[10]).not.toBeCloseTo((10 / 50) * 1000, 1);
    });
});
