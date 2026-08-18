/**
 * Two rules carry this unit and both are silent when broken.
 *
 * 1. Native names two conditions differently from axibridge's canon —
 *    `Crippled` for `Cripple`, `Immobile` for `Immobilize`. The existing
 *    CONDITION_NAME_MAP already covers both, so this pins the whole 14-name
 *    table rather than trusting that it stays covered.
 * 2. EI's `hits` is native's `outcomes.attempt_hits`, NOT native's `hits`.
 *    Native `hits` matches on 56 of 73 condition rows, so a reader using it
 *    looks correct until it reaches a fully-invulned application.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile } from '@axiapps/axilog';
import {
    CONDITION_TARGET_ROLES,
    getEntityConditionDamageRows,
    listConditionApplications,
    listConditionIds,
} from '../nativeConditions';

const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');
const details = { native: parseFile(FIXTURE, { everything: true }) };

describe('listConditionIds', () => {
    it('returns every condition in the catalog and no boons', () => {
        expect(listConditionIds(details)).toEqual(
            [720, 721, 722, 723, 727, 736, 737, 738, 742, 791, 861, 19426, 26766, 27705],
        );
    });
});

describe('condition name normalization', () => {
    // The two rows that matter are 721 and 727; the rest are here so a
    // catalog rename anywhere in the set fails loudly.
    it.each([
        [720, 'Blind'], [721, 'Cripple'], [722, 'Chill'], [723, 'Poison'],
        [727, 'Immobilize'], [736, 'Bleeding'], [737, 'Burning'],
        [738, 'Vulnerability'], [742, 'Weakness'], [791, 'Fear'],
        [861, 'Confusion'], [19426, 'Torment'], [26766, 'Slow'], [27705, 'Taunt'],
    ])('maps buff %i to the canonical name %s', (buffId, expected) => {
        const app = listConditionApplications(details).find((a) => a.buffId === buffId);
        expect(app?.conditionName).toBe(expected);
    });
});

describe('listConditionApplications', () => {
    it('covers enemy players and npcs, and never squad or friendly entities', () => {
        expect(CONDITION_TARGET_ROLES).toEqual(['enemy_player', 'npc']);
        const byId = new Map(details.native.entities.map((e: any) => [e.id, e]));
        const roles = new Set(
            listConditionApplications(details).map((a) => byId.get(a.targetEntityId)?.role),
        );
        expect([...roles].sort()).toEqual(['enemy_player', 'npc']);
    });

    it('carries the raw state timeline through untouched', () => {
        const app = listConditionApplications(details).find(
            (a) => a.targetEntityId === 42 && a.buffId === 720 && a.sourceEntityId === 9,
        );
        expect(app?.states).toEqual([[0, 0], [22300, 1], [25300, 0]]);
    });
});

describe('getEntityConditionDamageRows', () => {
    it('reads EI-equivalent hits from outcomes.attempt_hits, not hits', () => {
        // Entity 18 (:Anon104.4848) skill 736 Bleeding: native hits is 62 and
        // attempt_hits is 63; EI reports 63.
        const row = getEntityConditionDamageRows(details, 18).find((r) => r.skillId === 736);
        expect(row).toMatchObject({
            conditionName: 'Bleeding',
            damage: 13782,
            connectedHits: 62,
            attemptHits: 63,
        });
    });

    it('returns condition skills only', () => {
        const ids = new Set(listConditionIds(details));
        for (const row of getEntityConditionDamageRows(details, 18)) {
            expect(ids.has(row.skillId)).toBe(true);
        }
    });
});
