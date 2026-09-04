import React from 'react';
import { useStatsStore } from '../statsStore';
import type { SquadMemberMovement } from '../../../shared/movementData';

/** True if `timeMs` falls within any `[start, end)` range. */
const inAnyRange = (ranges: [number, number][] | undefined, timeMs: number): boolean =>
    (ranges ?? []).some(([start, end]) => timeMs >= start && timeMs < end);

/**
 * Members lying dead right now, split by side.
 *
 * Deliberately a CURRENT count rather than a cumulative kill count: this number
 * exists to account for the icons the map just removed, so it has to reconcile
 * with what is on screen. A cumulative tally drifts above the hidden-icon count
 * the moment anyone respawns, and then explains nothing.
 *
 * Despawned members are excluded on both sides — they are hidden too, but they
 * left, they did not die.
 */
export function countDead(
    members: SquadMemberMovement[],
    timeMs: number,
): { squad: number; enemy: number } {
    let squad = 0;
    let enemy = 0;
    for (const m of members) {
        if (!m.inSquad && !m.isEnemy) continue;
        if (inAnyRange(m.dcRanges, timeMs)) continue;
        if (!inAnyRange(m.deadRanges, timeMs)) continue;
        if (m.isEnemy) enemy++; else squad++;
    }
    return { squad, enemy };
}

const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5,
    fontSize: 11, fontVariantNumeric: 'tabular-nums', lineHeight: '14px',
};

/**
 * The graveyard: how many bodies are on the field, for the fights where they
 * are not being drawn.
 *
 * Renders nothing while `showDead` is on — the map is already showing them, and
 * a count of things you can see is clutter of exactly the kind hiding them was
 * meant to remove. Clicking it turns them back on.
 */
const DeathTallyCardInner: React.FC<{ members: SquadMemberMovement[]; timeMs: number }> = ({ members, timeMs }) => {
    const showDead = useStatsStore(state => state.replayLayers.showDead);
    const setReplayLayer = useStatsStore(state => state.setReplayLayer);
    const { squad, enemy } = countDead(members, timeMs);

    if (showDead || (squad === 0 && enemy === 0)) return null;

    return (
        <button
            type="button"
            data-death-tally
            title="Players lying dead right now, hidden from the map. Click to show them."
            onClick={() => setReplayLayer('showDead', true)}
            className="app-dropdown"
            style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                padding: '5px 8px', borderRadius: 8,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                cursor: 'pointer', textAlign: 'left',
            }}
        >
            <span style={{ ...rowStyle, color: '#60a5fa' }}>
                <span aria-hidden="true">☠</span>
                <span>{squad}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>squad</span>
            </span>
            <span style={{ ...rowStyle, color: '#ef4444' }}>
                <span aria-hidden="true">☠</span>
                <span>{enemy}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>enemy</span>
            </span>
        </button>
    );
};

/** Memoised for the same reason as the layers panel: a pan must not re-render it. */
export const DeathTallyCard = React.memo(DeathTallyCardInner);
DeathTallyCard.displayName = 'DeathTallyCard';

export default DeathTallyCard;
