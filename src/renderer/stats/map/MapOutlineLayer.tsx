import { useMemo } from 'react';
import { parseOutlineSvg } from './mapOutlines';

interface MapOutlineLayerProps {
    /** Raw SVG markup of the map outline, or undefined when no outline exists for the map. */
    svg: string | undefined;
    mapWidth: number;
    mapHeight: number;
    /** Layer opacity over the tiles. Defaults to 0.7. */
    opacity?: number;
    /** Horizontal pixel offset to align the outline with calibrated tile positions. Defaults to 0. */
    offsetX?: number;
    /** Vertical pixel offset to align the outline with calibrated tile positions. Defaults to 0. */
    offsetY?: number;
}

/**
 * Crisp vector outline of terrain/structures, layered on top of the map tiles.
 *
 * The outline's vector paths are inlined directly into the parent SVG (not drawn
 * through an <image> data URI, which rasterizes and blurs when the replay is
 * zoomed). The outline is authored in its own reference space (its viewBox), so a
 * transform stretches it to the map's pixel space — equivalent to the old
 * preserveAspectRatio="none", but staying sharp at any zoom.
 *
 * offsetX/offsetY should match the pixelOffset applied by getMapTiles so the outline
 * stays aligned with the tile layer (non-zero on EBG, zero on borderlands).
 */
export function MapOutlineLayer({ svg, mapWidth, mapHeight, opacity = 0.7, offsetX = 0, offsetY = 0 }: MapOutlineLayerProps) {
    const parsed = useMemo(() => parseOutlineSvg(svg), [svg]);
    if (!parsed || !(mapWidth > 0) || !(mapHeight > 0)) return null;
    const scaleX = mapWidth / parsed.width;
    const scaleY = mapHeight / parsed.height;
    return (
        <g
            transform={`translate(${offsetX} ${offsetY}) scale(${scaleX} ${scaleY})`}
            opacity={opacity}
            dangerouslySetInnerHTML={{ __html: parsed.inner }}
        />
    );
}
