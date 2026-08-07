import { describe, expect, it } from 'vitest';
import { orderMembersForRender } from '../replaySelectors';

describe('orderMembersForRender', () => {
    it('moves commanders to the end (SVG paint order = on top)', () => {
        const members = [
            { name: 'a', isCommander: false },
            { name: 'tag', isCommander: true },
            { name: 'b', isCommander: false },
        ];
        expect(orderMembersForRender(members).map(m => m.name)).toEqual(['a', 'b', 'tag']);
    });

    it('preserves relative order otherwise (stable)', () => {
        const members = [
            { name: 'e1' }, { name: 'tag1', isCommander: true },
            { name: 'e2' }, { name: 'tag2', isCommander: true }, { name: 'e3' },
        ];
        expect(orderMembersForRender(members).map(m => m.name))
            .toEqual(['e1', 'e2', 'e3', 'tag1', 'tag2']);
    });

    it('does not mutate the input array', () => {
        const members = [{ name: 'tag', isCommander: true }, { name: 'a' }];
        orderMembersForRender(members);
        expect(members[0].name).toBe('tag');
    });
});
