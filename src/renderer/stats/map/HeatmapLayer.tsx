import React, { useEffect, useRef } from 'react';
import type { HeatmapRaster } from './hooks/useHeatmapData';

interface HeatmapLayerProps {
    raster: HeatmapRaster | null;
    mapWidth: number;
    mapHeight: number;
    mode: 'off' | 'deaths' | 'time' | 'damage-taken';
}

/**
 * Topographic band palettes — each entry is [r, g, b, a] for that tier.
 * Bands are evenly spaced across the normalised [0,1] range; index 0 = lowest
 * density (transparent), last index = peak density.
 */
type Band = [number, number, number, number];

const BAND_PALETTES: Record<string, Band[]> = {
    deaths: [
        [  0,   0,   0,   0],   // empty — transparent
        [ 90,   0,  10, 110],   // tier 1
        [180,  20,  20, 150],   // tier 2
        [230,  70,   0, 180],   // tier 3
        [255, 160,  10, 210],   // tier 4
        [255, 230,  60, 235],   // tier 5 — peak
    ],
    time: [
        [  0,   0,   0,   0],
        [  0,  40, 130, 110],
        [  0, 140, 190, 150],
        [ 20, 210, 210, 180],
        [120, 240, 240, 210],
        [220, 255, 255, 235],
    ],
    'damage-taken': [
        [  0,   0,   0,   0],
        [ 60,   0, 110, 110],
        [170,  20, 170, 150],
        [230,  80,  10, 180],
        [255, 180,  20, 210],
        [255, 240, 100, 235],
    ],
};

/** Snap t ∈ [0,1] to the nearest band index and return its RGBA. */
function sampleBand(bands: Band[], t: number): Band {
    if (t <= 0) return bands[0];
    const idx = Math.min(bands.length - 1, Math.floor(t * (bands.length - 1) + 0.5));
    return bands[idx];
}

export const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ raster, mapWidth, mapHeight, mode }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (!raster) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        const [gw, gh] = raster.size;
        canvas.width = gw;
        canvas.height = gh;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const img = ctx.createImageData(gw, gh);
        const bands = BAND_PALETTES[mode] ?? BAND_PALETTES['deaths'];
        const max = raster.max || 1;
        for (let i = 0; i < raster.buffer.length; i++) {
            // Cube-root curve: pulls low-density areas into visible tiers faster than sqrt.
            const t = Math.cbrt(raster.buffer[i] / max);
            const [r, g, b, a] = sampleBand(bands, t);
            const offset = i * 4;
            img.data[offset]     = r;
            img.data[offset + 1] = g;
            img.data[offset + 2] = b;
            img.data[offset + 3] = a;
        }
        ctx.putImageData(img, 0, 0);
    }, [raster, mode]);

    if (!raster) return null;

    return (
        <foreignObject x={0} y={0} width={mapWidth} height={mapHeight}>
            <canvas
                ref={canvasRef}
                style={{
                    width: `${mapWidth}px`,
                    height: `${mapHeight}px`,
                    imageRendering: 'auto',
                    // Small blur softens the hard band edges without creating a glow halo.
                    filter: 'blur(3px)',
                    mixBlendMode: 'normal',
                    pointerEvents: 'none',
                }}
            />
        </foreignObject>
    );
};

export default HeatmapLayer;
