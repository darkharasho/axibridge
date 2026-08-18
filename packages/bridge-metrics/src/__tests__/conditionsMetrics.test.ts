/**
 * The summary/playerConditions shape is consumed by computePlayerAggregation,
 * StatsView and computeCommanderStats without a schema between them, so this
 * pins the contract rather than the numbers — the oracle pins the numbers.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile } from '@axiapps/axilog';
import { computeOutgoingConditions } from '../conditionsMetrics';

const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');

describe('computeOutgoingConditions', () => {
    it('produces the same result shape from a native container', () => {
        const details = { native: parseFile(FIXTURE, { everything: true }) };
        const result = computeOutgoingConditions({ details });

        expect(Object.keys(result).sort()).toEqual(['meta', 'playerConditions', 'summary']);
        expect(Object.keys(result.summary).length).toBeGreaterThan(0);

        const bleeding = result.summary.Bleeding;
        expect(bleeding.name).toBe('Bleeding');
        expect(bleeding.damage).toBeGreaterThan(0);
        expect(bleeding.applications).toBeGreaterThan(0);
        expect(bleeding.applicationsFromBuffs).toBeGreaterThan(0);
        expect(bleeding.uptimeMs).toBeGreaterThan(0);

        // Keys are account ids, not character names, and NOT the `acct:`-prefixed
        // spelling — computePlayerAggregation keys playerStats on the bare account.
        for (const key of Object.keys(result.playerConditions)) {
            expect(key).toMatch(/^:?[^:]+\.\d{4}$/);
        }
    });

    it('carries an icon for every condition it reports', () => {
        // Native `catalogs.buffs` has no icon field, so these can only come from
        // DEFAULT_CONDITION_ICONS. Damaging conditions have no default icon.
        const details = { native: parseFile(FIXTURE, { everything: true }) };
        const { summary } = computeOutgoingConditions({ details });
        expect(summary.Blind.icon).toContain('render.guildwars2.com');
        expect(summary.Cripple.icon).toContain('render.guildwars2.com');
    });

    it('returns empty structures rather than throwing without a native container', () => {
        const result = computeOutgoingConditions({ details: {} });
        expect(result.summary).toEqual({});
        expect(result.playerConditions).toEqual({});
        expect(result.meta.buffStateSourcesSeen).toBe(0);
    });
});
