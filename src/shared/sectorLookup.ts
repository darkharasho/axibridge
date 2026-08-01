import { WvwMap } from './wvwLandmarks';
import { WVW_SECTORS } from './wvwSectors';

function pointInPolygon(px: number, py: number, poly: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/**
 * The sector containing an EI-pixel-space point on a WvW map, or undefined
 * (open water, off-map). Used to colour objective landmarks by the owner of
 * the sector they sit in — an objective's marker always lies inside its own
 * capture sector.
 */
export function sectorIdAt(map: WvwMap, x: number, y: number): number | undefined {
    return WVW_SECTORS[map]?.find(sector => pointInPolygon(x, y, sector.bounds))?.id;
}
