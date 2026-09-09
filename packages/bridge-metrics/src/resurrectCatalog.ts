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
 * Skill 12502 "Signet of Renewal" is a CONDITION CLEANSE, not a resurrect. It
 * matches a naive /res|renew/ name probe, which is exactly how a metric like
 * this silently acquires a false positive. It is excluded by construction:
 * name matching below uses the full phrase "glyph of renewal", never "renewal".
 */
const ENTRIES: ResurrectSkill[] = [
    { id: 1066, name: 'Resurrect', kind: 'hand', windowMs: 0 },
    { id: 1175, name: 'Bandage', kind: 'self', windowMs: 0 },
    { id: 10244, name: 'Illusion of Life', kind: 'utility', windowMs: DEFAULT_UTILITY_WINDOW_MS },
    { id: 12569, name: 'Spirit of Nature', kind: 'utility', windowMs: 60000 },
    { id: 14419, name: 'Battle Standard', kind: 'utility', windowMs: 45000 }
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
