import type { SquadMemberMovement } from '../../../shared/movementData';
import { isReplayCondition } from '../../../shared/replayBuffs';

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

/**
 * The name to look a profession icon/label up by.
 *
 * Native's `profession` is the BASE class ("Elementalist"); the elite spec
 * lives in its own field. EI's `players[].profession` is the spec name, which
 * is what `getProfessionIconPath` and `PROFESSION_COLORS` are keyed on (they
 * fall back to the base themselves). Passing the raw native `profession` gets
 * you the base-class icon for every specced player.
 */
export function memberSpec(member: SquadMemberMovement): string {
    const spec = member.eliteSpec ? String(member.eliteSpec).trim() : '';
    return spec || member.profession;
}

/** The number of buff slots a card must hold open, split by cluster. */
export interface BuffRowCapacity {
    boons: number;
    condis: number;
}

/**
 * The most boons and the most conditions this member ever holds at once.
 *
 * A card reserves this many icon slots for the whole replay. Sizing the buff
 * row to the live count instead makes it wrap to a second line the moment a
 * member crosses eight icons and snap back when a boon ticks off — which
 * resizes the card and shunts every card below it, several times a second.
 *
 * Events are grouped by timestamp before the peak is sampled: a boon dropping
 * and another rising in the same tick is not an overlap, and reading between
 * the two would reserve a slot for a member who never held both.
 */
export function maxConcurrentBuffs(member: SquadMemberMovement): BuffRowCapacity {
    const states = member.boonStates;
    if (!states) return { boons: 0, condis: 0 };

    const events: { t: number; id: number; stacks: number }[] = [];
    for (const [idStr, series] of Object.entries(states)) {
        const id = Number(idStr);
        for (const [t, stacks] of series) events.push({ t, id, stacks });
    }
    events.sort((a, b) => a.t - b.t);

    const up = new Set<number>();
    let boons = 0, condis = 0, maxBoons = 0, maxCondis = 0;
    for (let i = 0; i < events.length; ) {
        const t = events[i].t;
        while (i < events.length && events[i].t === t) {
            const { id, stacks } = events[i++];
            const was = up.has(id);
            const now = stacks > 0;
            if (was === now) continue;
            if (now) up.add(id); else up.delete(id);
            const delta = now ? 1 : -1;
            if (isReplayCondition(id)) condis += delta; else boons += delta;
        }
        if (boons > maxBoons) maxBoons = boons;
        if (condis > maxCondis) maxCondis = condis;
    }
    return { boons: maxBoons, condis: maxCondis };
}
