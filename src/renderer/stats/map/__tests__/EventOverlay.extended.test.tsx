import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { EventOverlay } from '../EventOverlay';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

/** Auto-incrementing so no two fixture members ever share a React key. */
let nextMemberId = 1;
const mkMember = (o: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    id: nextMemberId++,
    name: 'A', account: 'A', profession: 'Guardian', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: Array.from({ length: 20 }, () => [100, 100] as [number, number]),
    downRanges: [], deadRanges: [], ...o,
});

const mkFight = (over: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'evt', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 10_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 0, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 10_000, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null,
    ...over,
});

describe('EventOverlay — extended layers', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
    });

    it('renders a damage pulse when damagePulses is on and event is recent', () => {
        useStatsStore.getState().setReplayLayer('damagePulses', true);
        const fight = mkFight({
            movementData: { ...mkFight({}).movementData, members: [mkMember({ account: 'A.1' })] },
            damageSpikeEvents: [{ timeMs: 5000, memberKey: 'A.1', magnitude: 50_000 }],
        });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={5200} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="damage"]')).not.toBeNull();
    });

    it('renders a rally ring when rallyRings is on and event is recent', () => {
        useStatsStore.getState().setReplayLayer('rallyRings', true);
        const fight = mkFight({
            movementData: { ...mkFight({}).movementData, members: [mkMember({ account: 'A.1', positions: [[200, 200]] })] },
            rallyEvents: [{ timeMs: 3000, memberKey: 'A.1' }],
        });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={3500} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="rally"]')).not.toBeNull();
    });

    it('renders target-focus lines when targetFocusLines is on', () => {
        useStatsStore.getState().setReplayLayer('targetFocusLines', true);
        const enemy = mkMember({ name: 'foe', account: '', isEnemy: true, inSquad: false, positions: [[300, 300], [300, 300]] });
        const fight = mkFight({
            movementData: {
                ...mkFight({}).movementData,
                members: [mkMember({ account: 'A.1' }), enemy],
            },
            targetFocusSamples: [{ timeMs: 1000, memberKey: 'A.1', targetIndex: 0 }],
        });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={1200} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="target-focus"]')).not.toBeNull();
    });

    it('does not render extended layers when toggles are off', () => {
        const fight = mkFight({
            movementData: { ...mkFight({}).movementData, members: [mkMember({ account: 'A.1' })] },
            damageSpikeEvents: [{ timeMs: 5000, memberKey: 'A.1', magnitude: 50_000 }],
            rallyEvents: [{ timeMs: 3000, memberKey: 'A.1' }],
        });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={3500} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="damage"]')).toBeNull();
        expect(container.querySelector('[data-pulse="rally"]')).toBeNull();
        expect(container.querySelector('[data-pulse="target-focus"]')).toBeNull();
    });

    // --- enemy down/death pulses -------------------------------------------
    // Regression: enemy members used to be skipped outright, so a fight where
    // nearly all the dying happened on the enemy side (the real WvW case:
    // 111 enemy down/death intervals vs the squad's 5) rendered no pulses.

    it('ignores enemy downs/deaths while enemyPulses is off', () => {
        const enemy = mkMember({ name: 'E', account: '', isEnemy: true, inSquad: false, downRanges: [[3000, 4000]], deadRanges: [[4000, 5000]] });
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members: [enemy] } });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={3200} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="down-enemy"]')).toBeNull();
        expect(container.querySelector('[data-pulse="down"]')).toBeNull();
    });

    it('pulses enemy downs and deaths when enemyPulses is on, tagged apart from squad ones', () => {
        useStatsStore.getState().setReplayLayer('enemyPulses', true);
        const enemy = mkMember({ name: 'E', account: '', isEnemy: true, inSquad: false, downRanges: [[3000, 9000]] });
        const ally = mkMember({ account: 'A.1', downRanges: [[3000, 9000]] });
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members: [ally, enemy] } });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={3200} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="down-enemy"]')).not.toBeNull();
        expect(container.querySelector('[data-pulse="down"]')).not.toBeNull();
    });

    it('pulses an enemy death with its own marker', () => {
        useStatsStore.getState().setReplayLayer('enemyPulses', true);
        const enemy = mkMember({ name: 'E', account: '', isEnemy: true, inSquad: false, deadRanges: [[3000, 9000]] });
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members: [enemy] } });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={3200} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="death-enemy"]')).not.toBeNull();
    });

    // --- track offset ------------------------------------------------------

    it('anchors a pulse using the member\'s own firstPoll, not an absolute index', () => {
        // pollingRate 1000, firstPoll 3 => positions[0] is the sample at
        // t=3000. A down at t=5000 must read positions[2] ([300,300]), NOT
        // positions[5] (out of range) or positions[0].
        const late = mkMember({
            account: 'L.1', firstPoll: 3,
            positions: [[100, 100], [200, 200], [300, 300], [400, 400]],
            downRanges: [[5000, 9000]],
        });
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members: [late] } });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={5200} scale={1} /></svg>);
        const circle = container.querySelector('[data-pulse="down"]');
        expect(circle).not.toBeNull();
        expect(circle?.getAttribute('cx')).toBe('300');
        expect(circle?.getAttribute('cy')).toBe('300');
    });

    it('drops a pulse that falls outside the member\'s tracked window', () => {
        // Same track, but the down happens at t=1000 — before this member's
        // first sample. Previously this clamped to positions[0] and drew the
        // pulse at a place the player had never been.
        const late = mkMember({
            account: 'L.1', firstPoll: 3,
            positions: [[100, 100], [200, 200]],
            downRanges: [[1000, 9000]],
        });
        const fight = mkFight({ movementData: { ...mkFight({}).movementData, members: [late] } });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={1200} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="down"]')).toBeNull();
    });
});

