export interface SquadMemberMovement {
    name: string;
    account: string;
    profession: string;
    eliteSpec: string | number;
    group: number;
    isCommander: boolean;
    isLocal: boolean;
    isEnemy: boolean;
    inSquad: boolean;
    positions: [number, number][];
    /**
     * Absolute poll index of `positions[0]`.
     *
     * EI/axilog emit one position per multiple of `pollingRate` inside the
     * actor's OWN `combatReplayData.start..end` window — not from t=0 — so
     * `positions[i]` is the sample at absolute poll `firstPoll + i`. Indexing
     * `positions[floor(t / pollingRate)]` without subtracting this reads the
     * wrong sample for anyone whose track does not begin at the very start of
     * the fight; a player who joins at t=38317ms is off by 128 polls, i.e.
     * their marker is drawn wherever they happened to be ~38 seconds later.
     *
     * Use `positionAtTime` rather than indexing by hand.
     */
    firstPoll: number;
    downRanges: [number, number][];
    deadRanges: [number, number][];
    boonStates?: Record<number, [number, number][]>;
    healthPercents?: [number, number][];
    /** Per-second damage taken deltas (index i = second i of the fight). */
    damageTaken1SPerSec?: number[];
    skillCasts?: { id: number; time: number; duration: number }[];
}

export interface MovementData {
    pollingRate: number;
    durationMs: number;
    inchToPixel: number;
    members: SquadMemberMovement[];
    boonIcons: Record<number, { name: string; icon: string }>;
    skillIcons: Record<number, { name: string; icon: string }>;
}

export interface BuildMovementDataOptions {
    trackedBuffIds: Set<number>;
    localAccount?: string;
    localName?: string;
    /** When true, skip integer rounding of position/health/damage values for higher precision. */
    precisePositions?: boolean;
}

/**
 * Absolute poll index of an actor's `positions[0]`, from its
 * `combatReplayData.start`.
 *
 * Mirrors the derivation `src/main/axilogParser.ts` already documents for its
 * own `PolledTrack.firstPoll`: axilog/EI emit `positions[i]` for the i-th
 * multiple of `pollingRate` that falls inside `[start, end]`, so the first
 * sample sits at `ceil(start / pollingRate)`.
 */
const pollIndexOfStart = (startMs: unknown, pollingRate: number): number => {
    const start = Number(startMs);
    if (!Number.isFinite(start) || start <= 0 || pollingRate <= 0) return 0;
    return Math.ceil(start / pollingRate);
};

/**
 * `[x, y]` for an actor at absolute time `timeMs`, honouring the actor's own
 * track offset (see `SquadMemberMovement.firstPoll`).
 *
 * `clamp` defaults to TRUE, which is what every call site did before this
 * helper existed: a time outside the actor's tracked window yields their
 * first/last known sample rather than nothing, so a marker parks at someone's
 * last known spot instead of vanishing. That behaviour is deliberately
 * preserved here — only the index OFFSET was wrong, and quietly turning
 * clamping off at the same time would change what the map shows for every
 * actor whose track ends before the fight does.
 *
 * Pass `clamp: false` when drawing something anchored to a specific past
 * instant (rather than to "now"), where an edge sample would place the mark
 * somewhere the actor was never standing.
 */
