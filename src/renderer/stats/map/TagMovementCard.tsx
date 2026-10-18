import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { sampleAt } from './layers/MemberLayer';
import { applyMark, estimateLag, markDef, pickTagPair, speedSeries, type FightMarks } from './replayMarks';
import type { ReplayFightPayload } from './replayTypes';

const W = 220;
const H = 48;
/** Fixed ceiling, in in/s: out-of-combat run speed with swiftness is ~400, so
 *  a scale fitted to the max would be set by one leap and flatten the rest. */
const SPEED_CAP = 600;
/** Widest lead or lag searched for, in seconds. */
const MAX_LAG_S = 10;
const OURS_COLOR = '#fbbf24';

const linePath = (series: (number | null)[]) => {
    const n = series.length;
    if (n < 2) return '';
    let d = '';
    let pen = false;
    series.forEach((v, i) => {
        if (v === null) { pen = false; return; }
        const x = (i / (n - 1)) * W;
        const y = H - (Math.min(v, SPEED_CAP) / SPEED_CAP) * (H - 2) - 1;
        d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `;
        pen = true;
    });
    return d.trim();
};

const fmt = (n: number) => Math.round(n).toLocaleString();

export interface TagMovementCardProps {
    fight: ReplayFightPayload;
    marks: FightMarks | undefined;
    timeMs: number;
}

/**
 * Our tag against the enemy tag the user marked: how fast each is moving over
 * the fight, how far apart they are now, and which one tends to move first.
 *
 * Shown only once an enemy has been marked `tag` - there is no way to know
 * the enemy commander from the log, so without the mark there is nothing to
 * compare against.
 */
export const TagMovementCard: React.FC<TagMovementCardProps> = ({ fight, marks, timeMs }) => {
    const setReplayPlayhead = useStatsStore(state => state.setReplayPlayhead);
    const setReplayMarks = useStatsStore(state => state.setReplayMarks);
    const { members, pollingRate, pixelsPerInch } = fight.movementData;
    const pair = useMemo(() => pickTagPair(members, marks), [members, marks]);

    const totalPolls = pollingRate > 0 ? Math.ceil(fight.durationMs / pollingRate) + 1 : 0;
    const analysis = useMemo(() => {
        if (!pair || totalPolls < 2) return null;
        const ours = speedSeries(pair.ours, totalPolls, pollingRate, pixelsPerInch);
        const theirs = speedSeries(pair.theirs, totalPolls, pollingRate, pixelsPerInch);
        const lag = estimateLag(ours, theirs, Math.round((MAX_LAG_S * 1000) / pollingRate));
        return { ours, theirs, lag, oursPath: linePath(ours), theirsPath: linePath(theirs) };
    }, [pair, totalPolls, pollingRate, pixelsPerInch]);

    if (!pair || !analysis) return null;

    const pollFrac = pollingRate > 0 ? timeMs / pollingRate : 0;
    const poll = Math.min(totalPolls - 1, Math.max(0, Math.round(pollFrac)));
    const pa = sampleAt(pair.ours, pollFrac);
    const pb = sampleAt(pair.theirs, pollFrac);
    const ppiX = pixelsPerInch?.x || 1;
    const ppiY = pixelsPerInch?.y || ppiX;
    const apart = pa && pb ? Math.hypot((pa[0] - pb[0]) / ppiX, (pa[1] - pb[1]) / ppiY) : null;
    const speedNow = (s: (number | null)[]) => (s[poll] === null || s[poll] === undefined ? '–' : fmt(s[poll]!));
    const playheadX = fight.durationMs > 0 ? (timeMs / fight.durationMs) * W : 0;
    const theirsColor = markDef('tag').color;

    let lagText = 'No clear lead or lag';
    if (analysis.lag) {
        const secs = Math.abs(analysis.lag.lagPolls * pollingRate) / 1000;
        lagText = analysis.lag.lagPolls === 0
            ? 'They move with us'
            : `They move ~${secs.toFixed(1)}s ${analysis.lag.lagPolls > 0 ? 'after' : 'before'} us`;
        lagText += ` (r ${analysis.lag.r.toFixed(2)})`;
    }

    const scrub = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setReplayPlayhead({ timeMs: frac * fight.durationMs });
    };
    const clear = () => {
        const current = useStatsStore.getState().replayMarks[fight.fightId] ?? {};
        setReplayMarks(fight.fightId, applyMark(current, members, pair.theirs.id, null));
    };
    const name = (m: typeof pair.ours) => m.isEnemy ? (m.name || 'Enemy') : (m.name || m.account);

    return (
        <div
            data-testid="tag-movement-card"
            className="app-dropdown axi-panel axi-panel--tile axi-panel--float"
            style={{ '--axi-panel-pad': '6px 8px', width: W + 16, fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 4 } as React.CSSProperties}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', fontSize: 9.5, color: 'var(--axi-text-dim)' }}>Tag movement</span>
                <button type="button" onClick={clear} title="Clear the enemy tag mark" aria-label="Clear the enemy tag mark"
                    className="axi-btn axi-btn--icon axi-btn--xs" style={{ marginLeft: 'auto' }}>
                    <X size={10} />
                </button>
            </div>
            <div style={{ display: 'flex', gap: 10, color: 'var(--axi-text)' }}>
                <span title={pair.ours.account} style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <span style={{ width: 8, height: 2, background: OURS_COLOR, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(pair.ours)}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <span style={{ width: 8, height: 2, background: theirsColor, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name(pair.theirs)}</span>
                </span>
            </div>
            <svg width={W} height={H} onClick={scrub} style={{ display: 'block', cursor: 'pointer', background: 'rgba(8,12,26,0.6)', borderRadius: 4 }}>
                <title>Speed of each tag over the fight (in/s). Click to jump there.</title>
                <path data-testid="tag-speed-ours" d={analysis.oursPath} fill="none" stroke={OURS_COLOR} strokeWidth={1.2} />
                <path data-testid="tag-speed-theirs" d={analysis.theirsPath} fill="none" stroke={theirsColor} strokeWidth={1.2} />
                <line x1={playheadX} x2={playheadX} y1={0} y2={H} stroke="var(--axi-text-dim)" strokeWidth={1} />
            </svg>
            <div style={{ color: 'var(--axi-text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                Speed {speedNow(analysis.ours)} / {speedNow(analysis.theirs)} in/s
                {apart !== null && <> · {fmt(apart)} in apart</>}
            </div>
            <div data-testid="tag-lag" style={{ color: 'var(--axi-text)' }}>{lagText}</div>
        </div>
    );
};

export default TagMovementCard;
