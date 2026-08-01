import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHeatmapData, __clearHeatmapCache } from '../useHeatmapData';
import type { ReplayFightPayload } from '../../replayTypes';
import type { SquadMemberMovement } from '../../../../../shared/movementData';

const mkMember = (over: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    name: 'A', account: 'A', profession: '', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: [], downRanges: [], deadRanges: [],
    ...over,
});

const mkFight = (over: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'hf1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 10_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 0, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 10_000, inchToPixel: 1, members: [], boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null,
    ...over,
});

describe('useHeatmapData', () => {
    beforeEach(() => __clearHeatmapCache());

    it('returns null for off mode', () => {
        const fight = mkFight({});
        const { result } = renderHook(() => useHeatmapData(fight, 'off'));
        expect(result.current).toBeNull();
    });

    it('returns a Float32Array buffer sized 128×128 for deaths mode', () => {
        const fight = mkFight({
            movementData: {
                ...mkFight({}).movementData,
                members: [mkMember({
                    positions: [[200, 200], [200, 200]],
                    deadRanges: [[500, 1000]],
                })],
            },
        });
        const { result } = renderHook(() => useHeatmapData(fight, 'deaths'));
        expect(result.current).not.toBeNull();
        expect(result.current!.buffer.length).toBe(128 * 128);
        expect(result.current!.size).toEqual([128, 128]);
        expect(result.current!.max).toBeGreaterThan(0);
    });

    it('memoizes per (fightId, mode)', () => {
        const fight = mkFight({
            movementData: {
                ...mkFight({}).movementData,
                members: [mkMember({ positions: [[300, 300]] })],
            },
        });
        const { result, rerender } = renderHook(() => useHeatmapData(fight, 'time'));
        const first = result.current;
        rerender();
        expect(result.current).toBe(first);
    });

    it('damage-taken mode accumulates from HP drops', () => {
        const fight = mkFight({
            movementData: {
                ...mkFight({}).movementData,
                members: [mkMember({
                    positions: [[100, 100], [100, 100]],
                    healthPercents: [[0, 100], [1000, 40]],
                })],
            },
        });
        const { result } = renderHook(() => useHeatmapData(fight, 'damage-taken'));
        expect(result.current!.max).toBeGreaterThan(0);
    });
});
