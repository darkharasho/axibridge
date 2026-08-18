import { describe, it, expect } from 'vitest';
import { buildMovementData, buildNativeMovement, positionAt, positionAtOrBefore } from '../movementData';
import { buildNativeLog } from '../../test/nativeLogFixture';

const trackedBuffs = new Set<number>([740, 725]); // Might, Fury — arbitrary sample.

describe('buildMovementData', () => {
    it('returns null when the log has no native replay tracks', () => {
        expect(buildMovementData({ players: [] }, { trackedBuffIds: trackedBuffs })).toBeNull();
    });

    it('extracts ally members, projecting world samples onto the render canvas', () => {
        const details = buildNativeLog([
            {
                id: 1, role: 'squad', account: 'Alice.0001', character: 'Alice',
                profession: 'Guardian', elite_spec: 'Firebrand', subgroup: 1, commander: true,
                pixels: [[100, 100], [110, 110]],
                ei: {
                    healthPercents: [[0, 100], [1000, 90]],
                    buffUptimes: [{ id: 740, states: [[0, 1], [30_000, 0]] }],
                    rotation: [],
                },
            },
        ], { buffMap: { b740: { name: 'Might', icon: '/might.png' } } });

        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs })!;
        expect(movement.members).toHaveLength(1);
        const member = movement.members[0];
        expect(member.name).toBe('Alice');
        expect(member.isCommander).toBe(true);
        expect(member.isLocal).toBe(false);
        expect(member.isEnemy).toBe(false);
        expect(member.inSquad).toBe(true);
        expect(member.positions).toEqual([[100, 100], [110, 110]]);
        expect(member.boonStates?.[740]).toEqual([[0, 1], [30_000, 0]]);
        expect(movement.boonIcons[740]?.name).toBe('Might');
    });

    it('reads firstPoll from the sample timestamp rather than deriving it', () => {
        // A track starting at 1500ms on a 300ms grid is poll 5. The EI path had
        // to infer this from a start time, and five call sites used floor where
        // ceil was correct; a self-timestamped sample removes the derivation.
        const details = buildNativeLog([
            { id: 1, role: 'squad', account: 'A.1', character: 'A', pixels: [[10, 10]], startMs: 1500 },
        ]);
        expect(buildMovementData(details, { trackedBuffIds: trackedBuffs })!.members[0].firstPoll).toBe(5);
    });

    it('gives an exact per-axis inch scale instead of EI\'s rounded scalar', () => {
        const details = buildNativeLog([
            { id: 1, role: 'squad', account: 'A.1', character: 'A', pixels: [[10, 10]] },
        ]);
        // 750px over a 75000-inch world rect.
        expect(buildMovementData(details, { trackedBuffIds: trackedBuffs })!.pixelsPerInch)
            .toEqual({ x: 0.01, y: 0.01 });
    });

    it('marks a member as local when localAccount matches', () => {
        const details = buildNativeLog([
            { id: 1, role: 'squad', account: 'Bob.0002', character: 'Bob', pixels: [[50, 50]] },
        ]);
        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs, localAccount: 'Bob.0002' });
        expect(movement!.members[0].isLocal).toBe(true);
    });

    it('keeps every ally without depending on a name at all', () => {
        // axilog's ei-json compat spells the character name `character_name`,
        // not `name`. The old path deduped allies on `name` and so depended on
        // `applyEiCompatShims` back-filling it — a shim slated for deletion in
        // unit 8. Entity ids make the join total and drop that dependency.
        const details = buildNativeLog([
            { id: 1, role: 'squad', account: 'A.1', character: 'A', pixels: [[10, 10]] },
            { id: 2, role: 'squad', account: 'B.2', character: 'B', pixels: [[20, 20]] },
            { id: 3, role: 'squad', account: 'C.3', character: 'C', pixels: [[30, 30]] },
        ]);
        expect(buildMovementData(details, { trackedBuffIds: trackedBuffs })!.members).toHaveLength(3);
    });

    it('separates squad members from non-squad friendlies', () => {
        const details = buildNativeLog([
            { id: 1, role: 'squad', account: 'A.1', character: 'A', pixels: [[10, 10]] },
            { id: 2, role: 'friendly_player', account: 'P.2', character: 'Pug', pixels: [[20, 20]] },
        ]);
        const members = buildMovementData(details, { trackedBuffIds: trackedBuffs })!.members;
        expect(members.find(m => m.name === 'A')!.inSquad).toBe(true);
        expect(members.find(m => m.name === 'Pug')!.inSquad).toBe(false);
        expect(members.every(m => !m.isEnemy)).toBe(true);
    });

    it('takes enemy profession and spec as fields, not scraped from a display name', () => {
        const details = buildNativeLog([
            { id: 1, role: 'squad', account: 'Ally.0001', character: 'Ally', pixels: [[0, 0]] },
            {
                id: 2, role: 'enemy_player', name: 'Anon26',
                profession: 'Guardian', elite_spec: 'Dragonhunter',
                pixels: [[500, 500], [510, 510]],
            },
        ]);
        const enemy = buildMovementData(details, { trackedBuffIds: trackedBuffs })!.members.find(m => m.isEnemy)!;
        expect(enemy.name).toBe('Anon26');
        expect(enemy.profession).toBe('Guardian');
        // The EI path parsed this out of a "<spec> pl-123" name string.
        expect(enemy.eliteSpec).toBe('Dragonhunter');
    });

    it('carries down and dead intervals from the native track', () => {
        const details = buildNativeLog([
            {
                id: 1, role: 'squad', account: 'A.1', character: 'A', pixels: [[10, 10], [11, 11]],
                down: [[600, 900]], dead: [[900, 1200]],
            },
        ]);
        const member = buildMovementData(details, { trackedBuffIds: trackedBuffs })!.members[0];
        expect(member.downRanges).toEqual([[600, 900]]);
        expect(member.deadRanges).toEqual([[900, 1200]]);
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

    it('reads no EI position data at all', () => {
        // The map view-model now sources positions from the same native tracks
        // this surface exposes. A log carrying ONLY EI positions must therefore
        // yield nothing rather than quietly falling back to the pixel space and
        // the rounded inchToPixel that unit 3 removed.
        const eiOnly = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01, sizes: [523, 750] },
            players: [{
                name: 'Alice', account: 'Alice.0001', profession: 'Guardian',
                notInSquad: false, combatReplayData: { start: 7, positions: [[1, 2], [3, 4]], dead: [], down: [] },
            }],
            targets: [],
        };
        expect(buildMovementData(eiOnly, { trackedBuffIds: trackedBuffs })).toBeNull();
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

/**
 * The replay map draws a commander's tag in the colour they actually ran, and
 * an overhead squad marker above whoever is carrying it. Both ride on the
 * member, so the join from `encounter.markers[].entity_id` to the member has
 * to survive `buildMovementData` — the map cannot recover it later.
 */
describe('buildMovementData markers', () => {
    it('carries the tag colour and squad marker onto the member', () => {
        const movement = buildMovementData(buildNativeLog(
            [{
                id: 1, role: 'squad', account: 'Alice.0001', character: 'Alice',
                profession: 'Guardian', subgroup: 1, commander: true, pixels: [[100, 100]],
            }],
            {
                markers: [
                    { entity_id: 1, marker_kind: 'commander_tag', marker_label: 'Purple', time_ms: 5 },
                    { entity_id: 1, marker_kind: 'squad_marker', marker_label: 'Arrow', marker_icon: 'arrow.png', time_ms: 6 },
                ],
            },
        ), { trackedBuffIds: trackedBuffs })!;
        const member = movement.members[0];
        expect(member.tagColor).toBe('#8e4ec6');
        expect(member.squadMarker).toEqual({ label: 'Arrow', icon: 'arrow.png' });
    });

    it('leaves both absent when the log carries no markers', () => {
        const movement = buildMovementData(buildNativeLog(
            [{
                id: 1, role: 'squad', account: 'Alice.0001', character: 'Alice',
                profession: 'Guardian', subgroup: 1, pixels: [[100, 100]],
            }],
        ), { trackedBuffIds: trackedBuffs })!;
        expect(movement.members[0].tagColor).toBeUndefined();
        expect(movement.members[0].squadMarker).toBeUndefined();
    });
});

/**
 * Ground markers cross two coordinate systems on the way in, and getting
 * either wrong is silent: the marker just lands somewhere plausible but wrong.
 */
describe('buildMovementData ground markers', () => {
    const squad = [{
        id: 1, role: 'squad' as const, account: 'Alice.0001', character: 'Alice',
        profession: 'Guardian', subgroup: 1, pixels: [[100, 100]] as Array<[number, number]>,
    }];

    it('rebases arcdps session time onto fight-relative time', () => {
        // `start_ms`/`end_ms` are session time like `commander.segments`, while
        // everything else on MovementData is fight-relative. Without the
        // rebase a marker placed 2s into the fight reads as 33847418ms and
        // never appears.
        const movement = buildMovementData(buildNativeLog(squad, {
            logStartMs: 1_000_000,
            groundMarkers: [{ index: 4, name: 'star', x: 0, y: 0, z: 0, start_ms: 1_002_000, end_ms: 1_005_000 }],
        }), { trackedBuffIds: trackedBuffs })!;
        expect(movement.groundMarkers).toHaveLength(1);
        expect(movement.groundMarkers[0].startMs).toBe(2000);
        expect(movement.groundMarkers[0].endMs).toBe(5000);
    });

    it('clamps a marker placed before the fight to t=0 rather than dropping it', () => {
        // It was on screen at t=0, which is what the replay needs to know.
        const movement = buildMovementData(buildNativeLog(squad, {
            logStartMs: 1_000_000,
            groundMarkers: [{ index: 0, name: 'arrow', x: 0, y: 0, z: 0, start_ms: 900_000 }],
        }), { trackedBuffIds: trackedBuffs })!;
        expect(movement.groundMarkers[0].startMs).toBe(0);
        expect(movement.groundMarkers[0].endMs).toBeNull();
    });

    it('projects world inches into the same canvas pixels members use', () => {
        // A marker dropped on a player must land on that player. The fixture
        // puts Alice at canvas pixel [100, 100]; a ground marker at her world
        // position has to come back to the same pixel.
        const details = buildNativeLog(squad, { groundMarkers: [] });
        const withMember = buildMovementData(details, { trackedBuffIds: trackedBuffs })!;
        const [ax, ay] = withMember.members[0].positions[0];

        // `samples` are `[timeMs, worldX, worldY]`.
        const [, wx, wy] = (details as any).native.blocks.replay.tracks.by_entity[1].samples[0];
        const movement = buildMovementData(buildNativeLog(squad, {
            groundMarkers: [{ index: 1, name: 'circle', x: wx, y: wy, z: 0, start_ms: 0 }],
        }), { trackedBuffIds: trackedBuffs })!;

        expect(movement.groundMarkers[0].x).toBeCloseTo(ax, 0);
        expect(movement.groundMarkers[0].y).toBeCloseTo(ay, 0);
    });

    it('is empty, not throwing, when the log carries none', () => {
        const movement = buildMovementData(buildNativeLog(squad), { trackedBuffIds: trackedBuffs })!;
        expect(movement.groundMarkers).toEqual([]);
    });
});
