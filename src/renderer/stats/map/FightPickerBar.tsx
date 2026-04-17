import React, { useCallback } from 'react';
import { useStatsStore } from '../statsStore';
import { FightPicker } from './FightPicker';
import type { ReplayFightPayload } from './replayTypes';

interface FightPickerBarProps {
    fights: ReplayFightPayload[];
    collapsed: boolean;
    onToggle: () => void;
}

export const FightPickerBar: React.FC<FightPickerBarProps> = ({ fights, collapsed, onToggle }) => {
    const selectedId = useStatsStore(state => state.selectedReplayFightId);
    const setSelectedReplayFight = useStatsStore(state => state.setSelectedReplayFight);

    const currentIdx = fights.findIndex(f => f.fightId === selectedId);
    const activeLabel = fights[currentIdx]?.label ?? '';

    const step = useCallback((dir: -1 | 1) => {
        if (!fights.length) return;
        const idx = currentIdx < 0 ? 0 : currentIdx;
        const nextIdx = Math.max(0, Math.min(fights.length - 1, idx + dir));
        const next = fights[nextIdx];
        if (next && next.fightId !== selectedId) setSelectedReplayFight(next.fightId);
    }, [fights, currentIdx, selectedId, setSelectedReplayFight]);

    const stepBack = useCallback(() => step(-1), [step]);
    const stepForward = useCallback(() => step(1), [step]);

    const atFirst = fights.length === 0 || currentIdx <= 0;
    const atLast = fights.length === 0 || currentIdx >= fights.length - 1;

    if (collapsed) {
        return (
            <div style={{
                background: 'var(--bg-elevated)',
                borderBottom: '1px solid var(--border-subtle)',
                height: 34, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
            }}>
                <button
                    type="button"
                    onClick={onToggle}
                    style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-hover)', cursor: 'pointer' }}
                >
                    ▼ Show all fights
                </button>
                {activeLabel && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--status-info)', padding: '2px 8px', borderRadius: 4, background: 'var(--status-info-bg)', border: '1px solid var(--status-info-border)' }}>
                        {activeLabel}
                    </span>
                )}
                {fights.length > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                        {currentIdx >= 0 ? currentIdx + 1 : '—'} of {fights.length}
                    </span>
                )}
                <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                    <button
                        type="button"
                        title="Previous fight"
                        aria-label="Previous fight"
                        onClick={stepBack}
                        disabled={atFirst}
                        style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', fontSize: 10, color: atFirst ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: atFirst ? 'default' : 'pointer' }}
                    >◀</button>
                    <button
                        type="button"
                        title="Next fight"
                        aria-label="Next fight"
                        onClick={stepForward}
                        disabled={atLast}
                        style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', fontSize: 10, color: atLast ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: atLast ? 'default' : 'pointer' }}
                    >▶</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'stretch' }}>
            <button
                type="button"
                title="Collapse fight picker"
                onClick={onToggle}
                style={{ width: 36, flexShrink: 0, borderRight: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
                ▲
            </button>
            <div style={{ flex: 1, overflow: 'hidden', overflowX: 'auto' }}>
                <FightPicker fights={fights} />
            </div>
        </div>
    );
};

export default FightPickerBar;
