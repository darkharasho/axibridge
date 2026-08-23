/**
 * Slice-local settings hash: sorted-key canonical JSON + a wider digest.
 *
 * Deliberately NOT `hashAggregationSettings` from `../statsStore` — that hash
 * is the desktop aggregation-cache key, keyed on whatever JS object-literal
 * insertion order the caller happened to construct. That's harmless there:
 * it's an in-memory cache key, and a false miss just recomputes. This hash is
 * different in kind — it is persisted into a published `slice.json.gz`
 * artifact and compared, on every page load, against a settings object built
 * by a *different* JS engine run. Two semantically-identical settings objects
 * constructed with keys in a different order would otherwise hash
 * differently and make a real, correctly-published report un-sliceable for
 * no reason. So this canonicalizes key order recursively before hashing.
 *
 * The wider (64-bit-ish) digest isn't about resisting an adversary — nothing
 * here is adversarial. It's about the failure mode: `hashAggregationSettings`
 * is a single 32-bit rolling hash with a documented ~1-in-4-billion converse
 * (a genuine settings mismatch that happens to hash equal, silently slicing
 * under the wrong settings). That hash's failure mode is "recompute, no
 * harm." This one's failure mode is "renders wrong numbers with no visible
 * error," so it concatenates two 32-bit digests rather than one.
 *
 * The two digests must come from *structurally different* mixers, not the same
 * recurrence under two seeds. Reseeding `h = h*31 + c` buys nothing: the
 * recurrence is affine in the seed, so for two inputs of equal length
 * `h_seed(s) - h_seed(t)` is independent of `seed` — every collision under one
 * seed is a collision under the other, and the concatenation carries 32 bits of
 * resistance while claiming 64. FNV-1a (xor, then multiply, 16777619) and djb2
 * (multiply by 33, then xor) differ in operation order, constants and the
 * position at which the input byte enters the state, so their collision sets
 * are not related by construction.
 */

const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
            .sort()
            .reduce((out: Record<string, unknown>, key) => {
                out[key] = canonicalize((value as Record<string, unknown>)[key]);
                return out;
            }, {} as Record<string, unknown>);
    }
    return value;
};

// FNV-1a: xor the input byte into the state, THEN multiply by the FNV prime.
const fnv1a = (input: string): number => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        const code = input.charCodeAt(i);
        hash ^= code & 0xff;
        hash = Math.imul(hash, 0x01000193);
        hash ^= (code >>> 8) & 0xff;
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

// djb2 (xor variant): multiply the state by 33 FIRST, then xor the input byte
// in. Different constant, different operation order, different entry point for
// the input — so a collision here is unrelated to a collision under fnv1a.
const djb2 = (input: string): number => {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (Math.imul(hash, 33) ^ input.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
};

export function hashSliceSettings(mvpWeights: unknown, statsViewSettings: unknown, disruptionMethod: unknown): string {
    const canonicalKey = JSON.stringify(canonicalize({ mvpWeights, statsViewSettings, disruptionMethod }));
    const low = djb2(canonicalKey);
    const high = fnv1a(canonicalKey);
    return `${high.toString(36)}-${low.toString(36)}`;
}
