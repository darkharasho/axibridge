import { describe, expect, it } from 'vitest';
import {
    buildReplayKey,
    createReplayElisionState,
    elideUnchangedReplayFights,
    isReplayElided,
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

    it('re-transfers when a log gains sector owners', () => {
        const state = createReplayElisionState();
        const logIds = ['a.zevtc', 'b.zevtc'];
        expect(elideUnchangedReplayFights(makeResult([{ fight: 1 }]), buildReplayKey(logIds, false), state)).toBe(false);
        // Same log set, but log a picked up an ownership snapshot → payload
        // contents changed, must transfer in full instead of eliding.
        expect(elideUnchangedReplayFights(makeResult([{ fight: 1 }]), buildReplayKey(logIds, false, ['a.zevtc']), state)).toBe(false);
        // Identical owned set afterwards elides again.
        expect(elideUnchangedReplayFights(makeResult([{ fight: 1 }]), buildReplayKey(logIds, false, ['a.zevtc']), state)).toBe(true);
    });

    it('builds the same key regardless of owned-id order', () => {
        expect(buildReplayKey(['a', 'b'], false, ['b', 'a'])).toBe(buildReplayKey(['a', 'b'], false, ['a', 'b']));
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
    });

    it('keeps the elided marker when there is no previous copy to reinject', () => {
        // The worker elided replayFights (e.g. a mid-stream flush) but the main
        // thread has never received a full copy yet. We must NOT erase the marker:
        // an elided-and-unrestored result is "replay not yet available", which is
        // different from "this report genuinely has no replay". Consumers (the web
        // upload) rely on the marker to avoid publishing a replay-less report.
        const elided: any = { stats: { replayFightsElided: true, otherSection: {} } };
        expect(reinjectElidedReplayFights(elided, null)).toBeNull();
        expect(elided.stats.replayFightsElided).toBe(true);
        expect(elided.stats.replayFights).toBeUndefined();
    });

    it('clears the marker once a full copy becomes available to reinject', () => {
        const fights = [{ fight: 1 }];
        const elided: any = { stats: { replayFightsElided: true } };
        reinjectElidedReplayFights(elided, fights);
        expect(elided.stats.replayFightsElided).toBeUndefined();
        expect(elided.stats.replayFights).toBe(fights);
    });

    describe('isReplayElided', () => {
        it('is true only when an unrestored elided marker remains', () => {
            expect(isReplayElided({ replayFightsElided: true })).toBe(true);
            expect(isReplayElided({ replayFights: [{ fight: 1 }] })).toBe(false);
            expect(isReplayElided({})).toBe(false);
            expect(isReplayElided(null)).toBe(false);
            expect(isReplayElided(undefined)).toBe(false);
        });
    });
});
