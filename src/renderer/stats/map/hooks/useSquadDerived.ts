import { useMemo } from 'react';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';
import type { Phase, PhaseKind, SquadDerived, SquadSample } from '../squadDerivedTypes';

const TICK_MS = 1000;
const cache = new Map<string, SquadDerived>();

function sampleAt(member: SquadMemberMovement, timeMs: number, pollingRate: number): [number, number] | null {
    if (!member.positions.length) return null;
    const idx = Math.min(member.positions.length - 1, Math.floor(timeMs / pollingRate));
    return member.positions[idx];
}

function isAliveAt(member: SquadMemberMovement, timeMs: number): boolean {
    for (const [start, end] of member.deadRanges) {
        if (timeMs >= start && (end === 0 || timeMs <= end)) return false;
    }
    return true;
}

function convexHull(points: [number, number][]): [number, number][] {
    if (points.length < 3) return [];
    const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
        (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: [number, number][] = [];
    for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: [number, number][] = [];
    for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
}

// Speed is centroid displacement per ms in EI pixel-space (map ~600 px wide).
// 0.005 u/ms ≈ 5 px/sec of centroid movement — enough to detect directed squad movement.
const MOVE_THRESHOLD = 0.005;

function classifyPhase(
    sample: SquadSample,
    prevSample: SquadSample | null,
    deathsSoFar: number,
    deathsRecent: number,
    fightStartOffsetMs: number,
): PhaseKind {
    void prevSample; void fightStartOffsetMs;
    if (sample.timeMs < 10_000 && deathsSoFar === 0) return 'opening';
    // Retreat: squad is taking deaths (stationary or moving — doesn't matter).
    if (deathsRecent > 0) return 'retreat';
    // Push: centroid is moving meaningfully with no recent deaths.
    if (sample.speed >= MOVE_THRESHOLD) return 'push';
    return 'cleanup';
}

function buildDerived(fight: ReplayFightPayload): SquadDerived {
    const md = fight.movementData;
    const allies = md.members.filter(m => !m.isEnemy && m.inSquad);

    const samples: SquadSample[] = [];
    for (let t = 0; t <= fight.durationMs; t += TICK_MS) {
        const live: { member: SquadMemberMovement; pos: [number, number] }[] = [];
        for (const member of allies) {
            if (!isAliveAt(member, t)) continue;
            const pos = sampleAt(member, t, md.pollingRate);
            if (pos) live.push({ member, pos });
        }
        if (!live.length) continue;

        const cx = live.reduce((acc, { pos }) => acc + pos[0], 0) / live.length;
        const cy = live.reduce((acc, { pos }) => acc + pos[1], 0) / live.length;

        let sumSq = 0;
        for (const { pos } of live) {
            const dx = pos[0] - cx;
            const dy = pos[1] - cy;
            sumSq += dx * dx + dy * dy;
        }
        const spread = Math.sqrt(sumSq / live.length);

        const byParty: Record<number, [number, number][]> = {};
        for (const { member, pos } of live) {
            if (!member.group) continue;
            (byParty[member.group] ??= []).push(pos);
        }
        const partyHulls: Record<number, [number, number][]> = {};
        for (const [groupStr, pts] of Object.entries(byParty)) {
            const hull = convexHull(pts);
            if (hull.length >= 3) partyHulls[Number(groupStr)] = hull;
        }

        const prev = samples[samples.length - 1];
        const speed = prev
            ? Math.hypot(cx - prev.centroid[0], cy - prev.centroid[1]) / TICK_MS
            : 0;

        samples.push({ timeMs: t, centroid: [cx, cy], spread, partyHulls, speed });
    }

    const phases: Phase[] = [];
    if (samples.length) {
        let cumDeaths = 0;
        const deathTimes = allies.flatMap(m => m.deadRanges.map(([start]) => start)).sort((a, b) => a - b);
        let current: Phase | null = null;

        for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            cumDeaths = deathTimes.filter(d => d <= s.timeMs).length;
            const deathsRecent = deathTimes.filter(d => d > s.timeMs - 5000 && d <= s.timeMs).length;
            const kind = classifyPhase(s, samples[i - 1] ?? null, cumDeaths, deathsRecent, 0);
            if (current && current.kind === kind) {
                current.endMs = s.timeMs;
            } else {
                if (current) phases.push(current);
                current = { kind, startMs: s.timeMs, endMs: s.timeMs };
            }
        }
        if (current) {
            current.endMs = fight.durationMs;
            phases.push(current);
        }
    }

    return { samples, phases };
}

export function useSquadDerived(fight: ReplayFightPayload | null): SquadDerived {
    return useMemo(() => {
        if (!fight) return { samples: [], phases: [] };
        const cached = cache.get(fight.fightId);
        if (cached) return cached;
        const derived = buildDerived(fight);
        cache.set(fight.fightId, derived);
        return derived;
    }, [fight]);
}

export function __clearSquadDerivedCache() {
    cache.clear();
}
