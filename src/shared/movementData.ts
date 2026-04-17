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
    const { trackedBuffIds, localAccount, localName } = options;
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
            positions,
            downRanges: p.combatReplayData?.down ?? [],
            deadRanges: p.combatReplayData?.dead ?? [],
            boonStates,
            healthPercents: p.healthPercents,
            damageTaken1SPerSec,
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
            positions,
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
