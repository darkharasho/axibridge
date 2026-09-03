import React, { useMemo, useState } from 'react';
import { useStatsStore } from '../statsStore';
import { formatDuration } from '../../../shared/mapUtils';
import { tickRateAt, tickWindow, tickTone } from './tickRate';
import type { ReplayTickRate } from './replayTypes';

// 0.25× exists for the same reason the replay exists: a rally or a spike
// resolves inside a couple of polls, and at 1× you watch it happen without
// seeing it.
export const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4] as const;

const TONE_COLOR: Record<string, string> = {
    normal: 'var(--text-secondary)',
    warn: 'var(--status-warning)',
    bad: '#f87171',
};

const SPARK_W = 26;
const SPARK_H = 10;
/** Seconds of history in the sparkline. Long enough to show a dip arriving, short enough to stay 26px wide. */
const SPARK_SECONDS = 13;

interface TickReadoutProps {
    tick: ReplayTickRate;
    timeMs: number;
}

/**
 * Live server tick at the playhead, with a short trailing sparkline.
 *
 * Deliberately colourless at a healthy tick: nominal is 25 and the great
 * majority of seconds in the great majority of fights sit there, so colour
 * appearing at all is the whole message. `avg` is never shown — it is ~25.0
 * on every log ever measured (see `tickRate.ts`) and would read as a constant.
 */
const TickReadout: React.FC<TickReadoutProps> = ({ tick, timeMs }) => {
    const value = tickRateAt(tick, timeMs);
    const window = useMemo(() => tickWindow(tick, timeMs, SPARK_SECONDS), [tick, timeMs]);

    if (value === null) return null;

    const tone = tickTone(value);
    const color = TONE_COLOR[tone];

    // Fixed 15..28 domain rather than min/max of the window: an auto-scaled
    // sparkline makes a flat healthy stretch look like violent noise, which is
    // the opposite of what this is for.
    const points = window.map((v, i) => {
        const x = window.length > 1 ? (i / (window.length - 1)) * SPARK_W : SPARK_W;
        const norm = Math.max(0, Math.min(1, (v - 15) / 13));
        return `${x.toFixed(1)},${((1 - norm) * SPARK_H).toFixed(1)}`;
    }).join(' ');

    const title = tone === 'normal'
        ? `Server tick ${value.toFixed(1)}/s — normal (25 is nominal). Fight low: ${tick.min.toFixed(1)}.`
        : `Server tick ${value.toFixed(1)}/s — the server was behind here, so reactions in this stretch are not strictly comparable to a clean fight. Fight low: ${tick.min.toFixed(1)}.`;

    return (
        <span
            data-testid="tick-readout"
            data-tone={tone}
            title={title}
            style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 10.5, fontVariantNumeric: 'tabular-nums', color,
            }}
        >
            {window.length > 1 && (
                <svg width={SPARK_W} height={SPARK_H} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
                    <polyline points={points} fill="none" stroke="currentColor" strokeOpacity={0.8} strokeWidth={1} />
                </svg>
            )}
            {value.toFixed(1)}
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>tick</span>
        </span>
    );
};

const Divider: React.FC = () => (
    <span aria-hidden="true" style={{ width: 1, height: 11, background: 'var(--border-default)', flexShrink: 0 }} />
);

export interface TransportInstrumentProps {
    durationMs: number;
    tick: ReplayTickRate | null;
}

/**
 * Where you are, how fast you're moving, and how well the server was keeping
 * up — one object, immediately right of the play button.
 *
 * These three belong together: all are rates or positions in the same
 * timeline, and reading one without the others is what made the old bar's
 * clock feel stranded. Keeping them together is also what let the speed
 * ladder collapse from a row of buttons into one value that opens on hover,
 * which is where most of the reclaimed gutter width came from.
 */
export const TransportInstrument: React.FC<TransportInstrumentProps> = ({ durationMs, tick }) => {
    const timeMs = useStatsStore(state => state.replayPlayhead.timeMs);
    const speed = useStatsStore(state => state.replayPlayhead.speed);
    const setReplayPlayhead = useStatsStore(state => state.setReplayPlayhead);
    const [ladderOpen, setLadderOpen] = useState(false);

    return (
        <div
            data-testid="transport-instrument"
            // No chip shell of its own any more: it sits inline beside the
            // play button in a single-row bar, so a border here would draw a
            // box around three quarters of the controls for no reason.
            style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, height: 22 }}
        >
            <span data-testid="transport-clock" style={{ fontSize: 11, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--text-primary)' }}>{formatDuration(timeMs)}</span>
                {' / '}
                {formatDuration(durationMs)}
            </span>

            <Divider />

            <span
                style={{ position: 'relative', display: 'flex' }}
                onMouseEnter={() => setLadderOpen(true)}
                onMouseLeave={() => setLadderOpen(false)}
            >
                {ladderOpen && (
                    // The 6px breathing room between chip and ladder used to be
                    // an offset, which made it a hole: crossing it put the
                    // pointer on the transport bar, the wrapper got a
                    // mouseleave, and the ladder closed under the cursor on the
                    // way to it. It is transparent padding on a bridging span
                    // now, so the gap still reads as a gap but the hover region
                    // is continuous.
                    <span
                        style={{
                            position: 'absolute', bottom: '100%', right: 0,
                            paddingBottom: 6, zIndex: 30,
                        }}
                    >
                    <span
                        data-testid="speed-ladder"
                        // A floating surface over the map: under the glass themes a bare
                        // `--bg-elevated` is translucent (blur is a no-op on Linux), so the
                        // map reads straight through the ladder. `.app-dropdown` is the
                        // shared opaque override for exactly this.
                        className="app-dropdown"
                        style={{
                            display: 'flex', flexDirection: 'column-reverse', gap: 2, padding: 3,
                            borderRadius: 7,
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-default)',
                            boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
                        }}
                    >
                        {SPEEDS.map(s => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => { setReplayPlayhead({ speed: s }); setLadderOpen(false); }}
                                style={{
                                    padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                    fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
                                    background: speed === s ? 'var(--status-info-bg)' : 'var(--bg-input)',
                                    border: `1px solid ${speed === s ? 'var(--status-info-border)' : 'var(--border-subtle)'}`,
                                    color: speed === s ? 'var(--status-info)' : 'var(--text-muted)',
                                }}
                            >
                                {s}×
                            </button>
                        ))}
                    </span>
                    </span>
                )}
                <button
                    type="button"
                    data-testid="speed-chip"
                    aria-haspopup="true"
                    aria-expanded={ladderOpen}
                    aria-label={`Playback speed ${speed}×, pick a speed`}
                    title="Pick a playback speed"
                    // Opens the ladder rather than stepping the speed. Cycling
                    // was six clicks wide once 0.25× joined, and it made the
                    // chip's own label the thing you had to read to find out
                    // where a click had landed you.
                    onClick={() => setLadderOpen(true)}
                    onFocus={() => setLadderOpen(true)}
                    style={{
                        padding: '1px 5px', borderRadius: 4, fontSize: 10.5, fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
                        background: 'var(--status-info-bg)',
                        border: '1px solid var(--status-info-border)',
                        color: 'var(--status-info)',
                    }}
                >
                    {speed}×
                </button>
            </span>

            {tick && (
                <>
                    <Divider />
                    <TickReadout tick={tick} timeMs={timeMs} />
                </>
            )}
        </div>
    );
};

export default TransportInstrument;
