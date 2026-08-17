import { decodeSeries, type NativeSeries } from './nativeSeries';

export interface NativeSkillRow {
    skillId: number;
    skillName: string;
    icon?: string;
    damage: number;
    hits: number;
    connectedHits: number;
    /**
     * Condition/indirect damage. `per_target.by_skill` does not carry it, so it
     * is joined from the entity's own top-level `by_skill` — which is also the
     * only correct source: the flag is a per-(entity, skill) fact in native, not
     * a property of the skill.
     */
    indirect: boolean;
}

const nativeOf = (details: any): any => details?.native ?? null;
const damageOf = (details: any, entityId: number): any =>
    nativeOf(details)?.blocks?.damage?.by_entity?.[String(entityId)] ?? null;
const seriesOf = (details: any, entityId: number): any =>
    nativeOf(details)?.blocks?.series?.by_entity?.[String(entityId)] ?? null;

export const resolveSkillMeta = (details: any, skillId: number | string): { name: string; icon?: string } => {
    const entry = nativeOf(details)?.catalogs?.skills?.[String(skillId)];
    return { name: entry?.name ? String(entry.name) : `Skill ${skillId}`, icon: entry?.icon };
};

export const getEntityDamageSeries = (details: any, entityId: number): number[] =>
    decodeSeries(seriesOf(details, entityId)?.damage as NativeSeries | undefined);

export const getEntityDamageTakenSeries = (
    details: any, entityId: number, opts: { power?: boolean } = {},
): number[] =>
    decodeSeries(
        seriesOf(details, entityId)?.[opts.power ? 'power_damage_taken' : 'damage_taken'] as NativeSeries | undefined,
    );

/** One squad member's outgoing damage against one specific enemy, cumulative. */
export const getEntityVsTargetSeries = (
    details: any, entityId: number, targetId: number, opts: { power?: boolean } = {},
): number[] =>
    decodeSeries(
        seriesOf(details, entityId)?.per_target?.[String(targetId)]?.[
            opts.power ? 'power_damage' : 'damage'
        ] as NativeSeries | undefined,
    );

export const getEntityTargetDamageSeries = (
    details: any, entityId: number, opts: { power?: boolean } = {},
): number[] => {
    const perTarget = seriesOf(details, entityId)?.per_target;
    if (!perTarget) return [];
    const field = opts.power ? 'power_damage' : 'damage';
    const decoded = Object.values(perTarget)
        .map((t: any) => decodeSeries(t?.[field] as NativeSeries | undefined))
        .filter((s) => s.length > 0);
    if (decoded.length === 0) return [];
    const len = decoded.reduce((n, s) => Math.max(n, s.length), 0);
    const out = new Array<number>(len).fill(0);
    for (const s of decoded) {
        for (let i = 0; i < len; i++) out[i] += Number(s[i] ?? s[s.length - 1] ?? 0);
    }
    return out;
};

export const getEntityDamageTotal = (details: any, entityId: number): number =>
    Number(damageOf(details, entityId)?.total ?? 0);

export const getEntityDownContribution = (details: any, entityId: number): number =>
    Number(
        nativeOf(details)?.blocks?.contribution?.by_entity?.[String(entityId)]
            ?.downs_contribution?.damage ?? 0,
    );

export const getEntityDownContributionBySkill = (details: any, entityId: number): Map<number, number> => {
    const raw = nativeOf(details)?.blocks?.contribution?.by_entity?.[String(entityId)]
        ?.downs_contribution_by_skill ?? {};
    return new Map(Object.entries<any>(raw).map(([id, v]) => [Number(id), Number(v ?? 0)]));
};

export const getEntitySkillRows = (
    details: any, entityId: number, opts: { perTarget?: boolean; supplement?: boolean } = {},
): NativeSkillRow[] => {
    const entity = damageOf(details, entityId);
    if (!entity) return [];

    const indirectById = new Map<string, boolean>();
    for (const [id, v] of Object.entries<any>(entity.by_skill ?? {})) {
        indirectById.set(id, Boolean(v?.outcomes?.indirect));
    }

    const source: Record<string, any> = {};
    const add = (id: string, v: any) => {
        const row = source[id] ?? (source[id] = { total: 0, hits: 0, connected_hits: 0 });
        row.total += Number(v?.total ?? 0);
        row.hits += Number(v?.hits ?? 0);
        row.connected_hits += Number(v?.connected_hits ?? v?.hits ?? 0);
    };

    if (opts.perTarget) {
        for (const target of Object.values<any>(entity.per_target ?? {})) {
            for (const [id, v] of Object.entries<any>(target?.by_skill ?? {})) add(id, v);
        }
        if (opts.supplement) {
            // Damage that landed on nothing tracked — splash, and hits on
            // entities the log did not curate — lives in `by_skill` but has no
            // `per_target` row. Adding the remainder reproduces EI's
            // targetDamageDist/totalDamageDist reconciliation, which callers
            // suppress on detailed WvW logs where the per-target slices are
            // authoritative and the totals carry known-bogus outliers.
            for (const [id, v] of Object.entries<any>(entity.by_skill ?? {})) {
                const seen = source[id];
                const deltaDamage = Number(v?.total ?? 0) - Number(seen?.total ?? 0);
                const deltaHits = Number(v?.hits ?? 0) - Number(seen?.hits ?? 0);
                if (deltaDamage <= 0 && deltaHits <= 0) continue;
                add(id, {
                    total: Math.max(0, deltaDamage),
                    hits: Math.max(0, deltaHits),
                    connected_hits: Math.max(0, Number(v?.connected_hits ?? v?.hits ?? 0) - Number(seen?.connected_hits ?? 0)),
                });
            }
        }
    } else {
        for (const [id, v] of Object.entries<any>(entity.by_skill ?? {})) add(id, v);
    }

    return Object.entries(source).map(([id, v]) => {
        const meta = resolveSkillMeta(details, id);
        return {
            skillId: Number(id),
            skillName: meta.name,
            icon: meta.icon,
            damage: v.total,
            hits: v.hits,
            connectedHits: v.connected_hits,
            indirect: indirectById.get(id) ?? false,
        };
    });
};
