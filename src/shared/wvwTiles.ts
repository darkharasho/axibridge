import { WvwMap } from './wvwLandmarks';

interface WvwMapTileData {
    continentRect: [[number, number], [number, number]];
    pixelSize: [number, number];
    pixelOffset: [number, number];
}

const CONTINENT_ID = 2;
const FLOOR_ID = 3;
export const MAX_TILE_ZOOM = 7;
const TILE_SIZE = 256;

// pixelOffset: shift applied to tile positions to align with EI's pixel coordinate space.
// Derived from the difference between GW2 API-computed landmark positions and
// manually calibrated EI-aligned positions.
export const WVW_TILE_DATA: Record<WvwMap, WvwMapTileData> = {
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

export const MAX_HIRES_ZOOM = 9;

/**
 * Pick the lowest tile zoom whose art density meets what the screen shows,
 * rounding UP (never a full level blurrier than needed).
 *
 * needed density  = (panelCssWidth / mapWidth) × viewportScale × dpr
 *                   (device px per map unit)
 * available at z  = (continentRectWidth / mapWidth) × 2^(z − MAX_TILE_ZOOM)
 */
export function pickTileZoom(
    map: WvwMap,
    mapWidth: number,
    panelCssWidth: number,
    viewportScale: number,
    dpr: number,
): number {
    const data = WVW_TILE_DATA[map];
    if (!data) return 5;
    const [[cx1], [cx2]] = data.continentRect;
    const nativeDensity = (cx2 - cx1) / mapWidth;
    // Panel width is 0 on the first render before layout; assume 1 CSS px
    // per map unit so the choice degrades to scale × dpr alone.
    const panelW = panelCssWidth > 0 ? panelCssWidth : mapWidth;
    const needed = (panelW / mapWidth) * viewportScale * (dpr > 0 ? dpr : 1);
    const zoom = MAX_TILE_ZOOM + Math.ceil(Math.log2(needed / nativeDensity));
    return Math.min(MAX_HIRES_ZOOM, Math.max(3, zoom));
}

export interface TileViewportState { scale: number; tx: number; ty: number; }
export interface MapRect { x: number; y: number; width: number; height: number; }

/**
 * The map-unit rect currently visible in the panel, inverting both the
 * preserveAspectRatio="xMidYMid slice" fit and the pan/zoom group transform
 * (mirrors screenToSvg in useReplayViewport).
 */
export function visibleMapRect(
    panelWidth: number,
    panelHeight: number,
    mapWidth: number,
    mapHeight: number,
    viewport: TileViewportState,
): MapRect {
    if (!(panelWidth > 0) || !(panelHeight > 0)) {
        return { x: 0, y: 0, width: mapWidth, height: mapHeight };
    }
    const rs = Math.max(panelWidth / mapWidth, panelHeight / mapHeight);
    const ox = (panelWidth - mapWidth * rs) / 2;
    const oy = (panelHeight - mapHeight * rs) / 2;
    const vx0 = (0 - ox) / rs;
    const vy0 = (0 - oy) / rs;
    const vx1 = (panelWidth - ox) / rs;
    const vy1 = (panelHeight - oy) / rs;
    const { scale, tx, ty } = viewport;
    return {
        x: (vx0 - tx) / scale,
        y: (vy0 - ty) / scale,
        width: (vx1 - vx0) / scale,
        height: (vy1 - vy0) / scale,
    };
}
