import React, { useId, useMemo } from 'react';
import { WvwMap } from '../../../shared/wvwLandmarks';
import { WVW_SECTORS, WVW_SECTOR_REF_SIZE, type WvwOwner } from '../../../shared/wvwSectors';

const OWNER_COLORS: Record<Exclude<WvwOwner, 'Neutral'>, string> = {
    Red: '#ef4444',
    Blue: '#3b82f6',
    Green: '#22c55e',
};
const NEUTRAL_COLOR = 'rgba(148,163,184,0.55)';

interface SectorOutlineLayerProps {
    mapKey: WvwMap;
    mapWidth: number;
    mapHeight: number;
    scale: number;
    sectorOwners?: Record<number, WvwOwner> | null;
}

/**
 * Team-coloured sector outlines. Each sector's stroke is clipped to its own
 * polygon interior (inner-aligned), so along a shared border both owners'
 * colours render side by side — every sector reads as a complete closed loop.
 */
export const SectorOutlineLayer: React.FC<SectorOutlineLayerProps> = ({ mapKey, mapWidth, mapHeight, scale, sectorOwners }) => {
    const clipPrefix = useId();
    const sectors = WVW_SECTORS[mapKey];
    const [refW, refH] = WVW_SECTOR_REF_SIZE[mapKey] ?? [mapWidth, mapHeight];

    const scaled = useMemo(() => {
        if (!sectors?.length) return [];
        const sx = mapWidth / refW;
        const sy = mapHeight / refH;
        return sectors.map(sec => ({
            id: sec.id,
            points: sec.bounds.map(([x, y]) => `${(x * sx).toFixed(1)},${(y * sy).toFixed(1)}`).join(' '),
        }));
    }, [sectors, mapWidth, mapHeight, refW, refH]);

    if (!scaled.length) return null;

    // 2× the target width, clipped to the interior → ~2 screen px inner-aligned.
    const strokeWidth = 4 / scale;

    return (
        <g>
            <defs>
                {scaled.map(sec => (
                    <clipPath key={sec.id} id={`${clipPrefix}-sec-${sec.id}`}>
                        <polygon points={sec.points} />
                    </clipPath>
                ))}
            </defs>
            {scaled.map(sec => {
                const owner = sectorOwners?.[sec.id];
                const color = owner && owner !== 'Neutral' ? OWNER_COLORS[owner] : NEUTRAL_COLOR;
                return (
                    <polygon
                        key={sec.id}
                        data-sector-id={sec.id}
                        points={sec.points}
                        fill="none"
                        stroke={color}
                        strokeOpacity={0.9}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                        clipPath={`url(#${clipPrefix}-sec-${sec.id})`}
                    />
                );
            })}
        </g>
    );
};

export default SectorOutlineLayer;
