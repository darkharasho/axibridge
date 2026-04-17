// src/renderer/stats/map/ReplaySquadPanel.tsx
import React, { useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import { PartyMemberCard } from './PartyMemberCard';
import type { ReplayFightPayload } from './replayTypes';

interface ReplaySquadPanelProps {
    fight: ReplayFightPayload;
    collapsed: boolean;
    onToggle: () => void;
}

export const ReplaySquadPanel: React.FC<ReplaySquadPanelProps> = ({ fight, collapsed, onToggle }) => {
    const timeMs = useStatsStore(state => state.replayPlayhead.timeMs);
    const setReplayFollowTarget = useStatsStore(state => state.setReplayFollowTarget);
    const followTarget = useStatsStore(state => state.replayViewport.followTarget);

    const allies = useMemo(
        () => fight.movementData.members.filter(m => !m.isEnemy && m.inSquad),
        [fight.movementData.members],
    );

    const byParty = useMemo(() => {
        const map = new Map<number, typeof allies>();
        for (const m of allies) {
            const group = m.group ?? 0;
            if (!map.has(group)) map.set(group, []);
            map.get(group)!.push(m);
        }
        return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    }, [allies]);

    const { boonIcons, skillIcons } = fight.movementData;

    if (collapsed) {
        return (
            <button
                type="button"
                title="Expand squad panel"
                onClick={onToggle}
                style={{
                    width: 28, flexShrink: 0,
                    background: 'var(--bg-elevated)',
                    borderLeft: '1px solid var(--border-default)',
                    border: 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    paddingTop: 8, cursor: 'pointer',
                }}
            >
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>◀</span>
                <span style={{ writingMode: 'vertical-rl', fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 7 }}>
                    Squad
                </span>
            </button>
        );
    }

    return (
        <div style={{
            width: 230, flexShrink: 0,
            background: 'var(--bg-elevated)',
            borderLeft: '1px solid var(--border-default)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Squad · {allies.length} members</span>
                <button
                    type="button"
                    title="Collapse squad panel"
                    onClick={onToggle}
                    style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px', borderRadius: 3, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                    ▶
                </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                {byParty.map(([group, members]) => (
                    <React.Fragment key={group}>
                        <div style={{ padding: '5px 8px 2px', fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', marginTop: 2 }}>
                            Party {group}
                        </div>
                        {members.map(m => (
                            <PartyMemberCard
                                key={`${m.name}_${m.account}`}
                                member={m}
                                timeMs={timeMs}
                                boonIcons={boonIcons}
                                skillIcons={skillIcons}
                                onFollow={setReplayFollowTarget}
                                isFollowed={(m.account || m.name) === followTarget}
                            />
                        ))}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

export default ReplaySquadPanel;
