import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Maximize2, Minimize2, Plus, Minus, RotateCcw, X, Crosshair } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { getMapTiles, hasTileData } from '../../../shared/wvwTiles';
import { WVW_LANDMARKS } from '../../../shared/wvwLandmarks';
import { normalizeMapNameShort, formatDuration } from '../../../shared/mapUtils';
import { getProfessionIconPath } from '../../classIconUtils';
import commanderTagRaw from '../../../../public/svg/commander_tag.svg?raw';
const COMMANDER_TAG_URI = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(commanderTagRaw)))}`;

import { HeatmapLayer } from './HeatmapLayer';
import { SquadOverlay } from './SquadOverlay';
import { SquadHealthStrip } from './SquadHealthStrip';
import { LayersPanel } from './LayersPopover';
import { useHeatmapData } from './hooks/useHeatmapData';
import { FightPickerBar } from './FightPickerBar';
import { ReplaySquadPanel } from './ReplaySquadPanel';
import { SyncedTimeline } from './SyncedTimeline';
import { EventOverlay } from './EventOverlay';
import { FullscreenPortal } from './FullscreenPortal';
import { useReplayPlayback } from './hooks/useReplayPlayback';
import { useReplayViewport } from './hooks/useReplayViewport';
import { useMovementData } from './hooks/useMovementData';
import { pickDefaultFightId, findClosestMember } from './replaySelectors';
import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';

interface ReplayViewProps {
    fights: ReplayFightPayload[];
    style?: React.CSSProperties;
}

const SPEEDS = [0.5, 1, 1.5, 2, 4] as const;

/** Return true if timeMs falls within any of the given [startMs, endMs] ranges. */
function inAnyRange(ranges: [number, number][], timeMs: number): boolean {
    return ranges.some(([start, end]) => timeMs >= start && timeMs < end);
}

/** Linearly interpolate between the two bracketing position samples for smooth movement. */
function sampleAt(member: SquadMemberMovement, pollFrac: number): [number, number] | null {
    const { positions } = member;
    if (!positions.length) return null;
    const lo = Math.max(0, Math.min(Math.floor(pollFrac), positions.length - 1));
    const t = pollFrac - Math.floor(pollFrac);
    if (t === 0 || lo >= positions.length - 1) return positions[lo];
    const a = positions[lo];
    const b = positions[lo + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

const ctrlBtnStyle: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 5,
    background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-secondary)', cursor: 'pointer', backdropFilter: 'blur(4px)',
};

const chipStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)', backdropFilter: 'blur(4px)',
    border: '1px solid var(--border-default)', borderRadius: 20,
    padding: '3px 10px', fontSize: 10, display: 'flex', alignItems: 'center',
    cursor: 'pointer',
};

export const ReplayView: React.FC<ReplayViewProps> = ({ fights, style }) => {
    const selectedId = useStatsStore(state => state.selectedReplayFightId);
    const setSelectedReplayFight = useStatsStore(state => state.setSelectedReplayFight);
    const playhead = useStatsStore(state => state.replayPlayhead);
    const setReplayPlayhead = useStatsStore(state => state.setReplayPlayhead);
    const viewportState = useStatsStore(state => state.replayViewport);
    const setReplayViewport = useStatsStore(state => state.setReplayViewport);
    const setReplayFollowTarget = useStatsStore(state => state.setReplayFollowTarget);
    const layers = useStatsStore(state => state.replayLayers);
    const spotlightParty = useStatsStore(state => state.replaySpotlightParty);
    const setReplaySpotlightParty = useStatsStore(state => state.setReplaySpotlightParty);

    const [fullscreen, setFullscreen] = useState(false);
    const [pickerCollapsed, setPickerCollapsed] = useState(true);
    const [panelCollapsed, setPanelCollapsed] = useState(true);
    const [layersOpen, setLayersOpen] = useState(false);
    const [tooltip, setTooltip] = useState<{ name: string; account: string; status: 'down' | 'dead' | null; x: number; y: number } | null>(null);
    // When true the viewport auto-centers on the follow target each frame.
    // Set to false when the user manually pans; recenter button restores it.
    const [centeredOnFollow, setCenteredOnFollow] = useState(true);

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const squadPanelRef = useRef<HTMLDivElement>(null);
    const draggedRef = useRef(false);
    // Stable ref so the drag handler can read followMember without being recreated.
    const followMemberRef = useRef<SquadMemberMovement | null>(null);

    useEffect(() => {
        if (!selectedId && fights.length) {
            const def = pickDefaultFightId(fights);
            if (def) setSelectedReplayFight(def);
        }
    }, [selectedId, fights, setSelectedReplayFight]);

    const selectedFight = useMovementData(fights, selectedId);
    const heatmap = useHeatmapData(selectedFight, layers.heatmap);
    const durationMs = selectedFight?.durationMs ?? 0;
    useReplayPlayback({ durationMs });

    const mapSize = selectedFight?.mapSize ?? [600, 600];
    const [mapWidth, mapHeight] = mapSize;
    const viewport = useReplayViewport({ mapWidth, mapHeight, containerWidth: mapWidth, containerHeight: mapHeight });

    const { centerOn, attachWheelZoom, attachPanDrag, screenToSvg } = viewport;
    useEffect(() => {
        const el = mapContainerRef.current;
        if (!el) return;
        return attachWheelZoom(el);
    }, [attachWheelZoom]);
    useEffect(() => {
        const el = mapContainerRef.current;
        if (!el) return;
        return attachPanDrag(el, (d) => {
            draggedRef.current = d;
            // Panning while following: detach auto-center so the map stays where the
            // user dragged it. A recenter button lets them re-lock.
            if (d && followMemberRef.current) setCenteredOnFollow(false);
        });
    }, [attachPanDrag]);
    useEffect(() => {
        const el = squadPanelRef.current;
        if (!el) return;
        const stop = (e: WheelEvent) => e.stopPropagation();
        el.addEventListener('wheel', stop, { passive: true });
        return () => el.removeEventListener('wheel', stop);
    }, [selectedFight]);

    // Fractional poll position — used for smooth lerped rendering.
    // Integer floor is used for array indexing (trails, hit detection).
    const pollFrac = selectedFight
        ? playhead.timeMs / selectedFight.movementData.pollingRate
        : 0;
    const pollIndex = Math.floor(pollFrac);

    const followMember = useMemo(() => {
        if (!selectedFight) return null;
        const key = viewportState.followTarget;
        if (!key) {
            return selectedFight.movementData.members.find(m => m.isCommander && m.inSquad) ?? null;
        }
        return selectedFight.movementData.members.find(m => (m.account || m.name) === key) ?? null;
    }, [selectedFight, viewportState.followTarget]);

    // Keep the ref in sync so the drag handler can read it without a closure dep.
    followMemberRef.current = followMember;

    // Re-lock auto-center whenever the follow target itself changes.
    useEffect(() => {
        setCenteredOnFollow(true);
    }, [viewportState.followTarget]);

    // On fight switch: center on commander and default-follow them.
    useEffect(() => {
        if (!selectedFight) return;
        const commander = selectedFight.movementData.members.find(m => m.isCommander && m.inSquad);
        if (!commander) return;
        const pos = sampleAt(commander, 0);
        if (pos) {
            setReplayViewport({ scale: 3 });
            centerOn(pos[0], pos[1]);
        }
        setReplayFollowTarget(commander.account || commander.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, centerOn]);

    useEffect(() => {
        if (!followMember || !centeredOnFollow) return;
        const pos = sampleAt(followMember, pollFrac);
        if (pos) centerOn(pos[0], pos[1]);
    }, [followMember, pollFrac, centerOn, centeredOnFollow]);

    const onCanvasClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (!selectedFight) return;
        if (draggedRef.current) { draggedRef.current = false; return; }
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        // Account for preserveAspectRatio="xMidYMid meet" letterboxing
        const [worldX, worldY] = screenToSvg(e.clientX, e.clientY, rect);
        const hit = findClosestMember(selectedFight.movementData.members, pollIndex, worldX, worldY, 24);
        if (hit && !hit.isEnemy) setReplayFollowTarget(hit.account || hit.name);
    }, [selectedFight, pollIndex, screenToSvg, setReplayFollowTarget]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === ' ' && selectedFight) {
                e.preventDefault();
                const { replayPlayhead } = useStatsStore.getState();
                setReplayPlayhead({ playing: !replayPlayhead.playing });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedFight, setReplayPlayhead]);

    const followLabel = viewportState.followTarget
        ? `Follow: ${viewportState.followTarget}`
        : (followMember ? `Follow: ${followMember.name} (commander)` : '');

    const body = (
        <div className="replay-view" style={{ display: 'flex', flexDirection: 'column', height: '100%', ...style }}>
            <FightPickerBar fights={fights} collapsed={pickerCollapsed} onToggle={() => setPickerCollapsed(v => !v)} />

            {!selectedFight ? (
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    color: 'var(--text-secondary, #94a3b8)',
                }}>
                    Pick a fight above to start replay.
                </div>
            ) : (
                <>
                    {/* Map area fills everything; squad panel overlays on the right */}
                    <div ref={mapContainerRef} style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                            {/* Floating zoom controls — offset past the layers panel (220px open, 28px collapsed) */}
                            <div style={{ position: 'absolute', top: 8, left: (layersOpen ? 220 : 28) + 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4, transition: 'left 0.15s' }}>
                                <button type="button" onClick={() => viewport.zoomIn()} title="Zoom in" style={ctrlBtnStyle}><Plus size={12} /></button>
                                <button type="button" onClick={() => viewport.zoomOut()} title="Zoom out" style={ctrlBtnStyle}><Minus size={12} /></button>
                                <button type="button" onClick={() => viewport.resetViewport()} title="Reset zoom" style={ctrlBtnStyle}><RotateCcw size={12} /></button>
                                <button type="button" onClick={() => setFullscreen(v => !v)} title="Fullscreen" style={ctrlBtnStyle}>
                                    {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                                </button>
                            </div>

                            {/* Status chips floating on the map */}
                            {followLabel && (
                                <div style={{ position: 'absolute', bottom: 10, left: (layersOpen ? 220 : 28) + 10, zIndex: 10, transition: 'left 0.15s', display: 'flex', gap: 6 }}>
                                    {!centeredOnFollow && (
                                        <button
                                            type="button"
                                            title="Re-center on followed player"
                                            onClick={() => setCenteredOnFollow(true)}
                                            style={{ ...chipStyle, borderColor: 'var(--status-warning)', color: 'var(--status-warning)' }}
                                        >
                                            <Crosshair size={11} style={{ marginRight: 4 }} /> Re-center
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setReplayFollowTarget(null)}
                                        style={{ ...chipStyle, borderColor: 'var(--status-info-border)', color: 'var(--status-info)' }}
                                    >
                                        {followLabel} <X size={10} style={{ marginLeft: 4 }} />
                                    </button>
                                </div>
                            )}
                            {spotlightParty !== null && (
                                <button
                                    type="button"
                                    onClick={() => setReplaySpotlightParty(null)}
                                    style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 10, ...chipStyle, borderColor: 'var(--status-warning)', color: 'var(--status-warning)' }}
                                >
                                    Spotlight: Party {spotlightParty} <X size={10} style={{ marginLeft: 4 }} />
                                </button>
                            )}

                            {layers.squadHealthStrip && (
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 }}>
                                    <SquadHealthStrip fight={selectedFight} timeMs={playhead.timeMs} />
                                </div>
                            )}

                            <svg
                                className="replay-canvas"
                                viewBox={`0 0 ${mapWidth} ${mapHeight}`}
                                preserveAspectRatio="xMidYMid slice"
                                onClick={onCanvasClick}
                                style={{ width: '100%', height: '100%', background: '#0c1224', cursor: 'grab', display: 'block' }}
                            >
                                <defs>
                                    {/* Tints the icon toward red by boosting the red channel and suppressing green/blue */}
                                    <filter id="enemy-tint" colorInterpolationFilters="sRGB">
                                        <feColorMatrix type="matrix" values="
                                            1.2  0.1  0.1  0  0.15
                                            0    0.1  0    0  0
                                            0    0    0.1  0  0
                                            0    0    0    1  0
                                        " />
                                    </filter>
                                </defs>
                                <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
                                    {selectedFight.mapKey && hasTileData(selectedFight.mapKey)
                                        ? getMapTiles(selectedFight.mapKey, Math.min(7, Math.max(3, Math.floor(5 + Math.log2(viewport.scale)))), mapWidth, mapHeight).map((t, i) => (
                                            <image key={i} href={t.url} x={t.x} y={t.y} width={t.width} height={t.height} preserveAspectRatio="none" />
                                        ))
                                        : selectedFight.mapImageUrl && (
                                            <image href={selectedFight.mapImageUrl} x={0} y={0} width={mapWidth} height={mapHeight} />
                                        )
                                    }
                                    <HeatmapLayer raster={heatmap} mapWidth={mapWidth} mapHeight={mapHeight} mode={layers.heatmap} />
                                    {selectedFight.mapKey && (WVW_LANDMARKS[selectedFight.mapKey] ?? []).map(lm => (
                                        <g key={lm.name} opacity={0.55}>
                                            <circle cx={lm.x} cy={lm.y} r={6} fill="rgba(15,23,42,0.6)" stroke="rgba(0,0,0,0.9)" strokeWidth={2.5} />
                                            <circle cx={lm.x} cy={lm.y} r={6} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1} />
                                            <text x={lm.x + 8} y={lm.y + 3} fontSize={9} fill="white" stroke="black" strokeWidth={2.5} paintOrder="stroke" strokeLinejoin="round">{lm.name}</text>
                                        </g>
                                    ))}
                                    {selectedFight.movementData.members.filter(m => m.inSquad || m.isEnemy).map(member => {
                                        const pos = sampleAt(member, pollFrac);
                                        if (!pos) return null;
                                        const timeMs = playhead.timeMs;
                                        const isDead  = inAnyRange(member.deadRanges, timeMs);
                                        const isDown  = !isDead && inAnyRange(member.downRanges, timeMs);
                                        const dim = spotlightParty !== null && !member.isEnemy && member.group !== spotlightParty;
                                        const trail = isDead ? [] : member.positions.slice(Math.max(0, pollIndex - 20), pollIndex + 1);
                                        const recent = isDead ? [] : member.positions.slice(Math.max(0, pollIndex - 5), pollIndex + 1);
                                        const trailStr = trail.map(p => `${p[0]},${p[1]}`).join(' ');
                                        const recentStr = recent.map(p => `${p[0]},${p[1]}`).join(' ');
                                        const color = member.isEnemy ? '#ef4444' : member.isCommander ? '#fbbf24' : '#60a5fa';
                                        const isFollow = followMember && (followMember.account || followMember.name) === (member.account || member.name);
                                        // All sizes are divided by viewport.scale so they stay a
                                        // constant pixel size on screen regardless of zoom level.
                                        const s = viewport.scale;
                                        const sw = 1 / s;           // 1px stroke
                                        const sw15 = 1.5 / s;       // 1.5px stroke
                                        // iconR is in screen-pixel units (the scale(1/s) counter-transform
                                        // on the icon group makes it render at exactly iconR*2 px).
                                        // We shrink it slightly as zoom increases so icons don't crowd
                                        // the map when zoomed in — from 20px at s=1 to ~14px at s=50.
                                        const iconR = Math.max(7, 10 - Math.log2(Math.max(1, s)) * 0.5);
                                        const ringR = 16 / s;        // follow ring radius

                                        // Base opacity: dead = very dim, down = half, enemies dim slightly, spotlight dim = faint
                                        const baseOpacity = isDead ? 0.12 : isDown ? 0.45 : dim ? 0.2 : member.isEnemy ? 0.75 : 1;

                                        return (
                                            <g
                                                key={`${member.name}_${member.account}`}
                                                opacity={baseOpacity}
                                                onMouseEnter={(e) => {
                                                    const rect = mapContainerRef.current?.getBoundingClientRect();
                                                    if (!rect) return;
                                                    const status = isDead ? 'dead' : isDown ? 'down' : null;
                                                    setTooltip({ name: member.name, account: member.account, status, x: e.clientX - rect.left, y: e.clientY - rect.top });
                                                }}
                                                onMouseLeave={() => setTooltip(null)}
                                            >
                                                {/* Movement trail — hidden while dead */}
                                                {trail.length > 1 && <polyline points={trailStr} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={sw} strokeDasharray={`${2/s} ${2/s}`} />}
                                                {recent.length > 1 && <polyline points={recentStr} fill="none" stroke={color} strokeOpacity={0.6} strokeWidth={sw15} />}
                                                {/* Follow ring */}
                                                {isFollow && <circle cx={pos[0]} cy={pos[1]} r={ringR} fill="none" stroke="#fbbf24" strokeWidth={sw15} strokeOpacity={0.8} />}
                                                {/* Member icon — rendered in a counter-scaled group so the
                                                    <image> element always has fixed 20×20 local dimensions.
                                                    Without this, sub-pixel dimensions at high zoom cause
                                                    browsers to silently skip rendering the image. */}
                                                <g transform={`translate(${pos[0]} ${pos[1]}) scale(${1 / s})`}>
                                                {member.isCommander ? (
                                                    // Commanders: just the commander tag SVG, no profession icon
                                                    <image
                                                        href={COMMANDER_TAG_URI}
                                                        x={-iconR} y={-iconR}
                                                        width={iconR * 2} height={iconR * 2}
                                                    />
                                                ) : member.isEnemy ? (
                                                    (() => {
                                                        const iconSrc = getProfessionIconPath(member.profession);
                                                        const er = iconR * 0.75; // enemies 25% smaller than allies
                                                        return iconSrc
                                                            ? <image href={iconSrc} x={-er} y={-er} width={er * 2} height={er * 2} filter="url(#enemy-tint)" />
                                                            : <circle cx={0} cy={0} r={er} fill="#ef4444" opacity={0.8} />;
                                                    })()
                                                ) : (
                                                    (() => {
                                                        const iconSrc = getProfessionIconPath(member.profession);
                                                        return iconSrc
                                                            ? <image href={iconSrc} x={-iconR} y={-iconR} width={iconR * 2} height={iconR * 2} />
                                                            : <circle cx={0} cy={0} r={iconR} fill="#60a5fa" opacity={0.9} />;
                                                    })()
                                                )}
                                                {/* Downed indicator: orange cross over the icon */}
                                                {isDown && !member.isEnemy && (
                                                    <>
                                                        <line x1={-iconR * 0.55} y1={0} x2={iconR * 0.55} y2={0} stroke="#f97316" strokeWidth={sw15 * 1.5 * s} strokeLinecap="round" />
                                                        <line x1={0} y1={-iconR * 0.55} x2={0} y2={iconR * 0.55} stroke="#f97316" strokeWidth={sw15 * 1.5 * s} strokeLinecap="round" />
                                                    </>
                                                )}
                                                </g>
                                            </g>
                                        );
                                    })}
                                    <SquadOverlay fight={selectedFight} timeMs={playhead.timeMs} />
                                    <EventOverlay fight={selectedFight} timeMs={playhead.timeMs} scale={viewport.scale} />
                                </g>
                            </svg>
                        {/* Member hover tooltip */}
                        {tooltip && (
                            <div style={{
                                position: 'absolute',
                                left: tooltip.x + 14,
                                top: tooltip.y - 10,
                                zIndex: 40,
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-default)',
                                borderRadius: 6,
                                padding: '5px 9px',
                                fontSize: 12,
                                color: 'var(--text-primary)',
                                pointerEvents: 'none',
                                whiteSpace: 'nowrap',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                            }}>
                                <div style={{ fontWeight: 600 }}>{tooltip.name}</div>
                                {tooltip.account && <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>{tooltip.account}</div>}
                                {tooltip.status && (
                                    <div style={{
                                        marginTop: 4,
                                        fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase',
                                        color: tooltip.status === 'dead' ? '#f87171' : '#fb923c',
                                    }}>
                                        {tooltip.status === 'dead' ? 'Dead' : 'Downed'}
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Layers panel — overlays on the left */}
                        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 20, display: 'flex', alignItems: 'stretch' }}>
                            <LayersPanel open={layersOpen} onToggle={() => setLayersOpen(v => !v)} />
                        </div>
                        {/* Squad panel — overlays on the right of the map. Native wheel listener
                             stops propagation before the map zoom handler can see the event. */}
                        <div ref={squadPanelRef} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 20, display: 'flex', alignItems: 'stretch' }}>
                            <ReplaySquadPanel
                                fight={selectedFight}
                                collapsed={panelCollapsed}
                                onToggle={() => setPanelCollapsed(v => !v)}
                            />
                        </div>
                    </div>

                    <SyncedTimeline fight={selectedFight} />

                    {/* Controls bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                        <button
                            type="button"
                            aria-label={playhead.playing ? 'Pause' : 'Play'}
                            onClick={() => setReplayPlayhead({ playing: !playhead.playing })}
                            style={{
                                width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                                background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--text-secondary)', cursor: 'pointer',
                            }}
                        >
                            {playhead.playing ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <div style={{ display: 'flex', gap: 2 }}>
                            {SPEEDS.map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setReplayPlayhead({ speed: s })}
                                    style={{
                                        padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                        background: playhead.speed === s ? 'var(--status-info-bg)' : 'var(--bg-hover)',
                                        border: `1px solid ${playhead.speed === s ? 'var(--status-info-border)' : 'var(--border-subtle)'}`,
                                        color: playhead.speed === s ? 'var(--status-info)' : 'var(--text-muted)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {s}×
                                </button>
                            ))}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatDuration(playhead.timeMs)} / {formatDuration(durationMs)}
                        </span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{normalizeMapNameShort(selectedFight.label)}</span>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <FullscreenPortal enabled={fullscreen} onExit={() => setFullscreen(false)}>
            {body}
        </FullscreenPortal>
    );
};

export default ReplayView;
