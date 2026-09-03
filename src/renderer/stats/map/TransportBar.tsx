import React from 'react';
import { Pause, Play } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { SyncedTimeline } from './SyncedTimeline';
import { TimelineLaneOverlay, TimelineLaneLabels } from './TimelineLanes';
import { TransportInstrument } from './TransportInstrument';
import type { ReplayFightPayload } from './replayTypes';

export interface TransportBarProps {
    fight: ReplayFightPayload;
    style?: React.CSSProperties;
}

/**
 * A drawing of the two mirrored lanes, used as the toggle's icon.
 *
 * Depicts what it turns on instead of naming it — outgoing bars standing above
 * a zero rule, incoming ones hanging below at half weight, which is exactly
 * what appears over the plot when it is pressed.
 */
const LanesGlyph: React.FC = () => (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true" style={{ display: 'block' }}>
        <g fill="currentColor">
            <rect x="1" y="2" width="1.6" height="3" /><rect x="3.6" y="3.5" width="1.6" height="1.5" />
            <rect x="6.2" y="1" width="1.6" height="4" /><rect x="8.8" y="3" width="1.6" height="2" />
            <rect x="1" y="7" width="1.6" height="2" opacity={0.5} /><rect x="3.6" y="7" width="1.6" height="3" opacity={0.5} />
            <rect x="6.2" y="7" width="1.6" height="1.5" opacity={0.5} /><rect x="8.8" y="7" width="1.6" height="2.5" opacity={0.5} />
        </g>
        <rect x="0" y="5.6" width="12" height="0.8" fill="currentColor" opacity={0.35} />
    </svg>
);

/**
 * Everything you press while watching, in one row.
 *
 * This was a two-row grid: scrubber above, CC/strip lanes below, sharing a
 * column with a 92px label gutter. The lanes are now drawn *over* the scrubber
 * instead of under it, which collapses the whole structure:
 *
 * - No second row, so the bar is ~44px instead of ~120 and the map gets the
 *   difference back.
 * - No second x-axis to keep aligned. The overlay is inset over the scrubber's
 *   own svg, so they cannot drift the way they once did (~190px).
 * - No gutter, so nothing subtracts width from the chart. The lane names ride
 *   in the plot's corners, where neither lane ever deflects.
 * - No height change when the lanes toggle, so the HUD around the bar stops
 *   reflowing every time it is pressed.
 *
 * The toggle sits outside the plot rather than in its corner: the overlay is
 * `pointerEvents: 'none'` and passes clicks through to the scrubber, and this
 * keeps that true of the entire plot surface, with no corner where a click
 * toggles instead of seeking.
 *
 * `.app-dropdown` only paints a background under the glass themes (see
 * index.css) — the default theme leaves it transparent, which would make
 * this bar see-through over the map since blur doesn't work on this
 * platform. An explicit `background` keeps it opaque everywhere while
 * still picking up the glass-theme override where that class applies.
 */
const TransportBarInner: React.FC<TransportBarProps> = ({ fight, style }) => {
    const playing = useStatsStore(state => state.replayPlayhead.playing);
    const setReplayPlayhead = useStatsStore(state => state.setReplayPlayhead);
    const lanesExpanded = useStatsStore(state => state.replayLanesExpanded);
    const setReplayLanesExpanded = useStatsStore(state => state.setReplayLanesExpanded);

    return (
        <div
            className="app-dropdown"
            style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '4px 7px', borderRadius: 10,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                ...style,
            }}
        >
            <button
                type="button"
                aria-label={playing ? 'Pause' : 'Play'}
                onClick={() => setReplayPlayhead({ playing: !playing })}
                style={{
                    width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                    background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                }}
            >
                {playing ? <Pause size={12} /> : <Play size={12} />}
            </button>

            <TransportInstrument durationMs={fight.durationMs} tick={fight.tickRate} />

            <div data-testid="transport-plot" style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <SyncedTimeline fight={fight} lanesOverlaid={lanesExpanded} />
                {lanesExpanded && (
                    <>
                        <TimelineLaneOverlay fight={fight} />
                        <TimelineLaneLabels />
                    </>
                )}
            </div>

            <button
                type="button"
                data-testid="lanes-toggle"
                title={lanesExpanded ? 'Hide CC and strip lanes' : 'Show CC and strip lanes'}
                aria-label="CC and strip lanes"
                aria-pressed={lanesExpanded}
                onClick={() => setReplayLanesExpanded(!lanesExpanded)}
                style={{
                    width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    background: lanesExpanded ? 'rgba(245,158,11,0.18)' : 'var(--bg-input)',
                    border: `1px solid ${lanesExpanded ? '#f59e0b' : 'var(--border-subtle)'}`,
                    color: lanesExpanded ? '#f59e0b' : 'var(--text-muted)',
                }}
            >
                <LanesGlyph />
            </button>
        </div>
    );
};


/** Memoised so a map pan (which re-renders ReplayView every mouse event)
 *  doesn't re-render this panel — see the note in ReplaySquadPanel.tsx. */
export const TransportBar = React.memo(TransportBarInner);
TransportBar.displayName = 'TransportBar';

export default TransportBar;
