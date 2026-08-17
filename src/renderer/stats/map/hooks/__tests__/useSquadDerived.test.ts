import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSquadDerived } from '../useSquadDerived';
import type { ReplayFightPayload } from '../../replayTypes';
import type { SquadMemberMovement } from '../../../../../shared/movementData';

const mkMember = (name: string, group: number, positions: [number, number][], extra: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    name, account: name, profession: 'Guardian', eliteSpec: '', group,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions, downRanges: [], deadRanges: [], ...extra,
});

const mkFight = (over: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'f1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 10_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 0, kills: 0, deaths: 0,
    movementData: {
        pollingRate: 1000, durationMs: 10_000, pixelsPerInch: { x: 1, y: 1 },
        members: [], boonIcons: {}, skillIcons: {},
    },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null,
    ...over,
});

describe('useSquadDerived', () => {
    it('returns centroid and spread samples at 1s tick', () => {
        const members = [
            mkMember('A', 1, Array.from({ length: 11 }, () => [100, 100] as [number, number])),
            mkMember('B', 1, Array.from({ length: 11 }, () => [110, 100] as [number, number])),
            mkMember('C', 1, Array.from({ length: 11 }, () => [100, 110] as [number, number])),
        ];
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members } });
        const { result } = renderHook(() => useSquadDerived(fight));
        expect(result.current.samples.length).toBeGreaterThan(0);
        const first = result.current.samples[0];
        expect(first.centroid[0]).toBeGreaterThan(99);
        expect(first.centroid[0]).toBeLessThan(108);
        expect(first.spread).toBeGreaterThan(0);
    });

    it('builds per-party convex hulls with ≥ 3 members', () => {
        const members = [
            mkMember('A', 1, [[0, 0], [0, 0]]),
            mkMember('B', 1, [[100, 0], [100, 0]]),
            mkMember('C', 1, [[50, 50], [50, 50]]),
            mkMember('D', 2, [[200, 200], [200, 200]]),
            mkMember('E', 2, [[210, 210], [210, 210]]),
        ];
        const fight = mkFight({ durationMs: 1000, movementData: { ...mkFight({}).movementData, durationMs: 1000, members } });
        const { result } = renderHook(() => useSquadDerived(fight));
        const hulls = result.current.samples[0].partyHulls;
        expect(hulls[1]?.length ?? 0).toBeGreaterThanOrEqual(3);
        expect(hulls[2]).toBeUndefined();
    });

    it('memoizes output for the same fightId', () => {
        const members = [mkMember('A', 1, [[0, 0]])];
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members } });
        const { result, rerender } = renderHook(() => useSquadDerived(fight));
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });

    it('detects at least one phase over a fight with deaths', () => {
        const members = [
            mkMember('A', 1, Array.from({ length: 11 }, (_, i) => [100 + i * 2, 100] as [number, number]),
                { deadRanges: [[5000, 10_000]] }),
            mkMember('B', 1, Array.from({ length: 11 }, (_, i) => [100, 100 + i * 2] as [number, number])),
        ];
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members } });
        const { result } = renderHook(() => useSquadDerived(fight));
        expect(result.current.phases.length).toBeGreaterThan(0);
        for (const phase of result.current.phases) {
            expect(phase.endMs).toBeGreaterThanOrEqual(phase.startMs);
        }
    });
});
