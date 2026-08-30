import React from 'react';
import { Pause, Play, ChevronUp, ChevronDown } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { formatDuration } from '../../../shared/mapUtils';
import { SyncedTimeline } from './SyncedTimeline';
import { TimelineLanes, TimelineLaneGutter } from './TimelineLanes';
import type { ReplayFightPayload } from './replayTypes';

const SPEEDS = [0.5, 1, 1.5, 2, 4] as const;

export interface TransportBarProps {
    fight: ReplayFightPayload;
    style?: React.CSSProperties;
}

/**
 * Everything you press while watching, in one row. Absorbs the old controls
 * bar and the old timeline header — the clock used to be printed in both.
 * The lanes band underneath is a detail view, so it starts collapsed.
 *
 * `.app-dropdown` only paints a background under the glass themes (see
 * index.css) — the default theme leaves it transparent, which would make
 * this bar see-through over the map since blur doesn't work on this
 * platform. An explicit `background` keeps it opaque everywhere while
 * still picking up the glass-theme override where that class applies.
 */
const TransportBarInner: React.FC<TransportBarProps> = ({ fight, style }) => {
    const playhead = useStatsStore(state => state.replayPlayhead);
    const setReplayPlayhead = useStatsStore(state => state.setReplayPlayhead);
    const lanesExpanded = useStatsStore(state => state.replayLanesExpanded);
    const setReplayLanesExpanded = useStatsStore(state => state.setReplayLanesExpanded);

    return (
        // A CSS grid, not a flex column, so `SyncedTimeline` (row 1, column 2)
        // and `TimelineLanes` (row 2, column 2) occupy the *identical* column
        // width. Before this, the scrubber sat in a `flex: 1` slot starting
        // after the play/speed/clock cluster while the lanes svg started
        // after its own separate fixed-width gutter — two independently sized
        // 1000-unit axes that drifted ~190px apart. Sharing a grid column
        // makes the drift structurally impossible rather than something to
        // keep in sync by hand.
        <div
            className="app-dropdown"
            style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr',
                rowGap: 4, columnGap: 8,
                padding: '5px 8px', borderRadius: 10,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                ...style,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                    type="button"
                    aria-label={playhead.playing ? 'Pause' : 'Play'}
                    onClick={() => setReplayPlayhead({ playing: !playhead.playing })}
                    style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                >
                    {playhead.playing ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {SPEEDS.map(s => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setReplayPlayhead({ speed: s })}
                            style={{
                                padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
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
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {formatDuration(playhead.timeMs)} / {formatDuration(fight.durationMs)}
                </span>
                <button
                    type="button"
                    title={lanesExpanded ? 'Hide CC and strip lanes' : 'Show CC and strip lanes'}
                    aria-expanded={lanesExpanded}
                    onClick={() => setReplayLanesExpanded(!lanesExpanded)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                        padding: '3px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                        background: lanesExpanded ? 'rgba(245,158,11,0.16)' : 'var(--bg-input)',
                        border: `1px solid ${lanesExpanded ? '#f59e0b' : 'var(--border-subtle)'}`,
                        color: lanesExpanded ? '#f59e0b' : 'var(--text-muted)',
                        cursor: 'pointer',
                    }}
                >
                    {lanesExpanded ? <ChevronDown size={11} /> : <ChevronUp size={11} />} Lanes
                </button>
            </div>
            <div style={{ minWidth: 0 }}>
                <SyncedTimeline fight={fight} />
            </div>
            {lanesExpanded && (
                <>
                    <TimelineLaneGutter />
                    <div style={{ minWidth: 0 }}>
                        <TimelineLanes fight={fight} hideGutter />
                    </div>
                </>
            )}
        </div>
    );
};


/** Memoised so a map pan (which re-renders ReplayView every mouse event)
 *  doesn't re-render this panel — see the note in ReplaySquadPanel.tsx. */
export const TransportBar = React.memo(TransportBarInner);
TransportBar.displayName = 'TransportBar';

export default TransportBar;
