import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    createRotationTimelineAccumulator, ingestLogRotationTimeline, decodeRotation,
    extractRotationTimelineFrame, mergeRotationTimelineFrame, finalizeRotationTimeline,
} from '../computeRotationTimeline';
import { computeStatsSync } from '../incrementalAggregation';

describe('createRotationTimelineAccumulator', () => {
    it('starts empty and unrecorded', () => {
        const acc = createRotationTimelineAccumulator();
        expect(acc.fights).toEqual([]);
        expect(acc.recorded).toBe(false);
    });
});

// readFileSync, never a static import: a static import of this 23 MB fixture
// OOMs `tsc --noEmit` at 8 GB and breaks `npm run validate`.
const FIXTURE = resolve(__dirname, '../../../../test-fixtures/ei/20260130-193742.json');
const loadFixture = () => JSON.parse(readFileSync(FIXTURE, 'utf8'));

const makeLog = (details: any) => ({ filePath: '/logs/fight-1.zevtc', details });

describe('ingestLogRotationTimeline + decodeRotation', () => {
    it('round-trips every cast in the fixture', () => {
        const details = loadFixture();
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);

        expect(acc.recorded).toBe(true);
        expect(acc.fights).toHaveLength(1);
        const fight = acc.fights[0];

        const squad = details.players.filter((p: any) => !p.notInSquad);
        const expectedPlayers = squad.filter((p: any) =>
            Array.isArray(p.rotation) && p.rotation.some((r: any) => r?.id && r.skills?.length));
        expect(fight.players.length).toBe(expectedPlayers.length);

        let totalCasts = 0;
        for (const player of fight.players) {
            const source = expectedPlayers.find((p: any) => `${p.account}|${p.profession}` === player.key);
            expect(source).toBeDefined();

            // Rebuild what the source says, flattened and time-ordered.
            const want: Array<{ castTime: number; duration: number; interrupted: boolean }> = [];
            for (const rot of source.rotation) {
                if (!rot?.id) continue;
                for (const s of rot.skills || []) {
                    want.push({
                        castTime: s.castTime,
                        duration: s.duration,
                        interrupted: s.timeGained === -s.duration && s.duration > 0,
                    });
                }
            }
            want.sort((a, b) => a.castTime - b.castTime);

            const got = decodeRotation(fight, player);
            expect(got).toHaveLength(want.length);
            for (let i = 0; i < want.length; i++) {
                expect(got[i].castTime).toBe(want[i].castTime);
                expect(got[i].duration).toBe(want[i].duration);
                expect(got[i].interrupted).toBe(want[i].interrupted);
            }
            totalCasts += got.length;
        }
        // The design spec's "5,781 casts" figure (and its Testing section's
        // "All 51 players, all 5,781 casts") is the fixture's whole-file total
        // across all 53 players. The spec elsewhere makes squad-only encoding
        // an explicit decision ("Players with `notInSquad` are skipped") and
        // lists "Rotation for non-squad players" as out of scope, so the 7
        // non-squad players who carry rotation (5 of them with casts) are
        // never encoded here. 5,758 is that same total minus their casts —
        // confirmed by summing `want` (this test's own extraction) over
        // `expectedPlayers`, independent of the encoder.
        expect(totalCasts).toBe(5758);

        const interruptedTotal = fight.players.reduce((n, p) => n + p.interrupted.length, 0);
        // Verified directly against the fixture: 285 of 5,758 squad casts are
        // real cancels. `duration === 0 && timeGained === 0` satisfies a naive
        // `timeGained === -duration` (0 === -0) and would inflate this to
        // 1,410.
        expect(interruptedTotal).toBe(285);
    });

    it('stays within the size budget of 14 bytes per cast', () => {
        const details = loadFixture();
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        const fight = acc.fights[0];
        const casts = fight.players.reduce((n, p) => n + p.skill.length, 0);
        // The budget is PER CAST, so it is measured against the per-cast
        // columnar arrays only. The palette and the player metadata are
        // per-fight fixed costs that do not grow with cast count; folding them
        // into a per-cast average makes the number meaningless on a short
        // fight and unreachable on a wide one. Measured here: ~11.6 B/cast.
        const castBytes = fight.players.reduce((n, p) => n
            + JSON.stringify(p.skill).length
            + JSON.stringify(p.dt).length
            + JSON.stringify(p.dur).length
            + JSON.stringify(p.interrupted).length, 0);
        // Verbatim EI rotation is ~70 bytes/cast. Blowing this budget is how
        // the feature turns into a failed report upload months from now.
        expect(castBytes / casts).toBeLessThan(14);

        // What actually threatens the ~38 MB GitHub blob ceiling is the whole
        // fight object, and the palette's share of it does not shrink with a
        // per-cast average. Cap it absolutely. This fixture is the widest one
        // we have (46 squad players, 3m18s) and measures ~123 KB; in a
        // published report the icon-index pass replaces each palette icon URL
        // with an integer, so the shipped figure is smaller still.
        expect(JSON.stringify(fight).length).toBeLessThan(150_000);
    });

    it('preserves a cast that began before the log started', () => {
        const details = loadFixture();
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        const fight = acc.fights[0];
        const negatives = fight.players.flatMap((p) => decodeRotation(fight, p))
            .filter((c) => c.castTime < 0);
        expect(negatives.length).toBeGreaterThan(0);
    });

    it('sorts casts into time order even when the source groups them by skill', () => {
        const details = {
            durationMS: 10000, fightName: 'Test', skillMap: { s1: { name: 'Late' }, s2: { name: 'Early' } },
            players: [{
                account: 'a.1234', name: 'A', profession: 'Guardian', group: 1, activeTimes: [9000],
                rotation: [
                    { id: 1, skills: [{ castTime: 5000, duration: 100, timeGained: 0 }] },
                    { id: 2, skills: [{ castTime: 1000, duration: 100, timeGained: 0 }] },
                ],
            }],
        };
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        const fight = acc.fights[0];
        const casts = decodeRotation(fight, fight.players[0]);
        expect(casts.map((c) => c.castTime)).toEqual([1000, 5000]);
        expect(casts.map((c) => c.name)).toEqual(['Early', 'Late']);
        expect(fight.players[0].dt.every((d, i) => i === 0 || d >= 0)).toBe(true);
    });

    it('never exposes a raw id for an unmapped or placeholder skill name', () => {
        const details = {
            durationMS: 10000, fightName: 'Test',
            skillMap: { s77: { name: 'Skill 77' } }, // axilog's placeholder
            players: [{
                account: 'a.1234', name: 'A', profession: 'Guardian', group: 1, activeTimes: [9000],
                rotation: [
                    { id: 77, skills: [{ castTime: 100, duration: 50, timeGained: 0 }] },
                    { id: 99, skills: [{ castTime: 200, duration: 50, timeGained: 0 }] }, // absent from skillMap
                    { id: 23275, skills: [{ castTime: 300, duration: 50, timeGained: 0 }] }, // Dodge
                ],
            }],
        };
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        const names = acc.fights[0].palette.map((s) => s.name);
        expect(names).toContain('Dodge');
        expect(names).not.toContain('Skill 77');
        expect(names).not.toContain('Skill 99');
        expect(names.every((n) => /^Unknown Skill$/.test(n) || !/^Skill \d+$/.test(n))).toBe(true);
    });

    it('skips rotation entries with no id or no casts', () => {
        const details = {
            durationMS: 10000, fightName: 'Test', skillMap: { s1: { name: 'Real' } },
            players: [{
                account: 'a.1234', name: 'A', profession: 'Guardian', group: 1, activeTimes: [9000],
                rotation: [
                    { id: 0, skills: [{ castTime: 10, duration: 5, timeGained: 0 }] }, // falsy id
                    { id: 5, skills: [] },                                             // no casts
                    { id: 5 },                                                         // no skills array
                    { id: 1, skills: [{ castTime: 100, duration: 50, timeGained: 0 }] },
                ],
            }],
        };
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        const fight = acc.fights[0];
        // Only the one real cast survives, and the skipped entries claimed no
        // palette slots.
        expect(decodeRotation(fight, fight.players[0])).toHaveLength(1);
        expect(fight.palette).toHaveLength(1);
        expect(fight.palette[0].name).toBe('Real');
    });

    it('skips non-squad players and fights with no rotation at all', () => {
        const details = {
            durationMS: 10000, fightName: 'Test', skillMap: { s1: { name: 'Cast' } },
            players: [
                { account: 'pug.1', name: 'P', profession: 'Ranger', notInSquad: true, activeTimes: [9000],
                  rotation: [{ id: 1, skills: [{ castTime: 10, duration: 5, timeGained: 0 }] }] },
            ],
        };
        const acc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), acc);
        expect(acc.fights).toEqual([]);
        expect(acc.recorded).toBe(false);
    });
});

