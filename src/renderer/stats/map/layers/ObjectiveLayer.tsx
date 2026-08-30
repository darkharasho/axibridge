import React, { useMemo } from 'react';
import { WVW_LANDMARKS, type WvwMap } from '../../../../shared/wvwLandmarks';
import { sectorIdAt } from '../../../../shared/sectorLookup';
import { OWNER_COLORS } from '../SectorOutlineLayer';
import { objectiveTier } from '../objectiveTiers';
import type { WvwOwner } from '../../../../shared/wvwSectors';

export interface ObjectiveLayerProps {
    mapKey: WvwMap | null;
    sectorOwners?: Record<number, WvwOwner> | null;
}

export const ObjectiveLayer: React.FC<ObjectiveLayerProps> = ({ mapKey, sectorOwners }) => {
    // Owner of each landmark's containing sector — tints the marker and label
    // like the in-game map. Empty when ownership is unknown.
    const owners = useMemo(() => {
        const out: Record<string, Exclude<WvwOwner, 'Neutral'>> = {};
        if (!mapKey || !sectorOwners) return out;
        for (const lm of WVW_LANDMARKS[mapKey] ?? []) {
            const sectorId = sectorIdAt(mapKey, lm.x, lm.y);
            const owner = sectorId !== undefined ? sectorOwners[sectorId] : undefined;
            if (owner && owner !== 'Neutral') out[lm.name] = owner;
        }
        return out;
    }, [mapKey, sectorOwners]);

    if (!mapKey) return null;

    return (
        <>
            {(WVW_LANDMARKS[mapKey] ?? []).map(lm => {
                const owner = owners[lm.name];
                const ownerColor = owner ? OWNER_COLORS[owner] : null;
                const tier = objectiveTier(lm.name);
                const r = tier === 'major' ? 5 : 3.5;
                return (
                    <g key={lm.name} data-objective data-tier={tier} opacity={ownerColor ? 0.85 : 0.55}>
                        <circle cx={lm.x} cy={lm.y} r={r}
                                fill={ownerColor ?? 'rgba(15,23,42,0.7)'}
                                stroke="rgba(255,255,255,0.55)" strokeWidth={0.8} />
                        {/* No paint-order stroke: a black-outlined white label
                            was the loudest element on the map. Occlusion by the
                            squad at fight zoom is the correct trade. */}
                        <text x={lm.x + r + 3} y={lm.y + 3}
                              fontSize={9} letterSpacing="0.06em"
                              fill={ownerColor ?? 'rgba(203,213,225,0.75)'}
                              opacity={tier === 'major' ? 0.9 : 0.6}>
                            {lm.name}
                        </text>
                    </g>
                );
            })}
        </>
    );
};

export default ObjectiveLayer;
