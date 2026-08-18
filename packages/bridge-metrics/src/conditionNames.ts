/**
 * Condition name canonicalization, extracted as a leaf module.
 *
 * `nativeConditions.ts` needs `normalizeConditionLabel`, and
 * `conditionsMetrics.ts` needs `nativeConditions.ts` — a cycle. This module
 * has no imports, so both can depend on it. `conditionsMetrics.ts` re-exports
 * `normalizeConditionLabel` so its existing consumers do not move.
 */

/**
 * Maps every spelling we have seen to axibridge's canonical name. Two of these
 * are load-bearing for the native parser specifically: axilog's catalog says
 * `Crippled` and `Immobile` where the canon is `Cripple` and `Immobilize`.
 *
 * Do not collapse this down to the native spellings — `normalizeConditionLabel`
 * is also called on user-facing and Elite-Insights-legacy strings.
 */
const CONDITION_NAME_MAP = new Map<string, string>([
    ['bleeding', 'Bleeding'],
    ['burning', 'Burning'],
    ['confusion', 'Confusion'],
    ['poison', 'Poison'],
    ['torment', 'Torment'],
    ['vulnerability', 'Vulnerability'],
    ['weakness', 'Weakness'],
    ['weakened', 'Weakness'],
    ['blind', 'Blind'],
    ['blinded', 'Blind'],
    ['blinding', 'Blind'],
    ['cripple', 'Cripple'],
    ['crippled', 'Cripple'],
    ['chill', 'Chill'],
    ['chilled', 'Chill'],
    ['immob', 'Immobilize'],
    ['immobile', 'Immobilize'],
    ['immobilized', 'Immobilize'],
    ['slow', 'Slow'],
    ['slowed', 'Slow'],
    ['fear', 'Fear'],
    ['feared', 'Fear'],
    ['taunt', 'Taunt'],
    ['taunted', 'Taunt'],
]);

export const getConditionName = (name?: string | null) => {
    if (!name) return null;
    const cleaned = name.trim().toLowerCase();
    const directMatch = CONDITION_NAME_MAP.get(cleaned);
    if (directMatch) return directMatch;
    const tokens = cleaned.split(/[^a-z]+/).filter(Boolean);
    for (const token of tokens) {
        const match = CONDITION_NAME_MAP.get(token);
        if (match) return match;
    }
    return null;
};

export const normalizeConditionLabel = (name?: string | null) => getConditionName(name);
