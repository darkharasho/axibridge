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
}
