import React, { useEffect, useRef } from 'react';
import { MarkGlyph } from './MarkGlyph';
import { REPLAY_MARK_DEFS, type ReplayMarkKind } from './replayMarks';
import type { SquadMemberMovement } from '../../../shared/movementData';

export interface MarkMenuProps {
    member: SquadMemberMovement;
    current: ReplayMarkKind | undefined;
    /** Position inside the map container, in CSS px. */
    x: number;
    y: number;
    onPick: (kind: ReplayMarkKind | null) => void;
    /** Present for friendlies only: the replay can only follow its own side. */
    onFollow?: () => void;
    onClose: () => void;
}

const MENU_W = 168;

/**
 * Right-click menu over a replay member. Closes on any press outside it, on
 * Escape, and after every choice.
 */
export const MarkMenu: React.FC<MarkMenuProps> = ({ member, current, x, y, onPick, onFollow, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        // Capture, so a press that starts a map pan still closes the menu first.
        window.addEventListener('mousedown', onDown, true);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDown, true);
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    const pick = (kind: ReplayMarkKind | null) => { onPick(kind); onClose(); };
    const who = member.isEnemy
        ? `${member.name || 'Enemy'} (enemy)`
        : member.account || member.name;

    return (
        <div
            ref={ref}
            role="group"
            aria-label="Mark player"
            data-testid="mark-menu"
            onContextMenu={(e) => e.preventDefault()}
            // Same floated tile as the speed ladder, for the same reason: the
            // map moves under it and there is no blur on Linux to hide that.
            className="app-dropdown axi-panel axi-panel--tile axi-panel--float"
            style={{
                position: 'absolute', left: x, top: y, width: MENU_W, zIndex: 45,
                display: 'flex', flexDirection: 'column', gap: 2,
                '--axi-panel-pad': '4px',
            } as React.CSSProperties}
        >
            <div style={{
                padding: '2px 6px 4px', fontSize: 11, fontWeight: 600, color: 'var(--axi-text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={who}>
                {who}
            </div>
            {REPLAY_MARK_DEFS.map(d => (
                <button
                    key={d.kind}
                    type="button"
                    aria-pressed={current === d.kind}
                    onClick={() => pick(d.kind)}
                    className="axi-pill"
                    style={{
                        '--axi-pill-pad': '3px 8px', '--axi-pill-size': '11px',
                        '--axi-pill-fill': 'var(--axi-meta)',
                        display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start',
                        textTransform: 'none',
                    } as React.CSSProperties}
                >
                    <svg width={14} height={14} viewBox="-8 -8 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
                        <MarkGlyph kind={d.kind} r={7} />
                    </svg>
                    {d.kind === 'tag'
                        ? (member.isEnemy ? 'Mark as enemy tag' : 'Mark as our tag')
                        : `Mark ${d.label}`}
                </button>
            ))}
            {current && (
                <button type="button" onClick={() => pick(null)} className="axi-pill"
                    style={{ '--axi-pill-pad': '3px 8px', '--axi-pill-size': '11px', textTransform: 'none', justifyContent: 'flex-start' } as React.CSSProperties}>
                    Clear mark
                </button>
            )}
            {onFollow && (
                <button type="button" onClick={() => { onFollow(); onClose(); }} className="axi-pill"
                    style={{ '--axi-pill-pad': '3px 8px', '--axi-pill-size': '11px', textTransform: 'none', justifyContent: 'flex-start' } as React.CSSProperties}>
                    Follow
                </button>
            )}
        </div>
    );
};

export { MENU_W as MARK_MENU_WIDTH };
export default MarkMenu;
