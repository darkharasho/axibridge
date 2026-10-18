import { describe, it, expect } from 'vitest';
import { WvwMap, WVW_LANDMARKS, findNearestLandmark } from '../wvwLandmarks';
import { WVW_TILE_DATA, MAX_TILE_ZOOM, getMapTiles, pickTileZoom } from '../wvwTiles';
import { WVW_SECTORS } from '../wvwSectors';
import { sectorIdAt } from '../sectorLookup';
import { resolveMapFromZone, resolveMapFromDetails, normalizeMapName, normalizeMapNameShort } from '../mapUtils';
import { replayCanvas, worldToPixel, type ArenaProjection } from '@axiapps/bridge-metrics/nativePositioning';

/**
 * Edge of the Mists (map id 968). Unlike Obsidian Sanctum, axilog DOES emit an
 * arena for it -- GW2EI has a combat-replay image -- so replay always worked,
 * but over that one 3.2 MB image instead of tiles. Everything here backs the
 * tile entry and its coupling to axilog's arena.
 *
 * Checked against 66k position samples from 32 real EotM logs: all inside the
 * rect, tracing the bridges between islands with no offset.
 */

/** axilog's `WVW_MAPS` entry for 968 (`axilog-core/src/wvw/maps.rs`), as emitted in `replay.tracks.arena`. */
const AXILOG_EOTM_ARENA: ArenaProjection = {
    image_width: 3556,
    image_height: 3646,
    image_url: 'https://darkharasho.github.io/axibridge-map-tiles/icons/imgur-iEpKYL0.jpg',
    world_min_x: -36864,
    world_min_y: -36864,
    world_max_x: 36864,
    world_max_y: 36864,
};

/** `/v2/maps/968`: map_rect [[-36864,-36864],[36864,36864]] <-> continent_rect [[5994,8446],[9066,11518]]. */
const worldToContinent = (wx: number, wy: number): [number, number] => [
    5994 + (wx + 36864) / 24,
    8446 + (36864 - wy) / 24,
];

describe('Edge of the Mists tiles', () => {
    it('agrees with the arena axilog emits', () => {
        // The arena's world corners, put through the API's own mapping, must
        // land on the tile rect's corners, or the art slides against the dots.
        const a = AXILOG_EOTM_ARENA;
        const tile = WVW_TILE_DATA[WvwMap.EdgeOfTheMists];
        expect(worldToContinent(a.world_min_x, a.world_max_y)).toEqual(tile.continentRect[0]);
        expect(worldToContinent(a.world_max_x, a.world_min_y)).toEqual(tile.continentRect[1]);
        // The canvas comes from the non-square IMAGE, not the square rect.
        expect(replayCanvas(a)).toEqual(tile.pixelSize);
        expect(tile.pixelOffset).toEqual([0, 0]);
    });

    it('projects the arena corners onto the canvas corners', () => {
        const a = AXILOG_EOTM_ARENA;
        const canvas = replayCanvas(a);
        expect(worldToPixel(a, a.world_min_x, a.world_max_y, canvas)).toEqual([0, 0]);
        expect(worldToPixel(a, a.world_max_x, a.world_min_y, canvas)).toEqual(canvas);
    });

    it('never requests a hi-res tile the pack was not built for', () => {
        const zoom = pickTileZoom(WvwMap.EdgeOfTheMists, 731, 1200, 4, 2);
        expect(zoom).toBeLessThanOrEqual(MAX_TILE_ZOOM);
        const tiles = getMapTiles(WvwMap.EdgeOfTheMists, zoom, 731, 750);
        expect(tiles.length).toBeGreaterThan(0);
        for (const t of tiles) expect(t.url).toMatch(/^https:\/\/tiles\.guildwars2\.com\/2\/3\//);
    });
});

describe('Edge of the Mists map resolution', () => {
    it('resolves by map id', () => {
        const details = { native: { encounter: { map_id: 968 } } };
        expect(resolveMapFromDetails(details, 'Detailed WvW - World vs World')).toBe(WvwMap.EdgeOfTheMists);
    });

    it('resolves by the name axilog gives it', () => {
        expect(resolveMapFromZone('Detailed WvW - Edge of the Mists')).toBe(WvwMap.EdgeOfTheMists);
        expect(resolveMapFromZone('EotM')).toBe(WvwMap.EdgeOfTheMists);
        // Every WvW map is "in the Mists"; that alone must not match.
        expect(resolveMapFromZone('World vs World - The Mists')).toBeNull();
    });

    it('names it', () => {
        expect(normalizeMapName('Detailed WvW - Edge of the Mists')).toBe('Edge of the Mists');
        expect(normalizeMapNameShort('Detailed WvW - Edge of the Mists')).toBe('EotM');
    });
});

describe('Edge of the Mists landmarks', () => {
    it('places every objective inside a sector of the generated table', () => {
        // Landmarks are hand-transcribed and sectors are generated, both from
        // the same rect and canvas. If either drifts, objectives fall outside
        // every polygon and lose their owner colouring.
        expect(WVW_SECTORS[WvwMap.EdgeOfTheMists].length).toBeGreaterThan(0);
        for (const lm of WVW_LANDMARKS[WvwMap.EdgeOfTheMists]) {
            expect(sectorIdAt(WvwMap.EdgeOfTheMists, lm.x, lm.y), lm.name).toBeDefined();
        }
    });

    it('labels a fight after its nearest keep, tower or camp', () => {
        expect(findNearestLandmark(WvwMap.EdgeOfTheMists, 545, 485)?.name).toBe('Thunder Hollow');
    });
});
