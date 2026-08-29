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

export interface RallyEvent {
    timeMs: number;
    memberKey: string;
}

export interface TargetFocusSample {
    timeMs: number;
    memberKey: string;
    targetIndex: number;
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
}
