import type { SquadMemberMovement } from '../../../shared/movementData';

/**
 * Manual marks the user puts on replay members with right-click.
 *
 * These are the viewer's own annotations, not log data: arcdps only records
 * markers the squad's commander handed out, so the enemy tag, the thing you
 * most want to watch, can never come from the log. `tag` is the one with
 * behaviour (it feeds the tag-movement card); the shapes are labels only.
 */
export type ReplayMarkKind = 'tag' | 'circle' | 'square' | 'triangle' | 'star';

export interface ReplayMarkDef {
    kind: ReplayMarkKind;
    label: string;
    color: string;
}

export const REPLAY_MARK_DEFS: readonly ReplayMarkDef[] = [
    { kind: 'tag', label: 'Tag', color: '#f43f5e' },
    { kind: 'circle', label: 'Circle', color: '#a78bfa' },
    { kind: 'square', label: 'Square', color: '#38bdf8' },
    { kind: 'triangle', label: 'Triangle', color: '#facc15' },
    { kind: 'star', label: 'Star', color: '#4ade80' },
];

export const markDef = (kind: ReplayMarkKind): ReplayMarkDef =>
    REPLAY_MARK_DEFS.find(d => d.kind === kind) ?? REPLAY_MARK_DEFS[0];

/** Member id -> mark, for one fight. */
export type FightMarks = Record<number, ReplayMarkKind>;

/**
 * Apply one mark to a fight's marks.
 *
 * A kind is held by one member per SIDE, as in-game squad markers are held by
 * one player: re-marking moves it. Per side rather than per fight because the
 * whole point of `tag` is having one on each side at once.
 * `kind === null` clears the member.
 */
export function applyMark(
    marks: FightMarks,
    members: Pick<SquadMemberMovement, 'id' | 'isEnemy'>[],
    memberId: number,
    kind: ReplayMarkKind | null,
): FightMarks {
    const next: FightMarks = { ...marks };
    delete next[memberId];
    if (kind === null) return next;
    const target = members.find(m => m.id === memberId);
    const side = !!target?.isEnemy;
    for (const m of members) {
        if (next[m.id] === kind && !!m.isEnemy === side) delete next[m.id];
    }
    next[memberId] = kind;
    return next;
}

/**
 * The two tags to compare: the enemy member marked `tag`, against the friendly
 * one marked `tag`, or the squad commander when no friendly is marked.
 * Null when there is no marked enemy tag or no friendly reference.
 */
export function pickTagPair(
    members: SquadMemberMovement[],
    marks: FightMarks | undefined,
): { ours: SquadMemberMovement; theirs: SquadMemberMovement } | null {
    if (!marks) return null;
    const theirs = members.find(m => m.isEnemy && marks[m.id] === 'tag');
    if (!theirs) return null;
    const ours = members.find(m => !m.isEnemy && marks[m.id] === 'tag')
        ?? members.find(m => m.isCommander && m.inSquad && !m.isEnemy);
    if (!ours) return null;
    return { ours, theirs };
}

const inRanges = (ranges: [number, number][] | undefined, t: number) =>
    (ranges ?? []).some(([s, e]) => t >= s && t < e);

/**
 * Speed in inches per second at each absolute poll, or null where the member
 * has no meaningful movement: before their track starts, after it ends, and
 * while dead or despawned (arcdps sends no positions then, and the jump to the
 * waypoint on return is not a run).
 *
 * Smoothed over `smoothPolls` either side. At a 300ms poll a raw step is
 * mostly jitter; one second of smoothing is what makes "started moving" and
 * "stopped" visible as edges.
 */
export function speedSeries(
    member: SquadMemberMovement,
    totalPolls: number,
    pollingRate: number,
    pixelsPerInch: { x: number; y: number },
    smoothPolls = 2,
): (number | null)[] {
    const raw: (number | null)[] = new Array(totalPolls).fill(null);
    const ppiX = pixelsPerInch?.x || 1;
    const ppiY = pixelsPerInch?.y || ppiX;
    const first = member.firstPoll || 0;
    const sec = pollingRate / 1000;
    if (sec <= 0) return raw;
    for (let p = Math.max(1, first + 1); p < totalPolls; p++) {
        const i = p - first;
        if (i >= member.positions.length) break;
        const t = p * pollingRate;
        const tPrev = (p - 1) * pollingRate;
        if (inRanges(member.deadRanges, t) || inRanges(member.dcRanges, t)
            || inRanges(member.deadRanges, tPrev) || inRanges(member.dcRanges, tPrev)) continue;
        const a = member.positions[i - 1];
        const b = member.positions[i];
        const dx = (b[0] - a[0]) / ppiX;
        const dy = (b[1] - a[1]) / ppiY;
        raw[p] = Math.hypot(dx, dy) / sec;
    }
    if (smoothPolls <= 0) return raw;
    return raw.map((v, p) => {
        if (v === null) return null;
        let sum = 0;
        let n = 0;
        for (let k = p - smoothPolls; k <= p + smoothPolls; k++) {
            const w = raw[k];
            if (w !== null && w !== undefined) { sum += w; n++; }
        }
        return n ? sum / n : null;
    });
}

/**
 * How many polls `b` trails `a` by, from the lag that best correlates their
 * speed curves. Positive = `b` reacts after `a`.
 *
 * Pearson r over the polls both have, per candidate lag. Returns null when no
 * lag clears `minR` or too few polls overlap: two squads that never moved
 * together do not have a reaction time, and an always-reported number would
 * invent one.
 */
export function estimateLag(
    a: (number | null)[],
    b: (number | null)[],
    maxLagPolls: number,
    minR = 0.3,
    minOverlap = 20,
): { lagPolls: number; r: number } | null {
    let best: { lagPolls: number; r: number } | null = null;
    for (let lag = -maxLagPolls; lag <= maxLagPolls; lag++) {
        let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
        for (let i = 0; i < a.length; i++) {
            const x = a[i];
            const y = b[i + lag];
            if (x === null || y === null || y === undefined) continue;
            n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
        }
        if (n < minOverlap) continue;
        const cov = sab - (sa * sb) / n;
        const va = saa - (sa * sa) / n;
        const vb = sbb - (sb * sb) / n;
        if (va <= 0 || vb <= 0) continue;
        const r = cov / Math.sqrt(va * vb);
        if (!best || r > best.r) best = { lagPolls: lag, r };
    }
    return best && best.r >= minR ? best : null;
}
