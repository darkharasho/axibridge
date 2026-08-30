import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Maximize2, Minimize2, Plus, Minus, RotateCcw, X, Crosshair } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { getTileLayers, hasTileData } from '../../../shared/wvwTiles';
import { normalizeMapNameShort, formatDuration } from '../../../shared/mapUtils';
import { HeatmapLayer } from './HeatmapLayer';
import { GroundMarkerLayer } from './GroundMarkerLayer';
import { SectorOutlineLayer } from './SectorOutlineLayer';
import { ObjectiveLayer } from './layers/ObjectiveLayer';
import { SquadOverlay } from './SquadOverlay';
import { SquadHealthStrip } from './SquadHealthStrip';
import { LayersPanel } from './LayersPopover';
import { CcTakenNotice } from './CcTakenNotice';
import { useHeatmapData } from './hooks/useHeatmapData';
import { FightPickerBar } from './FightPickerBar';
import { FightPicker } from './FightPicker';
import { ReplaySquadPanel } from './ReplaySquadPanel';
import { SyncedTimeline } from './SyncedTimeline';
import { EventOverlay } from './EventOverlay';
import { FullscreenPortal } from './FullscreenPortal';
import { useReplayPlayback } from './hooks/useReplayPlayback';
import { useReplayViewport } from './hooks/useReplayViewport';
import { useMovementData } from './hooks/useMovementData';
import { pickDefaultFightId, findClosestMember } from './replaySelectors';
import { MemberLayer, sampleAt } from './layers/MemberLayer';
import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';

interface ReplayViewProps {
    fights: ReplayFightPayload[];
    style?: React.CSSProperties;
}

const SPEEDS = [0.5, 1, 1.5, 2, 4] as const;

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
    const pickerOverlayRef = useRef<HTMLDivElement>(null);
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

    // Panel CSS size feeds screen-aware tile zoom + culling. The container only
    // mounts once a fight is selected, so the effect depends on selectedFight
    // to (re)attach; it also re-observes on fullscreen toggle because the
    // portal remounts the container node.
    const [panelSize, setPanelSize] = useState<[number, number]>([0, 0]);
    useEffect(() => {
        if (!selectedFight) return;
        const el = mapContainerRef.current;
        if (!el) return;
        const update = () => {
            const rect = el.getBoundingClientRect();
            setPanelSize(prev => prev[0] === rect.width && prev[1] === rect.height ? prev : [rect.width, rect.height]);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [fullscreen, selectedFight]);

    const { centerOn, attachWheelZoom, attachPanDrag, screenToSvg } = viewport;
    useEffect(() => {
        const el = mapContainerRef.current;
        if (!el) return;
        return attachWheelZoom(el);
    }, [attachWheelZoom, fullscreen]);
    useEffect(() => {
        const el = mapContainerRef.current;
        if (!el) return;
        return attachPanDrag(el, (d) => {
            draggedRef.current = d;
            // Panning while following: detach auto-center so the map stays where the
            // user dragged it. A recenter button lets them re-lock.
            if (d && followMemberRef.current) setCenteredOnFollow(false);
        });
    }, [attachPanDrag, fullscreen]);
    useEffect(() => {
        const el = squadPanelRef.current;
        if (!el) return;
        const stop = (e: WheelEvent) => e.stopPropagation();
        el.addEventListener('wheel', stop, { passive: true });
        return () => el.removeEventListener('wheel', stop);
    }, [selectedFight]);
    // Prevent wheel events on the fight-picker overlay from zooming the map beneath it.
    useEffect(() => {
        const el = pickerOverlayRef.current;
        if (!el) return;
        const stop = (e: WheelEvent) => e.stopPropagation();
        el.addEventListener('wheel', stop, { passive: true });
        return () => el.removeEventListener('wheel', stop);
    }, [pickerCollapsed]);

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
                            {/* Fight picker overlay — covers the map area when expanded */}
                            {!pickerCollapsed && (
                                <div ref={pickerOverlayRef} style={{
                                    position: 'absolute', inset: 0, zIndex: 30,
                                    background: 'rgba(8, 14, 30, 0.88)',
                                    backdropFilter: 'blur(3px)',
                                    display: 'flex', flexDirection: 'column',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                                            {fights.length} fight{fights.length !== 1 ? 's' : ''}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setPickerCollapsed(true)}
                                            style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', cursor: 'pointer' }}
                                        >
                                            ✕ Close
                                        </button>
                                    </div>
                                    <FightPicker fights={fights} onSelect={() => setPickerCollapsed(true)} />
                                </div>
                            )}
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

                            <CcTakenNotice ccTakenEvents={selectedFight.ccTakenEvents} />

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
                                <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
                                    {selectedFight.mapKey && hasTileData(selectedFight.mapKey)
                                        ? getTileLayers(selectedFight.mapKey, mapWidth, mapHeight, viewport, panelSize[0], panelSize[1], (typeof window !== 'undefined' && window.devicePixelRatio) || 1).map(layer => (
                                            <g key={layer.zoom}>
                                                {layer.tiles.map(t => (
                                                    <image key={t.url} href={t.url} x={t.x} y={t.y} width={t.width} height={t.height} preserveAspectRatio="none" />
                                                ))}
                                            </g>
                                        ))
                                        : selectedFight.mapImageUrl && (
                                            <image href={selectedFight.mapImageUrl} x={0} y={0} width={mapWidth} height={mapHeight} />
                                        )
                                    }
                                    {layers.zoneBorders && selectedFight.mapKey && (
                                        <SectorOutlineLayer
                                            mapKey={selectedFight.mapKey}
                                            mapWidth={mapWidth}
                                            mapHeight={mapHeight}
                                            scale={viewport.scale}
                                            sectorOwners={selectedFight.sectorOwners}
                                        />
                                    )}
                                    <HeatmapLayer raster={heatmap} mapWidth={mapWidth} mapHeight={mapHeight} mode={layers.heatmap} />
                                    {/* Under the member icons on purpose — a
                                        rally marker is exactly where everyone
                                        will be standing. */}
                                    <GroundMarkerLayer
                                        markers={selectedFight.movementData.groundMarkers}
                                        timeMs={playhead.timeMs}
                                        scale={viewport.scale}
                                    />
                                    <ObjectiveLayer
                                        mapKey={selectedFight.mapKey}
                                        sectorOwners={selectedFight.sectorOwners}
                                    />
                                    <MemberLayer
                                        members={selectedFight.movementData.members}
                                        pollFrac={pollFrac}
                                        pollIndex={pollIndex}
                                        timeMs={playhead.timeMs}
                                        scale={viewport.scale}
                                        spotlightParty={spotlightParty}
                                        followKey={followMember ? (followMember.account || followMember.name) : null}
                                        onHover={(info) => {
                                            const rect = mapContainerRef.current?.getBoundingClientRect();
                                            if (!rect) return;
                                            setTooltip({
                                                name: info.name, account: info.account, status: info.status,
                                                x: info.clientX - rect.left, y: info.clientY - rect.top,
                                            });
                                        }}
                                        onLeave={() => setTooltip(null)}
                                    />
                                    <SquadOverlay fight={selectedFight} timeMs={playhead.timeMs} scale={viewport.scale} />
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
                                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
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
                                        background: playhead.speed === s ? 'var(--status-info-bg)' : 'var(--bg-input)',
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