const fightStub = (id: string, timestampMs: number): any => ({
    id, label: id, durationMs: 1000, palette: [], players: [], timestampMs,
});

describe('rotation frames', () => {
    it('rejects a frame carrying more than one fight', () => {
        const acc = createRotationTimelineAccumulator();
        acc.fights.push(fightStub('a', 1), fightStub('b', 2));
        expect(() => extractRotationTimelineFrame(acc)).toThrow(/at most one fight/);
    });

    it('merges frames without duplicating a fight id', () => {
        const target = createRotationTimelineAccumulator();
        mergeRotationTimelineFrame(target, { fights: [fightStub('a', 1)], recorded: true });
        mergeRotationTimelineFrame(target, { fights: [fightStub('a', 1)], recorded: true });
        mergeRotationTimelineFrame(target, { fights: [fightStub('b', 2)], recorded: true });
        expect(target.fights.map((f) => f.id)).toEqual(['a', 'b']);
        expect(target.recorded).toBe(true);
    });

    it('ignores a null frame and keeps recorded false', () => {
        const target = createRotationTimelineAccumulator();
        mergeRotationTimelineFrame(target, null as any);
        expect(target.fights).toEqual([]);
        expect(target.recorded).toBe(false);
    });

    it('finalizes in chronological order', () => {
        const acc = createRotationTimelineAccumulator();
        acc.fights.push(fightStub('late', 300), fightStub('early', 100), fightStub('mid', 200));
        acc.recorded = true;
        const out = finalizeRotationTimeline(acc);
        expect(out.fights.map((f) => f.id)).toEqual(['early', 'mid', 'late']);
        expect(out.recorded).toBe(true);
    });
});

