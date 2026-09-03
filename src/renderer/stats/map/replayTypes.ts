import type { MovementData } from '../../../shared/movementData';
import type { WvwMap } from '../../../shared/wvwLandmarks';

export interface ReplayDpsSample {
    timeMs: number;
    squadDps: number;
}

export interface ReplayKillEvent {
    timeMs: number;
    victimName: string;
    isAlly: boolean;
}

export interface DamageSpikeEvent {
    timeMs: number;
    memberKey: string;
    magnitude: number;
}

/**
 * One instant at which one squad member took crowd control.
 *
 * Sparse on purpose. Incoming CC is bursty — a bomb lands on a fraction of the
 * roster for a handful of seconds — so a dense per-member grid would be mostly
 * zeroes, and `replayFights` is already the largest thing in a published
 * report. Only moments where something landed are emitted.
 */
export interface CcTakenEvent {
    timeMs: number;
    /** `account || name`, the same key `EventOverlay` indexes movement members by. */
    memberKey: string;
    /** Applications at this exact instant, which the canvas weights the mark by. */
    count: number;
    /**
     * Distinct control kinds, deduped — `stun_or_daze`, `knockback_or_pull`
     * and friends. Resolved through axilog's skill catalog, never from the
     * row's own skill id: arcdps substitutes generic control ids for the
     * ability that was cast, so the id names the effect and loses the cause.
     *
     * Empty for a fight parsed before axilog 1.10, whose 1s lane counted CC
     * without classifying it.
     */
    kinds: string[];
}

export interface RallyEvent {
    timeMs: number;
    memberKey: string;
}

export interface TargetFocusSample {
    timeMs: number;
    memberKey: string;
    targetIndex: number;
}

/**
 * Server tick rate over the fight, from arcdps `CBTS_TICK`.
 *
 * Nominal is 25 Hz. Present only when axilog saw at least two tick events, so
 * this is `null` on plenty of otherwise-complete logs. See `tickRate.ts` for
 * why `avg` is not worth showing and why a `0` in `perSecond` means
 * "unsampled second", not "server stopped".
 */
export interface ReplayTickRate {
    /** Mean across the fight. Effectively always ~25.0 — kept for completeness, not display. */
    avg: number;
    /** Lowest sampled second, ignoring unsampled buckets. This is the comparable number. */
    min: number;
    /** One sample per second, rounded to 0.1 to keep it cheap in `report.json`. `0` = unsampled. */
    perSecond: number[];
}

export interface ReplayFightPayload {
    fightId: string;
    fightIndex: number;
    label: string;
    timestampMs: number;
    durationMs: number;
    mapKey: WvwMap | null;
    mapImageUrl: string | null;
    mapSize: [number, number] | null;
    avgPosition: [number, number] | null;
    nearestLandmark: string | null;
    squadSize: number;
    kills: number;
    deaths: number;
    movementData: MovementData;
    dpsSamples: ReplayDpsSample[];
    killEvents: ReplayKillEvent[];
    damageSpikeEvents: DamageSpikeEvent[];
    rallyEvents: RallyEvent[];
    targetFocusSamples: TargetFocusSample[];
    sectorOwners: Record<number, import('../../../shared/wvwSectors').WvwOwner> | null;
    /** Squad CC applied per second, or null if the report predates axilog 1.8.0. */
    ccSamples: number[] | null;
    /** Squad boons stripped off enemies per second, or null if not recorded. */
    stripSamples: number[] | null;
    /**
     * Squad CC taken per second, or null if not recorded.
     *
     * Absent far more often than `ccSamples`, and for an extra reason:
     * axilog has no squad-level incoming lane, so this is folded from
     * `by_entity`, which needs `timeseries: true` (the Include Timeline
     * Arrays setting) where the squad lanes need nothing. It also needs
     * axilog 1.9.0, a release later than the other three lanes.
     *
     * NOT comparable to `ccSamples` in magnitude: GW2EI's incoming CC
     * applies no source filter and no pet/minion fold, so this runs higher
     * than the outgoing lane on any fight with enemies in it. The two are
     * normalized independently on the timeline for that reason.
     */
    ccInSamples: number[] | null;
    /** Squad boons stripped OFF the squad per second, or null if not recorded. Same `timeseries` gate as `ccInSamples`, but available since axilog 1.8.0. */
    stripInSamples: number[] | null;
    /**
     * Who took the CC that `ccInSamples` totals, second by second.
     *
     * Same source and same availability gate as `ccInSamples` — both are folded
     * from `by_entity.cc_taken` in one pass — so the two go absent together.
     * `null` means the lane was never recorded; `[]` means it was recorded and
     * the squad ate nothing. The replay draws nothing in either case, but only
     * `null` should read as missing data.
     */
    ccTakenEvents: CcTakenEvent[] | null;
    /**
     * Server tick rate per second, or null when the log carried too few
     * `CBTS_TICK` events for axilog to emit the block.
     *
     * Surfaced because WvW skill lag makes two fights not strictly
     * comparable: a squad that looks slow to react at 16 tick was not
     * necessarily slow. Read at the playhead in `TransportBar`.
     */
    tickRate: ReplayTickRate | null;
}
