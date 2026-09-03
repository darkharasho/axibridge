import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ReplayView } from '../ReplayView';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

/**
 * Every HUD panel floats *inside* the map container, and the pan-drag listener
 * lives on that container — so a mousedown on the transport bar used to bubble
 * up and arm a pan, and dragging the timeline scrubbed the playhead while also
 * sliding the map underneath it (Discord bug report, 2026-08-30).
 */
/**
 * No commander, so nothing is auto-followed: the follow camera legitimately
 * recentres the map as the playhead moves, which would mask the pan these
 * tests are actually about.
 */
let nextId = 1;
const mkMember = (): SquadMemberMovement => ({
    id: nextId++, name: 'Ally', account: 'A.1', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [[100, 100], [110, 110]], downRanges: [], deadRanges: [],
});

const mkFight = (): ReplayFightPayload => ({
    fightId: 'f1', fightIndex: 0, label: 'Fight A', timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 1, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 60_000, pixelsPerInch: { x: 1, y: 1 }, members: [mkMember()], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }], killEvents: [], damageSpikeEvents: [],
    rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null, tickRate: null,
});

Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 1400, height: 700, left: 0, top: 0, right: 1400, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }),
});

/** A press on `origin` followed by a drag well past the 3px jitter threshold. */
const dragFrom = (origin: Element) => {
    fireEvent.mouseDown(origin, { button: 0, clientX: 200, clientY: 200 });
    fireEvent.mouseMove(window, { clientX: 320, clientY: 260 });
    fireEvent.mouseUp(window);
};

describe('dragging a HUD overlay does not pan the map', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as unknown as { getInitialState(): object }).getInitialState());
    });

    it('leaves the viewport alone when the timeline scrubber is dragged', () => {
        const { container } = render(<ReplayView fights={[mkFight()]} />);
        const timeline = container.querySelector('.replay-timeline');
        expect(timeline, 'timeline scrubber not rendered').toBeTruthy();

        const before = useStatsStore.getState().replayViewport;
        dragFrom(timeline!);
        const after = useStatsStore.getState().replayViewport;

        expect([after.tx, after.ty]).toEqual([before.tx, before.ty]);
    });

    it('leaves the viewport alone when the transport bar chrome is dragged', () => {
        const { container } = render(<ReplayView fights={[mkFight()]} />);
        const transport = container.querySelector('[data-hud="transport"]');
        expect(transport, 'transport bar not rendered').toBeTruthy();

        const before = useStatsStore.getState().replayViewport;
        dragFrom(transport!);
        const after = useStatsStore.getState().replayViewport;

        expect([after.tx, after.ty]).toEqual([before.tx, before.ty]);
    });

    it('still pans when the drag starts on the map canvas itself', () => {
        const { container } = render(<ReplayView fights={[mkFight()]} />);
        const canvas = container.querySelector('.replay-canvas');
        expect(canvas, 'map canvas not rendered').toBeTruthy();

        const before = useStatsStore.getState().replayViewport;
        dragFrom(canvas!);
        const after = useStatsStore.getState().replayViewport;

        expect(after.tx).not.toBe(before.tx);
        expect(after.ty).not.toBe(before.ty);
    });
});