describe('rotation timeline slice-sidecar round-trip', () => {
    it('survives extract at publish time, a plain-data clone in transit, and merge+finalize in the viewer worker', () => {
        const details = loadFixture();

        // Baseline: ingest directly into a single accumulator, the way the
        // inline (<=8 logs) path does.
        const direct = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), direct);
        const directFight = direct.fights[0];
        const directCasts = directFight.players.reduce((n, p) => n + p.skill.length, 0);

        // Publish time, main thread: buildSliceSidecar.ts ingests each fight
        // into its own solo accumulator and calls exportFrame on it to build
        // the published report's slice sidecar.
        const publishAcc = createRotationTimelineAccumulator();
        ingestLogRotationTimeline(makeLog(details), publishAcc);
        const frame = extractRotationTimelineFrame(publishAcc);

        // The frame is plain data (strings, numbers, arrays, objects; no
        // Map/Set/Date/class instances), so structuredClone here is
        // equivalent to a plain deep copy and cannot prove anything a deep
        // copy wouldn't. It is kept anyway because it is what postMessage
        // actually does to the sidecar frames in transit to the viewer's
        // worker, and it guards against a future field that isn't plain data.
        const cloned = structuredClone(frame);

        // View time, inside the published viewer's worker: the 'mergeFrames'
        // handler in statsWorker.ts merges each sidecar frame into a fresh
        // accumulator and finalizes it to serve a sliced view.
        const viewerAcc = createRotationTimelineAccumulator();
        mergeRotationTimelineFrame(viewerAcc, cloned);
        const finalized = finalizeRotationTimeline(viewerAcc);

        expect(finalized.recorded).toBe(true);
        expect(finalized.fights).toHaveLength(1);
        const mergedFight = finalized.fights[0];
        expect(mergedFight.id).toBe(directFight.id);
        expect(mergedFight.players.length).toBe(directFight.players.length);

        const mergedCasts = mergedFight.players.reduce((n, p) => n + p.skill.length, 0);
        expect(mergedCasts).toBe(directCasts);

        // A bare count survives even if merge corrupts content while
        // preserving array lengths (e.g. zeroing dt/dur/skill). Pin actual
        // decoded content for the player with the most casts, deterministically
        // chosen rather than an arbitrary index.
        const busiestKey = directFight.players
            .reduce((best, p) => (p.skill.length > best.skill.length ? p : best), directFight.players[0]).key;
        const directPlayer = directFight.players.find((p) => p.key === busiestKey)!;
        const mergedPlayer = mergedFight.players.find((p) => p.key === busiestKey)!;
        expect(mergedPlayer).toBeDefined();
        expect(decodeRotation(mergedFight, mergedPlayer)).toEqual(decodeRotation(directFight, directPlayer));
    });
});

describe('rotation in the aggregator', () => {
    it('publishes rotationTimelineDrilldown from a real log', () => {
        const details = loadFixture();
        const { stats } = computeStatsSync({ logs: [makeLog(details)] });
        const drilldown = (stats as any).rotationTimelineDrilldown;
        expect(drilldown?.recorded).toBe(true);
        expect(drilldown.fights).toHaveLength(1);
        expect(drilldown.fights[0].players.length).toBeGreaterThan(40);
    });
});
