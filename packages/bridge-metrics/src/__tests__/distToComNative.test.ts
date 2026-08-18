import { describe, it, expect } from 'vitest';
import { computePlayerAggregation } from '../computePlayerAggregation';

// axilog's ei-json emits NEITHER `statsAll[0].distToCom` NOR `stackDist` (verified
// against `test-fixtures/axilog/wvw-small.anon.zevtc` on axilog 0.3.12). Every EI
// branch of `getDistanceToTag` therefore falls through to the combat-replay
// reconstruction, which only assigns a distance inside its death/down loops — so a
// player who never went down scored 0 and Closest to Tag read 0 for the whole squad.
//
// The distances DO exist, on the native replay block as `dist_to_com`/`stack_dist`,
// and `blocks.replay` is in the carry set. These tests pin the native fallback.

const makePlayer = (overrides: any) => ({
    name: overrides.name,
    account: overrides.account,
    group: 1,
    profession: 'Guardian',
    notInSquad: false,
    activeTimes: [60000],
    dpsAll: [{ dps: 0, damage: 0 }],
    // The axilog shape: statsAll present, but carrying no distance scalars at all.
    statsAll: [{}],
    defenses: [{ damageTaken: 0, downCount: 0, deadCount: 0 }],
    support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, resurrects: 0 }],
    ...overrides,
});

const makeLog = (players: any[], byEntity: Record<string, any>, entities: any[]) => ({
    details: {
        durationMS: 60000,
        timeStart: '2026-08-18T00:00:00Z',
        success: true,
        players,
        targets: [],
        phases: [{ start: 0, end: 60000, name: 'All' }],
        buffMap: {},
        skillMap: {},
        native: {
            entities,
            blocks: { replay: { by_entity: byEntity } },
        },
    },
});

const aggregate = (players: any[], byEntity: Record<string, any>, entities: any[]) =>
    computePlayerAggregation({
        validLogs: [makeLog(players, byEntity, entities)],
        method: 'count',
        skillDamageSource: 'target',
        splitPlayersByClass: false,
    } as any);

const statOf = (result: any, account: string) =>
    [...result.playerStats.values()].find((p: any) => p.account === account);

const entity = (id: number, account: string) => ({
    id, account, character: account.split('.')[0], role: 'squad', subgroup: 1,
    profession: 'Guardian', elite_spec: 'Firebrand',
});

describe('Closest to Tag on a native (axilog) parse', () => {
    it('reads dist_to_com from the native replay block when statsAll carries no scalars', () => {
        const result = aggregate(
            [makePlayer({ name: 'Ally', account: 'Ally.0001' })],
            { 7: { dist_to_com: 412.7, stack_dist: 900 } },
            [entity(7, 'Ally.0001')],
        );
        const s = statOf(result, 'Ally.0001');
        expect(s).toBeTruthy();
        expect(s!.distCount).toBe(1);
        expect(s!.totalDist).toBe(413);
    });

    it('falls back to native stack_dist when dist_to_com is the -1 sentinel', () => {
        const result = aggregate(
            [makePlayer({ name: 'NoCmdr', account: 'NoCmdr.0002' })],
            { 7: { dist_to_com: -1, stack_dist: 640 } },
            [entity(7, 'NoCmdr.0002')],
        );
        const s = statOf(result, 'NoCmdr.0002');
        expect(s!.totalDist).toBe(640);
    });

    it('joins on the account arcdps colon-prefixes, not the raw spelling', () => {
        const result = aggregate(
            [makePlayer({ name: 'Colon', account: 'Colon.0003' })],
            { 7: { dist_to_com: 250 } },
            [entity(7, ':Colon.0003')],
        );
        expect(statOf(result, 'Colon.0003')!.totalDist).toBe(250);
    });

    it('leaves a real EI parse alone — statsAll still wins over native', () => {
        const result = aggregate(
            [makePlayer({ name: 'EiPlayer', account: 'EiPlayer.0004', statsAll: [{ distToCom: 300 }] })],
            { 7: { dist_to_com: 999 } },
            [entity(7, 'EiPlayer.0004')],
        );
        expect(statOf(result, 'EiPlayer.0004')!.totalDist).toBe(300);
    });

    it('scores 0 rather than inventing a distance when the log carries no native block', () => {
        const result = aggregate([makePlayer({ name: 'Bare', account: 'Bare.0005' })], {}, []);
        const s = statOf(result, 'Bare.0005');
        expect(s!.totalDist).toBe(0);
    });
});
