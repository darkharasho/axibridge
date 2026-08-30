import React, { useCallback, useMemo, useRef } from 'react';
import { useStatsStore } from '../statsStore';
import { useSquadDerived } from './hooks/useSquadDerived';
import type { ReplayFightPayload } from './replayTypes';

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
        <div className="replay-timeline-wrap" style={{ padding: 0 }}>
            <svg
                ref={svgRef}
                className="replay-timeline"
                viewBox="0 0 1000 120"
                preserveAspectRatio="none"
                style={{ width: '100%', height: 54, display: 'block', cursor: 'col-resize', background: 'rgba(8,12,26,0.6)', borderRadius: 6 }}
                onClick={scrubFromEvent}
                onMouseDown={(e) => { setDragging(true); scrubFromEvent(e); }}
                onMouseMove={onMouseMove}
                onMouseUp={() => setDragging(false)}
                onMouseLeave={() => setDragging(false)}
            >
                <title>{`Squad DPS — peak ${maxDps.toLocaleString()}`}</title>
                {layersState.phases && derived.phases.map((p, i) => {
                    const x1 = (p.startMs / fight.durationMs) * 1000;
                    const x2 = (p.endMs / fight.durationMs) * 1000;
                    return (
                        <rect key={`ph-${i}`}
                            data-phase-chip
                            data-start-ms={p.startMs}
                            x={x1} y={0} width={Math.max(0, x2 - x1)} height={10}
                            fill={phaseColor[p.kind]} opacity={0.45}
                            style={{ cursor: 'pointer' }}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                // Beat the svg-wide scrub handler: a click on a
                                // phase segment means "jump to this phase",
                                // not "scrub to where I clicked".
                                e.stopPropagation();
                                setReplayPlayhead({ timeMs: p.startMs });
                            }}>
                            <title>{`${p.kind} — ${phaseDesc[p.kind]}`}</title>
                        </rect>
                    );
                })}
                <path d={pathData} style={{ fill: 'var(--accent-bg-strong)', stroke: 'var(--brand-primary)' }} strokeWidth={1} />
                {enemyKillMarks.map((m, i) => (
                    <line key={`k-${i}`} x1={(m.timeMs / fight.durationMs) * 1000} x2={(m.timeMs / fight.durationMs) * 1000}
                          y1={0} y2={12} stroke="#22c55e" strokeWidth={2} />
                ))}
                {allyKillMarks.map((m, i) => (
                    <line key={`d-${i}`} x1={(m.timeMs / fight.durationMs) * 1000} x2={(m.timeMs / fight.durationMs) * 1000}
                          y1={104} y2={116} stroke="#ef4444" strokeWidth={2} />
                ))}
                <line x1={playheadX} x2={playheadX} y1={0} y2={120} stroke="#fbbf24" strokeWidth={1.5} />
            </svg>
        </div>
    );
};

export default SyncedTimeline;
