/**
 * Subpath import, not the package root: `src/shared/**` is also compiled by
 * `electron/tsconfig.json`, whose Node10 resolver cannot see the root
 * `exports` map. See `src/main/bridgeMetricsRoot.d.ts`.
 */
import { getCommanderTagColors, getSquadMarkers } from './squadMarkers';
import {
    getArena, getPollMs, getPositionTracks, positionAt, worldToPixel,
    replayCanvas, pixelsPerInch,
    type ArenaProjection, type PositionTrack,
} from '@axiapps/bridge-metrics/nativePositioning';
import {
    squadEntities, friendlyPlayerEntities, enemyPlayerEntities,
} from '@axiapps/bridge-metrics/nativeRoster';

export type { ArenaProjection, PositionTrack };
export { positionAt };

/**
 * The native movement surface: self-timestamped world-inch tracks plus the
 * arena projection needed to draw them.
 *
 * This coexists with the EI view-model below rather than replacing it. The two
 * answer different questions: this one answers "where was entity N at time T",
 * which is all the stats and commander compute modules need; `MovementData`
 * additionally carries names, professions, boon states, skill casts and health
 * percents, which the replay map renders. Both now source their positions from
 * here — the map projects them onto the arena's render canvas, while the
 * commander metrics consume them as the world inches they already are.
 *
 * Note `tracks` is keyed by native ENTITY ID and includes enemy players, while
 * `MovementData.members` is a flat list keyed by name. They do not join
 * one-to-one; do not mix them.
 */
export interface NativeMovement {
    /** The replay polling interval in ms. */
    pollMs: number;
    /** `null` for maps GW2EI ships no arena image for. */
    arena: ArenaProjection | null;
    /** Keyed by entity id. Includes enemy players, not just the squad. */
    tracks: Map<number, PositionTrack>;
}

/**
 * Build the native surface, or `null` when the log carries no position samples
 * — either an EI-only parse, or a native parse whose tracks were dropped by
 * `pruneDetailsForStats` because the user turned off position retention.
 */
export const buildNativeMovement = (details: any): NativeMovement | null => {
    const pollMs = getPollMs(details);
    if (pollMs === null || pollMs <= 0) return null;
    const tracks = getPositionTracks(details);
    if (tracks.size === 0) return null;
    return { pollMs, arena: getArena(details), tracks };
};

/**
 * The last sample at or before `tMs`, or `null`.
 *
 * `positionAt` deliberately refuses to answer for an instant it has no sample
 * for — inventing a midpoint would put an actor somewhere they provably were
 * not. But down and death events are arcdps timestamps and do NOT land on the
 * polling grid, so an exact hit is not expected there. This is the explicit
 * tolerance for those call sites: "where were they last seen", not "where were
 * they interpolated to be".
 *
 * `maxAgeMs` bounds how stale an answer may be; it defaults to one poll, so a
 * sample can never be borrowed from across a tracking gap.
 */
export const positionAtOrBefore = (
    track: PositionTrack,
    tMs: number,
    maxAgeMs: number,
): [number, number] | null => {
    let lo = 0;
    let hi = track.samples.length - 1;
    let best: [number, number] | null = null;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const [t, x, y] = track.samples[mid];
        if (t <= tMs) {
            if (tMs - t <= maxAgeMs) best = [x, y];
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
};

// ─── The replay map view-model ────────────────────────────────────────────────

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
     * A track's samples start at the actor's own first poll, not at t=0, so
     * `positions[i]` is the sample at absolute poll `firstPoll + i`. Indexing
     * `positions[floor(t / pollingRate)]` without subtracting this reads the
     * wrong sample for anyone whose track does not begin at the very start of
     * the fight; a player who joins at t=38317ms is off by 128 polls, i.e.
     * their marker is drawn wherever they happened to be ~38 seconds later.
     *
     * This is now READ from the first sample's own timestamp rather than
     * inferred from a start time, so the `ceil`-vs-`floor` mistake that unit 3
     * found at five call sites cannot recur here.
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
    /**
     * The commander's tag colour as CSS hex, when this member carries a tag
     * and axilog resolved its GUID. Recolours `commander_tag.svg`; absent
     * means draw the default white tag.
     */
    tagColor?: string;
    /**
     * An overhead squad marker (Arrow, Circle, …) assigned to this member.
     * Distinct from `tagColor` — a tag says "this is the commander", a marker
     * is a transient assignment the commander hands out.
     */
    squadMarker?: { label: string; icon: string };
    skillCasts?: { id: number; time: number; duration: number }[];
}

