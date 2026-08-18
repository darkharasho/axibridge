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

const mkFight = (): ReplayFightPayload => ({
    fightId: 'sp1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 10_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 1, kills: 0, deaths: 0,
    movementData: {
        pollingRate: 1000, durationMs: 10_000, pixelsPerInch: { x: 1, y: 1 },
        members: [mkMember({ deadRanges: [[6000, 10_000]] })], boonIcons: {}, skillIcons: {}, groundMarkers: [],
    },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }, { timeMs: 5000, squadDps: 1000 }, { timeMs: 10_000, squadDps: 0 }],
    killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null,
});

describe('SyncedTimeline — phases', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
        __clearSquadDerivedCache();
    });

    it('does not render phase chips when phases toggle is off', () => {
        const { container } = render(<SyncedTimeline fight={mkFight()} />);
        expect(container.querySelector('[data-phase-chip]')).toBeNull();
    });

    it('renders at least one phase chip when phases toggle is on', () => {
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={mkFight()} />);
        expect(container.querySelector('[data-phase-chip]')).not.toBeNull();
    });

    it('clicking a phase chip scrubs to its startMs', () => {
        useStatsStore.getState().setReplayLayer('phases', true);
        const { container } = render(<SyncedTimeline fight={mkFight()} />);
        const chips = container.querySelectorAll('[data-phase-chip]');
        expect(chips.length).toBeGreaterThan(0);
        const last = chips[chips.length - 1] as HTMLElement;
        const startMs = Number(last.getAttribute('data-start-ms'));
        fireEvent.click(last);
        expect(useStatsStore.getState().replayPlayhead.timeMs).toBe(startMs);
    });
});
