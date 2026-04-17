import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReplayPlayback } from '../useReplayPlayback';
import { useStatsStore } from '../../../statsStore';

function advanceRaf(ms: number) {
    const cb = (global as any).__rafCb;
    if (!cb) return;
    (global as any).__rafCb = null;
    cb(performance.now() + ms);
}

describe('useReplayPlayback', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);  // merge — preserves setters

        (global as any).__rafCb = null;
        (global as any).requestAnimationFrame = (cb: any) => {
            (global as any).__rafCb = cb;
            return 1;
        };
        (global as any).cancelAnimationFrame = () => { (global as any).__rafCb = null; };
    });

    it('does not advance while paused', () => {
        renderHook(() => useReplayPlayback({ durationMs: 60_000 }));
        advanceRaf(1_000);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBe(0);
    });

    it('advances when playing at 1×', () => {
        renderHook(() => useReplayPlayback({ durationMs: 60_000 }));
        act(() => {
            useStatsStore.getState().setReplayPlayhead({ playing: true });
        });
        advanceRaf(0);   // baseline tick: playing=true, last=null → sets lastTimestampRef
        advanceRaf(500); // advancement tick: delta=500ms
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBeGreaterThanOrEqual(450);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBeLessThanOrEqual(550);
    });

    it('respects speed multiplier', () => {
        renderHook(() => useReplayPlayback({ durationMs: 60_000 }));
        act(() => {
            useStatsStore.getState().setReplayPlayhead({ playing: true, speed: 2 });
        });
        advanceRaf(0);   // baseline tick: playing=true, last=null → sets lastTimestampRef
        advanceRaf(500); // advancement tick: delta=500ms * 2 = 1000ms
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBeGreaterThanOrEqual(900);
    });

    it('pauses and clamps at duration', () => {
        renderHook(() => useReplayPlayback({ durationMs: 1_000 }));
        act(() => {
            useStatsStore.getState().setReplayPlayhead({ playing: true });
        });
        advanceRaf(0);    // baseline tick: sets lastTimestampRef
        advanceRaf(2_000); // advancement tick: delta=2000ms, clamps to 1000ms
        const p = useStatsStore.getState().replayPlayhead;
        expect(p.timeMs).toBe(1_000);
        expect(p.playing).toBe(false);
    });
});
