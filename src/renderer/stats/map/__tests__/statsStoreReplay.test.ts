import { describe, it, expect, beforeEach } from 'vitest';
import { useStatsStore } from '../../statsStore';

describe('statsStore — replay state', () => {
    beforeEach(() => {
        useStatsStore.setState(useStatsStore.getInitialState());
    });

    it('starts with no selected fight', () => {
        expect(useStatsStore.getState().selectedReplayFightId).toBeNull();
    });

    it('has default playhead paused at 0 at 1× speed', () => {
        const p = useStatsStore.getState().replayPlayhead;
        expect(p.timeMs).toBe(0);
        expect(p.playing).toBe(false);
        expect(p.speed).toBe(1);
    });

    it('has default viewport scale 3 with no follow target', () => {
        const v = useStatsStore.getState().replayViewport;
        expect(v.scale).toBe(3);
        expect(v.tx).toBe(0);
        expect(v.ty).toBe(0);
        expect(v.followTarget).toBeNull();
    });

    it('setSelectedReplayFight resets playhead to 0 and pauses', () => {
        useStatsStore.getState().setReplayPlayhead({ timeMs: 42_000, playing: true, speed: 2 });
        useStatsStore.getState().setSelectedReplayFight('fight-abc');
        const p = useStatsStore.getState().replayPlayhead;
        expect(p.timeMs).toBe(0);
        expect(p.playing).toBe(false);
        expect(p.speed).toBe(2); // speed preserved
        expect(useStatsStore.getState().selectedReplayFightId).toBe('fight-abc');
    });

    it('setReplayFollowTarget updates viewport.followTarget', () => {
        useStatsStore.getState().setReplayFollowTarget('Alice.0001');
        expect(useStatsStore.getState().replayViewport.followTarget).toBe('Alice.0001');
    });

    it('setReplaySelectedParty clamps to [0, 5]', () => {
        useStatsStore.getState().setReplaySelectedParty(3);
        expect(useStatsStore.getState().replaySelectedParty).toBe(3);
        useStatsStore.getState().setReplaySelectedParty(99);
        expect(useStatsStore.getState().replaySelectedParty).toBe(5);
        useStatsStore.getState().setReplaySelectedParty(-2);
        expect(useStatsStore.getState().replaySelectedParty).toBe(0);
    });
});
