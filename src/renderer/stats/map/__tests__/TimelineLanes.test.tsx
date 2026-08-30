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

    it('renders the strip lane when samples are present', () => {
        const { container } = render(<TimelineLanes fight={makeFight({ stripSamples: [0, 3, 1, 0] })} />);
        expect(container.querySelector('[data-testid="strip-lane"]')).not.toBeNull();
    });

    it('drops the strip lane when the stripLane toggle is off, even with samples present', () => {
        // Regression guard: swapping `layersState.stripLane` for
        // `layersState.stripInLane` at the strip-lane gate would still pass
        // every other test in this suite while silently ignoring this toggle.
        useStatsStore.getState().setReplayLayer('stripLane', false);
        const { container } = render(<TimelineLanes fight={makeFight({ stripSamples: [0, 3, 1] })} />);
        expect(container.querySelector('[data-testid="strip-lane"]')).toBeNull();
        expect(container.querySelector('[data-testid="strip-lane-not-recorded"]')).toBeNull();
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

describe('TimelineLanes geometry', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('positions the CC lane by timeMs / durationMs, matching the DPS area and playhead, not index / samples.length', () => {
        // len=50 at a 1000ms-per-sample interval spans 50_000ms; a
        // durationMs of 49_714ms (an inclusive-endpoint-style mismatch)
        // must not skew the lane's x-axis against the rest of the SVG.
        const durationMs = 49_714;
        const samples = new Array(50).fill(0).map((_, i) => (i === 10 ? 5 : 0));
        const { container } = render(<TimelineLanes fight={makeFight({ durationMs, ccSamples: samples })} />);
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

    // Incoming CC counts every source and folds no pets, so it runs higher
    // than outgoing by construction. A shared scale would flatten the
    // outgoing lane; each lane normalizes against its own peak instead.
    it('normalizes each lane against its own peak, not a shared one', () => {
        const { container } = render(
            <TimelineLanes fight={makeFight({ ccSamples: [0, 1, 0], ccInSamples: [0, 40, 0] })} />,
        );
        const out = container.querySelector('[data-testid="cc-lane"] path')?.getAttribute('d') || '';
        const inc = container.querySelector('[data-testid="cc-in-lane"] path')?.getAttribute('d') || '';
        // Both peaks reach their lane's full 10px height: the outgoing lane
        // stands up from y=14 to y=4, the incoming hangs from y=14 to
        // y=24. Under a shared scale the outgoing peak would barely leave
        // its baseline.
        expect(out).toContain('V 4.0');
        expect(inc).toContain('V 24.0');
    });
});

describe('TimelineLanes incoming lanes', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('renders a CC-taken sub-lane when samples are present', () => {
        const { container } = render(<TimelineLanes fight={makeFight({ ccInSamples: [0, 5, 2, 0] })} />);
        expect(container.querySelector('[data-testid="cc-in-lane"]')).not.toBeNull();
    });

    it('renders a strips-taken sub-lane when samples are present', () => {
        const { container } = render(<TimelineLanes fight={makeFight({ stripInSamples: [1, 0, 4] })} />);
        expect(container.querySelector('[data-testid="strip-in-lane"]')).not.toBeNull();
    });

    // The load-bearing case for the replay. The squad series is computed
    // unconditionally while `by_entity` needs `timeseries: true`, so a fight
    // routinely has a full outgoing lane and no incoming one at all. Sharing
    // a recorded signal between them would draw a flat incoming lane reading
    // "nothing landed on the squad".
    it('draws the outgoing lane and a not-recorded marker for the incoming one on the same fight', () => {
        const { container } = render(
            <TimelineLanes fight={makeFight({ ccSamples: [0, 2, 1, 0], ccInSamples: null })} />,
        );
        expect(container.querySelector('[data-testid="cc-lane"]')).not.toBeNull();
        expect(container.querySelector('[data-testid="cc-in-lane"]')).toBeNull();
        expect(container.querySelector('[data-testid="cc-in-lane-not-recorded"]')).not.toBeNull();
    });

    it('shows a not-recorded affordance for strips taken rather than an empty lane', () => {
        const { container } = render(<TimelineLanes fight={makeFight({ stripSamples: [0, 3] })} />);
        expect(container.querySelector('[data-testid="strip-in-lane"]')).toBeNull();
        expect(container.querySelector('[data-testid="strip-in-lane-not-recorded"]')).not.toBeNull();
    });

    it('hides each incoming lane behind its own layer toggle', () => {
        useStatsStore.getState().setReplayLayer('ccInLane', false);
        useStatsStore.getState().setReplayLayer('stripInLane', false);
        const { container } = render(
            <TimelineLanes fight={makeFight({ ccInSamples: [0, 5], stripInSamples: [1, 2] })} />,
        );
        expect(container.querySelector('[data-testid="cc-in-lane"]')).toBeNull();
        expect(container.querySelector('[data-testid="strip-in-lane"]')).toBeNull();
        // ...and leaves the outgoing pair alone.
        expect(container.querySelector('[data-testid="cc-lane-not-recorded"]')).not.toBeNull();
    });
});

describe('TimelineLanes lane labels', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('labels the CC measure whether or not the lane carries data', () => {
        // The lanes were previously named only in their not-recorded state, so
        // a fight WITH data drew an unlabelled coloured path.
        const withData = render(<TimelineLanes fight={makeFight({ ccSamples: [0, 2, 1] })} />);
        expect(withData.container.querySelector('[data-testid="cc-lane-label"]')).not.toBeNull();
        const without = render(<TimelineLanes fight={makeFight()} />);
        expect(without.container.querySelector('[data-testid="cc-lane-label"]')).not.toBeNull();
    });

    it('labels the strip measure whether or not the lane carries data', () => {
        const withData = render(<TimelineLanes fight={makeFight({ stripSamples: [0, 2, 1] })} />);
        expect(withData.container.querySelector('[data-testid="strip-lane-label"]')).not.toBeNull();
    });

    it('names both directions of a measure so the mirrored bars are readable', () => {
        const { container } = render(<TimelineLanes fight={makeFight({ ccSamples: [1], ccInSamples: [1] })} />);
        const label = container.querySelector('[data-testid="cc-lane-label"]')!;
        expect(label.textContent).toMatch(/out/i);
        expect(label.textContent).toMatch(/in/i);
    });

    it('drops a measure label entirely when both of its layer toggles are off', () => {
        useStatsStore.getState().setReplayLayer('ccLane', false);
        useStatsStore.getState().setReplayLayer('ccInLane', false);
        const { container } = render(<TimelineLanes fight={makeFight({ ccSamples: [1] })} />);
        expect(container.querySelector('[data-testid="cc-lane-label"]')).toBeNull();
        expect(container.querySelector('[data-testid="cc-zero-rule"]')).toBeNull();
    });
});
