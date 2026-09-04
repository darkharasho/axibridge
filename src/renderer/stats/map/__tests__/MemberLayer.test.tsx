import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemberLayer, sampleAt, lastAbsenceEnd } from '../layers/MemberLayer';
import type { SquadMemberMovement } from '../../../../shared/movementData';

let nextId = 1;
const mkMember = (o: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    id: nextId++,
    name: 'Player', account: 'P.1', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [[10, 10], [20, 20]], downRanges: [], deadRanges: [], ...o,
});

const renderLayer = (members: SquadMemberMovement[], props: Partial<React.ComponentProps<typeof MemberLayer>> = {}) =>
    render(
        <svg>
            <MemberLayer
                members={members}
                pollFrac={0}
                pollIndex={0}
                timeMs={0}
                scale={3}
                spotlightParty={null}
                showDead={false}
                pollingRate={300}
                followKey={null}
                onHover={() => {}}
                onLeave={() => {}}
                {...props}
            />
        </svg>,
    );

describe('sampleAt', () => {
    it('returns null for a member with no positions', () => {
        expect(sampleAt(mkMember({ positions: [] }), 0)).toBeNull();
    });

    it('lerps between bracketing samples', () => {
        expect(sampleAt(mkMember({ positions: [[0, 0], [10, 20]] }), 0.5)).toEqual([5, 10]);
    });

    it('clamps past the last sample', () => {
        expect(sampleAt(mkMember({ positions: [[0, 0], [10, 20]] }), 9)).toEqual([10, 20]);
    });

    it('treats pollFrac as ABSOLUTE and subtracts the member\'s own firstPoll', () => {
        // A member who joined 100 polls into the fight has positions[0] at
        // absolute poll 100. Without the subtraction the icon is drawn from
        // positions[100] — wherever they were 30s later — which is the
        // off-by-N `SquadMemberMovement.firstPoll` exists to prevent, and
        // which `replaySelectors.sampleAt` already avoids for hit-testing.
        const m = mkMember({ firstPoll: 100, positions: [[0, 0], [10, 20]] });
        expect(sampleAt(m, 100)).toEqual([0, 0]);
        expect(sampleAt(m, 100.5)).toEqual([5, 10]);
    });

    it('returns null before the member joined, at every fraction', () => {
        // Clamping here is what made not-yet-spawned enemies twitch: `lo`
        // pinned to 0 while `t` still swept 0 -> 1 once per poll, lerping
        // positions[0] -> positions[1] and snapping back ~3x a second.
        const m = mkMember({ firstPoll: 100, positions: [[0, 0], [10, 20]] });
        expect(sampleAt(m, 20)).toBeNull();
        expect(sampleAt(m, 99.5)).toBeNull();
        expect(sampleAt(m, 99.9)).toBeNull();
        // ...and appears exactly at their first poll, not before.
        expect(sampleAt(m, 100)).toEqual([0, 0]);
    });
});

describe('lastAbsenceEnd', () => {
    it('is null while the member has been continuously present', () => {
        expect(lastAbsenceEnd(mkMember(), 5000)).toBeNull();
    });

    it('ignores an absence that has not finished yet', () => {
        const m = mkMember({ deadRanges: [[1000, 9000]] });
        expect(lastAbsenceEnd(m, 5000)).toBeNull();
    });

    it('takes the latest of the finished death and despawn windows', () => {
        const m = mkMember({ deadRanges: [[1000, 2000]], dcRanges: [[3000, 4000]] });
        expect(lastAbsenceEnd(m, 9000)).toBe(4000);
        // Only the ones already over count.
        expect(lastAbsenceEnd(m, 3500)).toBe(2000);
    });
});

