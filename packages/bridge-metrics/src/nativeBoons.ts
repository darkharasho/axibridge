/**
 * The only reader that knows `blocks.boons` and `catalogs.buffs` shape.
 *
 * Two facts drive this file. First, native reports `avg_stacks` (intensity
 * buffs only) alongside `uptime_pct`, and EI's `uptime` corresponds to
 * whichever of the two matches the buff's stacking mode -- so callers must go
 * through `getEntityBuffUptime` rather than reaching for a field. Second,
 * `catalogs.buffs` states `kind` and `stacking` outright, which retires both
 * the hardcoded boon-id table and the `classification` string sniffing.
 */

export interface NativeBuffMeta {
    id: number;
    name: string;
    /**
     * axilog's catalog is three-valued: a buff that is neither a boon nor a
     * condition is `effect` (Frost Aura and friends). Passing it through
     * rather than folding it into `boon` keeps this in step with
     * `listBoonIds`, which filters on `kind === 'boon'` exactly.
     */
    kind: 'boon' | 'condition' | 'effect';
    /** True for intensity stacking. Normalized to the boolean the display math takes. */
    stacking: boolean;
    maxStacks: number;
}

export interface NativeBuffGeneration {
    self: number;
    group: number;
    squad: number;
    selfWasted: number;
    groupWasted: number;
    squadWasted: number;
}

const ZERO_GENERATION: NativeBuffGeneration = {
    self: 0, group: 0, squad: 0, selfWasted: 0, groupWasted: 0, squadWasted: 0,
};

const nativeOf = (details: any): any => details?.native ?? null;

const boonsOf = (details: any, entityId: number): any =>
    nativeOf(details)?.blocks?.boons?.by_entity?.[String(entityId)] ?? null;

const entryOf = (details: any, entityId: number, buffId: number): any =>
    boonsOf(details, entityId)?.[String(buffId)] ?? null;

export const getBuffMeta = (details: any, buffId: number | string): NativeBuffMeta | null => {
    const raw = nativeOf(details)?.catalogs?.buffs?.[String(buffId)];
    if (!raw) return null;
    return {
        id: Number(buffId),
        name: String(raw.name ?? `Buff ${buffId}`),
        kind: raw.kind === 'condition' || raw.kind === 'effect' ? raw.kind : 'boon',
        stacking: raw.stacking === 'intensity',
        maxStacks: Number(raw.max_stacks ?? 0),
    };
};

export const listBoonIds = (details: any): number[] => {
    const buffs = nativeOf(details)?.catalogs?.buffs;
    if (!buffs) return [];
    return Object.keys(buffs)
        .filter((id) => buffs[id]?.kind === 'boon')
        .map(Number)
        .filter((id) => Number.isFinite(id))
        .sort((a, b) => a - b);
};

export const getEntityBuffUptime = (details: any, entityId: number, buffId: number): number => {
    const entry = entryOf(details, entityId, buffId);
    if (!entry) return 0;
    // Intensity buffs report a mean stack count; duration buffs report a
    // percentage. EI collapsed both into `uptime`, so the branch lives here.
    const meta = getBuffMeta(details, buffId);
    if (meta?.stacking) return Number(entry.avg_stacks ?? 0);
    return Number(entry.uptime_pct ?? 0);
};

export const getEntityBuffPresence = (details: any, entityId: number, buffId: number): number =>
    Number(entryOf(details, entityId, buffId)?.uptime_pct ?? 0);

export const getEntityBuffGeneration = (
    details: any, entityId: number, buffId: number,
): NativeBuffGeneration => {
    const gen = entryOf(details, entityId, buffId)?.generation;
    if (!gen) return { ...ZERO_GENERATION };
    return {
        self: Number(gen.self_pct ?? 0),
        group: Number(gen.group_pct ?? 0),
        squad: Number(gen.squad_pct ?? 0),
        selfWasted: Number(gen.self_wasted ?? 0),
        groupWasted: Number(gen.group_wasted ?? 0),
        squadWasted: Number(gen.squad_wasted ?? 0),
    };
};

const toStates = (raw: any): Array<[number, number]> => {
    if (!Array.isArray(raw)) return [];
    const out: Array<[number, number]> = [];
    for (const pair of raw) {
        if (!Array.isArray(pair)) continue;
        const time = Number(pair[0]);
        const stacks = Number(pair[1]);
        if (!Number.isFinite(time) || !Number.isFinite(stacks)) continue;
        out.push([time, stacks]);
    }
    return out;
};

export const getEntityBuffStates = (
    details: any, entityId: number, buffId: number,
): Array<[number, number]> => toStates(entryOf(details, entityId, buffId)?.states);

export const getEntityBuffStatesPerSource = (
    details: any, entityId: number, buffId: number,
): Map<number, Array<[number, number]>> => {
    const bySource = entryOf(details, entityId, buffId)?.per_source?.by_source ?? {};
    const out = new Map<number, Array<[number, number]>>();
    for (const [sourceId, states] of Object.entries<any>(bySource)) {
        const id = Number(sourceId);
        if (!Number.isFinite(id)) continue;
        out.set(id, toStates(states));
    }
    return out;
};

export const getEntityActiveMs = (details: any, entityId: number, fallbackMs: number): number => {
    const active = nativeOf(details)?.blocks?.replay?.by_entity?.[String(entityId)]?.active_ms;
    const value = Number(active);
    return Number.isFinite(value) && value > 0 ? value : fallbackMs;
};
