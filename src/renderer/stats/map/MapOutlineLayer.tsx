interface MapOutlineLayerProps {
    /** Base64 SVG data URI of the map outline, or undefined when no outline exists for the map. */
    outlineUrl: string | undefined;
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
 * Authored in the map's reference pixel space, so it scales 1:1 with the tiles via
 * the parent transform group — no projection math here.
 *
 * offsetX/offsetY should match the pixelOffset applied by getMapTiles so the outline
 * stays aligned with the tile layer (non-zero on EBG, zero on borderlands).
 */
export function MapOutlineLayer({ outlineUrl, mapWidth, mapHeight, opacity = 0.7, offsetX = 0, offsetY = 0 }: MapOutlineLayerProps) {
    if (!outlineUrl) return null;
    return (
        <image
            href={outlineUrl}
            x={offsetX}
            y={offsetY}
            width={mapWidth}
            height={mapHeight}
            preserveAspectRatio="none"
            opacity={opacity}
        />
    );
}
