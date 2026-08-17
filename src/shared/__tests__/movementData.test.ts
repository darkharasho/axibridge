import { describe, it, expect } from 'vitest';
import { buildMovementData, buildNativeMovement, positionAt, positionAtOrBefore } from '../movementData';

const trackedBuffs = new Set<number>([740, 725]); // Might, Fury — arbitrary sample.

describe('buildMovementData', () => {
    it('returns null when no players have positions', () => {
        const details = { players: [{ name: 'Alice', combatReplayData: { positions: [] } }], targets: [] };
        expect(buildMovementData(details, { trackedBuffIds: trackedBuffs })).toBeNull();
    });

    it('extracts ally members with positions', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                {
                    name: 'Alice', account: 'Alice.0001', profession: 'Guardian', elite_spec: 62,
                    group: 1, hasCommanderTag: true, notInSquad: false, isFake: false,
                    combatReplayData: { positions: [[100, 100], [110, 110]], dead: [], down: [] },
                    healthPercents: [[0, 100], [1000, 90]],
                    buffUptimes: [{ id: 740, states: [[0, 1], [30_000, 0]] }],
                    rotation: [],
                },
            ],
            targets: [],
            skillMap: {},
            buffMap: { b740: { name: 'Might', icon: '/might.png' } },
        };

        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs });
        expect(movement).not.toBeNull();
        expect(movement!.members).toHaveLength(1);
        const member = movement!.members[0];
        expect(member.name).toBe('Alice');
        expect(member.isCommander).toBe(true);
        expect(member.isLocal).toBe(false);
        expect(member.isEnemy).toBe(false);
        expect(member.inSquad).toBe(true);
        expect(member.positions).toEqual([[100, 100], [110, 110]]);
        expect(member.boonStates?.[740]).toEqual([[0, 1], [30_000, 0]]);
        expect(movement!.boonIcons[740]?.name).toBe('Might');
    });

    it('marks a member as local when localAccount matches', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                { name: 'Bob', account: 'Bob.0002', profession: 'Engineer', elite_spec: 43,
                  group: 2, hasCommanderTag: false, notInSquad: false, isFake: false,
                  combatReplayData: { positions: [[50, 50]], dead: [], down: [] } },
            ],
            targets: [],
            skillMap: {},
            buffMap: {},
        };

        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs, localAccount: 'Bob.0002' });
        expect(movement!.members[0].isLocal).toBe(true);
    });

    it('extracts enemy players from targets[]', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                { name: 'Ally', account: 'Ally.0001', profession: 'Warrior', elite_spec: 18,
                  group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
                  combatReplayData: { positions: [[0, 0]], dead: [], down: [] } },
            ],
            targets: [
                { name: 'Dragonhunter pl-1', isFake: false, enemyPlayer: true, profession: 'Guardian',
                  combatReplayData: { positions: [[500, 500], [510, 510]], dead: [], down: [] } },
            ],
            skillMap: {},
            buffMap: {},
        };

        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs });
        const enemy = movement!.members.find(m => m.isEnemy);
        expect(enemy).toBeDefined();
        expect(enemy!.name).toBe('Dragonhunter pl-1');
        expect(enemy!.eliteSpec).toBe('Dragonhunter');
    });

    it('deduplicates targets that share a name with an ally', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                { name: 'DoppelGanger', account: 'DG.0001', profession: 'Mesmer', elite_spec: 40,
                  group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
                  combatReplayData: { positions: [[0, 0]], dead: [], down: [] } },
            ],
            targets: [
                { name: 'DoppelGanger', isFake: false, enemyPlayer: true, profession: 'Mesmer',
                  combatReplayData: { positions: [[100, 100]], dead: [], down: [] } },
            ],
            skillMap: {},
            buffMap: {},
        };
        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs });
        expect(movement!.members.filter(m => m.name === 'DoppelGanger')).toHaveLength(1);
    });
});

// ─── The native movement surface (unit 3) ─────────────────────────────────────

const nativeLog = {
    native: {
        axilog: { schema: '1.0' },
        blocks: {
            replay: {
                by_entity: { 5: { start_ms: 7, end_ms: 900, active_ms: 893, down: [], dead: [], dc: [] } },
                tracks: {
                    poll_ms: 300,
                    arena: {
                        image_width: 697, image_height: 1000, image_url: 'x',
                        world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008,
                    },
                    by_entity: {
                        5: { samples: [[300, 10, 20], [600, 30, 40]], down_intervals: [], dead_intervals: [], dc_intervals: [] },
                    },
                },
            },
        },
    },
};

describe('buildNativeMovement', () => {
    it('carries pollMs, arena and tracks', () => {
        const md = buildNativeMovement(nativeLog)!;
        expect(md.pollMs).toBe(300);
        expect(md.arena!.image_width).toBe(697);
        expect(md.tracks.get(5)!.samples).toHaveLength(2);
    });

    it('returns null without a native replay block', () => {
        expect(buildNativeMovement({})).toBeNull();
    });

    it('resolves a position by timestamp, ignoring start_ms entirely', () => {
        // start_ms is 7 — a non-multiple of the 300ms grid. Re-deriving a first
        // poll index is what 36 of 42 fixture players tripped over; native
        // samples carry their own t_ms, so there is nothing to compute.
        const md = buildNativeMovement(nativeLog)!;
        expect(positionAt(md.tracks.get(5)!, 300)).toEqual([10, 20]);
        expect(positionAt(md.tracks.get(5)!, 600)).toEqual([30, 40]);
    });

    it('leaves the EI view-model surface intact for the replay map', () => {
        // The map (SquadOverlay, useHeatmapData, replayTypes, ...) still reads
        // `members`/`pollingRate`/`inchToPixel`. Unit 3b migrates those onto
        // `arena` + `tracks` as one piece; until then both surfaces coexist and
        // this asserts the old one was not gutted out from under them.
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [{
                name: 'Alice', account: 'Alice.0001', profession: 'Guardian',
                notInSquad: false, combatReplayData: { start: 7, positions: [[1, 2], [3, 4]], dead: [], down: [] },
            }],
            targets: [],
        };
        const md = buildMovementData(details, { trackedBuffIds: trackedBuffs })!;
        expect(md.pollingRate).toBe(300);
        expect(md.members[0].positions).toEqual([[1, 2], [3, 4]]);
        // ceil(7 / 300) = 1 — this module is one of only two call sites that
        // ever got that rounding right.
        expect(md.members[0].firstPoll).toBe(1);
    });
});

describe('positionAtOrBefore', () => {
    const track = { entityId: 5, samples: [[300, 10, 20], [600, 30, 40], [1500, 50, 60]] as [number, number, number][], down: [], dead: [], dc: [] };

    it('answers with the last sample at or before the instant', () => {
        // A death at 700ms is not on the 300ms grid; the answer is where the
        // actor was last seen, at t=600.
        expect(positionAtOrBefore(track, 700, 300)).toEqual([30, 40]);
        expect(positionAtOrBefore(track, 600, 300)).toEqual([30, 40]);
    });

    it('refuses to borrow across a tracking gap', () => {
        // t=1200 is 600ms past the last sample — beyond one poll of staleness,
        // so the actor's whereabouts are genuinely unknown.
        expect(positionAtOrBefore(track, 1200, 300)).toBeNull();
    });

    it('returns null before the first sample', () => {
        expect(positionAtOrBefore(track, 100, 300)).toBeNull();
    });
});
