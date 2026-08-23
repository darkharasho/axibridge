/**
 * Per-fight precomputed drilldown data for the Stab Performance section.
 *
 * Captures, per 5s bucket: each squad player's stab stacks (avg), deaths,
 * distance to commander, plus squad incoming damage. This must run during
 * aggregation (with full EI details available) so the web report — which
 * has no log details at render time — can still draw party overlays.
 */

import { resolveCommanderDistance, getEntityBuffStates } from '@axiapps/bridge-metrics';
import { buildNativeMovement, positionAt, type PositionTrack } from '../../shared/movementData';
import { getDistanceScalars } from '@axiapps/bridge-metrics/nativePositioning';
import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';

export type StabPerfPlayerData = {
    group: number;
    displayName: string;
    stacks: number[];
    deaths: number[];
    distances: number[];
};

export type StabPerfFightData = {
    id: string;
    bucketCount: number;
    durationMs: number;
    incomingDamage: number[];
    players: Record<string, StabPerfPlayerData>;
};

export type StabPerfAccumulator = {
    fights: StabPerfFightData[];
};

export function createStabPerformanceAccumulator(): StabPerfAccumulator {
    return { fights: [] };
}

const round1 = (v: number) => Math.round(Number(v || 0) * 10) / 10;
const round0 = (v: number) => Math.round(Number(v || 0));

const normCum1D = (val: any): number[] => {
    if (!Array.isArray(val) || val.length === 0) return [];
    const f = val[0];
    if (typeof f === 'number') return val.map((e: any) => Number(e || 0));
    if (Array.isArray(f) && f.length > 0) {
        if (typeof f[0] === 'number') return f.map((e: any) => Number(e || 0));
        if (Array.isArray(f[0]) && Array.isArray((f[0] as any)[0])) {
            const targets = f
                .map((s: any) => Array.isArray(s) ? s.map((e: any) => Number(e || 0)) : null)
                .filter((s: number[] | null): s is number[] => Array.isArray(s) && s.length > 0);
            const len = targets.reduce((m: number, s: number[]) => Math.max(m, s.length), 0);
            if (len <= 0) return [];
            const out = new Array<number>(len).fill(0);
            targets.forEach((s: number[]) => { for (let i = 0; i < len; i++) out[i] += Number(s[i] || 0); });
            return out;
        }
    }
    return [];
};

const cumToDeltas = (s: number[]): number[] => s.map((v, i) => Math.max(0, Number(v || 0) - Number(s[i - 1] || 0)));

const sumTo5sBuckets = (perSecond: number[], bucketCount: number): number[] => {
    const out = new Array<number>(bucketCount).fill(0);
    for (let i = 0; i < perSecond.length; i++) {
        const b = Math.min(bucketCount - 1, Math.floor(i / 5));
        out[b] += Number(perSecond[i] || 0);
    }
    return out;
};

const computeIncomingDamage = (squadPlayers: any[], bucketCount: number): number[] => {
    const trySource = (field: string): number[] | null => {
        const arrays = squadPlayers.map((p: any) => cumToDeltas(normCum1D(p?.[field]))).filter((a: number[]) => a.length > 0);
        if (arrays.length === 0) return null;
        const maxLen = arrays.reduce((m: number, a: number[]) => Math.max(m, a.length), 0);
        const summed = new Array<number>(maxLen).fill(0);
        arrays.forEach((a: number[]) => a.forEach((v: number, i: number) => { summed[i] += v; }));
        const buckets = sumTo5sBuckets(summed, bucketCount);
        return buckets.some((v) => v > 0) ? buckets : null;
    };
    return trySource('damageTaken1S') || trySource('powerDamageTaken1S') || new Array<number>(bucketCount).fill(0);
};

const computeDeaths = (player: any, bucketCount: number): number[] => {
    const out = new Array<number>(bucketCount).fill(0);
    const deathSkill = (Array.isArray(player?.rotation) ? player.rotation : []).find((r: any) => Number(r?.id) === -28);
    if (!deathSkill || !Array.isArray(deathSkill.skills)) return out;
    deathSkill.skills.forEach((skill: any) => {
        const bucketIdx = Math.min(bucketCount - 1, Math.floor(Number(skill?.castTime || 0) / 5000));
        if (bucketIdx >= 0) out[bucketIdx]++;
    });
    return out;
};

/**
 * Mean distance to the tag per 5s bucket, in WORLD INCHES.
 *
 * Both tracks are read at the same timestamp. The old version derived a poll
 * index for each side (`floor(start / pollingRate)`, where `ceil` is correct)
 * and indexed two arrays by it, so any actor whose replay did not begin on the
 * polling grid — 36 of 42 on the committed fixture — was compared against a
 * tag position from a different moment. It also divided by EI's `inchToPixel`,
 * which is rounded to 3dp and read 3.12% short.
 */
const computeDistances = (
    track: PositionTrack | null,
    tagTrack: PositionTrack | null,
    fallbackDist: number,
    bucketCount: number
): number[] => {
    return Array.from({ length: bucketCount }, (_, b) => {
        if (!track || !tagTrack || track.samples.length === 0 || tagTrack.samples.length === 0) {
            return fallbackDist;
        }
        const bucketStartMs = b * 5000;
        const bucketEndMs = (b + 1) * 5000;
        let sum = 0, count = 0;
        for (const [t] of track.samples) {
            if (t < bucketStartMs) continue;
            if (t >= bucketEndMs) break;
            const p = positionAt(track, t);
            const tag = positionAt(tagTrack, t);
            if (!p || !tag) continue;
            const d = Math.hypot(p[0] - tag[0], p[1] - tag[1]);
            if (Number.isFinite(d)) { sum += d; count++; }
        }
        return count > 0 ? sum / count : fallbackDist;
    });
};

