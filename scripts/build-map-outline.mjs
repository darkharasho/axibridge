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

// map key -> { continentRect, pixelSize, outFile }. Green/Blue both feed the Alpine asset.
const MAPS = {
    ebg:          { rect: [[8958, 12798], [12030, 15870]], size: [716, 750], out: 'eternalbattlegrounds-outline.svg' },
    'alpine-green': { rect: [[5630, 11518], [8190, 15102]], size: [523, 750], out: 'alpine-outline.svg' },
    'alpine-blue':  { rect: [[12798, 10878], [15358, 14462]], size: [523, 750], out: 'alpine-outline.svg' },
    desert:       { rect: [[9214, 8958], [12286, 12030]], size: [750, 750], out: 'desert-outline.svg' },
};

const args = process.argv.slice(2);
const key = args.find(a => !a.startsWith('--'));
const reuse = args.includes('--reuse');
const cfg = MAPS[key];
if (!cfg) { console.error(`Unknown map "${key}". One of: ${Object.keys(MAPS).join(', ')}`); process.exit(1); }

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
const threshold = path.join(work, 'threshold.png');

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

// 2) Canny edge detection -> black feature outlines on white, ready to trace.
//    A brightness cut fails (the map is uniformly dark); edges capture the
//    terrain/water/structure boundaries we actually want.
//    Tunables: blur radius (noise) and the canny lower/upper hysteresis thresholds.
execFileSync('magick', [
    composite,
    '-colorspace', 'Gray',
    '-blur', '0x0.6',
    '-canny', '0x1+10%+30%',
    '-negate',
    threshold,
], { stdio: 'inherit' });

// 3) Trace the edge image with potrace. The input is black edges on white, so the
//    default black-on-white tracing captures the feature outlines.
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
const outPath = path.join(outDir, cfg.out);
writeFileSync(outPath, svg);
console.log(`[${key}] wrote ${outPath} (intermediates cached in ${work})`);
