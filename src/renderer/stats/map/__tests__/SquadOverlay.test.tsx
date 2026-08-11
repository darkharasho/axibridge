import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SquadOverlay } from '../SquadOverlay';
import { useStatsStore } from '../../statsStore';
import { __clearSquadDerivedCache } from '../hooks/useSquadDerived';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (over: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    name: 'A', account: 'A', profession: '', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [[100, 100]], downRanges: [], deadRanges: [], ...over,
});

const mkFight = (members: SquadMemberMovement[]): ReplayFightPayload => ({
    fightId: 's1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 3000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: members.length, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 3000, inchToPixel: 2, members, boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null,
});

describe('SquadOverlay', () => {
    beforeEach(() => {
        __clearSquadDerivedCache();
        const initial = (useStatsStore as any).getInitialState();
        useStatsStore.setState(initial);
    });

    it('renders nothing when all toggles are off', () => {
        const fight = mkFight([mkMember({ isCommander: true })]);
        const { container } = render(<svg><SquadOverlay fight={fight} timeMs={0} scale={1} /></svg>);
        expect(container.querySelector('[data-overlay="centroid"]')).toBeNull();
        expect(container.querySelector('[data-overlay="tag-rings"]')).toBeNull();
        expect(container.querySelector('[data-overlay="party-hulls"]')).toBeNull();
    });

    it('renders centroid + spread ring when centroidSpread is on', () => {
        useStatsStore.getState().setReplayLayer('centroidSpread', true);
        const fight = mkFight([
            mkMember({ positions: [[100, 100]] }),
            mkMember({ positions: [[120, 120]] }),
        ]);
        const { container } = render(<svg><SquadOverlay fight={fight} timeMs={0} scale={1} /></svg>);
        expect(container.querySelector('[data-overlay="centroid"]')).not.toBeNull();
    });

    it('renders two tag range rings when tagRangeRings is on', () => {
        useStatsStore.getState().setReplayLayer('tagRangeRings', true);
        const fight = mkFight([mkMember({ isCommander: true, positions: [[200, 200]] })]);
        const { container } = render(<svg><SquadOverlay fight={fight} timeMs={0} scale={1} /></svg>);
        const rings = container.querySelectorAll('[data-overlay="tag-rings"] circle');
        expect(rings.length).toBe(2);
    });

    it('renders hull polygons when partyHulls is on and party has ≥ 3 members', () => {
        useStatsStore.getState().setReplayLayer('partyHulls', true);
        const fight = mkFight([
            mkMember({ group: 1, positions: [[0, 0]] }),
            mkMember({ group: 1, positions: [[100, 0]] }),
            mkMember({ group: 1, positions: [[50, 50]] }),
        ]);
        const { container } = render(<svg><SquadOverlay fight={fight} timeMs={0} scale={1} /></svg>);
        expect(container.querySelector('[data-overlay="party-hulls"] polygon')).not.toBeNull();
    });
});
