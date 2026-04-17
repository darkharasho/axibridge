import { WvwMap } from './wvwLandmarks';

interface WvwMapTileData {
    continentRect: [[number, number], [number, number]];
    pixelSize: [number, number];
    pixelOffset: [number, number];
}

const CONTINENT_ID = 2;
const FLOOR_ID = 3;
const MAX_TILE_ZOOM = 7;
const TILE_SIZE = 256;

// pixelOffset: shift applied to tile positions to align with EI's pixel coordinate space.
// Derived from the difference between GW2 API-computed landmark positions and
// manually calibrated EI-aligned positions.
const WVW_TILE_DATA: Record<WvwMap, WvwMapTileData> = {
    [WvwMap.EternalBattlegrounds]: {
        continentRect: [[8958, 12798], [12030, 15870]],
        pixelSize: [716, 750],
        pixelOffset: [-14, 20],
    },
    [WvwMap.GreenBorderlands]: {
        continentRect: [[5630, 11518], [8190, 15102]],
        pixelSize: [523, 750],
        pixelOffset: [0, 0],
    },
    [WvwMap.BlueBorderlands]: {
        continentRect: [[12798, 10878], [15358, 14462]],
        pixelSize: [523, 750],
        pixelOffset: [0, 0],
    },
    [WvwMap.RedBorderlands]: {
        continentRect: [[9214, 8958], [12286, 12030]],
        pixelSize: [750, 750],
        pixelOffset: [0, 0],
    },
};

export interface TileInfo {
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Returns tile info for a WvW map at the given tile zoom level.
 * @param renderWidth  Actual render width in EI pixel space (from combatReplayMetaData.sizes[0]).
 *                     Defaults to the calibrated pixelSize if omitted.
 * @param renderHeight Actual render height in EI pixel space.
 */
export function getMapTiles(map: WvwMap, tileZoom: number, renderWidth?: number, renderHeight?: number): TileInfo[] {
    const data = WVW_TILE_DATA[map];
    if (!data) return [];

    const [[cx1, cy1], [cx2, cy2]] = data.continentRect;
    const [refW, refH] = data.pixelSize;
    // Use caller-supplied dimensions so tiles are in EI pixel space, not
    // the hardcoded reference size (guards against EI returning a different value).
    const pw = renderWidth ?? refW;
    const ph = renderHeight ?? refH;
    // Scale the manual offset proportionally if render size differs from reference.
    const ox = pw / refW * data.pixelOffset[0];
    const oy = ph / refH * data.pixelOffset[1];
    const cw = cx2 - cx1;
    const ch = cy2 - cy1;

    const tileSpan = TILE_SIZE * Math.pow(2, MAX_TILE_ZOOM - tileZoom);

    const txMin = Math.floor(cx1 / tileSpan);
    const tyMin = Math.floor(cy1 / tileSpan);
    const txMax = Math.floor((cx2 - 1) / tileSpan);
    const tyMax = Math.floor((cy2 - 1) / tileSpan);

    const tiles: TileInfo[] = [];
    for (let ty = tyMin; ty <= tyMax; ty++) {
        for (let tx = txMin; tx <= txMax; tx++) {
            const tileCx = tx * tileSpan;
            const tileCy = ty * tileSpan;

            const px = (tileCx - cx1) / cw * pw + ox;
            const py = (tileCy - cy1) / ch * ph + oy;
            const tileW = tileSpan / cw * pw;
            const tileH = tileSpan / ch * ph;

            tiles.push({
                url: `https://tiles.guildwars2.com/${CONTINENT_ID}/${FLOOR_ID}/${tileZoom}/${tx}/${ty}.jpg`,
                x: px,
                y: py,
                width: tileW,
                height: tileH,
            });
        }
    }

    return tiles;
}

export function hasTileData(map: WvwMap): boolean {
    return map in WVW_TILE_DATA;
}
