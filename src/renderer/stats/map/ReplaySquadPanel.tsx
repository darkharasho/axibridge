// src/renderer/stats/map/ReplaySquadPanel.tsx
import React, { useMemo } from 'react';
import { Crosshair, ChevronDown, ChevronRight } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { PartyMemberCard } from './PartyMemberCard';
import { SquadHealthStrip } from './SquadHealthStrip';
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
    const spotlightParty = useStatsStore(state => state.replaySpotlightParty);
    const setReplaySpotlightParty = useStatsStore(state => state.setReplaySpotlightParty);
    const collapsedParties = useStatsStore(state => state.replayCollapsedParties);
    const toggleParty = useStatsStore(state => state.toggleReplayPartyCollapsed);
    const showHealthStrip = useStatsStore(state => state.replayLayers.squadHealthStrip);

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
                className="app-dropdown"
                style={{
                    width: 28, flexShrink: 0,
                    background: 'var(--bg-elevated)',
                    borderRadius: 8,
                    borderLeft: '1px solid var(--border-default)',
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
        <div className="app-dropdown" style={{
            width: 216, maxHeight: '100%',
            background: 'var(--bg-elevated)',
            borderRadius: 10, border: '1px solid var(--border-default)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Squad · {allies.length}
                    </span>
                    <button
                        type="button"
                        title="Collapse squad panel"
                        onClick={onToggle}
                        style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px', borderRadius: 3, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                        ▶
                    </button>
                </div>
                {/* Was an absolute overlay across the top of the map; it reads
                    better banded above the roster it summarises. */}
                {showHealthStrip && (
                    <div style={{ marginTop: 4 }}>
                        <SquadHealthStrip fight={fight} timeMs={timeMs} />
                    </div>
                )}
            </div>
            <div className="replay-scroll" style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, padding: '3px 5px' }}>
                {byParty.map(([group, members]) => {
                    const isCollapsed = collapsedParties.has(group);
                    const isSpotlit = group === spotlightParty;
                    return (
                        <React.Fragment key={group}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                borderTop: '1px solid var(--border-subtle)', marginTop: 2, paddingTop: 3,
                            }}>
                                {/* Row = collapse, crosshair = spotlight. The row
                                    used to be the only spotlight control; collapse
                                    wins it because it is the more frequent action. */}
                                <button
                                    type="button"
                                    title={isCollapsed ? `Expand Party ${group}` : `Collapse Party ${group}`}
                                    aria-expanded={!isCollapsed}
                                    onClick={() => toggleParty(group)}
                                    style={{
                                        flex: 1, display: 'flex', alignItems: 'center', gap: 3,
                                        textAlign: 'left', padding: '2px 4px',
                                        fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
                                        color: isSpotlit ? 'var(--status-warning)' : 'var(--text-muted)',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                    }}
                                >
                                    {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                                    Party {group}
                                    <span style={{ opacity: 0.6, fontWeight: 500 }}>· {members.length}</span>
                                </button>
                                <button
                                    type="button"
                                    title={isSpotlit ? `Clear spotlight on Party ${group}` : `Spotlight Party ${group}`}
                                    aria-pressed={isSpotlit}
                                    onClick={() => setReplaySpotlightParty(isSpotlit ? null : group)}
                                    style={{
                                        width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: isSpotlit ? 'var(--status-warning)' : 'var(--text-muted)',
                                    }}
                                >
                                    <Crosshair size={11} />
                                </button>
                            </div>
                            {!isCollapsed && members.map(m => (
                                <PartyMemberCard
                                    key={m.id}
                                    member={m}
                                    timeMs={timeMs}
                                    boonIcons={boonIcons}
                                    skillIcons={skillIcons}
                                    onFollow={setReplayFollowTarget}
                                    isFollowed={(m.account || m.name) === followTarget}
                                />
                            ))}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default ReplaySquadPanel;