export interface MovementData {
    pollingRate: number;
    durationMs: number;
    /**
     * Exact pixels-per-world-inch on the render canvas, per axis.
     *
     * Replaces EI's single `inchToPixel`, which was rounded to 3dp AND forced
     * one scale onto a projection whose axes genuinely differ by ~2.4%. Scale a
     * game range by the matching axis; a value spanning both axes (a range
     * indicator) is an ellipse, not a circle.
     */
    pixelsPerInch: { x: number; y: number };
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
 * Flatten a native track into the dense, poll-indexed pixel array the map
 * renders, plus the absolute poll index of its first entry.
 *
 * Native samples are self-timestamped, so `firstPoll` is read rather than
 * derived. The dense encoding is kept deliberately: `replayFights` is ~66% of
 * `report.json`, and storing `[t, x, y]` triples would inflate the largest part
 * of the payload by half. It is safe because native tracks are a uniform grid
 * — all 74 tracks on the reference fixture step by exactly `poll_ms`.
 *
 * Should a future axilog ever introduce gaps, the grid is rebuilt by index from
 * each sample's own timestamp and any hole carries the previous position
 * forward. That degrades to "the marker parks at the last known spot", which is
 * exactly what `positionAtTime`'s clamping already does at track edges — never
 * to the silent off-by-N that indexing a compacted array would produce.
 */
const denseTrack = (
    track: PositionTrack,
    pollMs: number,
    arena: ArenaProjection | null,
    canvas: [number, number],
    round: (pt: [number, number]) => [number, number],
): { positions: [number, number][]; firstPoll: number } | null => {
    const samples = track.samples;
    if (!samples.length || pollMs <= 0 || !arena) return null;

    const firstPoll = Math.round(samples[0][0] / pollMs);
    const lastPoll = Math.round(samples[samples.length - 1][0] / pollMs);
    const span = lastPoll - firstPoll + 1;
    if (!(span > 0)) return null;

    const positions = new Array<[number, number]>(span);
    for (const [t, wx, wy] of samples) {
        const idx = Math.round(t / pollMs) - firstPoll;
        if (idx < 0 || idx >= span) continue;
        positions[idx] = round(worldToPixel(arena, wx, wy, canvas));
    }
    // Carry forward across any hole (none exist today — see above).
    for (let i = 0; i < span; i++) {
        if (!positions[i]) positions[i] = positions[i - 1] ?? positions.find(Boolean)!;
    }
    return { positions, firstPoll };
};

/** `commander.segments` is native's commander-tag evidence. */
const hasCommanderTag = (entity: any): boolean =>
    Array.isArray(entity?.commander?.segments) && entity.commander.segments.length > 0;

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
    const pollingRate = getPollMs(details) ?? 300;
    const durationMs = details?.durationMS ?? 0;
    const arena = getArena(details);
    const tracks = getPositionTracks(details);
    if (!arena || tracks.size === 0) return null;
    const canvas = replayCanvas(arena);

    // From the native catalog, not `details.skillMap`. axilog's EI-shaped
    // output carries NO icons at all — 0 of 508 entries — so building these
    // from `skillMap` left the replay squad panel with no skill art whatsoever
    // once the native engine became the parser. `catalogs.skills` has had them
    // all along (418 of 508 resolve; the rest are ids neither generated icon
    // table has a record of).
    // Resolved once for the whole log rather than per member: both are small
    // maps built from one scan of `encounter.markers[]`.
    const tagColors = getCommanderTagColors(details);
    const squadMarkers = getSquadMarkers(details);

