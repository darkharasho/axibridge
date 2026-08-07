import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFightMitigationByAccount } from '../embedMitigation';

// Minimal synthetic EI JSON with hand-computable mitigation.
// Enemy skill 100: totalDamage 3000 over 3 connected hits → avg 1000;
// min entries average → minDamage 500 (not asserted here; avg drives totalMitigation).
// Player "Alice.1234" against skill 100: blocked 2, glanced 1 →
//   totalMitigation = glanced × avg/2 + (blocked+evaded+missed+invulned+interrupted) × avg
//                   = 1 × 500 + 2 × 1000 = 2500.
// Player "Bob.5678" has an entry for skill 999 with zero connected enemy hits →
//   excluded → Bob has zero total → omitted from the map.
const syntheticDetails = {
    targets: [{
        totalDamageDist: [[
            { id: 100, totalDamage: 3000, connectedHits: 3, min: 500 },
            { id: 999, totalDamage: 0, connectedHits: 0, min: 0 },
        ]],
    }],
    players: [
        {
            account: 'Alice.1234', name: 'Alice', profession: 'Guardian', notInSquad: false,
            totalDamageTaken: [[
                { id: 100, hits: 5, blocked: 2, evaded: 0, glance: 1, missed: 0, invulned: 0, interrupted: 0, totalDamage: 2000, damage: 2000 },
            ]],
        },
        {
            account: 'Bob.5678', name: 'Bob', profession: 'Warrior', notInSquad: false,
            totalDamageTaken: [[
                { id: 999, hits: 1, blocked: 1, evaded: 0, glance: 0, missed: 0, invulned: 0, interrupted: 0, totalDamage: 0, damage: 0 },
            ]],
        },
    ],
};

describe('buildFightMitigationByAccount', () => {
    it('computes the hand-derived total for a synthetic fight', () => {
        const map = buildFightMitigationByAccount(syntheticDetails);
        expect(map.get('Alice.1234')).toBe(2500);
    });

    it('omits players whose only avoided skills had zero connected enemy hits', () => {
        const map = buildFightMitigationByAccount(syntheticDetails);
        expect(map.has('Bob.5678')).toBe(false);
    });

    it('returns an empty map when the fight has no enemy damage data', () => {
        expect(buildFightMitigationByAccount({ targets: [], players: [] }).size).toBe(0);
        expect(buildFightMitigationByAccount(null).size).toBe(0);
    });

    it('produces finite positive totals on a real fixture log', () => {
        const raw = JSON.parse(readFileSync(
            path.resolve(__dirname, '../../../test-fixtures/dmg-mit/20260205-190624.json'), 'utf8'));
        // Fixture files may be the EI JSON itself or a wrapper with .details — handle both.
        const details = raw.details ?? raw;
        const map = buildFightMitigationByAccount(details);
        expect(map.size).toBeGreaterThan(0);
        for (const v of map.values()) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThan(0);
        }
    });

    it('returns an empty map (no throw) for EI shapes without a players array', () => {
        expect(buildFightMitigationByAccount({ evtc: {} }).size).toBe(0);
    });
});
