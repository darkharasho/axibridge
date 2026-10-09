import { describe, expect, it } from 'vitest';
import { createBootTimeline, formatBootMark } from '../bootTimeline';

const harness = () => {
    let clock = 1_000;
    let tick: (() => void) | null = null;
    const lines: string[] = [];
    const timeline = createBootTimeline({
        log: (line) => lines.push(line),
        originEpochMs: 1_000,
        now: () => clock,
        setInterval: (fn) => { tick = fn; return 1; },
        clearInterval: () => { tick = null; },
    });
    return {
        timeline,
        lines,
        advance: (ms: number) => { clock += ms; },
        tick: () => tick?.(),
        isWatching: () => tick !== null,
    };
};

describe('bootTimeline', () => {
    it('logs each mark relative to process start and to the previous mark', () => {
        const h = harness();
        h.advance(400);
        h.timeline.mark('app ready');
        h.advance(250);
        h.timeline.mark('window created');
        expect(h.lines).toEqual([
            formatBootMark('app ready', 400, 400),
            formatBootMark('window created', 650, 250),
        ]);
    });

    it('places a renderer mark at its own timestamp, not when it arrives', () => {
        const h = harness();
        h.advance(5_000);
        h.timeline.markAt('renderer: App mounted', 3_000);
        expect(h.lines).toEqual(['[Boot] +2000ms (Δ2000ms) renderer: App mounted']);
    });

    it('reports event-loop blocks over the threshold and stops after a minute', () => {
        const h = harness();
        h.advance(100);
        h.tick();
        h.advance(2_100);
        h.tick();
        expect(h.lines).toEqual(['[Boot] main thread blocked ~2000ms, ending at +2200ms']);
        h.advance(60_000);
        h.tick();
        expect(h.isWatching()).toBe(false);
    });
});
