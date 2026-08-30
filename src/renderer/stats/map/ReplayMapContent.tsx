// src/renderer/stats/map/ReplayMapContent.tsx
import React from 'react';
import { HeatmapLayer } from './HeatmapLayer';
import { GroundMarkerLayer } from './GroundMarkerLayer';
import { SectorOutlineLayer } from './SectorOutlineLayer';
import { ObjectiveLayer } from './layers/ObjectiveLayer';
import { SquadOverlay } from './SquadOverlay';
import { EventOverlay } from './EventOverlay';
import { MemberLayer } from './layers/MemberLayer';
import type { ReplayFightPayload } from './replayTypes';
import type { StatsStoreState } from '../statsStore';
import type { HeatmapRaster } from './hooks/useHeatmapData';
import type { MemberHoverInfo } from './layers/MemberLayer';

export interface ReplayMapContentProps {
    fight: ReplayFightPayload;
    layers: StatsStoreState['replayLayers'];
    heatmap: HeatmapRaster | null;
    mapWidth: number;
    mapHeight: number;
    scale: number;
    pollFrac: number;
    pollIndex: number;
    timeMs: number;
    spotlightParty: number | null;
    followKey: string | null;
    onHover: (info: MemberHoverInfo) => void;
    onLeave: () => void;
}

/**
 * Everything drawn inside the pan/zoom group, split out and memoised.
 *
 * Panning writes `tx`/`ty` to the store on every mouse event, but the pan is
 * applied entirely by the enclosing `<g transform>` — not one layer in here
 * reads `tx` or `ty`. Left inline in ReplayView these all re-rendered on every
 * pan step anyway (~2.8ms of React at 50v50, against a ~8ms frame budget),
 * which is what made a fullscreen drag stutter. Taking `tx`/`ty` off the prop
 * list is what makes the memo hold: a pan changes nothing here, a zoom changes
 * `scale` and it re-renders as it should.
 *
 * Tiles stay in ReplayView on purpose — they cull against the visible rect, so
 * they are the one part of the map that genuinely depends on the pan.
 */
const ReplayMapContentInner: React.FC<ReplayMapContentProps> = ({
    fight, layers, heatmap, mapWidth, mapHeight, scale,
    pollFrac, pollIndex, timeMs, spotlightParty, followKey, onHover, onLeave,
}) => (
    <>
        {layers.zoneBorders && fight.mapKey && (
            <SectorOutlineLayer
                mapKey={fight.mapKey}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                scale={scale}
                sectorOwners={fight.sectorOwners}
            />
        )}
        <HeatmapLayer raster={heatmap} mapWidth={mapWidth} mapHeight={mapHeight} mode={layers.heatmap} />
        {/* Under the member icons on purpose — a rally marker is exactly
            where everyone will be standing. */}
        <GroundMarkerLayer
            markers={fight.movementData.groundMarkers}
            timeMs={timeMs}
            scale={scale}
        />
        <ObjectiveLayer mapKey={fight.mapKey} sectorOwners={fight.sectorOwners} />
        <MemberLayer
            members={fight.movementData.members}
            pollFrac={pollFrac}
            pollIndex={pollIndex}
            timeMs={timeMs}
            scale={scale}
            spotlightParty={spotlightParty}
            followKey={followKey}
            onHover={onHover}
            onLeave={onLeave}
        />
        <SquadOverlay fight={fight} timeMs={timeMs} scale={scale} />
        <EventOverlay fight={fight} timeMs={timeMs} scale={scale} />
    </>
);

export const ReplayMapContent = React.memo(ReplayMapContentInner);
ReplayMapContent.displayName = 'ReplayMapContent';

export default ReplayMapContent;
