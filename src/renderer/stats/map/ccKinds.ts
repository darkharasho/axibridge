/**
 * Colour vocabulary for the incoming-CC marks on the replay map.
 *
 * axilog classifies every control row into one of nine kinds (see
 * `analysis::control_catalog`), resolved through the skill catalog rather than
 * from the row's own skill id — arcdps substitutes a generic control id for the
 * ability that was cast, so the id names the effect and loses the cause.
 *
 * Those nine collapse to three families here, because the nine-way split is
 * finer than a ring on a map can carry and finer than a reader needs. What
 * matters mid-fight is what the CC DID to you: moved you, locked you, or made
 * you run.
 *
 * Note what is deliberately absent: pull. arcdps fuses knockback and pull into
 * one id (23295, `Generic Knockback Pull`), so `knockback_or_pull` is as far as
 * classification can go — telling them apart needs the victim's displacement
 * measured against the caster, which the 1000ms movement poll cannot resolve.
 * The displacement family is honest about that; a "pulled" colour would not be.
 */
export type CcFamily = 'displacement' | 'fear' | 'lockdown';

const FAMILY_BY_KIND: Record<string, CcFamily> = {
    knockback_or_pull: 'displacement',
    launch: 'displacement',
    float: 'displacement',
    sink: 'displacement',
    float_or_sink: 'displacement',
    fear: 'fear',
    knockdown: 'lockdown',
    stagger: 'lockdown',
    stun_or_daze: 'lockdown',
};

/**
 * Amber is both the lockdown colour and the fallback, on purpose. Every fight
 * parsed before axilog 1.10 — and every already-published report — carries
 * `kinds: []`, and amber is what those marks have always been drawn in. So an
 * unclassified mark keeps its existing appearance instead of becoming a fourth
 * category the legend would have to explain, and it stays matched to
 * `ACCENT_COLOR.cc` in the layers panel.
 */
export const CC_FAMILY_COLOR: Record<CcFamily, string> = {
    displacement: '#22d3ee',
    fear: '#ec4899',
    lockdown: '#f59e0b',
};

export const CC_UNCLASSIFIED_COLOR = CC_FAMILY_COLOR.lockdown;

/**
 * Which family wins when one instant carries several. A squad bomb lands stun
 * and knockback together constantly, and displacement is the one worth seeing:
 * being locked in place is bad, being thrown off the tag is worse, and the
 * lockdown reading is the one you can already infer from the CC lane's height.
 */
const PRECEDENCE: CcFamily[] = ['displacement', 'fear', 'lockdown'];

/** The winning family for a mark, or null when the fight predates classification. */
export function ccMarkFamily(kinds: readonly string[]): CcFamily | null {
    let best: CcFamily | null = null;
    let bestRank = PRECEDENCE.length;
    for (const kind of kinds) {
        const family = FAMILY_BY_KIND[kind];
        if (!family) continue;
        const rank = PRECEDENCE.indexOf(family);
        if (rank < bestRank) { best = family; bestRank = rank; }
    }
    return best;
}

export function ccMarkColor(kinds: readonly string[]): string {
    const family = ccMarkFamily(kinds);
    return family ? CC_FAMILY_COLOR[family] : CC_UNCLASSIFIED_COLOR;
}
