import React, { useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';

interface EventOverlayProps {
    fight: ReplayFightPayload;
    timeMs: number;
    scale: number;
}

const PULSE_DURATION_MS = 1500;

interface Pulse {
    x: number;
    y: number;
    ageMs: number;
    kind: 'down' | 'death' | 'damage' | 'rally';
}

function positionAt(member: SquadMemberMovement, timeMs: number, pollingRate: number): [number, number] | null {
    if (!member.positions.length) return null;
    const idx = Math.min(member.positions.length - 1, Math.floor(timeMs / pollingRate));
    return member.positions[idx];
}

function collectBasePulses(fight: ReplayFightPayload, timeMs: number): Pulse[] {
    const pulses: Pulse[] = [];
    const { pollingRate } = fight.movementData;
    for (const m of fight.movementData.members) {
        if (m.isEnemy) continue;
        for (const [t] of m.downRanges) {
            const age = timeMs - t;
            if (age >= 0 && age < PULSE_DURATION_MS) {
                const pos = positionAt(m, t, pollingRate);
                if (pos) pulses.push({ x: pos[0], y: pos[1], ageMs: age, kind: 'down' });
            }
        }
        for (const [t] of m.deadRanges) {
            const age = timeMs - t;
            if (age >= 0 && age < PULSE_DURATION_MS) {
                const pos = positionAt(m, t, pollingRate);
                if (pos) pulses.push({ x: pos[0], y: pos[1], ageMs: age, kind: 'death' });
            }
        }
    }
    return pulses;
}

function memberByKey(fight: ReplayFightPayload): Map<string, SquadMemberMovement> {
    const map = new Map<string, SquadMemberMovement>();
    for (const m of fight.movementData.members) {
        if (!m.isEnemy) map.set(m.account || m.name, m);
    }
    return map;
}

function collectDamagePulses(fight: ReplayFightPayload, timeMs: number, index: Map<string, SquadMemberMovement>): Pulse[] {
    const pulses: Pulse[] = [];
    const { pollingRate } = fight.movementData;
    for (const e of fight.damageSpikeEvents) {
        const age = timeMs - e.timeMs;
        if (age < 0 || age >= PULSE_DURATION_MS) continue;
        const m = index.get(e.memberKey);
        if (!m) continue;
        const pos = positionAt(m, timeMs, pollingRate);
        if (pos) pulses.push({ x: pos[0], y: pos[1], ageMs: age, kind: 'damage' });
    }
    return pulses;
}

function collectRallyPulses(fight: ReplayFightPayload, timeMs: number, index: Map<string, SquadMemberMovement>): Pulse[] {
    const pulses: Pulse[] = [];
    const { pollingRate } = fight.movementData;
    for (const e of fight.rallyEvents) {
        const age = timeMs - e.timeMs;
        if (age < 0 || age >= PULSE_DURATION_MS) continue;
        const m = index.get(e.memberKey);
        if (!m) continue;
        const pos = positionAt(m, e.timeMs, pollingRate);
        if (pos) pulses.push({ x: pos[0], y: pos[1], ageMs: age, kind: 'rally' });
    }
    return pulses;
}

interface FocusLine { x1: number; y1: number; x2: number; y2: number; key: string; }

function collectFocusLines(fight: ReplayFightPayload, timeMs: number, index: Map<string, SquadMemberMovement>): FocusLine[] {
    const enemies = fight.movementData.members.filter(m => m.isEnemy);
    if (!enemies.length) return [];
    const byMember = new Map<string, number>();
    for (const s of fight.targetFocusSamples) {
        if (s.timeMs > timeMs) break;
        if (timeMs - s.timeMs > 3000) continue;
        byMember.set(s.memberKey, s.targetIndex);
    }
    const lines: FocusLine[] = [];
    const { pollingRate } = fight.movementData;
    for (const [memberKey, targetIndex] of byMember) {
        const m = index.get(memberKey);
        const tgt = enemies[targetIndex];
        if (!m || !tgt) continue;
        const from = positionAt(m, timeMs, pollingRate);
        const to = positionAt(tgt, timeMs, pollingRate);
        if (!from || !to) continue;
        lines.push({ x1: from[0], y1: from[1], x2: to[0], y2: to[1], key: memberKey });
    }
    return lines;
}

export const EventOverlay: React.FC<EventOverlayProps> = ({ fight, timeMs, scale: s }) => {
    const layers = useStatsStore(state => state.replayLayers);
    const index = useMemo(() => memberByKey(fight), [fight]);

    const basePulses = collectBasePulses(fight, timeMs);
    const damagePulses = layers.damagePulses ? collectDamagePulses(fight, timeMs, index) : [];
    const rallyPulses = layers.rallyRings ? collectRallyPulses(fight, timeMs, index) : [];
    const focusLines = layers.targetFocusLines ? collectFocusLines(fight, timeMs, index) : [];

    return (
        <g className="replay-events">
            {focusLines.map(line => (
                <line key={`f-${line.key}`} data-pulse="target-focus"
                    x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                    stroke="#fb923c" strokeOpacity={0.4} strokeWidth={0.8 / s}
                    strokeDasharray={`${3 / s} ${3 / s}`} pointerEvents="none" />
            ))}
            {basePulses.map((p, i) => {
                const progress = p.ageMs / PULSE_DURATION_MS;
                if (p.kind === 'down') {
                    const r = 18 * (1 - progress) / s;
                    return <circle key={`b-${i}`} data-pulse="down"
                        cx={p.x} cy={p.y} r={r}
                        fill="none" stroke="#60a5fa" strokeOpacity={(1 - progress) * 0.6} strokeWidth={2 / s} />;
                }
                const r = (10 + 24 * progress) / s;
                return (
                    <g key={`b-${i}`} data-pulse="death">
                        <circle cx={p.x} cy={p.y} r={r} fill="none" stroke="#ef4444"
                                strokeOpacity={(1 - progress) * 0.5} strokeWidth={3 / s} />
                        <text x={p.x} y={p.y + 4 / s} textAnchor="middle" fontSize={14 / s}
                              fill="#fecaca" opacity={(1 - progress) * 0.6}>☠</text>
                    </g>
                );
            })}
            {damagePulses.map((p, i) => {
                const progress = p.ageMs / PULSE_DURATION_MS;
                const r = (8 + 22 * progress) / s;
                return <circle key={`d-${i}`} data-pulse="damage"
                    cx={p.x} cy={p.y} r={r}
                    fill="none" stroke="#fbbf24" strokeOpacity={1 - progress} strokeWidth={2.5 / s} />;
            })}
            {rallyPulses.map((p, i) => {
                const progress = p.ageMs / PULSE_DURATION_MS;
                const r = (6 + 18 * progress) / s;
                return <circle key={`r-${i}`} data-pulse="rally"
                    cx={p.x} cy={p.y} r={r}
                    fill="none" stroke="#22c55e" strokeOpacity={1 - progress} strokeWidth={2 / s} />;
            })}
        </g>
    );
};

export default EventOverlay;
