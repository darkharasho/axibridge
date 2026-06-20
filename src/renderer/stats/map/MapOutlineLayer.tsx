interface MapOutlineLayerProps {
    /** Base64 SVG data URI of the map outline, or undefined when no outline exists for the map. */
    outlineUrl: string | undefined;
    mapWidth: number;
    mapHeight: number;
    /** Layer opacity over the tiles. Defaults to 0.7. */
    opacity?: number;
}

/**
 * Crisp vector outline of terrain/structures, layered on top of the map tiles.
 * Authored in the map's reference pixel space, so it scales 1:1 with the tiles via
 * the parent transform group — no projection math here.
 */
export function MapOutlineLayer({ outlineUrl, mapWidth, mapHeight, opacity = 0.7 }: MapOutlineLayerProps) {
    if (!outlineUrl) return null;
    return (
        <image
            href={outlineUrl}
            x={0}
            y={0}
            width={mapWidth}
            height={mapHeight}
            preserveAspectRatio="none"
            opacity={opacity}
        />
    );
}
