// Dev-time pipeline: composite GW2 WvW tiles -> Canny edges -> potrace -> outline SVG.
// Usage: node scripts/build-map-outline.mjs <ebg|alpine-green|alpine-blue|desert> [--reuse]
//   --reuse  Skip the tile download/composite (reuse the cached composite) and just
//            re-run the edge + trace steps. Use while tuning; omit for a fresh build.
// Requires: ImageMagick `magick` on PATH; the `potrace` devDependency.
// Note: potrace is the same tracing engine Inkscape's "Trace Bitmap" wraps; Inkscape's
//       headless CLI (object-trace) only traces the page border in 1.x, so we drive
//       potrace directly for a deterministic, scriptable result.
// Geometry constants are mirrored from src/shared/wvwTiles.ts (the source of truth).
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import potrace from 'potrace';

const CONTINENT_ID = 2, FLOOR_ID = 3, MAX_TILE_ZOOM = 7, TILE_SIZE = 256;

// map key -> { continentRect, pixelSize, out base name }. Green/Blue both feed the Alpine asset.
const MAPS = {
    ebg:          { rect: [[8958, 12798], [12030, 15870]], size: [716, 750], out: 'eternalbattlegrounds-outline' },
    'alpine-green': { rect: [[5630, 11518], [8190, 15102]], size: [523, 750], out: 'alpine-outline' },
    'alpine-blue':  { rect: [[12798, 10878], [15358, 14462]], size: [523, 750], out: 'alpine-outline' },
    desert:       { rect: [[9214, 8958], [12286, 12030]], size: [750, 750], out: 'desert-outline' },
};

// Edge-detection recipe per detail level (ImageMagick args before -negate).
const RECIPES = {
    standard: ['-colorspace', 'Gray', '-blur', '0x0.4', '-canny', '0x1+6%+18%'],
    high:     ['-colorspace', 'Gray', '-clahe', '25x25%+128+2', '-blur', '0x0.4', '-canny', '0x1+6%+18%'],
    max:      ['-colorspace', 'Gray', '-clahe', '12x12%+128+3', '-canny', '0x1+4%+12%'],
};

const args = process.argv.slice(2);
const key = args.find(a => !a.startsWith('--'));
const reuse = args.includes('--reuse');
const cfg = MAPS[key];
if (!cfg) { console.error(`Unknown map "${key}". One of: ${Object.keys(MAPS).join(', ')}`); process.exit(1); }

const levelArg = args.find(a => a.startsWith('--level='));
const levels = levelArg ? levelArg.slice('--level='.length).split(',') : ['standard', 'high', 'max'];
for (const lv of levels) if (!RECIPES[lv]) { console.error(`Unknown level "${lv}". One of: ${Object.keys(RECIPES).join(', ')}`); process.exit(1); }

const [[cx1, cy1], [cx2, cy2]] = cfg.rect;
const [pw, ph] = cfg.size;
const cw = cx2 - cx1, ch = cy2 - cy1;
const tileSpan = TILE_SIZE * Math.pow(2, MAX_TILE_ZOOM - MAX_TILE_ZOOM); // zoom 7 => span 256
const txMin = Math.floor(cx1 / tileSpan), tyMin = Math.floor(cy1 / tileSpan);
const txMax = Math.floor((cx2 - 1) / tileSpan), tyMax = Math.floor((cy2 - 1) / tileSpan);

const outDir = path.resolve('src/shared/mapOutlines');
// Intermediate rasters live in a gitignored cache so the trace step can be re-tuned
// with --reuse without re-downloading ~170 tiles each iteration.
const work = path.join(outDir, '.cache', key);
mkdirSync(work, { recursive: true });
const composite = path.join(work, 'composite.png');

// 1) Composite the tiles (skipped with --reuse when a cached composite exists).
if (reuse && existsSync(composite)) {
    console.log(`[${key}] reusing cached composite ${composite}`);
} else {
    console.log(`[${key}] compositing ${(txMax - txMin + 1) * (tyMax - tyMin + 1)} tiles into ${pw}x${ph}`);
    // Download tiles and build the composite args (each tile resized to its WxH, placed at X,Y).
    const compositeArgs = ['-size', `${pw}x${ph}`, 'xc:white'];
    for (let ty = tyMin; ty <= tyMax; ty++) {
        for (let tx = txMin; tx <= txMax; tx++) {
            const url = `https://tiles.guildwars2.com/${CONTINENT_ID}/${FLOOR_ID}/${MAX_TILE_ZOOM}/${tx}/${ty}.jpg`;
            const res = await fetch(url);
            if (!res.ok) { console.warn(`  tile ${tx},${ty} -> ${res.status}, skipping`); continue; }
            const buf = Buffer.from(await res.arrayBuffer());
            const file = path.join(work, `t_${tx}_${ty}.jpg`);
            writeFileSync(file, buf);
            const px = Math.round((tx * tileSpan - cx1) / cw * pw);
            const py = Math.round((ty * tileSpan - cy1) / ch * ph);
            const w = Math.ceil(tileSpan / cw * pw);
            const h = Math.ceil(tileSpan / ch * ph);
            compositeArgs.push('(', file, '-resize', `${w}x${h}!`, ')', '-geometry', `+${px}+${py}`, '-composite');
        }
    }
    compositeArgs.push(composite);
    execFileSync('magick', compositeArgs, { stdio: 'inherit' });
}

// Edge detection -> trace -> write, once per detail level. The composite is shared.
// Canny captures terrain/water/structure boundaries (a brightness cut fails on the
// uniformly dark map); CLAHE in the higher levels lifts subtle structure edges.
for (const lv of levels) {
    const threshold = path.join(work, `threshold-${lv}.png`);
    // 2) Edge detection for this level (recipe args + -negate -> black lines on white).
    execFileSync('magick', [composite, ...RECIPES[lv], '-negate', threshold], { stdio: 'inherit' });

    // 3) Trace the edge image with potrace (black-on-white tracing captures the lines).
    //    Tunables: turdSize (drop specks <= N px), optTolerance (curve simplification).
    const traced = await new Promise((resolve, reject) => {
        potrace.trace(threshold, { threshold: 128, turdSize: 4, optTolerance: 0.4, color: '#000000', background: 'transparent' },
            (err, out) => (err ? reject(err) : resolve(out)));
    });

    // 4) Normalise the SVG header to the map's reference pixel space (potrace already
    //    emits paths in input-pixel coords = pw x ph) and write the committed asset.
    const svg = traced.replace(/<svg\b[^>]*>/, (open) => {
        const cleaned = open
            .replace(/\swidth="[^"]*"/, '')
            .replace(/\sheight="[^"]*"/, '')
            .replace(/\sviewBox="[^"]*"/, '');
        return cleaned.replace(/>$/, ` width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}">`);
    });
    const outPath = path.join(outDir, `${cfg.out}-${lv}.svg`);
    writeFileSync(outPath, svg);
    console.log(`[${key}:${lv}] wrote ${outPath}`);
}