const STABILITY_BUFF_ID = 1122;

const computeStabStacks = (
    details: any, entityId: number | undefined, bucketCount: number,
): number[] => {
    const out = new Array<number>(bucketCount).fill(0);
    if (entityId === undefined) return out;
    const states = getEntityBuffStates(details, entityId, STABILITY_BUFF_ID);
    if (states.length === 0) return out;
    // The bucket integration below is unchanged. Native `states` are a step
    // function in fight-relative ms whose last entry runs to fight end --
    // exactly what EI's `states` were, because the EI shim was passing these
    // very arrays through. All 504 are byte-identical on the fixture.
    for (let b = 0; b < bucketCount; b++) {
        const bucketStart = b * 5000;
        const bucketEnd = (b + 1) * 5000;
        let curStacks = 0;
        for (let i = states.length - 1; i >= 0; i--) {
            if (states[i][0] <= bucketStart) { curStacks = states[i][1]; break; }
        }
        let weightedSum = 0;
        let prevTime = bucketStart;
        for (let i = 0; i < states.length; i++) {
            if (states[i][0] <= bucketStart) continue;
            if (states[i][0] >= bucketEnd) break;
            weightedSum += curStacks * (states[i][0] - prevTime);
            prevTime = states[i][0];
            curStacks = states[i][1];
        }
        weightedSum += curStacks * (bucketEnd - prevTime);
        out[b] = weightedSum / 5000;
    }
    return out;
};

export function ingestLogStabPerformance(log: any, acc: StabPerfAccumulator): void {
    const details = log?.details;
    if (!details) return;
    const players = Array.isArray(details.players) ? details.players : [];
    const squadPlayers = players.filter((p: any) => !p?.notInSquad);
    if (squadPlayers.length === 0) return;
    const fightId = String(log?.filePath || log?.id || '');
    if (!fightId) return;
    const durationMs = Math.max(0, Number(details?.durationMS || 0));
    if (durationMs <= 0) return;
    const bucketCount = Math.max(1, Math.ceil(durationMs / 5000));

    // Positions come from native; stab stacks, deaths and damage still read the
    // EI player rows (units 4 and 5). The two are joined by ACCOUNT, which is
    // the only key both surfaces share.
    const movement = buildNativeMovement(details);
    const scalars = getDistanceScalars(details);
    const squadNative = squadEntities(details?.native ?? {});
    const entityByAccount = new Map<string, number>();
    for (const e of squadNative) {
        if (e.account) entityByAccount.set(e.account, e.id);
    }
    const commanderEntity = squadNative.find((e: any) => {
        const c = e?.commander;
        return !!c && typeof c === 'object' && Array.isArray(c.segments) && c.segments.length > 0;
    });
    const tagTrack = commanderEntity && movement
        ? movement.tracks.get(commanderEntity.id) ?? null
        : null;

    const incomingDamage = computeIncomingDamage(squadPlayers, bucketCount).map(round0);
    const playersOut: Record<string, StabPerfPlayerData> = {};
    squadPlayers.forEach((player: any) => {
        const playerAccount = String(player?.account || player?.name || 'Unknown');
        const group = Number(player?.group || 0);
        // Coarse fallback: axilog's in-core scalars, already world inches.
        const entityId = entityByAccount.get(playerAccount);
        const scalar = entityId === undefined ? undefined : scalars.get(entityId);
        const cmdDist = resolveCommanderDistance(scalar?.distToCom ?? undefined);
        const fallbackDist = cmdDist !== null ? cmdDist : Number(scalar?.stackDist || 0);
        const stacks = computeStabStacks(details, entityId, bucketCount).map(round1);
        const deaths = computeDeaths(player, bucketCount);
        const track = entityId === undefined || !movement ? null : movement.tracks.get(entityId) ?? null;
        const distances = computeDistances(track, tagTrack, fallbackDist, bucketCount).map(round0);
        const hasAny = stacks.some((v) => v > 0) || deaths.some((v) => v > 0) || distances.some((v) => v > 0);
        if (!hasAny && group === 0) return;
        playersOut[playerAccount] = {
            group,
            displayName: playerAccount.split('.')[0],
            stacks,
            deaths,
            distances,
        };
    });

    acc.fights.push({
        id: fightId,
        bucketCount,
        durationMs,
        incomingDamage,
        players: playersOut,
    });
}

export function finalizeStabPerformance(acc: StabPerfAccumulator): { fights: StabPerfFightData[] } {
    return { fights: acc.fights };
}

/**
 * Slice frame for the stab-performance accumulator.
 *
 * The accumulator is nothing but a per-fight array (`{ fights: [] }`) and
 * `finalizeStabPerformance` returns it unchanged, so a frame is one fight's
 * entry and merging is concatenation — no re-weighting, no renumbering.
 */
export interface StabPerformanceFrame {
    fights: StabPerfFightData[];
}

export function extractStabPerformanceFrame(acc: StabPerfAccumulator): StabPerformanceFrame {
    if (acc.fights.length > 1) {
        throw new Error(`extractStabPerformanceFrame expects at most one fight, got ${acc.fights.length}`);
    }
    return { fights: acc.fights };
}

/** The accumulator is a bare per-fight array, so merging is concatenation. */
export function mergeStabPerformanceFrame(target: StabPerfAccumulator, frame: StabPerformanceFrame): void {
    (frame?.fights || []).forEach((fight) => target.fights.push(fight));
}
