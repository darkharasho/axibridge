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
 * error," so it gets two independent 32-bit hashes concatenated rather than
 * one.
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

// A single FNV/djb2-style rolling hash, seeded differently per call so two
// independent runs over the same string are (in practice) independent.
const rollingHash = (input: string, seed: number): number => {
    let hash = seed | 0;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash = hash | 0;
    }
    return hash >>> 0;
};

export function hashSliceSettings(mvpWeights: unknown, statsViewSettings: unknown, disruptionMethod: unknown): string {
    const canonicalKey = JSON.stringify(canonicalize({ mvpWeights, statsViewSettings, disruptionMethod }));
    const low = rollingHash(canonicalKey, 0);
    const high = rollingHash(canonicalKey, 0x9e3779b9);
    return `${high.toString(36)}-${low.toString(36)}`;
}
