/**
 * Per-fight precomputed drilldown data for the Stab Performance section.
 *
 * Captures, per 5s bucket: each squad player's stab stacks (avg), deaths,
 * distance to commander, plus squad incoming damage. This must run during
 * aggregation (with full EI details available) so the web report — which
 * has no log details at render time — can still draw party overlays.
 */

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

const computeDistances = (
    player: any,
    cmdPositions: Array<[number, number]>,
    cmdOffset: number,
    pollingRate: number,
    inchesToPixel: number,
    fallbackDist: number,
    bucketCount: number
): number[] => {
    const getFirstSeg = (replayData: any) => Array.isArray(replayData) ? replayData[0] : replayData;
    const playerSeg = getFirstSeg(player?.combatReplayData);
    const playerPositions: Array<[number, number]> = Array.isArray(playerSeg?.positions) ? playerSeg.positions : [];
    const playerOffset = Math.floor(Number(playerSeg?.start || 0) / pollingRate);
    return Array.from({ length: bucketCount }, (_, b) => {
        if (cmdPositions.length === 0 || playerPositions.length === 0) return fallbackDist;
        const bucketStartMs = b * 5000;
        const bucketEndMs = (b + 1) * 5000;
        let sum = 0, count = 0;
        for (let t = bucketStartMs; t < bucketEndMs; t += pollingRate) {
            const tick = Math.floor(t / pollingRate);
            const cmdIdx = tick - cmdOffset;
            const playerIdx = tick - playerOffset;
            if (cmdIdx < 0 || cmdIdx >= cmdPositions.length) continue;
            if (playerIdx < 0 || playerIdx >= playerPositions.length) continue;
            const [cx, cy] = cmdPositions[cmdIdx];
            const [px, py] = playerPositions[playerIdx];
            const d = Math.hypot(px - cx, py - cy) / inchesToPixel;
            if (Number.isFinite(d)) { sum += d; count++; }
        }
        return count > 0 ? sum / count : fallbackDist;
    });
};

const computeStabStacks = (player: any, bucketCount: number): number[] => {
    const out = new Array<number>(bucketCount).fill(0);
    const buffUptime = Array.isArray(player?.buffUptimes)
        ? player.buffUptimes.find((b: any) => Number(b?.id) === 1122)
        : null;
    if (!buffUptime?.states || !Array.isArray(buffUptime.states)) return out;
    const states: Array<[number, number]> = (buffUptime.states as any[])
        .map((s: any) => Array.isArray(s) ? [Number(s[0]), Number(s[1])] : null)
        .filter(Boolean) as Array<[number, number]>;
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

    const replayMeta = (details as any)?.combatReplayMetaData || {};
    const inchesToPixel = Number(replayMeta?.inchToPixel || 0) > 0 ? Number(replayMeta.inchToPixel) : 1;
    const pollingRate = Number(replayMeta?.pollingRate || 0) > 0 ? Number(replayMeta.pollingRate) : 500;
    const getFirstSeg = (replayData: any) => Array.isArray(replayData) ? replayData[0] : replayData;
    const commanderPlayer = squadPlayers.find((p: any) => p?.hasCommanderTag);
    const cmdSeg = getFirstSeg(commanderPlayer?.combatReplayData);
    const cmdPositions: Array<[number, number]> = Array.isArray(cmdSeg?.positions) ? cmdSeg.positions : [];
    const cmdOffset = Math.floor(Number(cmdSeg?.start || 0) / pollingRate);

    const incomingDamage = computeIncomingDamage(squadPlayers, bucketCount).map(round0);
    const playersOut: Record<string, StabPerfPlayerData> = {};
    squadPlayers.forEach((player: any) => {
        const playerAccount = String(player?.account || player?.name || 'Unknown');
        const group = Number(player?.group || 0);
        const fallbackDist = Number((player as any)?.statsAll?.[0]?.distToCom || (player as any)?.statsAll?.[0]?.stackDist || 0);
        const stacks = computeStabStacks(player, bucketCount).map(round1);
        const deaths = computeDeaths(player, bucketCount);
        const distances = computeDistances(player, cmdPositions, cmdOffset, pollingRate, inchesToPixel, fallbackDist, bucketCount).map(round0);
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
