import { describe, expect, it } from 'vitest';
import {
    buildReplayKey,
    createReplayElisionState,
    elideUnchangedReplayFights,
    reinjectElidedReplayFights
} from '../replayTransfer';

const makeResult = (replayFights: any[] | undefined) => ({
    stats: { replayFights, otherSection: { value: 1 } },
    skillUsageData: []
});

describe('replay transfer elision', () => {
    it('transfers the first payload in full and elides identical repeats', () => {
        const state = createReplayElisionState();
        const key = buildReplayKey(['a.zevtc', 'b.zevtc'], false);

        const first = makeResult([{ fight: 1 }]);
        expect(elideUnchangedReplayFights(first, key, state)).toBe(false);
        expect(first.stats.replayFights).toEqual([{ fight: 1 }]);

        const second = makeResult([{ fight: 1 }]);
        expect(elideUnchangedReplayFights(second, key, state)).toBe(true);
        expect(second.stats.replayFights).toBeUndefined();
        expect((second.stats as any).replayFightsElided).toBe(true);
    });

    it('re-transfers when the log set changes', () => {
        const state = createReplayElisionState();
        const result1 = makeResult([{ fight: 1 }]);
        elideUnchangedReplayFights(result1, buildReplayKey(['a'], false), state);

        const result2 = makeResult([{ fight: 1 }, { fight: 2 }]);
        expect(elideUnchangedReplayFights(result2, buildReplayKey(['a', 'b'], false), state)).toBe(false);
        expect(result2.stats.replayFights).toHaveLength(2);
    });

    it('re-transfers when preciseReplay changes', () => {
        const state = createReplayElisionState();
        elideUnchangedReplayFights(makeResult([{ fight: 1 }]), buildReplayKey(['a'], false), state);
        expect(elideUnchangedReplayFights(makeResult([{ fight: 1 }]), buildReplayKey(['a'], true), state)).toBe(false);
    });

    it('resets elision tracking when replay data disappears', () => {
        const state = createReplayElisionState();
        const key = buildReplayKey(['a'], false);
        elideUnchangedReplayFights(makeResult([{ fight: 1 }]), key, state);
        // Replay disabled → empty payload posted; the tracked key must reset so
        // a later re-enable transfers in full.
        expect(elideUnchangedReplayFights(makeResult([]), key, state)).toBe(false);
        expect(elideUnchangedReplayFights(makeResult([{ fight: 1 }]), key, state)).toBe(false);
    });

    it('reinjects elided payloads on the receiving side and tracks full ones', () => {
        const fights = [{ fight: 1 }];
        const full = makeResult(fights);
        let kept = reinjectElidedReplayFights(full, null);
        expect(kept).toBe(fights);
        expect(full.stats.replayFights).toBe(fights);

        const elided: any = { stats: { replayFightsElided: true, otherSection: {} } };
        kept = reinjectElidedReplayFights(elided, kept);
        expect(kept).toBe(fights);
        expect(elided.stats.replayFights).toBe(fights);
        expect(elided.stats.replayFightsElided).toBeUndefined();
    });

    it('tolerates malformed results and missing previous copies', () => {
        expect(reinjectElidedReplayFights(null, null)).toBeNull();
        expect(reinjectElidedReplayFights({ stats: null }, null)).toBeNull();
        const elided: any = { stats: { replayFightsElided: true } };
        expect(reinjectElidedReplayFights(elided, null)).toBeNull();
        expect(elided.stats.replayFightsElided).toBeUndefined();
        expect(elided.stats.replayFights).toBeUndefined();
    });
});
