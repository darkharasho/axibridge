import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SyncedTimeline } from '../SyncedTimeline';
import { useStatsStore } from '../../statsStore';
import { __clearSquadDerivedCache } from '../hooks/useSquadDerived';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

/** Auto-incrementing so no two fixture members ever share a React key. */
let nextMemberId = 1;
const mkMember = (o: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    id: nextMemberId++,
    name: 'A', account: 'A', profession: 'Guardian', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: Array.from({ length: 11 }, (_, i) => [100 + i * 5, 100] as [number, number]),
    downRanges: [], deadRanges: [], ...o,
});

/**
 * A 20s fight with a moving squad and a mid-fight death, so
 * `useSquadDerived` produces at least an opening, a push and a retreat
 * phase — enough for the ribbon-segment tests to exercise more than one
 * `data-phase-chip` rect.
 */
const fightWithPhases = (): ReplayFightPayload => {
    const moving: [number, number][] = Array.from({ length: 21 }, (_, i) =>
        (i <= 9 ? [100, 100] : [100 + (i - 9) * 60, 100]) as [number, number]);
    const stationary: [number, number][] = Array.from({ length: 21 }, () => [100, 100] as [number, number]);
    return {
        fightId: 'sp1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 20_000,
        mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
        nearestLandmark: null, squadSize: 2, kills: 0, deaths: 0,
        movementData: {
            pollingRate: 1000, durationMs: 20_000, pixelsPerInch: { x: 1, y: 1 },
            members: [
                mkMember({ positions: moving, deadRanges: [[15_000, 20_000]] }),
                mkMember({ name: 'B', account: 'B', positions: stationary }),
            ],
            boonIcons: {}, skillIcons: {}, groundMarkers: [],
        },
        dpsSamples: [
            { timeMs: 0, squadDps: 0 }, { timeMs: 5000, squadDps: 2000 },
            { timeMs: 10_000, squadDps: 4000 }, { timeMs: 15_000, squadDps: 1000 },
            { timeMs: 20_000, squadDps: 0 },
        ],
        killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
        sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null,
    };
};

describe('SyncedTimeline — phases', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
        __clearSquadDerivedCache();
    });

    it('renders one clickable ribbon segment per phase', () => {
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={fightWithPhases()} />);
        const segs = container.querySelectorAll('[data-phase-chip]');
        expect(segs.length).toBeGreaterThan(0);
        expect(segs[0].tagName.toLowerCase()).toBe('rect');
    });

    it('clicking a ribbon segment scrubs to that phase start', () => {
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={fightWithPhases()} />);
        const seg = container.querySelectorAll('[data-phase-chip]')[1] as SVGRectElement;
        const start = Number(seg.getAttribute('data-start-ms'));
        fireEvent.click(seg);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBe(start);
    });

    it('mousedown on a ribbon segment does not start a drag-seek', () => {
        // The svg's own onMouseDown starts a drag AND immediately scrubs to
        // the click position; a mousedown that lands on a phase segment must
        // never reach it. fireEvent.click never dispatches a mousedown, so
        // this is the only test that would catch a missing
        // stopPropagation() on the rect's onMouseDown.
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={fightWithPhases()} />);
        const seg = container.querySelectorAll('[data-phase-chip]')[1] as SVGRectElement;
        fireEvent.mouseDown(seg);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBe(0);
    });

    it('renders no separate chip row below the svg', () => {
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={fightWithPhases()} />);
        expect(container.querySelectorAll('button[data-phase-chip]').length).toBe(0);
    });

    it('renders no phase segments when the phases layer is off', () => {
        useStatsStore.getState().setReplayLayer('phases', false);
        const { container } = render(<SyncedTimeline fight={fightWithPhases()} />);
        expect(container.querySelectorAll('[data-phase-chip]').length).toBe(0);
    });
});
