import { describe, it, expect } from 'vitest';
import { WvwMap } from '../wvwLandmarks';
import { WVW_TILE_DATA, MAX_TILE_ZOOM, getMapTiles, pickTileZoom } from '../wvwTiles';
import { resolveMapFromZone, resolveMapFromDetails, normalizeMapName, normalizeMapNameShort } from '../mapUtils';
import {
    getArena, replayCanvas, worldToPixel, OBSIDIAN_SANCTUM_ARENA,
} from '@axiapps/bridge-metrics/nativePositioning';

/**
 * Obsidian Sanctum (map id 899) is the one WvW map axilog emits no `arena`
 * for, because GW2EI has no combat-replay image for it. Everything here backs
 * the substitute frame that makes its replay work, and the coupling between
 * that frame and the tile rect that draws under it.
 *
 * The numbers are not free parameters: they come from `/v2/maps/899`'s
 * `map_rect` -> `continent_rect` mapping, and were checked against 273,642
 * position samples from 16 real OS logs (99.9% inside the rect).
 */

/** `/v2/maps/899`: map_rect [[-36864,-36864],[36864,36864]] <-> continent_rect [[8958,12798],[12030,15870]]. */
const worldToContinent = (wx: number, wy: number): [number, number] => [
    8958 + (wx + 36864) / 24,
    12798 + (36864 - wy) / 24,
];

describe('Obsidian Sanctum arena', () => {
    it('substitutes a fixed frame when axilog emits no arena', () => {
        const details = { native: { encounter: { map_id: 899 }, blocks: { replay: { tracks: {} } } } };
        expect(getArena(details)).toEqual(OBSIDIAN_SANCTUM_ARENA);
    });

    it('is a fixed frame, not a per-log bounding box', () => {
        // Two logs whose observed extents differ must still project onto the
        // same pixels, or positions are incomparable between fights.
        const a = { native: { encounter: { map_id: 899 }, blocks: { replay: { tracks: {} } } } };
        const b = { native: { encounter: { map_id: 899 }, blocks: { replay: { tracks: { bounds: { min_x: 0, min_y: 0, max_x: 1, max_y: 1 } } } } } };
        expect(getArena(a)).toEqual(getArena(b));
    });

    it('does not substitute for a map that has a real arena', () => {
        const real = {
            image_width: 697, image_height: 1000, image_url: 'x',
            world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008,
        };
        const details = { native: { encounter: { map_id: 96 }, blocks: { replay: { tracks: { arena: real } } } } };
        expect(getArena(details)).toEqual(real);
        // An unknown map id still gets nothing rather than a wrong frame.
        expect(getArena({ native: { encounter: { map_id: 1315 }, blocks: { replay: { tracks: {} } } } })).toBeNull();
    });

    it('agrees with the tile rect it is drawn under', () => {
        // THE invariant behind both constants. The arena's world corners, put
        // through the GW2 API's own mapping, must land exactly on the tile
        // rect's continent corners -- otherwise the art slides against the
        // dots and nothing catches it but the eye.
        const a = OBSIDIAN_SANCTUM_ARENA;
        const tile = WVW_TILE_DATA[WvwMap.ObsidianSanctum];
        expect(worldToContinent(a.world_min_x, a.world_max_y)).toEqual(tile.continentRect[0]);
        expect(worldToContinent(a.world_max_x, a.world_min_y)).toEqual(tile.continentRect[1]);
        // ...and the canvas the landmark/tile constants live in must match the
        // tile entry's reference size.
        expect(replayCanvas(a)).toEqual(tile.pixelSize);
    });

    it('projects the arena corners onto the canvas corners', () => {
        const a = OBSIDIAN_SANCTUM_ARENA;
        const canvas = replayCanvas(a);
        // World y grows north, image y grows down, so max_y is the top edge.
        expect(worldToPixel(a, a.world_min_x, a.world_max_y, canvas)).toEqual([0, 0]);
        expect(worldToPixel(a, a.world_max_x, a.world_min_y, canvas)).toEqual(canvas);
    });
});

describe('Obsidian Sanctum map resolution', () => {
    it('resolves by map id, since axilog cannot name the map', () => {
        // What an OS log actually carries: the generic WvW name.
        const details = { native: { encounter: { map_id: 899 } } };
        expect(resolveMapFromZone('Detailed WvW - World vs World')).toBeNull();
        expect(resolveMapFromDetails(details, 'Detailed WvW - World vs World'))
            .toBe(WvwMap.ObsidianSanctum);
    });

    it('falls back to the zone string when there is no native map id', () => {
        expect(resolveMapFromDetails({}, 'Detailed WvW - Obsidian Sanctum')).toBe(WvwMap.ObsidianSanctum);
        expect(resolveMapFromDetails({}, 'Detailed WvW - Eternal Battlegrounds')).toBe(WvwMap.EternalBattlegrounds);
        expect(resolveMapFromDetails({}, 'Detailed WvW - World vs World')).toBeNull();
    });

    it('names it once the map is known', () => {
        expect(normalizeMapName('Detailed WvW - Obsidian Sanctum')).toBe('Obsidian Sanctum');
        expect(normalizeMapNameShort('Detailed WvW - Obsidian Sanctum')).toBe('OS');
    });
});

describe('Obsidian Sanctum tiles', () => {
    it('never requests a hi-res tile the pack was not built for', () => {
        // The pack only covers the four match maps. Without the cap this
        // returns 9 at any real zoom and the detail layer 404s to blank.
        const zoom = pickTileZoom(WvwMap.ObsidianSanctum, 750, 1200, 4, 2);
        expect(zoom).toBeLessThanOrEqual(MAX_TILE_ZOOM);
        const tiles = getMapTiles(WvwMap.ObsidianSanctum, zoom, 750, 639);
        expect(tiles.length).toBeGreaterThan(0);
        for (const t of tiles) expect(t.url).toMatch(/^https:\/\/tiles\.guildwars2\.com\/2\/3\//);
    });

    it('still caps the four match maps at the hi-res ceiling, not at z7', () => {
        expect(pickTileZoom(WvwMap.EternalBattlegrounds, 716, 1200, 4, 2)).toBeGreaterThan(MAX_TILE_ZOOM);
    });
});
