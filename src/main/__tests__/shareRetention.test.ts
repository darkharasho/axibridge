import { describe, expect, it } from 'vitest';
import {
    DEFAULT_HIGH_WATER_PCT,
    PAGES_BUDGET_BYTES,
    REPLAY_SHARE_OF_REPORT,
    planRetention,
    type RetentionEntry
} from '../shareRetention';

const MB = 1024 * 1024;

const entry = (over: Partial<RetentionEntry> & { id: string }): RetentionEntry => ({
    bytes: 4 * MB,
    stage: 'full',
    seen: 1000,
    pinned: false,
    ...over
});

/** A budget small enough to reason about: high-water is 800 bytes of a 1000-byte budget. */
const tiny = { budgetBytes: 1000, highWaterPct: 0.8 };

describe('planRetention', () => {
    it('does nothing when already under the high-water mark', () => {
        const entries = [entry({ id: 'a', bytes: 100 }), entry({ id: 'b', bytes: 200 })];
        expect(planRetention(entries, tiny)).toEqual([]);
    });

    it('does nothing when exactly at the high-water mark', () => {
        expect(planRetention([entry({ id: 'a', bytes: 800 })], tiny)).toEqual([]);
    });

    it('demotes the least-recently-seen report first', () => {
        const entries = [
            entry({ id: 'recent', bytes: 500, seen: 9000 }),
            entry({ id: 'stale', bytes: 500, seen: 1000 })
        ];
        const actions = planRetention(entries, tiny);
        expect(actions[0]).toMatchObject({ id: 'stale', from: 'full', to: 'demoted' });
    });

    it('treats a never-seen report as the most evictable', () => {
        const entries = [
            entry({ id: 'seen-once', bytes: 500, seen: 1 }),
            entry({ id: 'never-seen', bytes: 500, seen: null })
        ];
        expect(planRetention(entries, tiny)[0].id).toBe('never-seen');
    });

    it('reports how many bytes a demotion reclaims', () => {
        // Derived from the constant rather than written out, because the
        // constant is a MEASURED value and has already moved once (0.66 -> 0.25
        // when it was measured against gzipped rather than raw bytes). A
        // hard-coded 660 here turned that correction into a test failure that
        // said nothing about the behaviour under test.
        const actions = planRetention([entry({ id: 'a', bytes: 1000 })], tiny);
        expect(actions[0].reclaimed).toBe(Math.round(1000 * REPLAY_SHARE_OF_REPORT));
    });

    it('stops as soon as it is under the mark, leaving later candidates alone', () => {
        const entries = [
            entry({ id: 'a', bytes: 1000, seen: 1 }),
            entry({ id: 'b', bytes: 1000, seen: 2 }),
            entry({ id: 'c', bytes: 1000, seen: 3 })
        ];
        // Sized so the mark falls exactly between the second and third demote,
        // which is the only way to prove the loop STOPS rather than merely
        // ordering correctly. Each demote reclaims 1000 * REPLAY_SHARE_OF_REPORT
        // (250), so from 3000 the totals run 2750 -> 2500 -> 2250; a high-water
        // of 2500 is reached by 'b' and 'c' is never touched. `tiny` cannot
        // express this: its 800-byte mark is unreachable by demotion alone at
        // any realistic reclaim rate, so every entry would be demoted AND
        // tombstoned and the assertion would test nothing.
        const budgetBytes = 2500 / 0.8;
        expect(planRetention(entries, { budgetBytes, highWaterPct: 0.8 }).map((a) => a.id))
            .toEqual(['a', 'b']);
    });

    it('never touches a pinned report', () => {
        const entries = [
            entry({ id: 'pinned', bytes: 900, seen: 1, pinned: true }),
            entry({ id: 'free', bytes: 200, seen: 2 })
        ];
        expect(planRetention(entries, tiny).every((a) => a.id !== 'pinned')).toBe(true);
    });

    it('demotes everything eligible before tombstoning anything', () => {
        // Note: bytes here are 2000, not the 1000 used elsewhere in this suite.
        // With 1000/1000 (as in the brief), fully demoting both entries alone
        // already lands under the 800-byte high-water mark (2000 - 2*660 = 680),
        // so no tombstone action is reachable and the invariant below can never
        // be exercised. Bumping to 2000/2000 forces a genuine shortfall after
        // full demotion (4000 - 2*1320 = 1360 > 800), which is what this test
        // is meant to check: everything demotable gets demoted before anything
        // is tombstoned.
        const entries = [
            entry({ id: 'a', bytes: 2000, seen: 1 }),
            entry({ id: 'b', bytes: 2000, seen: 2 })
        ];
        const actions = planRetention(entries, tiny);
        const firstTombstone = actions.findIndex((a) => a.to === 'tombstone');
        const lastDemote = actions.map((a) => a.to).lastIndexOf('demoted');
        expect(firstTombstone).toBeGreaterThan(lastDemote);
    });

    it('tombstones when demoting everything is not enough', () => {
        const entries = [entry({ id: 'a', bytes: 5000, seen: 1 })];
        const actions = planRetention(entries, tiny);
        expect(actions.map((a) => a.to)).toEqual(['demoted', 'tombstone']);
    });

    it('does not act on an already-tombstoned report', () => {
        const entries = [entry({ id: 'a', bytes: 0, stage: 'tombstone', seen: 1 })];
        expect(planRetention(entries, tiny)).toEqual([]);
    });

    it('gives up rather than looping when only pinned reports remain over budget', () => {
        const entries = [entry({ id: 'p', bytes: 5000, seen: 1, pinned: true })];
        expect(planRetention(entries, tiny)).toEqual([]);
    });

    it('handles an empty repository', () => {
        expect(planRetention([], tiny)).toEqual([]);
    });

    it('defaults to 80% of a 1 GiB Pages budget', () => {
        expect(PAGES_BUDGET_BYTES).toBe(1024 * 1024 * 1024);
        expect(DEFAULT_HIGH_WATER_PCT).toBe(0.8);
        const justUnder = entry({ id: 'a', bytes: PAGES_BUDGET_BYTES * 0.79 });
        expect(planRetention([justUnder])).toEqual([]);
    });

    it('orders a never-opened report before a real seen: 0 timestamp, regardless of input order', () => {
        // `?? 0` would tie these two and let input order decide the winner.
        // Put the seen: 0 entry FIRST so that bug would pick it, not 'never'.
        const entries = [
            entry({ id: 'epoch-zero', bytes: 500, seen: 0 }),
            entry({ id: 'never', bytes: 500, seen: null })
        ];
        expect(planRetention(entries, tiny)[0].id).toBe('never');
    });

    it('emits no demote step at all for a malformed negative-bytes entry', () => {
        // 'neg' is oldest, so it is the first candidate the demote pass reaches.
        // Unclamped, Math.round(-500 * REPLAY_SHARE_OF_REPORT) is negative — a
        // plan step that claims to GROW the repo. Clamping that to 0 only
        // turned it into a step that
        // frees nothing while still costing the caller a Worker PATCH, so it is
        // now skipped entirely. 'big' just needs to push total (1500) over the
        // 800 mark so the planner does work instead of short-circuiting on the
        // initial total <= highWater guard — and proves the skip does not
        // abandon the rest of the plan.
        const entries = [
            entry({ id: 'neg', bytes: -500, seen: 1, stage: 'full' }),
            entry({ id: 'big', bytes: 2000, seen: 5, stage: 'full' })
        ];
        const actions = planRetention(entries, tiny);
        expect(actions.find((a) => a.id === 'neg')).toBeUndefined();
        expect(actions.find((a) => a.id === 'big')).toMatchObject({ from: 'full', to: 'demoted' });
        expect(actions.every((a) => a.reclaimed > 0)).toBe(true);
    });

    it('emits no tombstone step at all for a malformed negative-bytes entry', () => {
        // 'neg' starts already 'demoted' so pass 2 (not pass 1) reaches it.
        // Unclamped, the tombstone branch's reclaimed is current.bytes, i.e.
        // -100 directly. As above, a zero-reclaim step is not a plan step.
        // 'big' is sized so demoting it alone (pass 1) still leaves total above
        // the 800 mark, forcing pass 2 to run and reach 'neg'.
        const entries = [
            entry({ id: 'neg', bytes: -100, seen: 1, stage: 'demoted' }),
            entry({ id: 'big', bytes: 5000, seen: 5, stage: 'full' })
        ];
        const actions = planRetention(entries, tiny);
        expect(actions.length).toBeGreaterThan(0);
        expect(actions.find((a) => a.id === 'neg')).toBeUndefined();
        expect(actions.every((a) => a.reclaimed > 0)).toBe(true);
    });

    it('never emits a step that reclaims nothing', () => {
        // A zero-byte entry is the ordinary (non-malformed) way to reach the
        // same place: both passes would previously have emitted a full→demoted
        // and a demoted→tombstone action for it, each freeing 0 bytes.
        const entries = [
            entry({ id: 'empty', bytes: 0, seen: 1, stage: 'full' }),
            entry({ id: 'big', bytes: 5000, seen: 5, stage: 'full' })
        ];
        const actions = planRetention(entries, tiny);
        expect(actions.find((a) => a.id === 'empty')).toBeUndefined();
        expect(actions.every((a) => a.reclaimed > 0)).toBe(true);
    });

    // Cross-task constraint: the Worker's PATCH /r/:code is monotonic (full=0,
    // demoted=1, tombstone=2) and rejects any move to a lower rank. A plan that
    // emitted a promotion would be rejected by the Worker, so planRetention must
    // never produce one — even over a mix of stages already below 'full'.
    it('never emits a promotion, over a mix of full/demoted/tombstone entries', () => {
        const rank: Record<string, number> = { full: 0, demoted: 1, tombstone: 2 };
        const entries = [
            entry({ id: 'a', bytes: 5000, seen: 1, stage: 'full' }),
            entry({ id: 'b', bytes: 5000, seen: 2, stage: 'demoted' }),
            entry({ id: 'c', bytes: 5000, seen: 3, stage: 'tombstone' })
        ];
        const actions = planRetention(entries, tiny);
        for (const action of actions) {
            expect(rank[action.to]).toBeGreaterThan(rank[action.from]);
        }
    });
});
