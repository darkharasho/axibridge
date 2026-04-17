import type { SquadMemberMovement } from '../../../shared/movementData';

export type MemberStatus = 'alive' | 'down' | 'dead';

export function hpAt(member: SquadMemberMovement, timeMs: number): number {
    const series = member.healthPercents;
    if (!series?.length) return 100;
    let hp = 100;
    for (const [t, v] of series) {
        if (t > timeMs) break;
        hp = v;
    }
    return hp;
}

export function statusAt(member: SquadMemberMovement, timeMs: number): MemberStatus {
    for (const [start, end] of member.deadRanges) {
        if (timeMs >= start && (end === 0 || timeMs <= end)) return 'dead';
    }
    for (const [start, end] of member.downRanges) {
        if (timeMs >= start && (end === 0 || timeMs <= end)) return 'down';
    }
    return 'alive';
}

export type ActiveBoon = { id: number; stacks: number };

export function activeBoons(member: SquadMemberMovement, timeMs: number): ActiveBoon[] {
    if (!member.boonStates) return [];
    const result: ActiveBoon[] = [];
    for (const [idStr, states] of Object.entries(member.boonStates)) {
        let stacks = 0;
        for (const [t, v] of states) {
            if (t > timeMs) break;
            stacks = v;
        }
        if (stacks > 0) result.push({ id: Number(idStr), stacks });
    }
    return result;
}

export function activeSkillsAt(member: SquadMemberMovement, timeMs: number): number[] {
    if (!member.skillCasts?.length) return [];
    return member.skillCasts
        .filter(c => c.time >= timeMs && c.time < timeMs + 1000)
        .map(c => c.id);
}
