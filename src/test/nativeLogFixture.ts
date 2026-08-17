/**
 * Hand-built native log fixtures for tests.
 *
 * Tests that exercise the replay map want to say "this player stood at pixel
 * [100, 100]" — but native stores world inches, and the render canvas is
 * derived from the arena. Writing world coordinates by hand in each test would
 * bury the intent under arithmetic, and getting the y-flip wrong would be
 * invisible. So callers still express PIXELS and this module inverts the
 * projection for them.
 *
 * The arena below is deliberately square and round-numbered: a 750×750 canvas
 * over a 75000×75000 world rect gives exactly 0.01 px/inch on both axes, so a
 * pixel is 100 inches and the inverse is exact — no rounding slack to hide a
 * sign error.
 */
import { worldToPixel, type ArenaProjection } from '@axiapps/bridge-metrics/nativePositioning';

export const TEST_ARENA: ArenaProjection = {
    image_width: 750,
    image_height: 750,
    image_url: 'https://example.invalid/map.png',
    world_min_x: 0,
    world_min_y: 0,
    world_max_x: 75_000,
    world_max_y: 75_000,
};

export const TEST_POLL_MS = 300;

/** Inverse of `worldToPixel` on {@link TEST_ARENA}, including the y flip. */
export const pixelToWorld = (
    px: number,
    py: number,
    arena: ArenaProjection = TEST_ARENA,
): [number, number] => {
    const [w, h] = [arena.image_width, arena.image_height];
    const fx = px / w;
    const fy = 1 - py / h;
    return [
        arena.world_min_x + fx * (arena.world_max_x - arena.world_min_x),
        arena.world_min_y + fy * (arena.world_max_y - arena.world_min_y),
    ];
};

export interface NativeMemberSpec {
    id: number;
    role: 'squad' | 'friendly_player' | 'enemy_player';
    /** Squad/friendly identity. Enemies use `name` instead, as native does. */
    account?: string;
    character?: string;
    name?: string;
    profession?: string;
    elite_spec?: string;
    subgroup?: number;
    commander?: boolean;
    /** Positions in RENDER-CANVAS PIXELS; inverted to world inches here. */
    pixels?: Array<[number, number]>;
    /** Timestamp of `pixels[0]`. Defaults to one poll, as a real track does. */
    startMs?: number;
    down?: Array<[number, number]>;
    dead?: Array<[number, number]>;
    /** Extra EI `players[]` fields — boons, casts, health, damage series. */
    ei?: Record<string, unknown>;
}

export interface NativeLogOptions {
    durationMs?: number;
    pollMs?: number;
    arena?: ArenaProjection;
    skillMap?: Record<string, unknown>;
    buffMap?: Record<string, unknown>;
    /** Extra top-level fields on the details object. */
    details?: Record<string, unknown>;
}

/**
 * A `details` object carrying BOTH surfaces, exactly as a real parse does: the
 * native container under `details.native`, and the EI rows the not-yet-migrated
 * fields (boons, casts, health, damage series) are still read from.
 */
export const buildNativeLog = (
    members: NativeMemberSpec[],
    options: NativeLogOptions = {},
): Record<string, any> => {
    const arena = options.arena ?? TEST_ARENA;
    const pollMs = options.pollMs ?? TEST_POLL_MS;

    const entities: any[] = [];
    const tracksByEntity: Record<number, any> = {};
    const byEntity: Record<number, any> = {};
    const players: any[] = [];

    for (const m of members) {
        const entity: any = {
            id: m.id,
            role: m.role,
            profession: m.profession ?? '',
            combat_participant: true,
            agent_addr: 1000 + m.id,
            instid: 2000 + m.id,
        };
        if (m.account !== undefined) entity.account = m.account;
        if (m.character !== undefined) entity.character = m.character;
        if (m.name !== undefined) entity.name = m.name;
        if (m.elite_spec !== undefined) entity.elite_spec = m.elite_spec;
        if (m.subgroup !== undefined) entity.subgroup = m.subgroup;
        if (m.commander) entity.commander = { guid: `g-${m.id}`, segments: [[0, 1000]], variant: 'blue' };
        entities.push(entity);

        const start = m.startMs ?? pollMs;
        if (m.pixels?.length) {
            tracksByEntity[m.id] = {
                samples: m.pixels.map((p, i) => {
                    const [wx, wy] = pixelToWorld(p[0], p[1], arena);
                    return [start + i * pollMs, wx, wy];
                }),
                down_intervals: m.down ?? [],
                dead_intervals: m.dead ?? [],
                dc_intervals: [],
            };
        }
        byEntity[m.id] = {
            start_ms: start,
            down: m.down ?? [],
            dead: m.dead ?? [],
            dc: [],
        };

        // The EI half. Positions are deliberately ABSENT: nothing may read them.
        if (m.role !== 'enemy_player') {
            players.push({
                account: m.account,
                profession: m.profession ?? '',
                notInSquad: m.role !== 'squad',
                isFake: false,
                ...(m.ei ?? {}),
            });
        }
    }

    return {
        durationMS: options.durationMs ?? 60_000,
        skillMap: options.skillMap ?? {},
        buffMap: options.buffMap ?? {},
        players,
        targets: [],
        ...(options.details ?? {}),
        native: {
            axilog: { schema: '1.0', version: 'test' },
            encounter: {},
            entities,
            catalogs: {},
            coverage: { replay: 'present' },
            blocks: {
                replay: {
                    by_entity: byEntity,
                    tracks: { poll_ms: pollMs, arena, by_entity: tracksByEntity },
                },
            },
        },
    };
};

/** Round-trip helper for assertions: the pixel a world sample projects back to. */
export const pixelOf = (
    wx: number,
    wy: number,
    arena: ArenaProjection = TEST_ARENA,
): [number, number] => worldToPixel(arena, wx, wy, [arena.image_width, arena.image_height]);
