import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

/**
 * Panning writes the viewport to the store on every mouse event, so ReplayView
 * re-renders continuously for the whole duration of a drag. The HUD panels and
 * the map content are React.memo'd to sit that out — but memo only holds while
 * their props keep their identity, so a single inline arrow (`onToggle={() =>
 * ...}`) re-added to the JSX silently un-does the whole thing with no visible
 * symptom until someone drags a fullscreen map with a full roster open.
 *
 * These tests capture the props each memoised child is handed and assert that
 * a pan changes none of them. Deliberately asserting on identity rather than
 * on timings, which would be flaky.
 */
const captured: Record<string, Record<string, unknown>[]> = {};
const capture = (name: string) => (props: Record<string, unknown>) => {
    (captured[name] ??= []).push(props);
    return null;
};

vi.mock('../ReplayMapContent', () => ({ ReplayMapContent: capture('ReplayMapContent') }));
vi.mock('../ReplaySquadPanel', () => ({ ReplaySquadPanel: capture('ReplaySquadPanel') }));
vi.mock('../LayersPopover', () => ({ LayersPanel: capture('LayersPanel') }));
vi.mock('../TransportBar', () => ({ TransportBar: capture('TransportBar') }));
vi.mock('../FightIdentityPill', () => ({ FightIdentityPill: capture('FightIdentityPill') }));

const { ReplayView } = await import('../ReplayView');
const { useStatsStore } = await import('../../statsStore');

let nextId = 1;
const mkMember = (i: number): SquadMemberMovement => ({
    id: nextId++, name: `P${i}`, account: `P${i}.1`, profession: 'Guardian', eliteSpec: '',
    group: (i % 5) + 1, isCommander: i === 0, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [[100, 100], [110, 110]], downRanges: [], deadRanges: [],
});
const mkFight = (): ReplayFightPayload => ({
    fightId: 'f1', fightIndex: 0, label: 'Fight A', timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: [716, 750], avgPosition: null,
    nearestLandmark: null, squadSize: 10, kills: 0, deaths: 0,
    movementData: {
        pollingRate: 1000, durationMs: 60_000, pixelsPerInch: { x: 1, y: 1 },
        members: Array.from({ length: 10 }, (_, i) => mkMember(i)),
        boonIcons: {}, skillIcons: {}, groundMarkers: [],
    },
    dpsSamples: [{ timeMs: 0, squadDps: 0 }], killEvents: [], damageSpikeEvents: [],
    rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null,
    stripInSamples: null, ccTakenEvents: null,
});

Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ width: 1900, height: 1000, left: 0, top: 0, right: 1900, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) }),
});

const pan = () => act(() => {
    const p = useStatsStore.getState().replayViewport;
    useStatsStore.getState().setReplayViewport({ tx: p.tx - 2.5, ty: p.ty - 1.7 });
});

/** Every prop the child was last handed, compared by reference. */
const lastProps = (name: string) => {
    const seen = captured[name];
    expect(seen?.length, `${name} never rendered`).toBeTruthy();
    return seen[seen.length - 1];
};
const assertStableAcrossPan = (name: string) => {
    const before = lastProps(name);
    for (let i = 0; i < 5; i++) pan();
    const after = lastProps(name);
    const changed = Object.keys(after).filter(k => after[k] !== before[k]);
    expect(changed, `${name} received new prop identities during a pan: ${changed.join(', ')}`).toEqual([]);
};

describe('panning does not re-render viewport-independent UI', () => {
    beforeEach(() => {
        for (const k of Object.keys(captured)) delete captured[k];
        useStatsStore.setState((useStatsStore as never as { getInitialState(): object }).getInitialState());
    });

    it.each([
        ['ReplayMapContent'],
        ['ReplaySquadPanel'],
        ['LayersPanel'],
        ['TransportBar'],
        ['FightIdentityPill'],
    ])('hands %s identical props across a pan', name => {
        render(<ReplayView fights={[mkFight()]} />);
        assertStableAcrossPan(name);
    });

    it('keeps props stable with the squad roster open, the expensive case', () => {
        render(<ReplayView fights={[mkFight()]} />);
        // The collapsed rail is the real button; the mock renders nothing, so
        // drive the open state through the toggle the mock was handed.
        act(() => { (lastProps('ReplaySquadPanel').onToggle as () => void)(); });
        expect(lastProps('ReplaySquadPanel').collapsed).toBe(false);
        assertStableAcrossPan('ReplaySquadPanel');
        assertStableAcrossPan('ReplayMapContent');
    });

    /** A zoom legitimately must re-render the map content — memo isn't a freeze. */
    it('still re-renders the map content when the zoom changes', () => {
        render(<ReplayView fights={[mkFight()]} />);
        const before = lastProps('ReplayMapContent');
        act(() => { useStatsStore.getState().setReplayViewport({ scale: 7 }); });
        const after = lastProps('ReplayMapContent');
        expect(after.scale).toBe(7);
        expect(after.scale).not.toBe(before.scale);
    });
});
