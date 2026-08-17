// src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReplaySquadPanel } from '../ReplaySquadPanel';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (o: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    name: 'Player', account: 'P.1', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [], downRanges: [], deadRanges: [], ...o,
});

const mkFight = (members: SquadMemberMovement[]): ReplayFightPayload => ({
    fightId: 'f1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 5000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: members.length, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 5000, pixelsPerInch: { x: 1, y: 1 }, members, boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null,
});

describe('ReplaySquadPanel', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('renders member names when expanded', () => {
        const fight = mkFight([mkMember({ name: 'Alice' }), mkMember({ name: 'Bob', group: 2 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('Alice')).toBeTruthy();
        expect(screen.getByText('Bob')).toBeTruthy();
    });

    it('hides member names when collapsed', () => {
        const fight = mkFight([mkMember({ name: 'Alice' })]);
        render(<ReplaySquadPanel fight={fight} collapsed={true} onToggle={() => {}} />);
        expect(screen.queryByText('Alice')).toBeNull();
    });

    it('renders party headers for each unique group', () => {
        const fight = mkFight([
            mkMember({ name: 'A', group: 1 }),
            mkMember({ name: 'B', group: 2 }),
        ]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('Party 1')).toBeTruthy();
        expect(screen.getByText('Party 2')).toBeTruthy();
    });

    it('excludes enemies from the panel', () => {
        const fight = mkFight([
            mkMember({ name: 'Friend', isEnemy: false }),
            mkMember({ name: 'Foe', isEnemy: true }),
        ]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('Friend')).toBeTruthy();
        expect(screen.queryByText('Foe')).toBeNull();
    });

    it('calls onToggle when collapse button is clicked', () => {
        const onToggle = vi.fn();
        const fight = mkFight([mkMember()]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={onToggle} />);
        fireEvent.click(screen.getByTitle('Collapse squad panel'));
        expect(onToggle).toHaveBeenCalledOnce();
    });

    it('calls onToggle when the collapsed rail is clicked', () => {
        const onToggle = vi.fn();
        const fight = mkFight([mkMember()]);
        render(<ReplaySquadPanel fight={fight} collapsed={true} onToggle={onToggle} />);
        fireEvent.click(screen.getByTitle('Expand squad panel'));
        expect(onToggle).toHaveBeenCalledOnce();
    });

    it('sets followTarget in store when a member card is clicked', () => {
        const fight = mkFight([mkMember({ name: 'Alice', account: 'Alice.1' })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /Alice/i }));
        expect(useStatsStore.getState().replayViewport.followTarget).toBe('Alice.1');
    });

    it('excludes allied members with inSquad false', () => {
        const fight = mkFight([
            mkMember({ name: 'InSquad', inSquad: true }),
            mkMember({ name: 'NotInSquad', inSquad: false }),
        ]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('InSquad')).toBeTruthy();
        expect(screen.queryByText('NotInSquad')).toBeNull();
    });
});
