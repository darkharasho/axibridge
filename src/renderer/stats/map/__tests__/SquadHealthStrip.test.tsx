import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SquadHealthStrip } from '../SquadHealthStrip';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (o: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    name: 'A', account: 'A', profession: 'Guardian', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [[0, 0]], downRanges: [], deadRanges: [], ...o,
});

const mkFight = (members: SquadMemberMovement[]): ReplayFightPayload => ({
    fightId: 'h1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 3000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: members.length, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 3000, pixelsPerInch: { x: 1, y: 1 }, members, boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [], killEvents: [],
    damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null,
});

describe('SquadHealthStrip', () => {
    it('renders one cell per squad ally', () => {
        const fight = mkFight([
            mkMember({ name: 'A', account: 'A.1' }),
            mkMember({ name: 'B', account: 'B.1' }),
            mkMember({ name: 'X', account: 'X.1', isEnemy: true }),
        ]);
        const { container } = render(<SquadHealthStrip fight={fight} timeMs={0} />);
        const cells = container.querySelectorAll('[data-hpcell]');
        expect(cells.length).toBe(2);
    });

    it('marks dead members with data-status=dead', () => {
        const fight = mkFight([mkMember({ name: 'A', account: 'A.1', deadRanges: [[500, 3000]] })]);
        const { container } = render(<SquadHealthStrip fight={fight} timeMs={1000} />);
        const cell = container.querySelector('[data-hpcell]');
        expect(cell?.getAttribute('data-status')).toBe('dead');
    });
});
