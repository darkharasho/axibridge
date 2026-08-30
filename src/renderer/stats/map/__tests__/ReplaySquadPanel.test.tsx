// src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReplaySquadPanel } from '../ReplaySquadPanel';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

/** Auto-incrementing so no two fixture members ever share a React key. */
let nextMemberId = 1;
const mkMember = (o: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    id: nextMemberId++,
    name: 'Player', account: 'P.1', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [], downRanges: [], deadRanges: [], ...o,
});

const mkFight = (members: SquadMemberMovement[]): ReplayFightPayload => ({
    fightId: 'f1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 5000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: members.length, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 5000, pixelsPerInch: { x: 1, y: 1 }, members, boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null,
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

describe('ReplaySquadPanel party collapse and spotlight', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('renders every party expanded by default', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 }), mkMember({ name: 'B', group: 2 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('A')).toBeTruthy();
        expect(screen.getByText('B')).toBeTruthy();
    });

    it('clicking a party header collapses that party only', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 }), mkMember({ name: 'B', group: 2 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Collapse Party 1'));
        expect(screen.queryByText('A')).toBeNull();
        expect(screen.getByText('B')).toBeTruthy();
    });

    it('clicking a collapsed party header expands it again', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Collapse Party 1'));
        fireEvent.click(screen.getByTitle('Expand Party 1'));
        expect(screen.getByText('A')).toBeTruthy();
    });

    it('the party header no longer toggles the spotlight', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Collapse Party 1'));
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
    });

    it('the crosshair button sets the spotlight party', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Spotlight Party 1'));
        expect(useStatsStore.getState().replaySpotlightParty).toBe(1);
    });

    it('the crosshair button clears an active spotlight and reports aria-pressed', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Spotlight Party 1'));
        const btn = screen.getByTitle('Clear spotlight on Party 1');
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(btn);
        expect(useStatsStore.getState().replaySpotlightParty).toBeNull();
    });

    it('collapsing a party leaves the spotlight untouched', () => {
        const fight = mkFight([mkMember({ name: 'A', group: 1 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Spotlight Party 1'));
        fireEvent.click(screen.getByTitle('Collapse Party 1'));
        expect(useStatsStore.getState().replaySpotlightParty).toBe(1);
    });

    it('hosts the health strip in its header when the layer is on', () => {
        useStatsStore.getState().setReplayLayer('squadHealthStrip', true);
        const fight = mkFight([mkMember({ name: 'A' }), mkMember({ name: 'B' })]);
        const { container } = render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(container.querySelectorAll('[data-hpcell]').length).toBe(2);
    });

    it('omits the health strip when the layer is off', () => {
        const fight = mkFight([mkMember({ name: 'A' })]);
        const { container } = render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(container.querySelectorAll('[data-hpcell]').length).toBe(0);
    });

    it('applies the thin-scrollbar class to the scrolling roster', () => {
        const fight = mkFight([mkMember()]);
        const { container } = render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(container.querySelector('.replay-scroll')).not.toBeNull();
    });

    it('the panel sets an explicit opaque background', () => {
        const fight = mkFight([mkMember()]);
        const { container } = render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        const panel = container.firstElementChild as HTMLElement;
        expect(panel.style.background).not.toBe('');
    });
});
