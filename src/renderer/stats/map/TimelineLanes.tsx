import React, { useCallback, useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import { SERIES_INTERVAL_MS } from '@axiapps/bridge-metrics/nativeSeries';
import type { ReplayFightPayload } from './replayTypes';

/** The overlay's own coordinate height, in px, matching `TIMELINE_HEIGHT_PX`. */
export const LANES_VIEW_H = 44;

/**
 * The two mirrored measures, each drawn as an outgoing lane above its zero
 * line and an incoming lane below it.
 *
 * `zeroY` and `reach` are in the overlay's 44-unit y space, which is 1:1 with
 * rendered pixels — the svg is exactly `LANES_VIEW_H` tall. They are chosen so
 * CC's incoming half and Strips' outgoing half cannot collide at full
 * deflection: CC occupies 4–26 and Strips 26–42.
 */
export const LANE_BANDS = [
    { id: 'cc', label: 'CC', color: '#f59e0b', zeroY: 15, reach: 11, outKey: 'ccLane', inKey: 'ccInLane' },
    { id: 'strip', label: 'Strips', color: '#e879f9', zeroY: 34, reach: 8, outKey: 'stripLane', inKey: 'stripInLane' },
] as const;

/**
 * The lane names, as HTML rather than svg `<text>`.
 *
 * The overlay svg is stretched horizontally (`preserveAspectRatio="none"` over
 * a 1000-unit box), which squashes any text drawn inside it. These sit in the
 * plot's own corners instead, out of the bars' way: CC deflects downward from
 * y=15 and Strips upward from y=34, so the top and bottom edges are the two
 * places nothing is ever drawn.
 */
export const TimelineLaneLabels: React.FC = () => {
    const layersState = useStatsStore(state => state.replayLayers);
    return (
        <>
            {LANE_BANDS.map((lane, i) => (
                (layersState[lane.outKey] || layersState[lane.inKey]) && (
                    <span
                        key={lane.id}
                        data-testid={`${lane.id}-lane-label`}
                        title="Outgoing above the line, incoming below. Each lane is scaled to its own peak, so bar heights are not comparable across the zero line."
                        style={{
                            position: 'absolute', left: 4, ...(i === 0 ? { top: 0 } : { bottom: 0 }),
                            fontSize: 8, fontWeight: 700, color: lane.color, letterSpacing: '.02em',
                            pointerEvents: 'none', textShadow: '0 0 3px #0b0f1a, 0 0 3px #0b0f1a',
                        }}
                    >
                        {lane.label}
                    </span>
                )
            ))}
        </>
    );
};

export interface TimelineLaneOverlayProps {
    fight: ReplayFightPayload;
}

/**
 * The CC and strip lanes, drawn *on top of* the scrubber rather than beneath
 * it.
 *
 * This used to be a second chart in a second grid row, which meant two
 * independently sized 1000-unit x-axes that could drift apart (they once did,
 * by ~190px) and a 92px label gutter whose width was subtracted from both.
 * Superimposing removes the whole class of problem: this svg is absolutely
 * positioned over `SyncedTimeline`'s, inset 0, with the identical
 * `viewBox` width and `preserveAspectRatio="none"`, so the two share one
 * horizontal axis by construction. There is nothing left to keep in sync.
 *
 * `pointerEvents: 'none'` is what makes it an overlay rather than an
 * obstruction — clicks and drags land on the scrubber underneath, so covering
 * the plot costs no scrub surface.
 */
export const TimelineLaneOverlay: React.FC<TimelineLaneOverlayProps> = ({ fight }) => {
    const timeMs = useStatsStore(state => state.replayPlayhead.timeMs);
    const layersState = useStatsStore(state => state.replayLayers);

    /**
     * CC and strips get their own normalized sub-lanes rather than sharing the
     * DPS y-axis: squad DPS runs in the hundreds of thousands and CC counts in
     * single digits, so a shared axis flattens the counts onto the baseline.
     */
    const subLane = useCallback((samples: number[] | null, zeroY: number, reach: number, invert = false) => {
        if (!samples || samples.length === 0 || fight.durationMs <= 0) return '';
        const max = Math.max(1, ...samples);
        // These are native squad series stamped at SERIES_INTERVAL_MS (1s)
        // per sample; `samples.length * SERIES_INTERVAL_MS` does not always
        // equal `fight.durationMs` exactly. Positioning by
        // `timeMs / fight.durationMs`, like the scrubber does, keeps this
        // lane aligned instead of drifting by `index / samples.length`.
        const stepPx = (SERIES_INTERVAL_MS / fight.durationMs) * 1000;
        // `invert` hangs the bars downward from the zero line instead of
        // standing them up from it. The max is per-lane on purpose: incoming
        // CC counts every source and folds no pets, so a shared scale would
        // flatten the outgoing lane against a much taller incoming one.
        const reachY = (v: number) => (invert ? zeroY + (v / max) * reach : zeroY - (v / max) * reach);
        return samples
            .map((v, i) => `M ${(i * stepPx).toFixed(1)},${zeroY} V ${reachY(v).toFixed(1)}`)
            .join(' ');
    }, [fight.durationMs]);

    const [cc, strip] = LANE_BANDS;
    const ccPath = useMemo(() => subLane(fight.ccSamples, cc.zeroY, cc.reach), [subLane, fight.ccSamples, cc]);
    const ccInPath = useMemo(() => subLane(fight.ccInSamples, cc.zeroY, cc.reach, true), [subLane, fight.ccInSamples, cc]);
    const stripPath = useMemo(() => subLane(fight.stripSamples, strip.zeroY, strip.reach), [subLane, fight.stripSamples, strip]);
    const stripInPath = useMemo(() => subLane(fight.stripInSamples, strip.zeroY, strip.reach, true), [subLane, fight.stripInSamples, strip]);

    // Same x derivation as SyncedTimeline's scrubber playhead — timeMs /
    // durationMs, not index / samples.length — so this line lands at the
    // identical x as the one in the svg underneath.
    const playheadX = fight.durationMs > 0 ? (timeMs / fight.durationMs) * 1000 : 0;

    return (
        <svg
            data-testid="timeline-lanes"
            viewBox={`0 0 1000 ${LANES_VIEW_H}`}
            preserveAspectRatio="none"
            style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                display: 'block', pointerEvents: 'none',
            }}
        >
            {LANE_BANDS.map(lane => (
                (layersState[lane.outKey] || layersState[lane.inKey]) && (
                    // The zero line the pair mirrors around. Without it the
                    // two half-height bar sets read as two unrelated lanes
                    // rather than one axis.
                    <line key={lane.id}
                          data-testid={`${lane.id}-zero-rule`}
                          x1={0} x2={1000} y1={lane.zeroY} y2={lane.zeroY}
                          stroke={lane.color} strokeWidth={0.5} opacity={0.3} />
                )
            ))}
            {layersState.ccLane && (
                fight.ccSamples?.length ? (
                    ccPath && (
                        <g data-testid="cc-lane">
                            <path d={ccPath} stroke={cc.color} strokeWidth={2} fill="none" opacity={0.85} />
                        </g>
                    )
                ) : (
                    // `null` (or a degenerate empty lane) means "never
                    // captured" — log predates axilog 1.8.0, or was parsed
                    // without raw timeline arrays. Pixel-identical to a
                    // genuinely all-zero series otherwise. A dashed
                    // baseline keeps the two states distinct.
                    <g data-testid="cc-lane-not-recorded">
                        <line x1={0} x2={1000} y1={cc.zeroY} y2={cc.zeroY} stroke={cc.color} strokeWidth={1} strokeDasharray="4 3" opacity={0.35} />
                        <text x={6} y={cc.zeroY - 2} fontSize={7} fill={cc.color} opacity={0.6}>not recorded</text>
                    </g>
                )
            )}
            {layersState.ccInLane && (
                fight.ccInSamples?.length ? (
                    ccInPath && (
                        <g data-testid="cc-in-lane">
                            <path d={ccInPath} stroke={cc.color} strokeWidth={2} fill="none" opacity={0.45} />
                        </g>
                    )
                ) : (
                    // Absent here means something narrower than for the
                    // outgoing lane above: axilog has no squad-level
                    // incoming series, so this is folded from `by_entity`,
                    // which needs raw timeline arrays AND axilog 1.9.0. A
                    // log can draw a full CC lane and nothing here, which
                    // is exactly why the two are gated apart.
                    <g data-testid="cc-in-lane-not-recorded">
                        <line x1={0} x2={1000} y1={cc.zeroY + 6} y2={cc.zeroY + 6} stroke={cc.color} strokeWidth={1} strokeDasharray="4 3" opacity={0.2} />
                    </g>
                )
            )}
            {layersState.stripLane && (
                fight.stripSamples?.length ? (
                    stripPath && (
                        <g data-testid="strip-lane">
                            <path d={stripPath} stroke={strip.color} strokeWidth={2} fill="none" opacity={0.85} />
                        </g>
                    )
                ) : (
                    <g data-testid="strip-lane-not-recorded">
                        <line x1={0} x2={1000} y1={strip.zeroY} y2={strip.zeroY} stroke={strip.color} strokeWidth={1} strokeDasharray="4 3" opacity={0.35} />
                        <text x={6} y={strip.zeroY - 2} fontSize={7} fill={strip.color} opacity={0.6}>not recorded</text>
                    </g>
                )
            )}
            {layersState.stripInLane && (
                fight.stripInSamples?.length ? (
                    stripInPath && (
                        <g data-testid="strip-in-lane">
                            <path d={stripInPath} stroke={strip.color} strokeWidth={2} fill="none" opacity={0.45} />
                        </g>
                    )
                ) : (
                    <g data-testid="strip-in-lane-not-recorded">
                        <line x1={0} x2={1000} y1={strip.zeroY + 5} y2={strip.zeroY + 5} stroke={strip.color} strokeWidth={1} strokeDasharray="4 3" opacity={0.2} />
                    </g>
                )
            )}
            <line data-testid="lanes-playhead"
                  x1={playheadX} x2={playheadX} y1={0} y2={LANES_VIEW_H}
                  stroke="#fbbf24" strokeWidth={1.5} />
        </svg>
    );
};

export default TimelineLaneOverlay;
