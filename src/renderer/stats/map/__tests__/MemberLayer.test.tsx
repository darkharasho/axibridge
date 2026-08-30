import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemberLayer, sampleAt } from '../layers/MemberLayer';
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
});

describe('MemberLayer', () => {
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

    it('emits the enemy-tint filter definition', () => {
        const { container } = renderLayer([mkMember({ isEnemy: true, inSquad: false })]);
        expect(container.querySelector('filter#enemy-tint')).not.toBeNull();
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