    const skillIcons: Record<number, { name: string; icon: string }> = {};
    for (const [key, val] of Object.entries(details?.native?.catalogs?.skills ?? {})) {
        const id = Number(key);
        const info = val as any;
        // `auto_attack` is native's spelling of EI's `autoAttack`; auto-attacks
        // are excluded because they would flood the cast strip.
        if (Number.isFinite(id) && info?.icon && !info.auto_attack) {
            skillIcons[id] = { name: info.name, icon: info.icon };
        }
    }

    const members: SquadMemberMovement[] = [];

    /**
     * Allies come from the native roster, joined to their track by entity id.
     *
     * The EI path this replaces joined on `players[].name` and deduped on it —
     * but axilog's ei-json compat does not emit `name`, so every ally collided
     * on `undefined` and the map rendered ONE of 42 allies. Entity ids are the
     * join key native was built to provide; there is nothing to dedupe.
     */
    const nativeReport = details?.native ?? {};
    const allies = [
        ...squadEntities(nativeReport).map(e => ({ e, inSquad: true })),
        ...friendlyPlayerEntities(nativeReport).map(e => ({ e, inSquad: false })),
    ];

    // Boons, casts, health and damage series still come from EI — those blocks
    // belong to units 4-6. Account is the only stable join EI still offers.
    const eiByAccount = new Map<string, any>();
    for (const p of (Array.isArray(details?.players) ? details.players : [])) {
        if (p?.isFake || !p?.account) continue;
        if (!eiByAccount.has(p.account)) eiByAccount.set(p.account, p);
    }

    for (const { e, inSquad } of allies) {
        const track = tracks.get(e.id);
        if (!track) continue;
        const dense = denseTrack(track, pollingRate, arena, canvas, roundPos);
        if (!dense) continue;
        const p = (e.account ? eiByAccount.get(e.account) : null) ?? {};

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

        const character = e.character ?? (e as any).name ?? '';
        const isLocal = (!!localAccount && e.account === localAccount)
            || (!!localName && character === localName);

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
            name: character,
            account: e.account ?? '',
            profession: e.profession ?? '',
            eliteSpec: e.elite_spec ?? '',
            group: e.subgroup ?? 0,
            isCommander: hasCommanderTag(e),
            tagColor: tagColors.get(e.id),
            squadMarker: squadMarkers.get(e.id),
            isLocal,
            isEnemy: false,
            inSquad,
            positions: dense.positions,
            firstPoll: dense.firstPoll,
            downRanges: track.down,
            deadRanges: track.dead,
            boonStates,
            healthPercents: p.healthPercents?.map((pt: any) => [pt[0], precisePositions ? pt[1] : Math.round(pt[1])] as [number, number]),
            damageTaken1SPerSec: precisePositions ? damageTaken1SPerSec : damageTaken1SPerSec?.map(Math.round),
            skillCasts,
        });
    }

    // Enemies. Native gives profession and elite spec as fields; the EI path
    // had to scrape them out of a `"<spec> pl-123"` display name.
    for (const e of enemyPlayerEntities(nativeReport)) {
        const track = tracks.get(e.id);
        if (!track) continue;
        const dense = denseTrack(track, pollingRate, arena, canvas, roundPos);
        if (!dense) continue;
        members.push({
            name: (e as any).name ?? e.character ?? '',
            account: '',
            profession: e.profession ?? '',
            eliteSpec: e.elite_spec ?? '',
            group: 0,
            isCommander: false,
            isLocal: false,
            isEnemy: true,
            inSquad: false,
            positions: dense.positions,
            firstPoll: dense.firstPoll,
            downRanges: track.down,
            deadRanges: track.dead,
        });
    }

    if (!members.length) return null;

    // Likewise from the native catalog rather than `details.buffMap`, which
    // carries no icons either. `catalogs.buffs[].icon` arrived in axilog 0.3.8.
    const boonIcons: Record<number, { name: string; icon: string }> = {};
    for (const [key, val] of Object.entries(details?.native?.catalogs?.buffs ?? {})) {
        const id = Number(key);
        const info = val as any;
        if (Number.isFinite(id) && trackedBuffIds.has(id) && info?.icon) {
            boonIcons[id] = { name: info.name, icon: info.icon };
        }
    }

    return {
        pollingRate, durationMs,
        pixelsPerInch: pixelsPerInch(arena, canvas),
        members, boonIcons, skillIcons,
    };
}
