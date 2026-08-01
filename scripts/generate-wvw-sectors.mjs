// Regenerates src/shared/wvwSectors.ts from the GW2 API.
// Usage: npm run generate:wvw-sectors
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared', 'wvwSectors.ts');

// Keep in sync with WVW_TILE_DATA in src/shared/wvwTiles.ts (continentRect, pixelSize, pixelOffset).
const MAPS = {
    EternalBattlegrounds: { apiId: 38,   rect: [[8958, 12798], [12030, 15870]], size: [716, 750], offset: [-14, 20] },
    GreenBorderlands:     { apiId: 95,   rect: [[5630, 11518], [8190, 15102]],  size: [523, 750], offset: [0, 0] },
    BlueBorderlands:      { apiId: 96,   rect: [[12798, 10878], [15358, 14462]], size: [523, 750], offset: [0, 0] },
    RedBorderlands:       { apiId: 1099, rect: [[9214, 8958], [12286, 12030]],  size: [750, 750], offset: [0, 0] },
};

const floor = await (await fetch('https://api.guildwars2.com/v2/continents/2/floors/3')).json();
const objectives = await (await fetch('https://api.guildwars2.com/v2/wvw/objectives?ids=all')).json();

const round1 = (n) => Math.round(n * 10) / 10;
const sectorsByMap = {};
for (const [key, cfg] of Object.entries(MAPS)) {
    const apiMap = floor.regions['7']?.maps?.[String(cfg.apiId)];
    if (!apiMap?.sectors) throw new Error(`No sectors for map ${cfg.apiId} (${key})`);
    const [[cx1, cy1], [cx2, cy2]] = cfg.rect;
    const [pw, ph] = cfg.size;
    const [ox, oy] = cfg.offset;
    const toEi = ([x, y]) => [
        round1((x - cx1) / (cx2 - cx1) * pw + ox),
        round1((y - cy1) / (cy2 - cy1) * ph + oy),
    ];
    sectorsByMap[key] = Object.entries(apiMap.sectors).map(([id, s]) => ({
        id: Number(id),
        name: s.name.trim(),
        bounds: s.bounds.map(toEi),
    }));
    console.log(`${key}: ${sectorsByMap[key].length} sectors`);
}

const wantedMapIds = new Set(Object.values(MAPS).map(m => m.apiId));
const objectiveSectors = {};
for (const o of objectives) {
    if (wantedMapIds.has(o.map_id) && o.sector_id) objectiveSectors[o.id] = o.sector_id;
}
console.log(`objectives mapped: ${Object.keys(objectiveSectors).length}`);

const body = `// GENERATED FILE — do not edit by hand. Regenerate with: npm run generate:wvw-sectors
// Source: GW2 API /v2/continents/2/floors/3 (region 7) + /v2/wvw/objectives.
// Bounds are in EI pixel space (same space as wvwLandmarks/wvwTiles).
import { WvwMap } from './wvwLandmarks';

export type WvwOwner = 'Red' | 'Blue' | 'Green' | 'Neutral';

export interface WvwSector {
    id: number;
    name: string;
    bounds: [number, number][];
}

export const WVW_MAP_IDS: Record<WvwMap, number> = {
${Object.entries(MAPS).map(([k, c]) => `    [WvwMap.${k}]: ${c.apiId},`).join('\n')}
};

export const WVW_SECTOR_REF_SIZE: Record<WvwMap, [number, number]> = {
${Object.entries(MAPS).map(([k, c]) => `    [WvwMap.${k}]: [${c.size[0]}, ${c.size[1]}],`).join('\n')}
};

export const WVW_SECTORS: Record<WvwMap, WvwSector[]> = {
${Object.entries(sectorsByMap).map(([k, secs]) =>
    `    [WvwMap.${k}]: ${JSON.stringify(secs)},`).join('\n')}
};

export const OBJECTIVE_SECTORS: Record<string, number> = ${JSON.stringify(objectiveSectors)};
`;
writeFileSync(OUT, body);
console.log(`wrote ${OUT}`);
