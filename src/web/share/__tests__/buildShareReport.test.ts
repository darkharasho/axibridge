import { describe, expect, it, vi } from 'vitest';
import { buildShareReport, ShareReportShapeError } from '../buildShareReport';

/** A minimal but real native `details` block: one squad commander, one pug,
 *  one enemy target. Modeled on the `nativeDeathLog` fixture pattern used by
 *  `incrementalAggregation.test.ts` — enough fields for the aggregator to
 *  ingest without throwing. */
const makeDetails = () => ({
    durationMS: 6000,
    fightName: 'Skirmish',
    players: [
        {
            account: 'Cmdr.5678',
            name: 'Glorious Leader',
            profession: 'Guardian',
            notInSquad: false,
            hasCommanderTag: true,
            dpsAll: [{ damage: 100 }],
            defenses: [{ damageTaken: 10, downCount: 0, deadCount: 0 }],
            statsAll: [{}],
        },
        {
            account: 'Pug.1111',
            name: 'Rando',
            profession: 'Necromancer',
            notInSquad: false,
            hasCommanderTag: false,
            dpsAll: [{ damage: 50 }],
            defenses: [{ damageTaken: 5, downCount: 0, deadCount: 0 }],
            statsAll: [{}],
        },
    ],
    targets: [
        { isFake: false, name: 'Enemy Warrior', profession: 'Warrior', dpsAll: [{ damage: 0 }] },
    ],
});

describe('buildShareReport', () => {
    it.each([null, undefined, 'x', 42, true, []])(
        'throws ShareReportShapeError for junk input %p',
        (junk) => {
            // Any of these values reaching the naive `raw as ReportPayload` cast
            // it replaces would silently render `undefined.players` deep in the
            // stats tree instead of failing loudly here.
            expect(() => buildShareReport(junk)).toThrow(ShareReportShapeError);
        }
    );

    it('passes through an already-built {meta, stats} payload by identity', () => {
        const input = { meta: { title: 'Prebuilt' }, stats: { ok: true } };
        // `toBe` (not `toEqual`) proves this is a passthrough, not a rebuild —
        // a naive impl that always rebuilds from `details.players` would return
        // a *different* object (and would also throw here, since this input has
        // no `players` array).
        expect(buildShareReport(input)).toBe(input);
    });

    it('throws ShareReportShapeError for an object that is neither a payload nor details', () => {
        // No `meta`/`stats`, and no `players` array either — a naive impl that
        // only checked `!raw.players` without the Array.isArray guard would
        // treat this as "valid details" and crash deeper in the aggregator
        // instead of surfacing a clean error here.
        expect(() => buildShareReport({ foo: 1 })).toThrow(ShareReportShapeError);
    });

    it('builds a payload whose meta.commanders names the tagged commander', () => {
        const result = buildShareReport(makeDetails());
        // Named assertion: a naive impl that dropped `hasCommanderTag` players
        // or built meta from the wrong source would produce an empty
        // `commanders` array (or the pug's name) instead of this exact name.
        expect(result.meta.commanders).toContain('Glorious Leader');
        expect(result.stats).not.toBeNull();
        expect(typeof result.stats).toBe('object');
    });

    it('includes statsViewSettings and strips the transient replayFightsElided marker', () => {
        const result = buildShareReport(makeDetails());
        // A naive impl that spread `computed.stats` without adding
        // `statsViewSettings` would leave this `undefined` instead of the
        // settings object; one that forgot the `delete` would leak the
        // transient marker into published report content.
        expect(result.stats.statsViewSettings).toEqual(
            expect.objectContaining({ showTopStats: true })
        );
        expect(result.stats.replayFightsElided).toBeUndefined();
    });

    it('wraps an aggregation failure as ShareReportShapeError with a prefixed message', async () => {
        vi.resetModules();
        vi.doMock('../../../renderer/stats/incrementalAggregation', () => ({
            computeStatsSync: () => {
                throw new Error('boom: bad fixture');
            },
        }));
        const { buildShareReport: rebuilt, ShareReportShapeError: RebuiltError } = await import('../buildShareReport');
        // Asserting the exact prefix proves the original aggregator error is
        // wrapped (not just any error, and not a raw unhandled stack trace
        // reaching the viewer's error card) — a naive impl that let the
        // original error escape uncaught would fail this `rejects`/`throw`
        // check with the unwrapped message instead.
        expect(() => rebuilt(makeDetails())).toThrow(RebuiltError);
        try {
            rebuilt(makeDetails());
            throw new Error('expected rebuilt() to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(RebuiltError);
            expect((err as Error).message).toMatch(/^Could not compute stats for this report: boom: bad fixture/);
        }
        vi.doUnmock('../../../renderer/stats/incrementalAggregation');
        vi.resetModules();
    });
});
