/**
 * One row per displayed skill name.
 *
 * A log routinely carries several ids under one name — most often a skill's
 * cast id plus its hit/proc id (Arcane Shield 5641/5703) — and every per-skill
 * table keyed by raw id rendered those as indistinguishable duplicate rows.
 * Ids whose name genuinely differs by variant (warrior adrenaline tiers, primal
 * bursts, attunement variants) already carry distinct names by the time they
 * get here: `applyEiCompatShims` bakes axilog's curated `variant_label` into
 * `skillMap` as `"Name (Label)"`. So grouping by exact name merges exactly the
 * rows that should merge and nothing else.
 *
 * The canonical id is the smallest id sharing the name in THIS log's
 * `skillMap`. Placeholder names (`"Skill <id>"`, blank) never group — two
 * unnamed ids are not known to be the same skill.
 */
const PLACEHOLDER = /^Skill \d+$/;

/**
 * `"Name (Label)"` for an id axilog (>= 1.14.0) gives a curated
 * `variant_label` — adrenaline tier, primal burst, attunement. Idempotent, so
 * details re-read through the parse shim are never double-labelled.
 */
export const withVariantLabel = (name: string, label: unknown): string => {
    if (typeof label !== 'string' || !label.trim()) return name;
    const suffix = ` (${label.trim()})`;
    return name.endsWith(suffix) ? name : `${name}${suffix}`;
};
const cache = new WeakMap<object, Map<number, number>>();

const buildIndex = (skillMap: Record<string, { name?: unknown }>): Map<number, number> => {
    const minIdByName = new Map<string, number>();
    const nameById = new Map<number, string>();
    for (const [key, entry] of Object.entries(skillMap)) {
        const id = Number(String(key).replace(/^s/, ''));
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
        if (!Number.isFinite(id) || !name || PLACEHOLDER.test(name)) continue;
        nameById.set(id, name);
        const seen = minIdByName.get(name);
        if (seen === undefined || id < seen) minIdByName.set(name, id);
    }
    const canonical = new Map<number, number>();
    nameById.forEach((name, id) => {
        const min = minIdByName.get(name)!;
        if (min !== id) canonical.set(id, min);
    });
    return canonical;
};

export const canonicalSkillId = (details: any, id: number | string): number => {
    const numeric = Number(id);
    const skillMap = details?.skillMap;
    if (!skillMap || typeof skillMap !== 'object') return numeric;
    let index = cache.get(skillMap);
    if (!index) {
        index = buildIndex(skillMap);
        cache.set(skillMap, index);
    }
    return index.get(numeric) ?? numeric;
};
