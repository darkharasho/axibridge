import { getBuffMeta } from './nativeBoons';
import { entitiesById, type EntityRole } from './nativeRoster';
import { normalizeConditionLabel } from './conditionsMetrics';

/**
 * Which target roles count as somewhere a condition can be applied.
 *
 * Elite Insights curates `targets[]` down to enemy players, so every
 * condition a squad member landed on an enemy pet or minion — Blood Fiends,
 * Juvenile pets, Function Gyros — was dropped on the floor. Native attributes
 * them, and on the reference fixture they are 362 of 1520 source-state
 * arrays, all sourced from squad entities.
 *
 * Including them is the ruling recorded in the unit 5b plan. Dropping
 * 'npc' here is the one-line reversal if published leaderboards need to
 * match pre-migration numbers.
 */
export const CONDITION_TARGET_ROLES: readonly EntityRole[] = ['enemy_player', 'npc'];

export interface NativeConditionApplication {
    targetEntityId: number;
    buffId: number;
    conditionName: string;
    sourceEntityId: number;
    states: Array<[number, number]>;
}

export interface NativeConditionDamageRow {
    buffId: number;
    conditionName: string;
    skillId: number;
    damage: number;
    connectedHits: number;
    /**
     * EI's `totalDamageDist[].hits`. Native splits the concept: `hits` counts
     * landed hits while `outcomes.attempt_hits` counts attempts including
     * invulned/blocked/evaded. EI reports the attempt count, and the two agree
     * on all but the fully-mitigated rows — so reading native `hits` here is
     * wrong in exactly the cases the consumer's fallback path exists for.
     */
    attemptHits: number;
}

const nativeOf = (details: any): any => details?.native ?? null;

export const listConditionIds = (details: any): number[] => {
    const buffs = nativeOf(details)?.catalogs?.buffs ?? {};
    return Object.entries<any>(buffs)
        .filter(([, meta]) => meta?.kind === 'condition')
        .map(([id]) => Number(id))
        .filter((id) => Number.isFinite(id))
        .sort((a, b) => a - b);
};

export const listConditionApplications = (details: any): NativeConditionApplication[] => {
    const native = nativeOf(details);
    const byEntity = native?.blocks?.conditions?.by_entity;
    if (!byEntity) return [];

    const roles = entitiesById(native);
    // `NativeEntityLike.role` is an optional string, so the membership test
    // has to widen rather than assume the union.
    const allowed = new Set<string>(CONDITION_TARGET_ROLES);
    const out: NativeConditionApplication[] = [];

    for (const [targetId, buffs] of Object.entries<any>(byEntity)) {
        const target = roles.get(Number(targetId));
        if (!target?.role || !allowed.has(target.role)) continue;
        for (const [buffId, entry] of Object.entries<any>(buffs ?? {})) {
            const conditionName = normalizeConditionLabel(
                getBuffMeta(details, buffId)?.name,
            );
            if (!conditionName) continue;
            for (const [sourceId, states] of Object.entries<any>(entry?.per_source?.by_source ?? {})) {
                if (!Array.isArray(states)) continue;
                out.push({
                    targetEntityId: Number(targetId),
                    buffId: Number(buffId),
                    conditionName,
                    sourceEntityId: Number(sourceId),
                    states: states as Array<[number, number]>,
                });
            }
        }
    }
    return out;
};

/**
 * The conditions applied TO `entityId`, per condition, from
 * `blocks.damage.by_entity[id].by_skill_taken`.
 *
 * This does NOT come from `blocks.conditions`: that container holds enemy and
 * npc entities only, so a condition landing on a squad member does not appear
 * in it at all. Damage-taken is where the incoming side lives, and its rows
 * carry the same shape as the outgoing `by_skill` rows.
 *
 * Membership is decided by `catalogs.buffs[id].kind === 'condition'` — the
 * skill id IS the buff id for condition damage. The EI path this replaces
 * decided membership by tokenizing the skill NAME, which counted any strike
 * skill named after a condition (`Burning Speed`, `Chilled to the Bone!`) as
 * incoming condition damage.
 */
export const getEntityConditionDamageTakenRows = (
    details: any,
    entityId: number,
): NativeConditionDamageRow[] => {
    const bySkill = nativeOf(details)?.blocks?.damage?.by_entity?.[String(entityId)]?.by_skill_taken ?? {};
    return collectConditionRows(details, bySkill);
};

const collectConditionRows = (details: any, bySkill: any): NativeConditionDamageRow[] => {
    const conditionIds = new Set(listConditionIds(details));
    const out: NativeConditionDamageRow[] = [];
    for (const [skillId, row] of Object.entries<any>(bySkill ?? {})) {
        const id = Number(skillId);
        if (!conditionIds.has(id)) continue;
        const conditionName = normalizeConditionLabel(getBuffMeta(details, id)?.name);
        if (!conditionName) continue;
        out.push({
            buffId: id,
            conditionName,
            skillId: id,
            damage: Number(row?.total ?? 0),
            connectedHits: Number(row?.connected_hits ?? 0),
            attemptHits: Number(row?.outcomes?.attempt_hits ?? 0),
        });
    }
    return out;
};

export const getEntityConditionDamageRows = (
    details: any,
    entityId: number,
): NativeConditionDamageRow[] => {
    const bySkill = nativeOf(details)?.blocks?.damage?.by_entity?.[String(entityId)]?.by_skill ?? {};
    return collectConditionRows(details, bySkill);
};
