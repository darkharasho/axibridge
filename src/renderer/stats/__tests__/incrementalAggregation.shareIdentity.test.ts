import { describe, expect, it } from 'vitest';
import { computeStatsSync } from '../incrementalAggregation';

/**
 * `enrichPrecomputedStats` (internal to incrementalAggregation.ts) matches a
 * precomputed `fightBreakdown` entry back to its source log by `id`, then by
 * link. That link match used to read `log?.permalink` directly; it must now
 * go through `shareIdentity` so a log that has ONLY a `shareUrl` (the
 * post-share-links normal case going forward) still matches.
 *
 * This fight deliberately carries no `id` that matches the log's
 * `filePath`/`id`, so the ONLY way the match can succeed is via the link
 * fallback. If the call site regressed to reading `log?.permalink` directly,
 * `shareUrl`-only logs would never match and `teamBreakdown` would not be
 * copied onto the fight — this test would fail on the `toEqual` below.
 */
describe('incrementalAggregation: shareUrl-only link matching', () => {
    it('matches a precomputed fight to its log via shareUrl when there is no permalink', () => {
        const teamBreakdown = [{ team: 'red', count: 3 }];
        const logs = [
            {
                id: 'log-share-only',
                filePath: 'share-only.zevtc',
                shareUrl: 'https://bridge.axi.link/r/k3Xm9qR2',
                details: { teamBreakdown },
            },
        ];

        const precomputedStats = {
            fightBreakdown: [
                {
                    // No `id` field at all, so the id-based match path is
                    // unavailable and only the link fallback can resolve this.
                    permalink: 'https://bridge.axi.link/r/k3Xm9qR2',
                    timestamp: 1000,
                },
            ],
        };

        const { stats } = computeStatsSync({ logs, precomputedStats });

        expect(stats.fightBreakdown[0].teamBreakdown).toEqual(teamBreakdown);
    });

    it('still matches via the legacy dps.report permalink for pre-existing logs with no shareUrl', () => {
        const teamBreakdown = [{ team: 'blue', count: 5 }];
        const logs = [
            {
                id: 'log-permalink-only',
                filePath: 'permalink-only.zevtc',
                permalink: 'https://dps.report/legacy-abc',
                details: { teamBreakdown },
            },
        ];

        const precomputedStats = {
            fightBreakdown: [
                {
                    permalink: 'https://dps.report/legacy-abc',
                    timestamp: 1000,
                },
            ],
        };

        const { stats } = computeStatsSync({ logs, precomputedStats });

        expect(stats.fightBreakdown[0].teamBreakdown).toEqual(teamBreakdown);
    });
});
