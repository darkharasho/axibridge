// Generates AxiBridge's hi-res replay tile pack (synthetic z8/z9) from the
// official GW2 tile service via Real-ESRGAN. One-time, run manually:
//   npm run generate:hires-tiles -- [--map ebg] [--skip-z9] [--dry-run]
// Requires realesrgan-ncnn-vulkan on PATH (or --binary /path/to/it):
//   https://github.com/xinntao/Real-ESRGAN/releases (ncnn-vulkan build)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Frozen calibration constants — keep in sync with WVW_TILE_DATA in
// src/shared/wvwTiles.ts (values never change; the map art is static).
const REGIONS = {
    ebg:   { name: 'EternalBattlegrounds', rect: [[8958, 12798], [12030, 15870]] },
    green: { name: 'GreenBorderlands',     rect: [[5630, 11518], [8190, 15102]] },
    blue:  { name: 'BlueBorderlands',      rect: [[12798, 10878], [15358, 14462]] },
    red:   { name: 'RedBorderlands',       rect: [[9214, 8958], [12286, 12030]] },
};
const OFFICIAL = 'https://tiles.guildwars2.com/2/3';
const TILE = 256;
const JPEG_QUALITY = 85;

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const mapKeys = args.flatMap((a, i) => a === '--map' ? [args[i + 1]] : []);
const targets = mapKeys.length ? mapKeys : Object.keys(REGIONS);
const WORK = opt('--work', 'tile-work');
const BINARY = opt('--binary', 'realesrgan-ncnn-vulkan');
const MODEL = opt('--model', 'realesrgan-x4plus');
const OUT = path.join(WORK, 'tiles');

/** Inclusive tile index range covering [c1, c2) at the given span. */
const range = (c1, c2, span) => ({ min: Math.floor(c1 / span), max: Math.floor((c2 - 1) / span) });

function planRegion(key) {
    const [[cx1, cy1], [cx2, cy2]] = REGIONS[key].rect;
    const z7x = range(cx1, cx2, 256), z7y = range(cy1, cy2, 256);
    const z8x = range(cx1, cx2, 128), z8y = range(cy1, cy2, 128);
    const z9x = range(cx1, cx2, 64),  z9y = range(cy1, cy2, 64);
    const count = r => (r.x.max - r.x.min + 1) * (r.y.max - r.y.min + 1);
    return { key, z7x, z7y, z8x, z8y, z9x, z9y,
        cols: z7x.max - z7x.min + 1, rows: z7y.max - z7y.min + 1,
        counts: { z7: count({ x: z7x, y: z7y }), z8: count({ x: z8x, y: z8y }), z9: count({ x: z9x, y: z9y }) } };
}

async function download(plan) {
    const dir = path.join(WORK, 'z7', plan.key);
    mkdirSync(dir, { recursive: true });
    const jobs = [];
    for (let ty = plan.z7y.min; ty <= plan.z7y.max; ty++)
        for (let tx = plan.z7x.min; tx <= plan.z7x.max; tx++)
            jobs.push({ tx, ty, file: path.join(dir, `${tx}_${ty}.jpg`) });
    let done = 0;
    const workers = Array.from({ length: 6 }, async () => {
        while (jobs.length) {
            const j = jobs.shift();
            if (!existsSync(j.file)) {
                const res = await fetch(`${OFFICIAL}/7/${j.tx}/${j.ty}.jpg`);
                if (!res.ok) throw new Error(`z7 ${j.tx}/${j.ty}: HTTP ${res.status}`);
                writeFileSync(`${j.file}.tmp`, Buffer.from(await res.arrayBuffer()));
                renameSync(`${j.file}.tmp`, j.file);
                await new Promise(r => setTimeout(r, 100));
            }
            if (++done % 50 === 0) console.log(`  ${plan.key}: ${done} z7 tiles`);
        }
    });
    await Promise.all(workers);
    return dir;
}

async function stitch(plan, dir) {
    const file = path.join(WORK, 'stitched', `${plan.key}.png`);
    mkdirSync(path.dirname(file), { recursive: true });
    if (existsSync(file)) return file;
    const composites = [];
    for (let ty = plan.z7y.min; ty <= plan.z7y.max; ty++)
        for (let tx = plan.z7x.min; tx <= plan.z7x.max; tx++)
            composites.push({ input: path.join(dir, `${tx}_${ty}.jpg`), left: (tx - plan.z7x.min) * TILE, top: (ty - plan.z7y.min) * TILE });
    // Temp + rename so an interrupted run can't leave a partial file that a
    // resume treats as complete (applies to every writer in this script).
    await sharp({ create: { width: plan.cols * TILE, height: plan.rows * TILE, channels: 3, background: '#000' }, limitInputPixels: false })
        .composite(composites).png().toFile(`${file}.tmp`);
    renameSync(`${file}.tmp`, file);
    return file;
}

