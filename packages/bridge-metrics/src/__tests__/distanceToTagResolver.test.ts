import { describe, it, expect } from 'vitest';
import { createDistanceToTagResolver, getPlayerDistanceToTag } from '../dashboardMetrics';

// The Discord embed and the per-log card read distance straight off `statsAll`.
// A native (axilog) parse emits NEITHER `distToCom` NOR `stackDist` there — the
// scalars live on `native.blocks.replay.by_entity` — so those two surfaces
// printed 0 for the whole squad while StatsView (which has its own native
// fallback) read correctly. This pins the shared resolver both now use.

const player = (over: any = {}) => ({
    name: 'Ally',
    account: 'Ally.0001',
    statsAll: [{}],
    ...over,
});

const details = (byEntity: Record<string, any>, entities: any[]) => ({
    players: [player()],
    native: { entities, blocks: { replay: { by_entity: byEntity } } },
});

const entity = (id: number, account: string, character = 'Ally') => ({
    id, account, character, role: 'squad', subgroup: 1,
});

describe('createDistanceToTagResolver', () => {
    it('reads native dist_to_com when statsAll carries no scalars', () => {
        const resolve = createDistanceToTagResolver(details({ 7: { dist_to_com: 412.7, stack_dist: 900 } }, [entity(7, 'Ally.0001')]));
        expect(resolve(player() as any)).toBe(413);
    });

    it('falls back to native stack_dist when dist_to_com is the -1 sentinel', () => {
        const resolve = createDistanceToTagResolver(details({ 7: { dist_to_com: -1, stack_dist: 640.4 } }, [entity(7, 'Ally.0001')]));
        expect(resolve(player() as any)).toBe(640);
    });

    it('matches by character name when the EI row has no account', () => {
        const resolve = createDistanceToTagResolver(details({ 7: { dist_to_com: 250, stack_dist: 900 } }, [entity(7, '')]));
        expect(resolve(player({ account: '' }) as any)).toBe(250);
    });

    it('prefers EI statsAll over the native block on a real EI parse', () => {
        const resolve = createDistanceToTagResolver(details({ 7: { dist_to_com: 999, stack_dist: 999 } }, [entity(7, 'Ally.0001')]));
        expect(resolve(player({ statsAll: [{ distToCom: 300.2 }] }) as any)).toBe(300);
    });

    it('uses statsAll stackDist when distToCom is the "Infinity" sentinel', () => {
        const resolve = createDistanceToTagResolver({ players: [] });
        expect(resolve(player({ statsAll: [{ distToCom: 'Infinity', stackDist: 480.6 }] }) as any)).toBe(481);
    });

    it('returns null when neither source knows the distance', () => {
        const resolve = createDistanceToTagResolver({ players: [] });
        expect(resolve(player() as any)).toBeNull();
    });

    it('leaves the plain EI-only getter unchanged', () => {
        expect(getPlayerDistanceToTag({ statsAll: [{ distToCom: 12 }] } as any)).toBe(12);
    });
});
