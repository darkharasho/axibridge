import { RES_UTILITY_NAME_MATCHES } from './statsMetrics';

export type ResurrectKind = 'hand' | 'utility' | 'self';

export interface ResurrectSkill {
    id: number;
    name: string;
    kind: ResurrectKind;
    /**
     * How long after the cast starts a revive may still be credited to it.
     * Ground-placed utilities persist; instant ones do not. These values are
     * provisional and are validated against real logs in Task 6.
     */
    windowMs: number;
}

/** Instant-effect utilities and anything matched only by name use this window. */
export const DEFAULT_UTILITY_WINDOW_MS = 5000;

/**
 * Window for utilities that revive at the moment of the cast rather than
 * leaving a field behind.
 *
 * arcdps's own instant-res counter credits these inside a single event tick —
 * the effect create and the rally arrive together — and reads back only 200ms
 * for Glyph of Renewal, which has no usable effect. Our clock is coarser: the
 * only timestamp EI gives us is the cast START, so the window has to cover the
 * cast animation plus the rally, not just the pulse. Pinned against real logs
 * by `scripts/revive-validate.mjs report --gaps`.
 */
export const INSTANT_UTILITY_WINDOW_MS = 2000;

/**
 * Skill 12502 "Signet of Renewal" is a CONDITION CLEANSE, not a resurrect. It
 * matches a naive /res|renew/ name probe, which is exactly how a metric like
 * this silently acquires a false positive. It is excluded by construction:
 * name matching below uses the full phrase "glyph of renewal", never "renewal".
 *
 * Several skills carry two ids — a base and a duplicate the game emits in some
 * builds. Both are catalogued: the name fallback below only fires when the log
 * carries a skill map, and the duplicates have been observed as real casts
 * (14569 Battle Standard appears in the validation sample).
 *
 * Elementalist Glyph of Renewal never casts under its own id (5573). It casts
 * as one of four attunement variants NAMED "Renewal of Air/Earth/Fire/Water",
 * which is why the 'glyph of renewal' name match could never fire — the same
 * four ids arcdps special-cases. They are catalogued by id here.
 */
const ENTRIES: ResurrectSkill[] = [
    { id: 1066, name: 'Resurrect', kind: 'hand', windowMs: 0 },
    { id: 1175, name: 'Bandage', kind: 'self', windowMs: 0 },
    // Ground-placed: plant once, keep reviving for the field's lifetime.
    { id: 12569, name: 'Spirit of Nature', kind: 'utility', windowMs: 60000 },
    { id: 69300, name: 'Spirit of Nature', kind: 'utility', windowMs: 60000 },
    { id: 14419, name: 'Battle Standard', kind: 'utility', windowMs: 45000 },
    { id: 14569, name: 'Battle Standard', kind: 'utility', windowMs: 45000 },
    { id: 31677, name: 'Glyph of the Stars', kind: 'utility', windowMs: 10000 },
    { id: 55024, name: 'Glyph of the Stars', kind: 'utility', windowMs: 10000 },
    { id: 55046, name: 'Glyph of the Stars', kind: 'utility', windowMs: 10000 },
    // Illusion of Life applies a buff to the revived player; its window is the
    // buff, not a field.
    { id: 10244, name: 'Illusion of Life', kind: 'utility', windowMs: DEFAULT_UTILITY_WINDOW_MS },
    { id: 25541, name: 'Illusion of Life', kind: 'utility', windowMs: DEFAULT_UTILITY_WINDOW_MS },
    // Pet has to run to the downed ally first, so this one is not instant.
    { id: 30123, name: '"Search and Rescue!"', kind: 'utility', windowMs: DEFAULT_UTILITY_WINDOW_MS },
    { id: 34309, name: '"Search and Rescue!"', kind: 'utility', windowMs: DEFAULT_UTILITY_WINDOW_MS },
    // Instant: the ally stands up on the cast.
    { id: 9163, name: 'Signet of Mercy', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 24414, name: 'Signet of Mercy', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 10611, name: 'Signet of Undeath', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 24544, name: 'Signet of Undeath', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 5760, name: 'Renewal of Air', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 5761, name: 'Renewal of Earth', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 5762, name: 'Renewal of Fire', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 5763, name: 'Renewal of Water', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 24407, name: 'Renewal of Fire', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 24409, name: 'Renewal of Air', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 24410, name: 'Renewal of Water', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS },
    { id: 24411, name: 'Renewal of Earth', kind: 'utility', windowMs: INSTANT_UTILITY_WINDOW_MS }
];

export const RESURRECT_SKILLS: ReadonlyMap<number, ResurrectSkill> = new Map(
    ENTRIES.map((entry) => [entry.id, entry])
);

/**
 * Resolve a cast skill id to a resurrect skill, or null.
 *
 * Id lookup first (authoritative), then a full-phrase name match against the
 * shared utility name list, so utilities we have not catalogued by id are still
 * counted. Name matching cannot produce a 'hand' or 'self' classification —
 * those are id-only, because "resurrect" appears in too many unrelated names.
 */
export const classifyResurrectSkill = (
    id: number,
    skillMap: Record<string, { name?: string }> | undefined
): ResurrectSkill | null => {
    const known = RESURRECT_SKILLS.get(id);
    if (known) return known;

    const entry = skillMap?.[`s${id}`] || skillMap?.[`${id}`];
    const name = entry?.name?.toLowerCase() || '';
    if (!name) return null;

    const match = RES_UTILITY_NAME_MATCHES.find((candidate) => name.includes(candidate));
    if (!match) return null;

    return { id, name: entry?.name || match, kind: 'utility', windowMs: DEFAULT_UTILITY_WINDOW_MS };
};
