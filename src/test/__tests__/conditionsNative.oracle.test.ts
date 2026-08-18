/**
 * Unit 5b's equality oracle.
 *
 * The EI side is built the way PRODUCTION builds it: `parseFileEi` followed by
 * `applyEiCompatShims`. That is load-bearing, not incidental. The shim fills
 * `players[].name` from `character_name`, and EI's buff-state half joins
 * `targets[].buffs[].statesPerSource` (keyed by character name) through it.
 * Run the oracle against raw `parseFileEi` output and every source lookup
 * misses, EI reports zero applications and zero uptime, and the comparison
 * silently measures a defect that does not exist in the app.
 *
 * Two differences remain, and native is right on both.
 */
import { describe, expect, it } from 'vitest';
import { parseFile, parseFileEi } from '@axiapps/axilog';
import { FIXTURE_PATH } from '../axilogOracle';
import { applyEiCompatShims } from '../../main/axilogParser';
import { computeOutgoingConditions } from '@axiapps/bridge-metrics';
import { computeOutgoingConditionsEi } from '../legacy/conditionsMetricsEi';

/**
 * Every difference this unit introduces, with the side that is right and the
 * exact magnitude on the reference fixture. A change to any of these numbers
 * is a behaviour change to re-rule, not a baseline to refresh.
 */
const ALLOWLIST = {
    'summary[*].damage, summary[*].applications': {
        right: 'native',
        reason:
            'EI resolved a damage-dist entry to a condition when the SKILL NAME '
            + 'tokenized to one, so strike damage from "Burning Speed", '
            + '"Chilled to the Bone!" and "Bleeding Edge" was booked as condition '
            + 'damage. Native keys on catalogs.buffs[id].kind === "condition".',
    },
    'summary[*].applicationsFromBuffs, .applicationsFromBuffsActive, .uptimeMs': {
        right: 'native',
        reason:
            'The npc ruling. EI curates targets[] down to enemy players, so '
            + 'conditions squad members landed on enemy pets and minions are '
            + 'dropped: 1158 source-state arrays on the EI side against 1520 on '
            + "native's. Native counts them, so these fields are strictly higher. "
            + 'Reverse by dropping "npc" from CONDITION_TARGET_ROLES.',
    },
} as const;

/** EI-only condition credit, by condition, from the name-matched skills. */
const EI_NAME_MISATTRIBUTION: Record<string, { hits: number; damage: number; skill: string }> = {
    Burning: { hits: 5, damage: 11669, skill: 'Burning Speed' },
    Chill: { hits: 3, damage: 60, skill: 'Chilled to the Bone!' },
    Bleeding: { hits: 3, damage: 0, skill: 'Bleeding Edge' },
};

const buildEi = () => {
    const eiJson: any = parseFileEi(FIXTURE_PATH, { everything: true } as any);
    eiJson.native = parseFile(FIXTURE_PATH, { everything: true } as any);
    applyEiCompatShims(eiJson, FIXTURE_PATH);
    return eiJson;
};

describe('unit 5b conditions oracle', () => {
    const native = computeOutgoingConditions({
        details: { native: parseFile(FIXTURE_PATH, { everything: true } as any) },
    });
    const eiJson = buildEi();
    const ei = computeOutgoingConditionsEi({
        players: eiJson.players,
        targets: eiJson.targets,
        skillMap: eiJson.skillMap,
        buffMap: eiJson.buffMap,
    });

    // Guards the shim above. Without it EI reports 0 sources and the rest of
    // this file compares against a phantom.
    it('has a live EI baseline to compare against', () => {
        expect(ei.meta.buffStateSourcesSeen).toBe(1158);
        expect(ei.meta.buffStateApplicationsTotal).toBeGreaterThan(0);
    });

    it('reports every condition EI does', () => {
        const nativeNames = Object.keys(native.summary).sort();
        for (const name of Object.keys(ei.summary)) expect(nativeNames).toContain(name);
        // Taunt reaches npc targets only, so it exists on native alone.
        expect(nativeNames.filter((n) => !(n in ei.summary))).toEqual(['Taunt']);
    });

    it("matches EI on damage and applications once EI's name misattribution is subtracted", () => {
        for (const [name, row] of Object.entries(native.summary)) {
            const eiRow = ei.summary[name];
            if (!eiRow) continue;
            const slip = EI_NAME_MISATTRIBUTION[name] ?? { hits: 0, damage: 0 };
            expect([name, row.damage + slip.damage]).toEqual([name, eiRow.damage]);
            expect([name, row.applications + slip.hits]).toEqual([name, eiRow.applications]);
        }
    });

    it('pins each misattribution to its exact magnitude', () => {
        // If a future axilog build ever classifies one of these skill ids as a
        // condition, the difference collapses and this fails rather than
        // quietly absorbing the change.
        for (const [name, slip] of Object.entries(EI_NAME_MISATTRIBUTION)) {
            expect([name, ei.summary[name].damage - native.summary[name].damage])
                .toEqual([name, slip.damage]);
        }
    });

    it('is strictly above EI on the buff-state fields, never below (the npc ruling)', () => {
        expect(Object.keys(ALLOWLIST)).toHaveLength(2);
        expect(native.meta.buffStateSourcesSeen).toBe(1520);
        for (const [name, row] of Object.entries(native.summary)) {
            const eiRow = ei.summary[name];
            if (!eiRow) continue;
            for (const field of ['applicationsFromBuffs', 'applicationsFromBuffsActive', 'uptimeMs'] as const) {
                expect([name, field, (row[field] ?? 0) >= (eiRow[field] ?? 0)])
                    .toEqual([name, field, true]);
            }
        }
    });

    it('actually exceeds EI somewhere, so the npc allowlist is not vacuous', () => {
        const higher = Object.entries(native.summary).filter(
            ([name, row]) => (row.applicationsFromBuffs ?? 0) > (ei.summary[name]?.applicationsFromBuffs ?? 0),
        );
        expect(higher.length).toBeGreaterThan(0);
    });
});
