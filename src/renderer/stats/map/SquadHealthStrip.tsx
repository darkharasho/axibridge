import React, { useMemo } from 'react';
import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';
import { getProfessionColor } from '../../../shared/professionUtils';

interface SquadHealthStripProps {
    fight: ReplayFightPayload;
    timeMs: number;
}

function hpAt(m: SquadMemberMovement, t: number): number {
    const s = m.healthPercents;
    if (!s?.length) return 100;
    let hp = 100;
    for (const [ts, v] of s) {
        if (ts > t) break;
        hp = v;
    }
    return hp;
}

function statusAt(m: SquadMemberMovement, t: number): 'alive' | 'down' | 'dead' {
    for (const [start, end] of m.deadRanges) {
        if (t >= start && (end === 0 || t <= end)) return 'dead';
    }
    for (const [start, end] of m.downRanges) {
        if (t >= start && (end === 0 || t <= end)) return 'down';
    }
    return 'alive';
}

export const SquadHealthStrip: React.FC<SquadHealthStripProps> = ({ fight, timeMs }) => {
    const allies = useMemo(() => {
        return fight.movementData.members
            .filter(m => !m.isEnemy && m.inSquad)
            .sort((a, b) => (a.group - b.group) || a.name.localeCompare(b.name));
    }, [fight.movementData.members]);

    return (
        <div className="replay-health-strip"
             style={{ display: 'flex', gap: 2, padding: 2, height: 16, background: 'rgba(8,12,26,0.6)', borderRadius: 4 }}>
            {allies.map(m => {
                const hp = hpAt(m, timeMs);
                const status = statusAt(m, timeMs);
                const fill = status === 'dead' ? '#7f1d1d'
                    : status === 'down' ? '#9a3412'
                    : getProfessionColor(m.profession);
                const strokeColor = status === 'dead' ? '#ef4444'
                    : status === 'down' ? '#fdba74'
                    : 'transparent';
                return (
                    <div
                        key={`${m.name}_${m.account}`}
                        data-hpcell
                        data-status={status}
                        title={`${m.name} — ${hp}%`}
                        style={{
                            flex: 1, minWidth: 4, background: '#1f2937',
                            border: `1px solid ${strokeColor}`,
                            borderRadius: 2, overflow: 'hidden',
                        }}
                    >
                        <div style={{ width: `${Math.max(0, Math.min(100, hp))}%`, height: '100%', background: fill }} />
                    </div>
                );
            })}
        </div>
    );
};

export default SquadHealthStrip;
