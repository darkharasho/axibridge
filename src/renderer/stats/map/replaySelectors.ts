import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';

export function pickDefaultFightId(fights: ReplayFightPayload[]): string | null {
    if (!fights.length) return null;
    let best = fights[0];
    for (let i = 1; i < fights.length; i++) {
        const candidate = fights[i];
        if (
            candidate.timestampMs > best.timestampMs
            || (candidate.timestampMs === best.timestampMs && candidate.fightIndex > best.fightIndex)
        ) {
            best = candidate;
        }
    }
    return best.fightId;
}

function sampleAt(member: SquadMemberMovement, pollIndex: number): [number, number] | null {
    if (!member.positions.length) return null;
    const idx = Math.max(0, Math.min(pollIndex, member.positions.length - 1));
    return member.positions[idx];
}

export function findClosestMember(
    members: SquadMemberMovement[],
    pollIndex: number,
    mapX: number,
    mapY: number,
    radius: number,
): SquadMemberMovement | null {
    let bestMember: SquadMemberMovement | null = null;
    let bestDist = radius;
    for (const m of members) {
        const pos = sampleAt(m, pollIndex);
        if (!pos) continue;
        const d = Math.hypot(pos[0] - mapX, pos[1] - mapY);
        if (d < bestDist) {
            bestDist = d;
            bestMember = m;
        }
    }
    return bestMember;
}
