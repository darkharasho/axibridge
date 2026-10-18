import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { ReplayView } from '../ReplayView';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

/**
 * Right-click marking, end to end through ReplayView: the hit test, the menu,
 * the store, the map glyph and the tag-movement card.
 *
 * The container is 600x600 over a 600x600 map, so the only screen-to-map
 * transform is the pan/zoom group, read back from the rendered DOM.
 */
const mkMember = (over: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    id: 1, name: 'Ally', account: 'A.1', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [], downRanges: [], deadRanges: [],
    ...over,
});

const polls = 60;

const mkFight = (): ReplayFightPayload => ({
    fightId: 'f1', fightIndex: 0, label: 'Fight A', timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 1, kills: 0, deaths: 0,
    movementData: {
        pollingRate: 1000, durationMs: 60_000, pixelsPerInch: { x: 1, y: 1 },
        members: [
            mkMember({ id: 1, name: 'Cmd', account: 'Cmd.1', isCommander: true, positions: Array.from({ length: polls }, () => [100, 100] as [number, number]) }),
            mkMember({ id: 7, name: 'Firebrand', account: '', isEnemy: true, inSquad: false, positions: Array.from({ length: polls }, () => [400, 300] as [number, number]) }),
        ],
        boonIcons: {}, skillIcons: {}, groundMarkers: [],
    },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }], killEvents: [], damageSpikeEvents: [],
    rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null, tickRate: null,
});

Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 600, height: 600, left: 0, top: 0, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }),
});
Object.defineProperty(SVGElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 600, height: 600, left: 0, top: 0, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }),
});

describe('right-click marks', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as unknown as { getInitialState(): object }).getInitialState());
    });

    it('marks an enemy as tag, draws it, and opens the tag card', () => {
        const { container } = render(<ReplayView fights={[mkFight()]} />);
        // Zoomed and panned on purpose: picking used to ignore the pan/zoom
        // group and only hit at the default view.
        act(() => { useStatsStore.getState().setReplayViewport({ scale: 2, tx: -150, ty: -80 }); });
        const canvas = container.querySelector('.replay-canvas')!;
        expect(screen.queryByTestId('tag-movement-card')).toBeNull();

        const g = container.querySelector('[data-member-id="7"]')!;
        const icon = g.querySelector('[data-member-icon]')!.getAttribute('transform')!;
        const [, x, y] = icon.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!.map(Number);
        const t = container.querySelector('.replay-canvas > g')!.getAttribute('transform')!;
        const [, tx, ty, sc] = t.match(/translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/)!.map(Number);
        fireEvent.contextMenu(canvas, { clientX: tx + x * sc, clientY: ty + y * sc });

        const menu = screen.getByTestId('mark-menu');
        expect(menu.textContent).toContain('Firebrand (enemy)');
        // Enemies can't be followed, so the menu doesn't offer it.
        expect(menu.textContent).not.toContain('Follow');
        fireEvent.click(screen.getByText('Mark as enemy tag'));

        expect(useStatsStore.getState().replayMarks.f1).toEqual({ 7: 'tag' });
        expect(screen.queryByTestId('mark-menu')).toBeNull();
        expect(container.querySelector('[data-member-id="7"] [data-manual-mark="tag"]')).not.toBeNull();
        expect(screen.getByTestId('tag-movement-card').textContent).toContain('Cmd');
    });

    it('opens no menu on empty map', () => {
        const { container } = render(<ReplayView fights={[mkFight()]} />);
        fireEvent.contextMenu(container.querySelector('.replay-canvas')!, { clientX: 590, clientY: 5 });
        expect(screen.queryByTestId('mark-menu')).toBeNull();
    });
});