describe('EventOverlay — incoming CC marks', () => {
    beforeEach(() => {
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
    });

    const ccFight = (events: NonNullable<ReplayFightPayload['ccTakenEvents']>) => mkFight({
        movementData: { ...mkFight({}).movementData, members: [mkMember({ account: 'A.1' })] },
        ccTakenEvents: events,
    });

    it('marks a member who took CC in the current second', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', true);
        const { container } = render(<svg><EventOverlay fight={ccFight([{ timeMs: 5000, memberKey: 'A.1', count: 2 , kinds: [] }])} timeMs={5400} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="cc-taken"]')).not.toBeNull();
    });

    it('marks CC without being asked, because the layer ships on', () => {
        // No setReplayLayer call: this asserts the shipped default, which is
        // the whole reason the marks are discoverable at all.
        const { container } = render(<svg><EventOverlay fight={ccFight([{ timeMs: 5000, memberKey: 'A.1', count: 2 , kinds: [] }])} timeMs={5400} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="cc-taken"]')).not.toBeNull();
    });

    it('draws nothing once the layer is switched off', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', false);
        const { container } = render(<svg><EventOverlay fight={ccFight([{ timeMs: 5000, memberKey: 'A.1', count: 2 , kinds: [] }])} timeMs={5400} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="cc-taken"]')).toBeNull();
    });

    it('does not mark a member whose CC landed outside the playhead window', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', true);
        const { container } = render(<svg><EventOverlay fight={ccFight([{ timeMs: 1000, memberKey: 'A.1', count: 2 , kinds: [] }])} timeMs={9000} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="cc-taken"]')).toBeNull();
    });

    it('does not mark ahead of the playhead', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', true);
        const { container } = render(<svg><EventOverlay fight={ccFight([{ timeMs: 8000, memberKey: 'A.1', count: 2 , kinds: [] }])} timeMs={5000} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="cc-taken"]')).toBeNull();
    });

    it('draws a heavier ring for a bigger burst of CC in one second', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', true);
        const one = render(<svg><EventOverlay fight={ccFight([{ timeMs: 5000, memberKey: 'A.1', count: 1 , kinds: [] }])} timeMs={5000} scale={1} /></svg>);
        const many = render(<svg><EventOverlay fight={ccFight([{ timeMs: 5000, memberKey: 'A.1', count: 6 , kinds: [] }])} timeMs={5000} scale={1} /></svg>);
        const width = (r: ReturnType<typeof render>) =>
            Number(r.container.querySelector('[data-pulse="cc-taken"]')!.getAttribute('stroke-width'));
        expect(width(many)).toBeGreaterThan(width(one));
    });

    it('rings the member where they are at the playhead, so the ring frames the icon', () => {
        // The member icon is drawn at the playhead position. Anchoring the ring
        // at the moment the CC landed instead leaves it trailing in empty map
        // behind a moving squad, which is what made these marks unreadable on a
        // real fight.
        useStatsStore.getState().setReplayLayer('ccTakenMarks', true);
        // Real logs poll at 300ms, so a mark's 900ms life spans three samples.
        const walking = mkMember({
            account: 'A.1',
            positions: Array.from({ length: 40 }, (_, i) => [100 + i * 10, 100] as [number, number]),
        });
        const fight = mkFight({
            movementData: { ...mkFight({}).movementData, pollingRate: 300, members: [walking] },
            ccTakenEvents: [{ timeMs: 5000, memberKey: 'A.1', count: 2 , kinds: [] }],
        });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={5800} scale={1} /></svg>);
        const ring = container.querySelector('[data-pulse="cc-taken"]')!;
        // Sample 16 (x=260) is where the CC landed; sample 19 (x=290) is where
        // the member — and their icon — is by the time the playhead gets here.
        expect(Number(ring.getAttribute('cx'))).toBe(290);
    });

    it('draws the ring clear of the 20px member icon it has to frame', () => {
        // ReplayView renders each member as a 20px-wide icon (iconR 7-10 screen
        // px). A ring at r=11px sits right on that edge and disappears into the
        // profession art.
        useStatsStore.getState().setReplayLayer('ccTakenMarks', true);
        const { container } = render(<svg><EventOverlay fight={ccFight([{ timeMs: 5000, memberKey: 'A.1', count: 1 , kinds: [] }])} timeMs={5000} scale={1} /></svg>);
        const ring = container.querySelector('[data-pulse="cc-taken"]')!;
        expect(Number(ring.getAttribute('r'))).toBeGreaterThanOrEqual(16);
    });

    it('renders nothing at all when the lane was never recorded', () => {
        useStatsStore.getState().setReplayLayer('ccTakenMarks', true);
        const fight = mkFight({
            movementData: { ...mkFight({}).movementData, members: [mkMember({ account: 'A.1' })] },
            ccTakenEvents: null,
        });
        const { container } = render(<svg><EventOverlay fight={fight} timeMs={5000} scale={1} /></svg>);
        expect(container.querySelector('[data-pulse="cc-taken"]')).toBeNull();
    });
});
