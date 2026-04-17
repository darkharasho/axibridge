import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { EventOverlay } from '../EventOverlay';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (o: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    name: 'A', account: 'A', profession: 'Guardian', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: Array.from({ length: 20 }, () => [100, 100] as [number, number]),
    downRanges: [], deadRanges: [], ...o,
});

const mkFight = (over: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'evt', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 10_000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: 0, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 10_000, inchToPixel: 1, members: [], boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
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
});