export function positionAtTime(
    member: Pick<SquadMemberMovement, 'positions' | 'firstPoll'>,
    timeMs: number,
    pollingRate: number,
    clamp = true,
): [number, number] | null {
    if (!member.positions.length || pollingRate <= 0) return null;
    const raw = Math.floor(timeMs / pollingRate) - (member.firstPoll || 0);
    if (!clamp && (raw < 0 || raw >= member.positions.length)) return null;
    const idx = Math.max(0, Math.min(raw, member.positions.length - 1));
    const pt = member.positions[idx];
    if (!Array.isArray(pt) || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return null;
    return [pt[0], pt[1]];
}

/** Flatten a possibly-nested EI cumulative series to a flat number[]. */
function normalizeCumulative(val: any): number[] {
    if (!Array.isArray(val) || val.length === 0) return [];
    const first = val[0];
    if (typeof first === 'number') return val.map((v: any) => Number(v || 0));
    if (Array.isArray(first)) {
        // [phase][time] — use phase 0
        const phase0 = first;
        if (typeof phase0[0] === 'number') return phase0.map((v: any) => Number(v || 0));
        // [phase][target][time] — sum targets in phase 0
        if (Array.isArray(phase0[0])) {
            const maxLen = phase0.reduce((m: number, s: any) => Math.max(m, Array.isArray(s) ? s.length : 0), 0);
            const out = new Array<number>(maxLen).fill(0);
            for (const s of phase0) {
                if (!Array.isArray(s)) continue;
                for (let i = 0; i < s.length; i++) out[i] += Number(s[i] || 0);
            }
            return out;
        }
    }
    return [];
}

export function buildMovementData(details: any, options: BuildMovementDataOptions): MovementData | null {
    const { trackedBuffIds, localAccount, localName, precisePositions } = options;
    const roundPos = precisePositions
        ? (pt: any): [number, number] => [pt[0], pt[1]]
        : (pt: any): [number, number] => [Math.round(pt[0]), Math.round(pt[1])];
    const pollingRate = details?.combatReplayMetaData?.pollingRate ?? 300;
    const durationMs = details?.durationMS ?? 0;
    const inchToPixel = details?.combatReplayMetaData?.inchToPixel ?? 1;

    const skillIcons: Record<number, { name: string; icon: string }> = {};
    for (const [key, val] of Object.entries(details?.skillMap ?? {})) {
        const id = Number(String(key).replace(/^s/, ''));
        const info = val as any;
        if (info?.icon && !info.autoAttack) {
            skillIcons[id] = { name: info.name, icon: info.icon };
        }
    }

    const members: SquadMemberMovement[] = [];
    const allyNames = new Set<string>();

    const players = Array.isArray(details?.players) ? details.players : [];
    for (const p of players) {
        if (p?.isFake) continue;
        if (allyNames.has(p.name)) continue; // skip duplicate player entries (EI can emit the same character twice in WvW)
        const positions = p?.combatReplayData?.positions;
        if (!positions?.length) continue;
        allyNames.add(p.name);

        let boonStates: Record<number, [number, number][]> | undefined;
        if (Array.isArray(p.buffUptimes)) {
            boonStates = {};
            for (const buff of p.buffUptimes) {
                if (!trackedBuffIds.has(buff.id) || !buff.states?.length) continue;
                boonStates[buff.id] = buff.states;
            }
        }

        let skillCasts: { id: number; time: number; duration: number }[] | undefined;
        if (Array.isArray(p.rotation) && p.rotation.length) {
            skillCasts = [];
            for (const entry of p.rotation) {
                if (!skillIcons[entry.id]) continue;
                const casts = Array.isArray(entry.skills) ? entry.skills : [];
                for (const cast of casts) {
                    // Trait procs are instant (duration 0). Keep user-pressed casts and negative IDs (dodge, weapon swap).
                    if (entry.id > 0 && cast.duration <= 0) continue;
                    skillCasts.push({ id: entry.id, time: cast.castTime, duration: cast.duration });
                }
            }
            skillCasts.sort((a, b) => a.time - b.time);
        }

        const isLocal = (!!localAccount && p.account === localAccount)
            || (!!localName && p.name === localName);

        // Extract per-second damage-taken deltas from the cumulative EI series.
        // EI outputs damageTaken1S / powerDamageTaken1S as cumulative arrays; we
        // take deltas so each index is the damage taken in that 1-second bucket.
        let damageTaken1SPerSec: number[] | undefined;
        const rawDmgTaken = p.damageTaken1S ?? p.powerDamageTaken1S;
        if (rawDmgTaken != null) {
            const flat = normalizeCumulative(rawDmgTaken);
            if (flat.length) {
                damageTaken1SPerSec = flat.map((v, i) => Math.max(0, v - (i > 0 ? flat[i - 1] : 0)));
            }
        }

        members.push({
            name: p.name,
            account: p.account ?? '',
            profession: p.profession ?? '',
            eliteSpec: p.elite_spec ?? '',
            group: p.group ?? 0,
            isCommander: !!p.hasCommanderTag,
            isLocal,
            isEnemy: false,
            inSquad: !p.notInSquad,
            positions: positions.map(roundPos),
            firstPoll: pollIndexOfStart(p.combatReplayData?.start, pollingRate),
            downRanges: p.combatReplayData?.down ?? [],
            deadRanges: p.combatReplayData?.dead ?? [],
            boonStates,
            healthPercents: p.healthPercents?.map((pt: any) => [pt[0], precisePositions ? pt[1] : Math.round(pt[1])] as [number, number]),
            damageTaken1SPerSec: precisePositions ? damageTaken1SPerSec : damageTaken1SPerSec?.map(Math.round),
            skillCasts,
        });
    }

    const targets = Array.isArray(details?.targets) ? details.targets : [];
    for (const t of targets) {
        if (!t?.enemyPlayer || t?.isFake) continue;
        const positions = t?.combatReplayData?.positions;
        if (!positions?.length) continue;
        if (allyNames.has(t.name)) continue;

        const specMatch = typeof t.name === 'string' ? t.name.match(/^(.+?) pl-\d+$/) : null;
        const specName = specMatch?.[1] ?? '';
        members.push({
            name: t.name,
            account: '',
            profession: t.profession ?? specName,
            eliteSpec: specName,
            group: 0,
            isCommander: false,
            isLocal: false,
            isEnemy: true,
            inSquad: false,
            positions: positions.map(roundPos),
            firstPoll: pollIndexOfStart(t.combatReplayData?.start, pollingRate),
            downRanges: t.combatReplayData?.down ?? [],
            deadRanges: t.combatReplayData?.dead ?? [],
        });
    }

    if (!members.length) return null;

    const boonIcons: Record<number, { name: string; icon: string }> = {};
    for (const [key, val] of Object.entries(details?.buffMap ?? {})) {
        const id = Number(String(key).replace(/^b/, ''));
        const info = val as any;
        if (trackedBuffIds.has(id) && info?.icon) {
            boonIcons[id] = { name: info.name, icon: info.icon };
        }
    }

    return { pollingRate, durationMs, inchToPixel, members, boonIcons, skillIcons };
}
