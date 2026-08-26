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
import { computeOutgoingConditionsEi, resolveConditionNameFromEntry as resolveConditionNameFromEntryEi } from '../legacy/conditionsMetricsEi';
import { getEntityConditionDamageTakenRows, squadEntities } from '@axiapps/bridge-metrics';

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
    // Added at axilog 1.6.1 for the same reason Poison joined the incoming
    // table below: ids 12812/12831 ("Poison Blast Combo") were literally
    // `Skill 12812`/`Skill 12831` until 1.6.1 named them, so EI's name
    // tokenizer had nothing to match and silently under-credited itself.
    // The count is 3 here and 7 on the incoming side because these are
    // different scopes over the same fixture, not the same number twice.
    // Damage stays 0: a blast combo applies the condition, it does not strike.
    Poison: { hits: 3, damage: 0, skill: 'Poison Blast Combo' },
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

/**
 * The INCOMING half, migrated with the aggregators unit.
 *
 * EI decided whether a `totalDamageTaken` entry was a condition by tokenizing
 * the skill name, and on this fixture that was not a marginal error: it booked
 * 74000 points of `Burning Speed` STRIKE damage as incoming Burning CONDITION
 * damage — 85% of the number it reported. Native decides membership from
 * `catalogs.buffs[id].kind === 'condition'`, reading
 * `blocks.damage.by_entity[].by_skill_taken`.
 *
 * `blocks.conditions` cannot serve this side: it holds enemy and npc entities
 * only, so a condition landing on a squad member is not in it at all.
 */
describe('unit 5c oracle — incoming conditions', () => {
    /** EI-only incoming credit, by condition, from the name-matched skills. */
    const EI_INCOMING_MISATTRIBUTION: Record<string, { hits: number; damage: number; skill: string }> = {
        Burning: { hits: 38, damage: 74000, skill: 'Burning Speed' },
        // 228, not the 155 a first pass read off a deduplicated probe: two of
        // the three hits landed for 73 and 82, and a third for another 73 that
        // the dedup collapsed away.
        Bleeding: { hits: 3, damage: 228, skill: 'Bleeding Edge' },
        // Joined the list at axilog 1.6.1, which is a naming change and NOT a
        // counting one: ids 12812/12831 are the "Poison Blast Combo" field
        // blast, and until 1.6.1 neither had a name at all -- they arrived as
        // `Skill 12812`/`Skill 12831`, which this heuristic could not
        // name-match to a condition, so their 7 hits went uncounted on the EI
        // side by accident. Now that they resolve, EI's name matching credits
        // them to Poison exactly as it credits `Burning Speed` to Burning.
        // Damage is 0, not a rounding artifact: a blast combo applies the
        // condition and deals no strike damage itself, which is why only
        // `applications` moved (70 -> 77) while `damage` stayed at 2265.
        // The native side never counted them and still reads 70 -- it keys on
        // the condition's own buff id, not on what a skill happens to be
        // called, which is the entire point of this oracle.
        Poison: { hits: 7, damage: 0, skill: 'Poison Blast Combo' },
    };

    const buildEi = () => {
        const ei: any = applyEiCompatShims(parseFileEi(FIXTURE_PATH, { everything: true }), FIXTURE_PATH);
        const totals: Record<string, { applications: number; damage: number }> = {};
        for (const p of ei.players ?? []) {
            if (p.notInSquad) continue;
            for (const list of p.totalDamageTaken ?? []) {
                for (const entry of list ?? []) {
                    if (!entry?.id) continue;
                    let sName = `Skill ${entry.id}`;
                    const sm = ei.skillMap?.[`s${entry.id}`] ?? ei.skillMap?.[`${entry.id}`];
                    if (sm?.name) sName = sm.name;
                    const bm = ei.buffMap?.[`b${entry.id}`];
                    if (sName.startsWith('Skill ') && bm?.name) sName = bm.name;
                    const finalName = resolveConditionNameFromEntryEi(sName, entry.id, ei.buffMap);
                    if (!finalName) continue;
                    const t = totals[finalName] ?? { applications: 0, damage: 0 };
                    t.applications += Number(entry.hits ?? 0);
                    t.damage += Number(entry.totalDamage ?? 0);
                    totals[finalName] = t;
                }
            }
        }
        return totals;
    };

    const buildNative = () => {
        const details: any = { native: parseFile(FIXTURE_PATH, { everything: true }) };
        const totals: Record<string, { applications: number; damage: number }> = {};
        for (const entity of squadEntities(details.native)) {
            for (const row of getEntityConditionDamageTakenRows(details, entity.id)) {
                const t = totals[row.conditionName] ?? { applications: 0, damage: 0 };
                t.applications += row.attemptHits;
                t.damage += row.damage;
                totals[row.conditionName] = t;
            }
        }
        return totals;
    };

    it('finds the same conditions on both sides', () => {
        expect(Object.keys(buildNative()).sort()).toEqual(Object.keys(buildEi()).sort());
    });

    it('agrees once EI’s name-matched strike skills are subtracted', () => {
        const ei = buildEi();
        const native = buildNative();
        for (const [name, eiTotals] of Object.entries(ei)) {
            const bogus = EI_INCOMING_MISATTRIBUTION[name] ?? { hits: 0, damage: 0 };
            expect(native[name]?.damage, `${name} damage`).toBe(eiTotals.damage - bogus.damage);
            expect(native[name]?.applications, `${name} applications`).toBe(eiTotals.applications - bogus.hits);
        }
    });

    it('pins each misattribution to its exact magnitude', () => {
        const ei = buildEi();
        const native = buildNative();
        // Non-vacuity: the whole point is that these are large, so a run where
        // they came out zero would prove nothing.
        expect(ei.Burning.damage - native.Burning.damage).toBe(74000);
        expect(native.Burning.damage).toBeLessThan(ei.Burning.damage * 0.2);
        expect(ei.Bleeding.damage - native.Bleeding.damage).toBe(228);
        // Poison is the inverse shape and worth pinning as such: applications
        // move, damage does not.
        expect(ei.Poison.applications - native.Poison.applications).toBe(7);
        expect(ei.Poison.damage - native.Poison.damage).toBe(0);
    });

    it('leaves conditions with no same-named strike skill untouched', () => {
        const ei = buildEi();
        const native = buildNative();
        // Poison left this list at axilog 1.6.1 -- it acquired a same-named
        // strike skill (see EI_INCOMING_MISATTRIBUTION) the moment
        // "Poison Blast Combo" became nameable.
        for (const name of ['Confusion', 'Torment']) {
            expect(native[name], name).toEqual(ei[name]);
        }
    });
});
