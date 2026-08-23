import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSliceSidecar } from '../buildSliceSidecar';
import { statsLogKey } from '../../utils/statsLogKey';

/**
 * Read at runtime rather than `import`ed: a static import of these fixtures
 * gives `tsc --noEmit` a multi-megabyte structural literal to infer, and all
 * seven of them together (~31 MB) push `npm run typecheck` past its 8 GB
 * heap. See `sliceSidecar.test.ts`/`aggregatorFrames.test.ts` for the same
 * pattern — confirmed here by reproducing the OOM with a static-import
 * version of this file and removing it.
 */
const fixture = (name: string) => JSON.parse(
    readFileSync(resolve(process.cwd(), `test-fixtures/native/${name}.json`), 'utf8'),
);

const LOGS = [
    '20260117-175120', '20260117-180135', '20260117-180259', '20260117-180458',
    '20260117-180636', '20260117-180826', '20260117-181030',
].map(fixture).map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

/**
 * The sidecar's whole reason to exist is that it stays small enough to live on
 * a free R2 tier. Measured 2026-08-22 on this same 7-fight fixture series:
 * ~268 KB/fight average, largest single frame ~360 KB gz (37-42 player
 * rosters). That is above the spec's original ~124 KB/fight aspiration but
 * nowhere near a raw-`details` leak, which reads in the MEGABYTES per frame
 * (901 KB/fight measured leaking `log.details` wholesale into a frame — a
 * 2.25x trip of this budget) rather than hundreds of KB. The binding cost
 * here is the viewer's tray-open fetch (one gzip download), not R2 storage,
 * so 400 KB/fight is generous headroom without being a blank check for that
 * failure mode.
 *
 * What this assertion does NOT catch: a narrower leak, such as the frame's
 * own replay track (`this.replayPayloads`), only moved the measured total
 * from 268 to 316 KB/fight — still comfortably under 400 KB. That leak is
 * caught by the sibling "carries no replay tracks" test below, via a
 * substring check, not by size. Size and content are complementary guards;
 * neither alone is sufficient.
 *
 * A per-section breakdown (see task-15-report.md) found `playerAcc` (~27%)
 * and `boonTableLogs` (~18%) are the two largest sections, matching Task 12's
 * prior measurement. Inside `boonTableLogs`, the `native.blocks.boons` payload
 * carries full per-source state-transition tracks and `.states`/`.uptime_pct`
 * that `buildBoonTables` never reads (it only reads `.generation.*`) — a
 * proposed, NOT yet implemented, trim that would cut that payload by ~78%.
 * See the task-15 report for the numbers; this budget is set independent of
 * that trim landing.
 *
 * If this fails: something now serializes `details` (or a large amount of
 * replay-scale data) into a frame. Find it and narrow the projection. Do NOT
 * raise the budget.
 */
const MAX_GZIPPED_BYTES_PER_FIGHT = 400 * 1024;

const ROSTER = LOGS.map((log, i) => ({
    id: statsLogKey(log, i),
    label: `Fight ${i + 1}`,
    timestamp: i + 1,
    duration: '1:00',
}));

describe('slice sidecar size', () => {
    it('stays inside the per-fight gzipped budget', () => {
        const sidecar = buildSliceSidecar({
            logs: LOGS, roster: ROSTER,
            mvpWeights: undefined, statsViewSettings: undefined, disruptionMethod: undefined,
        });
        const gzipped = gzipSync(Buffer.from(JSON.stringify(sidecar), 'utf8'), { level: 9 });
        const perFight = gzipped.length / sidecar.frames.length;
        // Logged so a regression report carries the number, not just a boolean.
        console.info(`[slice] ${(gzipped.length / 1024).toFixed(0)} KB gzipped, ${(perFight / 1024).toFixed(0)} KB/fight`);
        expect(perFight).toBeLessThan(MAX_GZIPPED_BYTES_PER_FIGHT);
    });

    it('carries no replay tracks', () => {
        const sidecar = buildSliceSidecar({
            logs: LOGS, roster: ROSTER,
            mvpWeights: undefined, statsViewSettings: undefined, disruptionMethod: undefined,
        });
        const json = JSON.stringify(sidecar);
        expect(json).not.toContain('replayFights');
        expect(json).not.toContain('"tracks"');
    });
});
