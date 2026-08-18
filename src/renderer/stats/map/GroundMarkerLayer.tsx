import React from 'react';
import type { GroundMarkerPlacement } from '../../../shared/movementData';

interface GroundMarkerLayerProps {
    markers: GroundMarkerPlacement[];
    timeMs: number;
    /** Viewport scale, so markers keep a constant on-screen size when zoomed. */
    scale: number;
}

/**
 * Ground-placed squad markers, drawn where the commander dropped them.
 *
 * Distinct from the overhead marker on a member: this one is pinned to the
 * terrain and does not move, so it is a map layer rather than something that
 * rides along with a player icon.
 *
 * Only markers live at `timeMs` are drawn. A marker's window is half-open —
 * `[startMs, endMs)` — and `endMs` is null for one never removed, which is a
 * real state rather than a missing value: a commander who drops a marker and
 * leaves it there produces exactly that.
 *
 * Placements are drawn under the member icons (the layer is mounted before
 * them) so a marker never hides the player standing on it — which, for a
 * rally marker, is precisely where everyone will be.
 */
export const GroundMarkerLayer: React.FC<GroundMarkerLayerProps> = ({ markers, timeMs, scale }) => {
    const live = markers.filter(m => timeMs >= m.startMs && (m.endMs == null || timeMs < m.endMs));
    if (live.length === 0) return null;

    return (
        <g className="ground-marker-layer">
            {live.map((m, i) => (
                // Counter-scaled like the member icons: without it the marker
                // grows with zoom and swamps the map.
                <g key={`${m.name}-${m.startMs}-${i}`} transform={`translate(${m.x} ${m.y}) scale(${1 / scale})`}>
                    {/* A soft disc under the art. The wiki PNGs are light line
                        drawings and vanish over pale terrain without it. */}
                    <circle cx={0} cy={0} r={11} fill="#0b0e13" opacity={0.55} />
                    {m.icon
                        ? <image href={m.icon} x={-9} y={-9} width={18} height={18} opacity={0.95}>
                            <title>{m.name}</title>
                        </image>
                        : <circle cx={0} cy={0} r={7} fill="none" stroke="#e6e8ec" strokeWidth={1.5} opacity={0.9} />}
                </g>
            ))}
        </g>
    );
};
