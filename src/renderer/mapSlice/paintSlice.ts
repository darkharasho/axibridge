import type { SliceDrawList } from '../../shared/sliceGeometry';

const BEACON_RINGS = [
    { radius: 26, alpha: 0.14 },
    { radius: 18, alpha: 0.22 },
    { radius: 11, alpha: 0.32 },
];
const BEACON_CORE_RADIUS = 5.5;
const BEACON_RED = '#ff3b3b';
const TRAIL_WIDTH = 3.5;
const END_MARKER_RADIUS = 5;
const CAPTION_FONT = '600 20px "Segoe UI", system-ui, sans-serif';
const CAPTION_MARGIN = 14;

/** Decode a `data:` URL into an image. Rejects anything else — a remote URL
 *  would taint the canvas and make `toBlob` throw. */
const loadDataUrl = (url: string): Promise<HTMLImageElement | null> =>
    new Promise((resolve) => {
        if (!url.startsWith('data:')) {
            resolve(null);
            return;
        }
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });

/**
 * Paint a draw list and return PNG bytes, or `null` if painting is impossible.
 *
 * This function knows nothing about maps, projections, or the network: main
 * resolved all of that into `drawList`. It only puts pixels down.
 */
export async function paintSlice(drawList: SliceDrawList): Promise<Uint8Array | null> {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = drawList.width;
        canvas.height = drawList.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Tiles, loaded in parallel and drawn in list order.
        const images = await Promise.all(drawList.tiles.map(t => loadDataUrl(t.url)));
        images.forEach((img, i) => {
            if (!img) return;
            const t = drawList.tiles[i];
            ctx.drawImage(img, t.x, t.y, t.width, t.height);
        });

        drawTrail(ctx, drawList.path);
        if (drawList.path.length > 1) drawEndMarker(ctx, drawList.path[drawList.path.length - 1]);
        if (drawList.path.length > 0) drawBeacon(ctx, drawList.path[0]);
        if (drawList.caption) drawCaption(ctx, drawList.caption, canvas.height);

        return await canvasToPng(canvas);
    } catch {
        return null;
    }
}

/** The squad's route, fading out as it gets further from the beacon. */
function drawTrail(ctx: CanvasRenderingContext2D, path: Array<[number, number]>): void {
    if (path.length < 2) return;
    ctx.save();
    ctx.lineWidth = TRAIL_WIDTH;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    for (let i = 1; i < path.length; i++) {
        // Per-segment alpha rather than one gradient: the path doubles back on
        // itself, so a positional gradient would not track progress along it.
        ctx.globalAlpha = 1 - (i / path.length) * 0.8;
        ctx.strokeStyle = BEACON_RED;
        ctx.beginPath();
        ctx.moveTo(path[i - 1][0], path[i - 1][1]);
        ctx.lineTo(path[i][0], path[i][1]);
        ctx.stroke();
    }
    ctx.restore();
}

/** Layered rings, a glow, and a white-ringed core — readable at Discord's width. */
function drawBeacon(ctx: CanvasRenderingContext2D, [x, y]: [number, number]): void {
    ctx.save();
    for (const ring of BEACON_RINGS) {
        ctx.globalAlpha = ring.alpha;
        ctx.fillStyle = BEACON_RED;
        ctx.beginPath();
        ctx.arc(x, y, ring.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = BEACON_RED;
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, BEACON_CORE_RADIUS + 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = BEACON_RED;
    ctx.beginPath();
    ctx.arc(x, y, BEACON_CORE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawEndMarker(ctx: CanvasRenderingContext2D, [x, y]: [number, number]): void {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(x, y, END_MARKER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, canvasHeight: number): void {
    ctx.save();
    ctx.font = CAPTION_FONT;
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, CAPTION_MARGIN, canvasHeight - CAPTION_MARGIN);
    ctx.restore();
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                resolve(null);
                return;
            }
            blob.arrayBuffer()
                .then(buf => resolve(new Uint8Array(buf)))
                .catch(() => resolve(null));
        }, 'image/png');
    });
}
