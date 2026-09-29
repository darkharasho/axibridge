import React, { useCallback } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { formatDuration } from '../../../shared/mapUtils';
import type { ReplayFightPayload } from './replayTypes';

export interface FightIdentityPillProps {
    fights: ReplayFightPayload[];
    onOpenPicker: () => void;
}

const stepBtn = (disabled: boolean): React.CSSProperties => ({
    width: 20, height: 20, borderRadius: 4, flexShrink: 0,
    background: 'transparent', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
    cursor: disabled ? 'default' : 'pointer',
});

/**
 * Which fight you are looking at, centred over the map. Replaces the
 * full-width picker bar: the same stepping and the same doorway into the
 * `FightPicker` overlay, in ~28px of floating chrome instead of 34px of
 * docked chrome.
 *
 * An `.axi-toolbar--float`, like the transport bar below it: a raised surface
 * holding controls, pinned over content that moves. `.app-dropdown` is the
 * entrance animation and nothing else.
 *
 * It loses its capsule in the process. The 16px radius it used to write inline
 * happens to be exactly what glass gives a panel-sized surface, so under that
 * theme nothing moves; under the default theme, whose radius is 0, this squares
 * off along with every other card already migrated. The language has one radius
 * scale and no capsule in it, and a component keeping its own corner is the
 * reskin this whole exercise is removing - so the name stays historical and the
 * shape follows the theme.
 */
const FightIdentityPillInner: React.FC<FightIdentityPillProps> = ({ fights, onOpenPicker }) => {
    const selectedId = useStatsStore(state => state.selectedReplayFightId);
    const setSelectedReplayFight = useStatsStore(state => state.setSelectedReplayFight);

    const currentIdx = fights.findIndex(f => f.fightId === selectedId);
    const current = fights[currentIdx];

    const step = useCallback((dir: -1 | 1) => {
        if (!fights.length) return;
        const idx = currentIdx < 0 ? 0 : currentIdx;
        const nextIdx = Math.max(0, Math.min(fights.length - 1, idx + dir));
        const next = fights[nextIdx];
        if (next && next.fightId !== selectedId) setSelectedReplayFight(next.fightId);
    }, [fights, currentIdx, selectedId, setSelectedReplayFight]);

    if (!fights.length) return null;

    const atFirst = currentIdx <= 0;
    const atLast = currentIdx >= fights.length - 1;

    return (
        <div
            className="app-dropdown axi-toolbar axi-toolbar--float axi-toolbar--nowrap"
            style={{
                gap: 6, maxWidth: 380,
                '--axi-toolbar-pad': '3px 6px',
            } as React.CSSProperties}
        >
            <button type="button" title="Previous fight" aria-label="Previous fight"
                    onClick={() => step(-1)} disabled={atFirst} style={stepBtn(atFirst)}>
                <ChevronLeft size={13} />
            </button>

            <button
                type="button"
                title="Show all fights"
                onClick={onOpenPicker}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
            >
                <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {current?.label ?? '—'}
                </span>
                {current && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        · {formatDuration(current.durationMs)}
                        · <Users size={9} />{current.squadSize}
                    </span>
                )}
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                    · {currentIdx >= 0 ? currentIdx + 1 : '—'} of {fights.length}
                </span>
                <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>

            <button type="button" title="Next fight" aria-label="Next fight"
                    onClick={() => step(1)} disabled={atLast} style={stepBtn(atLast)}>
                <ChevronRight size={13} />
            </button>
        </div>
    );
};


/** Memoised so a map pan (which re-renders ReplayView every mouse event)
 *  doesn't re-render this panel — see the note in ReplaySquadPanel.tsx. */
export const FightIdentityPill = React.memo(FightIdentityPillInner);
FightIdentityPill.displayName = 'FightIdentityPill';

export default FightIdentityPill;