describe('MemberLayer', () => {
    it('slices trails relative to the member\'s own firstPoll', () => {
        // Same off-by-N as `sampleAt`: the trail must end at the member's
        // CURRENT sample, not at absolute index `pollIndex`.
        const m = mkMember({ firstPoll: 10, positions: [[0, 0], [1, 1], [2, 2], [3, 3]] });
        const { container } = renderLayer([m], { pollFrac: 11, pollIndex: 11 });
        const trail = container.querySelector('polyline');
        expect(trail?.getAttribute('points')).toBe('0,0 1,1');
    });

    it('renders one group per member', () => {
        const { container } = renderLayer([mkMember({ name: 'A' }), mkMember({ name: 'B' })]);
        expect(container.querySelectorAll('[data-member-id]').length).toBe(2);
    });

    it('skips members with no position sample', () => {
        const { container } = renderLayer([mkMember({ positions: [] })]);
        expect(container.querySelectorAll('[data-member-id]').length).toBe(0);
    });

    it('counter-scales the icon group so icons stay a constant screen size', () => {
        const { container } = renderLayer([mkMember()], { scale: 4 });
        const g = container.querySelector('[data-member-icon]');
        expect(g?.getAttribute('transform')).toContain('scale(0.25)');
    });

    it('dims members outside the spotlight party', () => {
        const { container } = renderLayer(
            [mkMember({ group: 1 }), mkMember({ group: 2 })],
            { spotlightParty: 1 },
        );
        const opacities = [...container.querySelectorAll('[data-member-id]')]
            .map(el => el.getAttribute('opacity'));
        expect(opacities).toContain('1');
        expect(opacities).toContain('0.2');
    });

    it('reports DEAD and DOWNED for enemies too, not just the squad', () => {
        const onHover = vi.fn();
        const enemy = (o = {}) => mkMember({ isEnemy: true, inSquad: false, account: '', name: 'Foe', ...o });
        const hover = (m: SquadMemberMovement, props = {}) => {
            const { container } = renderLayer([m], { onHover, timeMs: 1000, ...props });
            const g = container.querySelector('[data-member-id]') as SVGGElement;
            g.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 1, clientY: 1 }));
        };
        hover(enemy({ downRanges: [[0, 5000]] }));
        expect(onHover).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Foe', status: 'down' }));
        hover(enemy({ deadRanges: [[0, 5000]] }), { showDead: true });
        expect(onHover).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Foe', status: 'dead' }));
    });

    it('draws the downed cross for enemies, sized to their smaller icon', () => {
        // A downed enemy is the most actionable state on the map; leaving it
        // to the tooltip meant you had to already suspect it to find it.
        const crossOf = (m: SquadMemberMovement) => {
            const { container } = renderLayer([m], { timeMs: 1000 });
            const lines = [...container.querySelectorAll('[data-member-icon] line')];
            expect(lines.length).toBe(2);
            return Math.abs(Number(lines[0].getAttribute('x2')));
        };
        const down = { downRanges: [[0, 5000]] as [number, number][] };
        const allyCross = crossOf(mkMember(down));
        const enemyCross = crossOf(mkMember({ ...down, isEnemy: true, inSquad: false }));
        // Enemy icons render at 75% — the cross must follow, not overhang.
        expect(enemyCross).toBeCloseTo(allyCross * 0.75, 5);
    });

    it('emits the enemy-tint filter definition', () => {
        const { container } = renderLayer([mkMember({ isEnemy: true, inSquad: false })]);
        expect(container.querySelector('filter#enemy-tint')).not.toBeNull();
    });

    it('hides a member who is dead, by default', () => {
        const { container } = renderLayer(
            [mkMember({ deadRanges: [[0, 5000]] })],
            { timeMs: 1000 },
        );
        expect(container.querySelectorAll('[data-member-id]').length).toBe(0);
    });

    it('draws a dead member, faded, when showDead is on', () => {
        const { container } = renderLayer(
            [mkMember({ deadRanges: [[0, 5000]] })],
            { timeMs: 1000, showDead: true },
        );
        const g = container.querySelector('[data-member-id]');
        expect(g).not.toBeNull();
        expect(g?.getAttribute('opacity')).toBe('0.12');
    });

    it('hides a despawned member even when showDead is on', () => {
        // A despawn is not a death: there is no body on the field, so no
        // toggle can bring one back.
        const { container } = renderLayer(
            [mkMember({ dcRanges: [[0, 5000]] })],
            { timeMs: 1000, showDead: true },
        );
        expect(container.querySelectorAll('[data-member-id]').length).toBe(0);
    });

    it('hides enemies who have not spawned yet rather than twitching them', () => {
        const m = mkMember({ isEnemy: true, inSquad: false, firstPoll: 50, positions: [[0, 0], [9, 9]] });
        const { container } = renderLayer([m], { pollFrac: 10.5, pollIndex: 10 });
        expect(container.querySelectorAll('[data-member-id]').length).toBe(0);
    });

    it('clips the trail at the end of the last absence', () => {
        // Died at poll 1, back at poll 3 somewhere else entirely. Without the
        // clip the trail streaks from the corpse to the respawn point across
        // ground the player never walked.
        const m = mkMember({
            firstPoll: 0,
            positions: [[0, 0], [1, 1], [1, 1], [50, 50], [51, 51]],
            deadRanges: [[300, 900]],
        });
        const { container } = renderLayer([m], { pollFrac: 4, pollIndex: 4, timeMs: 1200 });
        const trail = container.querySelector('polyline');
        expect(trail?.getAttribute('points')).toBe('50,50 51,51');
    });

    it('calls onHover with the member identity and status', () => {
        const onHover = vi.fn();
        const { container } = renderLayer(
            [mkMember({ name: 'Alice', account: 'Alice.1', downRanges: [[0, 5000]] })],
            { onHover, timeMs: 1000 },
        );
        const g = container.querySelector('[data-member-id]') as SVGGElement;
        g.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 42, clientY: 7 }));
        expect(onHover).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Alice', account: 'Alice.1', status: 'down',
        }));
    });
});
