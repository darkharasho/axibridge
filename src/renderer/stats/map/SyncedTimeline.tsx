import React, { useCallback, useMemo, useRef } from 'react';
import { useStatsStore } from '../statsStore';
import { formatDuration } from '../../../shared/mapUtils';
import { useSquadDerived } from './hooks/useSquadDerived';
import type { ReplayFightPayload } from './replayTypes';
import { SERIES_INTERVAL_MS } from '@axiapps/bridge-metrics/nativeSeries';

/**
 * The two mirrored measures, each drawn as an outgoing lane above its zero
 * line and an incoming lane below it. `zeroY` is the shared baseline the
 * `subLane` calls below hang off, so these must stay in step with the y
 * offsets passed there.
 */
const LANE_LABELS = [
    { id: 'cc', label: 'CC', color: '#f59e0b', zeroY: 114, outKey: 'ccLane', inKey: 'ccInLane' },
    { id: 'strip', label: 'Strips', color: '#e879f9', zeroY: 142, outKey: 'stripLane', inKey: 'stripInLane' },
] as const;

interface SyncedTimelineProps {
    fight: ReplayFightPayload;
}

export const SyncedTimeline: React.FC<SyncedTimelineProps> = ({ fight }) => {
    const timeMs = useStatsStore(state => state.replayPlayhead.timeMs);
    const setReplayPlayhead = useStatsStore(state => state.setReplayPlayhead);
    const layersState = useStatsStore(state => state.replayLayers);
    const derived = useSquadDerived(fight);
    const svgRef = useRef<SVGSVGElement | null>(null);

    const phaseColor: Record<string, string> = {
        opening: '#60a5fa',
        push: '#22c55e',
        retreat: '#ef4444',
        cleanup: '#a78bfa',
    };

    const phaseDesc: Record<string, string> = {
        opening: 'First ~10 s of the fight — no deaths yet',
        push: 'Squad advancing with no recent deaths',
        retreat: 'Squad taking deaths',
        cleanup: 'Squad stationary / mopping up',
    };

    const { pathData, maxDps } = useMemo(() => {
        if (!fight.dpsSamples.length || fight.durationMs <= 0) {
            return { pathData: '', maxDps: 0 };
        }
        const max = Math.max(1, ...fight.dpsSamples.map(s => s.squadDps));
        const points = fight.dpsSamples
            .map(s => {
                const x = (s.timeMs / fight.durationMs) * 1000;
                const y = 100 - (s.squadDps / max) * 80;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' L ');
        return { pathData: `M 0,100 L ${points} L 1000,100 Z`, maxDps: max };
    }, [fight.dpsSamples, fight.durationMs]);

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
        // `timeMs / fight.durationMs`, like the DPS area, kill marks and
        // playhead do, keeps this lane aligned with the rest of the SVG
        // instead of drifting by `index / samples.length`.
        const stepPx = (SERIES_INTERVAL_MS / fight.durationMs) * 1000;
        // `invert` hangs the bars downward from `top` instead of standing them
        // up from the baseline. Each measure draws its outgoing lane upward and
        // its incoming lane downward around one shared zero line, so the pair
        // reads as one mirrored axis. The max is per-lane on purpose: incoming
        // CC counts every source and folds no pets, so a shared scale would
        // flatten the outgoing lane against a much taller incoming one.
        const baseline = invert ? top : top + height;
        const reach = (v: number) => (invert ? baseline + (v / max) * height : baseline - (v / max) * height);
        return samples
            .map((v, i) => `M ${(i * stepPx).toFixed(1)},${baseline} V ${reach(v).toFixed(1)}`)
            .join(' ');
    }, [fight.durationMs]);

    const ccPath = useMemo(() => subLane(fight.ccSamples, 104, 10), [subLane, fight.ccSamples]);
    const ccInPath = useMemo(() => subLane(fight.ccInSamples, 114, 10, true), [subLane, fight.ccInSamples]);
    const stripPath = useMemo(() => subLane(fight.stripSamples, 132, 10), [subLane, fight.stripSamples]);
    const stripInPath = useMemo(() => subLane(fight.stripInSamples, 142, 10, true), [subLane, fight.stripInSamples]);

    const allyKillMarks = fight.killEvents.filter(e => e.isAlly);
    const enemyKillMarks = fight.killEvents.filter(e => !e.isAlly);

    const scrubFromEvent = useCallback((e: React.MouseEvent<SVGElement>) => {
        const svg = svgRef.current;
        if (!svg || fight.durationMs <= 0) return;
        const rect = svg.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setReplayPlayhead({ timeMs: frac * fight.durationMs });
    }, [fight.durationMs, setReplayPlayhead]);

    const [dragging, setDragging] = React.useState(false);
    const onMouseMove = (e: React.MouseEvent<SVGElement>) => { if (dragging) scrubFromEvent(e); };

    const playheadX = fight.durationMs > 0 ? (timeMs / fight.durationMs) * 1000 : 0;

    return (
        <div className="replay-timeline-wrap" style={{ padding: '0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.8, padding: '4px 0' }}>
                <span>Squad DPS (peak {maxDps.toLocaleString()})</span>
                <span>{formatDuration(timeMs)} / {formatDuration(fight.durationMs)}</span>
            </div>
            <svg
                ref={svgRef}
                className="replay-timeline"
                viewBox="0 0 1000 176"
                preserveAspectRatio="none"
                style={{ width: '100%', height: 152, display: 'block', cursor: 'col-resize', background: 'rgba(8,12,26,0.6)', borderRadius: 6 }}
                onClick={scrubFromEvent}
                onMouseDown={(e) => { setDragging(true); scrubFromEvent(e); }}
                onMouseMove={onMouseMove}
                onMouseUp={() => setDragging(false)}
                onMouseLeave={() => setDragging(false)}
            >
                {layersState.phases && derived.phases.map((p, i) => {
                    const x1 = (p.startMs / fight.durationMs) * 1000;
                    const x2 = (p.endMs / fight.durationMs) * 1000;
                    return (
                        <rect key={`ph-${i}`}
                            x={x1} y={0} width={Math.max(0, x2 - x1)} height={8}
                            fill={phaseColor[p.kind]} opacity={0.35} />
                    );
                })}
                <path d={pathData} style={{ fill: 'var(--accent-bg-strong)', stroke: 'var(--brand-primary)' }} strokeWidth={1} />
                {enemyKillMarks.map((m, i) => (
                    <line key={`k-${i}`} x1={(m.timeMs / fight.durationMs) * 1000} x2={(m.timeMs / fight.durationMs) * 1000}
                          y1={0} y2={12} stroke="#22c55e" strokeWidth={2} />
                ))}
                {allyKillMarks.map((m, i) => (
                    <line key={`d-${i}`} x1={(m.timeMs / fight.durationMs) * 1000} x2={(m.timeMs / fight.durationMs) * 1000}
                          y1={156} y2={168} stroke="#ef4444" strokeWidth={2} />
                ))}
                {layersState.ccLane && (
                    fight.ccSamples?.length ? (
                        ccPath && (
                            <g data-testid="cc-lane">
                                <path d={ccPath} stroke="#f59e0b" strokeWidth={2} fill="none" opacity={0.85} />
                            </g>
                        )
                    ) : (
                        // `null` (or a degenerate empty lane) means "never captured"
                        // — log predates axilog
                        // 1.8.0, or was parsed without raw timeline arrays.
                        // pixel-identical to a genuinely all-zero series
                        // otherwise. A dashed baseline + muted label keeps
                        // the two states visually distinct on the replay.
                        <g data-testid="cc-lane-not-recorded">
                            <line x1={0} x2={1000} y1={109} y2={109} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.35} />
                            <text x={98} y={107} fontSize={7} fill="#f59e0b" opacity={0.6}>not recorded</text>
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
                        // Absent here means something narrower than it does for
                        // the outgoing lane above: axilog has no squad-level
                        // incoming series, so this is folded from `by_entity`,
                        // which needs raw timeline arrays on AND axilog 1.9.0.
                        // A log can therefore draw a full CC lane and nothing
                        // here, which is exactly why the two are gated apart.
                        <g data-testid="cc-in-lane-not-recorded">
                            <line x1={0} x2={1000} y1={119} y2={119} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.2} />
                            <text x={98} y={123} fontSize={7} fill="#f59e0b" opacity={0.45}>not recorded</text>
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
                            <line x1={0} x2={1000} y1={137} y2={137} stroke="#e879f9" strokeWidth={1} strokeDasharray="4 3" opacity={0.35} />
                            <text x={98} y={135} fontSize={7} fill="#e879f9" opacity={0.6}>not recorded</text>
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
                            <line x1={0} x2={1000} y1={147} y2={147} stroke="#e879f9" strokeWidth={1} strokeDasharray="4 3" opacity={0.2} />
                            <text x={98} y={151} fontSize={7} fill="#e879f9" opacity={0.45}>not recorded</text>
                        </g>
                    )
                )}
                {LANE_LABELS.map(lane => (
                    (layersState[lane.outKey] || layersState[lane.inKey]) && (
                        <g key={lane.id}>
                            {/* The zero line the pair mirrors around. Without it
                                the two half-height bar sets read as two
                                unrelated lanes rather than one axis. */}
                            <line data-testid={`${lane.id}-zero-rule`}
                                  x1={0} x2={1000} y1={lane.zeroY} y2={lane.zeroY}
                                  stroke={lane.color} strokeWidth={0.5} opacity={0.3} />
                            {/* Opaque plate: the bars run to x=0, so a bare
                                label would sit inside the fight's opening
                                seconds and be unreadable. */}
                            <rect x={0} y={lane.zeroY - 6.5} width={92} height={13}
                                  fill="rgba(8,12,26,0.92)" rx={2} />
                            <text data-testid={`${lane.id}-lane-label`}
                                  x={4} y={lane.zeroY + 3.2} fontSize={9}
                                  fontWeight={600}
                                  fill={lane.color} opacity={0.95}>
                                {`${lane.label} \u25B2out \u25BCin`}
                            </text>
                        </g>
                    )
                ))}
                <line x1={playheadX} x2={playheadX} y1={0} y2={176} stroke="#fbbf24" strokeWidth={1.5} />
            </svg>
            {layersState.phases && derived.phases.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {derived.phases.map((p, i) => (
                        <button
                            key={`${p.startMs}-${i}`}
                            type="button"
                            data-phase-chip
                            data-start-ms={p.startMs}
                            title={phaseDesc[p.kind]}
                            onClick={() => setReplayPlayhead({ timeMs: p.startMs })}
                            style={{
                                padding: '2px 6px',
                                fontSize: 10,
                                borderRadius: 3,
                                background: `${phaseColor[p.kind]}22`,
                                color: phaseColor[p.kind],
                                border: `1px solid ${phaseColor[p.kind]}55`,
                                cursor: 'pointer',
                            }}
                        >
                            {p.kind} · {(p.startMs / 1000).toFixed(0)}s
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SyncedTimeline;
