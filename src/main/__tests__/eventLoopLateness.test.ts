import { describe, expect, it } from 'vitest';
import { describeLateness, startEventLoopLatenessMonitor } from '../eventLoopLateness';

/** Drives the monitor's timer by hand so a "block" costs no wall-clock. */
const makeHarness = () => {
    let clock = 0;
    let tick: (() => void) | null = null;
    const monitor = startEventLoopLatenessMonitor({
        intervalMs: 1000,
        setInterval: (fn: () => void) => { tick = fn; return { unref: () => undefined }; },
        clearInterval: () => { tick = null; },
        now: () => clock,
    });
    return {
        monitor,
        /** Advance the clock and fire the tick that was due. */
        advance: (ms: number) => { clock += ms; tick?.(); },
    };
};

describe('event-loop lateness monitor', () => {
    it('reads near zero when ticks are on time', () => {
        const h = makeHarness();
        h.advance(1000);
        h.advance(1000);
        expect(h.monitor.peakMs()).toBe(0);
    });

    it('reports a block as the lateness of the tick that followed it', () => {
        const h = makeHarness();
        h.advance(8000);
        expect(h.monitor.peakMs()).toBe(7000);
    });

    it('does not re-report the same block on later ticks', () => {
        // Re-anchoring on `expectedAt + intervalMs` would leave the schedule
        // 7s in the past, so every on-time tick afterwards would look late.
        const h = makeHarness();
        h.advance(8000);
        h.monitor.takePeakMs();
        h.advance(1000);
        h.advance(1000);
        expect(h.monitor.peakMs()).toBe(0);
    });

    it('keeps the worst block in the window, not the latest', () => {
        const h = makeHarness();
        h.advance(6000);
        h.advance(2000);
        expect(h.monitor.peakMs()).toBe(5000);
    });

    it('resets on read', () => {
        const h = makeHarness();
        h.advance(5000);
        expect(h.monitor.takePeakMs()).toBe(4000);
        expect(h.monitor.peakMs()).toBe(0);
    });
});

describe('describeLateness', () => {
    it('stays silent for ordinary jitter', () => {
        expect(describeLateness(12)).toBe('');
    });

    it('names the block once it is worth reading', () => {
        expect(describeLateness(7800)).toBe(', peakEventLoopBlock: 7.8s');
    });
});
