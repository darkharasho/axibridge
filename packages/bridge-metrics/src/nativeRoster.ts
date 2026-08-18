/**
 * Roster and identity readers over axilog's native 1.0 container.
 *
 * These replace `playerIdentity.ts`'s partitioning, and are deliberately a
 * separate module: `playerIdentity.ts` keeps serving EI-shaped history rows
 * during the migration and is deleted whole at Step N.
 *
 * They are FILTERS, not partitioners. EI emitted one `players[]` entry per
 * agent instance, so a relog produced two rows for one person and axibridge
 * collapsed them downstream. axilog dedupes upstream by account
 * (`crates/axilog-core/src/wvw/mod.rs`'s `dedupe_players`), collecting agent
 * addrs across relogs, so one entity IS one person.
 */

import { normalizeAccountName } from './playerIdentity';

export type EntityRole = 'squad' | 'friendly_player' | 'enemy_player' | 'npc';

/** The subset of a native entity this module reads. */
export interface NativeEntityLike {
    id: number;
    account?: string;
    character?: string;
    role?: string;
    combat_participant?: boolean;
    profession?: string;
    elite_spec?: string;
    subgroup?: number;
    team?: string;
    guild_id?: string;
}

export interface NativeReportLike {
    entities?: NativeEntityLike[] | null;
}

const allEntities = (report: NativeReportLike | null | undefined): NativeEntityLike[] =>
    Array.isArray(report?.entities) ? report!.entities! : [];

const byRole = (report: NativeReportLike, role: EntityRole): NativeEntityLike[] =>
    allEntities(report).filter((e) => e?.role === role);

/** The squad. EI's `players[]` minus its `notInSquad` rows. */
export const squadEntities = (report: NativeReportLike): NativeEntityLike[] =>
    byRole(report, 'squad');

/**
 * Non-squad players on the squad's own team — pugs. EI only ever exposed these
 * as a `notInSquad` flag on a squad-shaped row; native gives them a role.
 */
export const friendlyPlayerEntities = (report: NativeReportLike): NativeEntityLike[] =>
    byRole(report, 'friendly_player');

/** The equivalent of EI's curated `targets[]`. */
export const enemyPlayerEntities = (report: NativeReportLike): NativeEntityLike[] =>
    byRole(report, 'enemy_player');

/**
 * Everything not in the squad that actually participated in combat — enemy
 * players plus participating NPCs and pugs. Wider than
 * {@link enemyPlayerEntities}; use that one where EI used `targets[]`.
 */
export const combatParticipantEnemies = (report: NativeReportLike): NativeEntityLike[] =>
    allEntities(report).filter((e) => e?.role !== 'squad' && e?.combat_participant === true);

/**
 * Stable identity key for an entity: account when known, else character name,
 * else null. Mirrors `playerIdentity.getPlayerAccountKey`'s key spelling
 * (`acct:` / `name:` prefixes) so keys stay comparable across the two shapes
 * for the duration of the migration.
 */
export const getEntityAccountKey = (entity: NativeEntityLike | null | undefined): string | null => {
    const raw = typeof entity?.account === 'string' ? entity.account.trim() : '';
    const account = normalizeAccountName(raw);
    if (account && account !== 'Unknown') return `acct:${account}`;
    const character = typeof entity?.character === 'string' ? entity.character.trim() : '';
    if (character && character !== 'Unknown') return `name:${character}`;
    return null;
};

/**
 * The profession string axibridge's lookup tables are keyed on.
 *
 * **EI's `players[].profession` is native's `elite_spec`, not native's
 * `profession`.** EI reports `"Amalgam"`; native reports
 * `profession: "Engineer", elite_spec: "Amalgam"`. `PROFESSION_COLORS`,
 * `PROFESSION_ABBREVIATIONS` and friends are all keyed on the elite-spec
 * spelling, so that is what this returns — falling back to the base class for
 * a core build, which is what EI did too.
 */
export const getEntityProfession = (entity: NativeEntityLike | null | undefined): string => {
    const spec = typeof entity?.elite_spec === 'string' ? entity.elite_spec.trim() : '';
    if (spec) return spec;
    const base = typeof entity?.profession === 'string' ? entity.profession.trim() : '';
    return base || 'Unknown';
};

/**
 * Entities keyed by native id — the join key that replaces EI's positional
 * `statsTargets[i]` ↔ `targets[i]` alignment.
 */
export const entitiesById = (report: NativeReportLike): Map<number, NativeEntityLike> => {
    const map = new Map<number, NativeEntityLike>();
    for (const entity of allEntities(report)) {
        if (typeof entity?.id === 'number') map.set(entity.id, entity);
    }
    return map;
};
