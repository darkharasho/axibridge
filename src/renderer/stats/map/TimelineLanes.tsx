import React, { useCallback, useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import { SERIES_INTERVAL_MS } from '@axiapps/bridge-metrics/nativeSeries';
import type { ReplayFightPayload } from './replayTypes';

const GUTTER_PX = 92;

/**
 * The two mirrored measures, each drawn as an outgoing lane above its zero
 * line and an incoming lane below it. `zeroY` is the shared baseline the
 * `subLane` calls below hang off, so these must stay in step with the y
 * offsets passed there.
 */
const LANE_LABELS = [
    { id: 'cc', label: 'CC', color: '#f59e0b', zeroY: 14, outKey: 'ccLane', inKey: 'ccInLane' },
    { id: 'strip', label: 'Strips', color: '#e879f9', zeroY: 38, outKey: 'stripLane', inKey: 'stripInLane' },
] as const;

/**
 * The lane-name gutter, split out of `TimelineLanes` so `TransportBar` can
 * place it in its own grid cell (row 2, column 1 — the same column the
 * play/speed/clock cluster occupies in row 1), leaving the plotting `<svg>`
 * free to fill column 2 exactly like `SyncedTimeline` above it. Sharing that
 * column is what keeps the two timelines' 1000-unit x-axes aligned.
 */
export const TimelineLaneGutter: React.FC = () => {
    const layersState = useStatsStore(state => state.replayLayers);
    return (
        <div style={{ width: GUTTER_PX, flexShrink: 0, position: 'relative', height: '100%' }}>
            {LANE_LABELS.map(lane => (
                (layersState[lane.outKey] || layersState[lane.inKey]) && (
                    <span
                        key={lane.id}
                        data-testid={`${lane.id}-lane-label`}
                        title="Each lane is scaled to its own peak, so bar heights are not comparable across the zero line."
                        style={{
                            position: 'absolute', left: 2,
                            top: `${(lane.zeroY / 52) * 100}%`, transform: 'translateY(-50%)',
                            fontSize: 9, fontWeight: 600, color: lane.color, whiteSpace: 'nowrap',
                        }}
                    >
                        {`${lane.label} ▲out ▼in`}
                    </span>
                )
            ))}
        </div>
    );
};

export interface TimelineLanesProps {
    fight: ReplayFightPayload;
    /**
     * Suppresses the internal label gutter so the `<svg>` can fill its grid
     * cell exactly — `TransportBar` renders `TimelineLaneGutter` separately
     * in that case. Defaults to false so existing standalone usage (and its
     * tests) keeps drawing its own gutter, matching the pre-grid layout.
     */
    hideGutter?: boolean;
}

export const TimelineLanes: React.FC<TimelineLanesProps> = ({ fight, hideGutter = false }) => {
    const timeMs = useStatsStore(state => state.replayPlayhead.timeMs);
    const layersState = useStatsStore(state => state.replayLayers);

    /**
     * CC and strips get their own normalized sub-lanes rather than sharing the
     * DPS y-axis: squad DPS runs in the hundreds of thousands and CC counts in
     * single digits, so a shared axis flattens the counts onto the baseline.
     */
    const subLane = useCallback((samples: number[] | null, top: number, height: number, invert = false) => {
        if (!samples || samples.length === 0 || fight.durationMs <= 0) return '';
        const max = Math.max(1, ...samples);
        // These are native squad series stamped at SERIES_INTERVAL_MS (1s)
        // per sample; `samples.length * SERIES_INTERVAL_MS` does not always
        // equal `fight.durationMs` exactly. Positioning by
        // `timeMs / fight.durationMs`, like the scrubber does, keeps this
        // lane aligned instead of drifting by `index / samples.length`.
        const stepPx = (SERIES_INTERVAL_MS / fight.durationMs) * 1000;
        // `invert` hangs the bars downward from `top` instead of standing them
        // up from the baseline. The max is per-lane on purpose: incoming CC
        // counts every source and folds no pets, so a shared scale would
        // flatten the outgoing lane against a much taller incoming one.
        const baseline = invert ? top : top + height;
        const reach = (v: number) => (invert ? baseline + (v / max) * height : baseline - (v / max) * height);
        return samples
            .map((v, i) => `M ${(i * stepPx).toFixed(1)},${baseline} V ${reach(v).toFixed(1)}`)
            .join(' ');
    }, [fight.durationMs]);

    const ccPath = useMemo(() => subLane(fight.ccSamples, 4, 10), [subLane, fight.ccSamples]);
    const ccInPath = useMemo(() => subLane(fight.ccInSamples, 14, 10, true), [subLane, fight.ccInSamples]);
    const stripPath = useMemo(() => subLane(fight.stripSamples, 28, 10), [subLane, fight.stripSamples]);
    const stripInPath = useMemo(() => subLane(fight.stripInSamples, 38, 10, true), [subLane, fight.stripInSamples]);

    // Same x derivation as SyncedTimeline's scrubber playhead — timeMs /
    // durationMs, not index / samples.length — so a line drawn here lands at
    // the identical x as the one above it in the grid's shared column.
    const playheadX = fight.durationMs > 0 ? (timeMs / fight.durationMs) * 1000 : 0;

    return (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, height: '100%' }}>
            {/* Gutter, outside the plotting area. The old in-SVG label plate
                sat on top of the bars and hid the fight's opening seconds.
                Omitted when `hideGutter` — TransportBar renders it separately
                so the svg below can fill its grid cell exactly. */}
            {!hideGutter && <TimelineLaneGutter />}
            <svg
                data-testid="timeline-lanes"
                viewBox="0 0 1000 52"
                preserveAspectRatio="none"
                style={{ flex: 1, width: '100%', height: 52, display: 'block', background: 'rgba(8,12,26,0.6)', borderRadius: 6 }}
            >
                {layersState.ccLane && (
                    fight.ccSamples?.length ? (
                        ccPath && (
                            <g data-testid="cc-lane">
                                <path d={ccPath} stroke="#f59e0b" strokeWidth={2} fill="none" opacity={0.85} />
                            </g>
                        )
                    ) : (
                        // `null` (or a degenerate empty lane) means "never
                        // captured" — log predates axilog 1.8.0, or was parsed
                        // without raw timeline arrays. Pixel-identical to a
                        // genuinely all-zero series otherwise. A dashed
                        // baseline keeps the two states distinct.
                        <g data-testid="cc-lane-not-recorded">
                            <line x1={0} x2={1000} y1={9} y2={9} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.35} />
                            <text x={6} y={7} fontSize={7} fill="#f59e0b" opacity={0.6}>not recorded</text>
                        </g>
                    )
                )}
                {layersState.ccInLane && (
                    fight.ccInSamples?.length ? (
                        ccInPath && (
                            <g data-testid="cc-in-lane">
                                <path d={ccInPath} stroke="#f59e0b" strokeWidth={2} fill="none" opacity={0.45} />
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
                            <line x1={0} x2={1000} y1={19} y2={19} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.2} />
                            <text x={6} y={23} fontSize={7} fill="#f59e0b" opacity={0.45}>not recorded</text>
                        </g>
                    )
                )}
                {layersState.stripLane && (
                    fight.stripSamples?.length ? (
                        stripPath && (
                            <g data-testid="strip-lane">
                                <path d={stripPath} stroke="#e879f9" strokeWidth={2} fill="none" opacity={0.85} />
                            </g>
                        )
                    ) : (
                        <g data-testid="strip-lane-not-recorded">
                            <line x1={0} x2={1000} y1={33} y2={33} stroke="#e879f9" strokeWidth={1} strokeDasharray="4 3" opacity={0.35} />
                            <text x={6} y={31} fontSize={7} fill="#e879f9" opacity={0.6}>not recorded</text>
                        </g>
                    )
                )}
                {layersState.stripInLane && (
                    fight.stripInSamples?.length ? (
                        stripInPath && (
                            <g data-testid="strip-in-lane">
                                <path d={stripInPath} stroke="#e879f9" strokeWidth={2} fill="none" opacity={0.45} />
                            </g>
                        )
                    ) : (
                        <g data-testid="strip-in-lane-not-recorded">
                            <line x1={0} x2={1000} y1={43} y2={43} stroke="#e879f9" strokeWidth={1} strokeDasharray="4 3" opacity={0.2} />
                            <text x={6} y={47} fontSize={7} fill="#e879f9" opacity={0.45}>not recorded</text>
                        </g>
                    )
                )}
                {LANE_LABELS.map(lane => (
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
                <line data-testid="lanes-playhead"
                      x1={playheadX} x2={playheadX} y1={0} y2={52}
                      stroke="#fbbf24" strokeWidth={1.5} />
            </svg>
        </div>
    );
};

export default TimelineLanes;