function upscale2x(src, dst) {
    if (existsSync(dst)) return dst;
    mkdirSync(path.dirname(dst), { recursive: true });
    console.log(`  upscaling ${src} → ${dst} (this can take a while)`);
    // .tmp.png (not .png.tmp): the binary infers output format from extension.
    execFileSync(BINARY, ['-i', src, '-o', `${dst}.tmp.png`, '-s', '2', '-n', MODEL], { stdio: 'inherit' });
    renameSync(`${dst}.tmp.png`, dst);
    return dst;
}

async function slice(plan, image, zoom, unitPx) {
    // unitPx: image px per continent unit (2 for the 2× image, 4 for 4×).
    // One horizontal band per tile row — a single decode of the big image
    // per row instead of one per tile (the 4× image is ~13k×13k px).
    const span = 256 / (2 ** (zoom - 7));           // continent units per tile
    const originX = plan.z7x.min * 256, originY = plan.z7y.min * 256;
    const zx = zoom === 8 ? plan.z8x : plan.z9x;
    const zy = zoom === 8 ? plan.z8y : plan.z9y;
    for (let ty = zy.min; ty <= zy.max; ty++) {
        const { data, info } = await sharp(image, { limitInputPixels: false })
            .extract({ left: 0, top: (ty * span - originY) * unitPx, width: plan.cols * TILE * unitPx, height: TILE })
            .raw().toBuffer({ resolveWithObject: true });
        for (let tx = zx.min; tx <= zx.max; tx++) {
            const dir = path.join(OUT, '2', '3', String(zoom), String(tx));
            mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `${ty}.jpg`);
            if (existsSync(file)) continue;
            await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
                .extract({ left: (tx * span - originX) * unitPx, top: 0, width: TILE, height: TILE })
                .jpeg({ quality: JPEG_QUALITY }).toFile(`${file}.tmp`);
            renameSync(`${file}.tmp`, file);
        }
        const row = ty - zy.min + 1;
        if (row % 8 === 0) console.log(`  ${plan.key} z${zoom}: row ${row}/${zy.max - zy.min + 1}`);
    }
}

const plans = targets.map(planRegion);
for (const p of plans) console.log(`${p.key}: z7 ${p.counts.z7} downloads → z8 ${p.counts.z8} tiles${flag('--skip-z9') ? '' : ` + z9 ${p.counts.z9} tiles`}`);
if (flag('--dry-run')) process.exit(0);

let binaryOk = true;
try { execFileSync(BINARY, ['-h'], { stdio: 'ignore' }); } catch (e) {
    // The ncnn binary prints usage and exits non-zero on -h; a numeric
    // status means it ran. Only a spawn failure (ENOENT etc.) means missing.
    binaryOk = typeof e.status === 'number';
}
if (!binaryOk && !flag('--skip-upscale')) {
    console.error(`Cannot run '${BINARY}'. Install realesrgan-ncnn-vulkan from`);
    console.error('https://github.com/xinntao/Real-ESRGAN/releases and put it on PATH (or pass --binary).');
    process.exit(1);
}

for (const plan of plans) {
    console.log(`\n=== ${plan.key} ===`);
    const dir = await download(plan);
    const stitched = await stitch(plan, dir);
    if (flag('--skip-upscale')) continue;
    const up2 = upscale2x(stitched, path.join(WORK, 'up2', `${plan.key}.png`));
    await slice(plan, up2, 8, 2);
    if (!flag('--skip-z9')) {
        const up4 = upscale2x(up2, path.join(WORK, 'up4', `${plan.key}.png`));
        await slice(plan, up4, 9, 4);
    }
}
if (!flag('--skip-upscale')) {
    writeFileSync(path.join(OUT, '.nojekyll'), '');
    writeFileSync(path.join(OUT, 'README.md'),
        '# AxiBridge hi-res WvW map tiles\n\nAI-upscaled (Real-ESRGAN) derivatives of Guild Wars 2 map tiles for the AxiBridge fight replay. Non-commercial fan content under the ArenaNet Content Terms of Use. © ArenaNet / NCSOFT.\n');
}
console.log('\ndone');
